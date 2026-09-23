package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/catalog"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/httpapi"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
)

var expectedProducts = []catalog.Product{
	{Code: "RED", Name: "Red set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 1, ColorToken: "red"},
	{Code: "GREEN", Name: "Green set", UnitPriceSatang: 4000, Currency: "THB", DisplayOrder: 2, ColorToken: "green"},
	{Code: "BLUE", Name: "Blue set", UnitPriceSatang: 3000, Currency: "THB", DisplayOrder: 3, ColorToken: "blue"},
	{Code: "YELLOW", Name: "Yellow set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 4, ColorToken: "yellow"},
	{Code: "PINK", Name: "Pink set", UnitPriceSatang: 8000, Currency: "THB", DisplayOrder: 5, ColorToken: "pink"},
	{Code: "PURPLE", Name: "Purple set", UnitPriceSatang: 9000, Currency: "THB", DisplayOrder: 6, ColorToken: "purple"},
	{Code: "ORANGE", Name: "Orange set", UnitPriceSatang: 12000, Currency: "THB", DisplayOrder: 7, ColorToken: "orange"},
}

type dependencies struct {
	products   []catalog.Product
	catalogErr error
	readyErr   error
	readyCalls int
	panicList  bool
	listFunc   func(context.Context) ([]catalog.Product, error)
	placeFunc  func(context.Context, ordering.Command) (ordering.Receipt, error)
	resetFunc  func(context.Context) error
}

func (d *dependencies) ListProducts(ctx context.Context) ([]catalog.Product, error) {
	if d.panicList {
		panic("database password must never cross the HTTP seam")
	}
	if d.listFunc != nil {
		return d.listFunc(ctx)
	}
	return d.products, d.catalogErr
}

func (d *dependencies) Ready(context.Context) error {
	d.readyCalls++
	return d.readyErr
}

func (d *dependencies) PlaceOrder(ctx context.Context, command ordering.Command) (ordering.Receipt, error) {
	if d.placeFunc != nil {
		return d.placeFunc(ctx, command)
	}
	return ordering.Receipt{}, ordering.ErrServiceUnavailable
}

func (d *dependencies) ResetRedAvailability(ctx context.Context) error {
	if d.resetFunc != nil {
		return d.resetFunc(ctx)
	}
	return nil
}

func TestUnexpectedPanicReturnsSafeInternalError(t *testing.T) {
	deps := &dependencies{panicList: true}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	assertBasicError(t, res, "INTERNAL_ERROR", "An unexpected error occurred.")
}

func TestUnsafeIncomingRequestIDIsReplaced(t *testing.T) {
	deps := &dependencies{products: expectedProducts}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	req.Header.Set("X-Request-ID", "secret value")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()
	if got := res.Header.Get("X-Request-ID"); got == "secret value" || !strings.HasPrefix(got, "req_") {
		t.Fatalf("X-Request-ID = %q, want generated request ID", got)
	}
}

func TestRequestsUseTheConfiguredBaseContext(t *testing.T) {
	baseContext, cancel := context.WithCancel(context.Background())
	cancel()
	deps := &dependencies{listFunc: func(ctx context.Context) ([]catalog.Product, error) {
		if ctx.Err() == nil {
			return expectedProducts, nil
		}
		return nil, ctx.Err()
	}}
	app := httpapi.New(httpapi.Config{BaseContext: baseContext}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusServiceUnavailable)
	}
}

func TestStructuredRequestLogUsesTheRouteTemplate(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	deps := &dependencies{products: expectedProducts}
	app := httpapi.New(httpapi.Config{Logger: logger}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()
	logLine := output.String()
	for _, expected := range []string{`"method":"GET"`, `"route":"/api/v1/products"`, `"status_class":"2xx"`, `"request_id":"req_`} {
		if !strings.Contains(logLine, expected) {
			t.Errorf("request log %q does not contain %q", logLine, expected)
		}
	}
}

func TestListProductsReturnsTheContractCatalog(t *testing.T) {
	deps := &dependencies{products: expectedProducts}
	app := httpapi.New(httpapi.Config{AllowedOrigins: []string{"http://localhost:3000"}}, deps, deps, deps)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/products", nil)
	req.Header.Set("X-Request-ID", "req_catalog_contract")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}
	if got := res.Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	if got := res.Header.Get("X-Request-ID"); got != "req_catalog_contract" {
		t.Fatalf("X-Request-ID = %q, want propagated request ID", got)
	}

	var body struct {
		Products []catalog.Product `json:"products"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Products) != len(expectedProducts) {
		t.Fatalf("product count = %d, want %d", len(body.Products), len(expectedProducts))
	}
	for i := range expectedProducts {
		if body.Products[i] != expectedProducts[i] {
			t.Errorf("product[%d] = %#v, want %#v", i, body.Products[i], expectedProducts[i])
		}
	}
}

func TestListProductsMapsDependencyFailureToSafeError(t *testing.T) {
	deps := &dependencies{catalogErr: errors.New("dial tcp db.internal:5432: password=secret")}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusServiceUnavailable)
	}
	assertBasicError(t, res, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.")
}

func TestListProductsMapsInvalidCatalogToSafeInternalError(t *testing.T) {
	deps := &dependencies{catalogErr: fmt.Errorf("validate products: %w", catalog.ErrInvalidCatalog)}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/v1/products", nil))
	if err != nil {
		t.Fatalf("GET products: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusInternalServerError)
	}
	assertBasicError(t, res, "INTERNAL_ERROR", "An unexpected error occurred.")
}

func TestLivenessDoesNotCheckPostgreSQL(t *testing.T) {
	deps := &dependencies{readyErr: errors.New("database unavailable")}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/health/live", nil))
	if err != nil {
		t.Fatalf("GET liveness: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}
	if deps.readyCalls != 0 {
		t.Fatalf("readiness dependency called %d times, want 0", deps.readyCalls)
	}
	assertHealth(t, res)
}

func TestReadinessReflectsPostgreSQLState(t *testing.T) {
	t.Run("ready", func(t *testing.T) {
		deps := &dependencies{}
		app := httpapi.New(httpapi.Config{}, deps, deps, deps)
		res, err := app.Test(httptest.NewRequest(http.MethodGet, "/health/ready", nil))
		if err != nil {
			t.Fatalf("GET readiness: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
		}
		assertHealth(t, res)
	})

	t.Run("unavailable", func(t *testing.T) {
		deps := &dependencies{readyErr: errors.New("migration 1 missing")}
		app := httpapi.New(httpapi.Config{}, deps, deps, deps)
		res, err := app.Test(httptest.NewRequest(http.MethodGet, "/health/ready", nil))
		if err != nil {
			t.Fatalf("GET readiness: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusServiceUnavailable)
		}
		assertBasicError(t, res, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.")
	})
}

func TestCORSAllowsOnlyConfiguredWebOrigin(t *testing.T) {
	deps := &dependencies{}
	app := httpapi.New(httpapi.Config{AllowedOrigins: []string{"http://localhost:3000"}}, deps, deps, deps)

	allowed := httptest.NewRequest(http.MethodOptions, "/api/v1/products", nil)
	allowed.Header.Set("Origin", "http://localhost:3000")
	allowed.Header.Set("Access-Control-Request-Method", http.MethodGet)
	allowedRes, err := app.Test(allowed)
	if err != nil {
		t.Fatalf("allowed preflight: %v", err)
	}
	defer allowedRes.Body.Close()
	if got := allowedRes.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allowed origin header = %q", got)
	}

	blocked := httptest.NewRequest(http.MethodOptions, "/api/v1/products", nil)
	blocked.Header.Set("Origin", "https://untrusted.example")
	blocked.Header.Set("Access-Control-Request-Method", http.MethodGet)
	blockedRes, err := app.Test(blocked)
	if err != nil {
		t.Fatalf("blocked preflight: %v", err)
	}
	defer blockedRes.Body.Close()
	if got := blockedRes.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("blocked origin unexpectedly allowed: %q", got)
	}
}

func assertHealth(t *testing.T, res *http.Response) {
	t.Helper()
	if got := res.Header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if len(body) != 1 || body["status"] != "ok" {
		t.Fatalf("health body = %#v, want only status=ok", body)
	}
	if res.Header.Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID is empty")
	}
}

func assertBasicError(t *testing.T, res *http.Response, code, message string) {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if len(body) != 3 {
		t.Fatalf("error body keys = %#v, want code, message, request_id", body)
	}
	if body["code"] != code || body["message"] != message {
		t.Fatalf("error body = %#v", body)
	}
	if requestID, ok := body["request_id"].(string); !ok || requestID == "" {
		t.Fatalf("request_id = %#v, want non-empty string", body["request_id"])
	} else if got := res.Header.Get("X-Request-ID"); got != requestID {
		t.Fatalf("X-Request-ID = %q, want response request_id %q", got, requestID)
	}
}
