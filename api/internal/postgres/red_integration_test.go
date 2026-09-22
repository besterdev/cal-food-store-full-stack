package postgres_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	storepg "github.com/besterdev/cal-food-store-full-stack/api/internal/postgres"
	"github.com/besterdev/cal-food-store-full-stack/api/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func openIsolatedOrderSchema(t *testing.T, prefix string) (*pgxpool.Pool, context.Context, context.CancelFunc) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set; real PostgreSQL integration test skipped")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		cancel()
		t.Fatalf("open admin pool: %v", err)
	}
	t.Cleanup(admin.Close)

	schema := prefix + "_" + randomHex(t, 8)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		cancel()
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = admin.Exec(cleanupCtx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
	})

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		cancel()
		t.Fatalf("parse database URL: %v", err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		cancel()
		t.Fatalf("open isolated pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := migrations.Apply(ctx, pool); err != nil {
		cancel()
		t.Fatalf("apply migrations: %v", err)
	}
	return pool, ctx, cancel
}

func TestConcurrentRedOrdersAcceptExactlyOne(t *testing.T) {
	pool, ctx, cancel := openIsolatedOrderSchema(t, "red_race")
	defer cancel()

	const attempts = 10
	var waitGroup sync.WaitGroup
	results := make(chan error, attempts)
	for index := 0; index < attempts; index++ {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()
			service := &ordering.Service{Store: storepg.New(pool)}
			_, err := service.PlaceOrder(ctx, ordering.Command{
				IdempotencyKey: fmt.Sprintf("red-race-%d", index),
				Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
			})
			results <- err
		}(index)
	}
	waitGroup.Wait()
	close(results)

	successes := 0
	conflicts := 0
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ordering.ErrRedUnavailable):
			conflicts++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if successes != 1 || conflicts != attempts-1 {
		t.Fatalf("successes=%d conflicts=%d, want 1/%d", successes, conflicts, attempts-1)
	}

	var orderCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM orders`).Scan(&orderCount); err != nil {
		t.Fatalf("count orders: %v", err)
	}
	if orderCount != 1 {
		t.Fatalf("order count = %d, want 1", orderCount)
	}
}

func TestRedIdempotentReplayDoesNotExtendWindow(t *testing.T) {
	pool, ctx, cancel := openIsolatedOrderSchema(t, "red_replay")
	defer cancel()

	service := &ordering.Service{Store: storepg.New(pool)}
	command := ordering.Command{
		IdempotencyKey: "red-replay-key",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	}
	first, err := service.PlaceOrder(ctx, command)
	if err != nil {
		t.Fatalf("first Red Order: %v", err)
	}

	var firstAvailable time.Time
	if err := pool.QueryRow(ctx, `
		SELECT available_at FROM red_availability_gate WHERE product_code = 'RED'
	`).Scan(&firstAvailable); err != nil {
		t.Fatalf("read gate: %v", err)
	}

	replay, err := service.PlaceOrder(ctx, command)
	if err != nil {
		t.Fatalf("replay Red Order: %v", err)
	}
	if replay.OrderID != first.OrderID {
		t.Fatalf("replay order_id = %s, want %s", replay.OrderID, first.OrderID)
	}

	var secondAvailable time.Time
	if err := pool.QueryRow(ctx, `
		SELECT available_at FROM red_availability_gate WHERE product_code = 'RED'
	`).Scan(&secondAvailable); err != nil {
		t.Fatalf("read gate after replay: %v", err)
	}
	if !secondAvailable.Equal(firstAvailable) {
		t.Fatalf("gate changed on replay: %v -> %v", firstAvailable, secondAvailable)
	}
}

func TestNonRedOrdersSucceedWhileRedBlocked(t *testing.T) {
	pool, ctx, cancel := openIsolatedOrderSchema(t, "red_block")
	defer cancel()

	service := &ordering.Service{Store: storepg.New(pool)}
	if _, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "red-first",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	}); err != nil {
		t.Fatalf("first Red Order: %v", err)
	}

	_, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "red-second",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	})
	if !errors.Is(err, ordering.ErrRedUnavailable) {
		t.Fatalf("second Red Order err = %v, want RED_UNAVAILABLE", err)
	}

	blue, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "blue-while-blocked",
		Lines:          []ordering.Line{{ProductCode: "BLUE", Quantity: 2}},
	})
	if err != nil {
		t.Fatalf("non-Red Order while blocked: %v", err)
	}
	if blue.FinalTotalSatang != 6000 {
		t.Fatalf("blue total = %d, want 6000", blue.FinalTotalSatang)
	}
}

func TestRedOrderSucceedsExactlyAtAvailableAtBoundary(t *testing.T) {
	pool, ctx, cancel := openIsolatedOrderSchema(t, "red_boundary")
	defer cancel()

	service := &ordering.Service{Store: storepg.New(pool)}
	if _, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "red-seed",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	}); err != nil {
		t.Fatalf("seed Red Order: %v", err)
	}

	if _, err := pool.Exec(ctx, `
		UPDATE red_availability_gate
		SET available_at = clock_timestamp()
		WHERE product_code = 'RED'
	`); err != nil {
		t.Fatalf("set gate boundary: %v", err)
	}

	receipt, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "red-at-boundary",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("boundary Red Order: %v", err)
	}
	if receipt.OrderID.String() == "" {
		t.Fatal("expected accepted boundary Red Order")
	}
}

func TestFailedRedTransactionDoesNotConsumeWindow(t *testing.T) {
	pool, ctx, cancel := openIsolatedOrderSchema(t, "red_rollback")
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var before string
	if err := tx.QueryRow(ctx, `
		SELECT available_at::text
		FROM red_availability_gate
		WHERE product_code = 'RED'
		FOR UPDATE
	`).Scan(&before); err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	var now time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		t.Fatalf("read clock: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE red_availability_gate
		SET available_at = $1::timestamptz + interval '60 minutes'
		WHERE product_code = 'RED'
	`, now); err != nil {
		t.Fatalf("advance gate: %v", err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}

	var after string
	if err := pool.QueryRow(ctx, `
		SELECT available_at::text FROM red_availability_gate WHERE product_code = 'RED'
	`).Scan(&after); err != nil {
		t.Fatalf("read gate after rollback: %v", err)
	}
	if after != before {
		t.Fatalf("gate after rollback = %q, want %q", after, before)
	}

	service := &ordering.Service{Store: storepg.New(pool)}
	if _, err := service.PlaceOrder(ctx, ordering.Command{
		IdempotencyKey: "red-after-rollback",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	}); err != nil {
		t.Fatalf("Red Order after rolled-back gate update: %v", err)
	}
}
