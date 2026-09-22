package postgres_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/catalog"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/httpapi"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	storepg "github.com/besterdev/cal-food-store-full-stack/api/internal/postgres"
	"github.com/besterdev/cal-food-store-full-stack/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrationsSeedExactlyTheContractCatalog(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set; real PostgreSQL integration test skipped")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open admin pool: %v", err)
	}
	defer admin.Close()

	schema := "catalog_test_" + randomHex(t, 8)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = admin.Exec(cleanupCtx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
	})

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse database URL: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("open isolated pool: %v", err)
	}
	defer pool.Close()

	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatalf("repeat migrations: %v", err)
	}
	var migrationCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationCount); err != nil {
		t.Fatalf("count applied migrations: %v", err)
	}
	if migrationCount != 2 {
		t.Fatalf("migration count = %d, want 2 after repeated apply", migrationCount)
	}

	store := storepg.New(pool)
	orders := &ordering.Service{Store: store}
	products, err := store.ListProducts(ctx)
	if err != nil {
		t.Fatalf("list products: %v", err)
	}
	want := []catalog.Product{
		{Code: "RED", Name: "Red set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 1, ColorToken: "red"},
		{Code: "GREEN", Name: "Green set", UnitPriceSatang: 4000, Currency: "THB", DisplayOrder: 2, ColorToken: "green"},
		{Code: "BLUE", Name: "Blue set", UnitPriceSatang: 3000, Currency: "THB", DisplayOrder: 3, ColorToken: "blue"},
		{Code: "YELLOW", Name: "Yellow set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 4, ColorToken: "yellow"},
		{Code: "PINK", Name: "Pink set", UnitPriceSatang: 8000, Currency: "THB", DisplayOrder: 5, ColorToken: "pink"},
		{Code: "PURPLE", Name: "Purple set", UnitPriceSatang: 9000, Currency: "THB", DisplayOrder: 6, ColorToken: "purple"},
		{Code: "ORANGE", Name: "Orange set", UnitPriceSatang: 12000, Currency: "THB", DisplayOrder: 7, ColorToken: "orange"},
	}
	if !reflect.DeepEqual(products, want) {
		t.Fatalf("products = %#v, want %#v", products, want)
	}
	if err := store.Ready(ctx); err != nil {
		t.Fatalf("readiness after migrations: %v", err)
	}

	app := httpapi.New(httpapi.Config{}, store, store, orders)
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products through Fiber Adapter: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET products status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var body struct {
		Products []catalog.Product `json:"products"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode GET products response: %v", err)
	}
	if !reflect.DeepEqual(body.Products, want) {
		t.Fatalf("HTTP products = %#v, want %#v", body.Products, want)
	}
}

func randomHex(t *testing.T, bytes int) string {
	t.Helper()
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		t.Fatalf("generate schema suffix: %v", err)
	}
	return hex.EncodeToString(value)
}

func TestPlaceOrderPersistsReceiptAndReplaysIdempotently(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set; real PostgreSQL integration test skipped")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open admin pool: %v", err)
	}
	defer admin.Close()

	schema := "order_test_" + randomHex(t, 8)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = admin.Exec(cleanupCtx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
	})

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse database URL: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("open isolated pool: %v", err)
	}
	defer pool.Close()

	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	store := storepg.New(pool)
	orders := &ordering.Service{Store: store}
	command := ordering.Command{
		IdempotencyKey: "order-key-1",
		Lines: []ordering.Line{
			{ProductCode: "BLUE", Quantity: 2},
			{ProductCode: "YELLOW", Quantity: 1},
		},
	}
	first, err := orders.PlaceOrder(ctx, command)
	if err != nil {
		t.Fatalf("PlaceOrder first: %v", err)
	}
	if first.FinalTotalSatang != 11000 {
		t.Fatalf("final total = %d, want 11000", first.FinalTotalSatang)
	}
	if first.PairDiscountTotalSatang != 0 || first.MemberDiscountSatang != 0 {
		t.Fatalf("unexpected discounts: %#v", first)
	}

	var orderCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders`).Scan(&orderCount); err != nil {
		t.Fatalf("count orders: %v", err)
	}
	if orderCount != 1 {
		t.Fatalf("order count = %d, want 1", orderCount)
	}

	replay, err := orders.PlaceOrder(ctx, command)
	if err != nil {
		t.Fatalf("PlaceOrder replay: %v", err)
	}
	if replay.OrderID != first.OrderID || replay.FinalTotalSatang != first.FinalTotalSatang {
		t.Fatalf("replay receipt = %#v, want %#v", replay, first)
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders`).Scan(&orderCount); err != nil {
		t.Fatalf("count orders after replay: %v", err)
	}
	if orderCount != 1 {
		t.Fatalf("order count after replay = %d, want 1", orderCount)
	}

	conflictCommand := ordering.Command{
		IdempotencyKey: "order-key-1",
		Lines:          []ordering.Line{{ProductCode: "BLUE", Quantity: 3}},
	}
	_, err = orders.PlaceOrder(ctx, conflictCommand)
	if !errors.Is(err, ordering.ErrIdempotencyConflict) {
		t.Fatalf("conflict err = %v, want idempotency conflict", err)
	}

	app := httpapi.New(httpapi.Config{}, store, store, orders)
	body := `{"lines":[{"product_code":"PURPLE","quantity":1}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/orders", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "http-order-key")
	response, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("POST orders status = %d, want %d", response.StatusCode, http.StatusCreated)
	}
}
