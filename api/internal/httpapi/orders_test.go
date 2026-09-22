package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/httpapi"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	"github.com/google/uuid"
)

func TestCreateOrderReturnsCommittedReceipt(t *testing.T) {
	orderID := uuid.MustParse("018f4f10-67a4-7ab1-ae12-5ce1d93f6417")
	acceptedAt := time.Date(2026, 9, 21, 10, 15, 30, 0, time.UTC)
	deps := &dependencies{
		placeFunc: func(_ context.Context, command ordering.Command) (ordering.Receipt, error) {
			if command.IdempotencyKey != "key-1" {
				t.Fatalf("idempotency key = %q", command.IdempotencyKey)
			}
			if len(command.Lines) != 1 || command.Lines[0].ProductCode != "BLUE" || command.Lines[0].Quantity != 2 {
				t.Fatalf("lines = %#v", command.Lines)
			}
			return ordering.Receipt{
				OrderID:    orderID,
				AcceptedAt: acceptedAt,
				Currency:   "THB",
				Lines: []ordering.ReceiptLine{{
					ProductCode: "BLUE", ProductName: "Blue set", Quantity: 2,
					UnitPriceSatang: 3000, LineTotalBeforeDiscountSatang: 6000,
				}},
				TotalBeforeDiscountSatang: 6000,
				PairDiscounts:             []ordering.PairDiscount{},
				FinalTotalSatang:          6000,
			}, nil
		},
	}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/orders",
		bytes.NewBufferString(`{"lines":[{"product_code":"BLUE","quantity":2}]}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "key-1")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusCreated)
	}
	if got := res.Header.Get("Location"); got != "/api/v1/orders/"+orderID.String() {
		t.Fatalf("Location = %q", got)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode receipt: %v", err)
	}
	if body["order_id"] != orderID.String() {
		t.Fatalf("order_id = %#v", body["order_id"])
	}
	if body["final_total_satang"] != float64(6000) {
		t.Fatalf("final_total_satang = %#v", body["final_total_satang"])
	}
	if body["pair_discount_total_satang"] != float64(0) {
		t.Fatalf("pair_discount_total_satang = %#v", body["pair_discount_total_satang"])
	}
}

func TestCreateOrderRejectsMissingIdempotencyKey(t *testing.T) {
	deps := &dependencies{}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/orders",
		bytes.NewBufferString(`{"lines":[{"product_code":"BLUE","quantity":1}]}`),
	)
	req.Header.Set("Content-Type", "application/json")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusBadRequest)
	}
	assertFieldError(t, res, "INVALID_IDEMPOTENCY_KEY")
}

func TestCreateOrderRejectsUnknownJSONField(t *testing.T) {
	deps := &dependencies{}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/orders",
		bytes.NewBufferString(`{"lines":[{"product_code":"BLUE","quantity":1}],"price":100}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "key-unknown")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusBadRequest)
	}
	assertFieldError(t, res, "MALFORMED_JSON")
}

func TestCreateOrderMapsValidationErrors(t *testing.T) {
	deps := &dependencies{
		placeFunc: func(context.Context, ordering.Command) (ordering.Receipt, error) {
			return ordering.Receipt{}, &ordering.ValidationError{Fields: []ordering.FieldError{{
				Field: "lines[0].quantity", Code: "OUT_OF_RANGE", Message: "quantity must be an integer from 1 through 999",
			}}}
		},
	}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/orders",
		bytes.NewBufferString(`{"lines":[{"product_code":"BLUE","quantity":0}]}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "key-validation")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusUnprocessableEntity)
	}
	assertFieldError(t, res, "VALIDATION_ERROR")
}

func TestCreateOrderMapsIdempotencyConflict(t *testing.T) {
	deps := &dependencies{
		placeFunc: func(context.Context, ordering.Command) (ordering.Receipt, error) {
			return ordering.Receipt{}, ordering.ErrIdempotencyConflict
		},
	}
	app := httpapi.New(httpapi.Config{}, deps, deps, deps)
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/v1/orders",
		bytes.NewBufferString(`{"lines":[{"product_code":"BLUE","quantity":1}]}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "key-conflict")

	res, err := app.Test(req)
	if err != nil {
		t.Fatalf("POST orders: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusConflict)
	}
	assertBasicError(t, res, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for a different Order Intent.")
}

func assertFieldError(t *testing.T, res *http.Response, code string) {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if body["code"] != code {
		t.Fatalf("code = %#v, want %s", body["code"], code)
	}
	fieldErrors, ok := body["field_errors"].([]any)
	if !ok || len(fieldErrors) == 0 {
		t.Fatalf("field_errors = %#v, want non-empty", body["field_errors"])
	}
}
