package ordering_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/pricing"
	"github.com/google/uuid"
)

type fakePlacementTx struct {
	mu sync.Mutex

	availableAt   time.Time
	now           time.Time
	advancedTo    *time.Time
	insertCalls   int
	commitCalls   int
	rollbackCalls int
	failInsert    bool
	failAdvance   bool
	committed     bool

	receipt ordering.Receipt
}

func (t *fakePlacementTx) ClaimIdempotency(context.Context, ordering.PreparedIntent, uuid.UUID) (bool, error) {
	return true, nil
}

func (t *fakePlacementTx) LoadReceiptByKey(context.Context, ordering.PreparedIntent) (ordering.Receipt, error) {
	return t.receipt, nil
}

func (t *fakePlacementTx) LoadProducts(_ context.Context, codes []string) (map[string]ordering.ProductSnapshot, error) {
	products := map[string]ordering.ProductSnapshot{
		"RED":  {Code: "RED", Name: "Red set", UnitPriceSatang: 5000, DisplayOrder: 1},
		"BLUE": {Code: "BLUE", Name: "Blue set", UnitPriceSatang: 3000, DisplayOrder: 3},
	}
	out := make(map[string]ordering.ProductSnapshot, len(codes))
	for _, code := range codes {
		product, ok := products[code]
		if !ok {
			return nil, &ordering.ValidationError{Fields: []ordering.FieldError{{
				Field: "lines", Code: "UNSUPPORTED", Message: "unsupported",
			}}}
		}
		out[code] = product
	}
	return out, nil
}

func (t *fakePlacementTx) ReadClock(context.Context) (time.Time, error) {
	return t.now, nil
}

func (t *fakePlacementTx) LockRedGate(context.Context) (time.Time, error) {
	return t.availableAt, nil
}

func (t *fakePlacementTx) AdvanceRedGate(_ context.Context, from time.Time) error {
	if t.failAdvance {
		return ordering.AsServiceUnavailable(errors.New("advance failed"))
	}
	next := from.Add(60 * time.Minute)
	t.advancedTo = &next
	return nil
}

func (t *fakePlacementTx) InsertAcceptedOrder(context.Context, uuid.UUID, time.Time, pricing.Breakdown) error {
	t.insertCalls++
	if t.failInsert {
		return ordering.AsServiceUnavailable(errors.New("insert failed"))
	}
	return nil
}

func (t *fakePlacementTx) Commit(context.Context) error {
	t.commitCalls++
	t.committed = true
	return nil
}

func (t *fakePlacementTx) Rollback(context.Context) error {
	if t.committed {
		return nil
	}
	t.rollbackCalls++
	t.advancedTo = nil
	return nil
}

type fakeStore struct {
	tx *fakePlacementTx
}

func (s *fakeStore) BeginPlacement(context.Context) (ordering.PlacementTx, error) {
	return s.tx, nil
}

func TestPlaceOrderRejectsRedWhenGateUnavailable(t *testing.T) {
	now := time.Date(2026, 9, 22, 10, 0, 0, 0, time.UTC)
	available := now.Add(30 * time.Minute)
	tx := &fakePlacementTx{availableAt: available, now: now}
	service := &ordering.Service{Store: &fakeStore{tx: tx}}

	_, err := service.PlaceOrder(context.Background(), ordering.Command{
		IdempotencyKey: "red-blocked",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	})
	var conflict *ordering.RedConflictError
	if !errors.As(err, &conflict) {
		t.Fatalf("err = %v, want red conflict", err)
	}
	if !conflict.AvailableAt.Equal(available.UTC()) {
		t.Fatalf("available_at = %v, want %v", conflict.AvailableAt, available.UTC())
	}
	if tx.insertCalls != 0 || tx.commitCalls != 0 {
		t.Fatalf("blocked Red Order must not insert/commit")
	}
	if tx.advancedTo != nil {
		t.Fatal("blocked Red Order must not advance the gate")
	}
}

func TestPlaceOrderAcceptsRedExactlyAtAvailableAt(t *testing.T) {
	now := time.Date(2026, 9, 22, 11, 0, 0, 0, time.UTC)
	tx := &fakePlacementTx{availableAt: now, now: now}
	service := &ordering.Service{Store: &fakeStore{tx: tx}}

	receipt, err := service.PlaceOrder(context.Background(), ordering.Command{
		IdempotencyKey: "red-boundary",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 2}},
	})
	if err != nil {
		t.Fatalf("PlaceOrder: %v", err)
	}
	if !receipt.AcceptedAt.Equal(now) {
		t.Fatalf("accepted_at = %v, want %v", receipt.AcceptedAt, now)
	}
	if tx.advancedTo == nil || !tx.advancedTo.Equal(now.Add(60*time.Minute)) {
		t.Fatalf("advanced gate = %v", tx.advancedTo)
	}
}

func TestPlaceOrderRollsBackRedGateWhenInsertFails(t *testing.T) {
	now := time.Date(2026, 9, 22, 10, 0, 0, 0, time.UTC)
	tx := &fakePlacementTx{
		availableAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		now:         now,
		failInsert:  true,
	}
	service := &ordering.Service{Store: &fakeStore{tx: tx}}

	_, err := service.PlaceOrder(context.Background(), ordering.Command{
		IdempotencyKey: "red-rollback",
		Lines:          []ordering.Line{{ProductCode: "RED", Quantity: 1}},
	})
	if !errors.Is(err, ordering.ErrServiceUnavailable) {
		t.Fatalf("err = %v, want service unavailable", err)
	}
	if tx.rollbackCalls == 0 {
		t.Fatal("expected rollback after insert failure")
	}
	if tx.advancedTo != nil {
		t.Fatal("rolled-back transaction must restore Red gate advancement")
	}
	if tx.commitCalls != 0 {
		t.Fatal("failed Red Order must not commit")
	}
}

func TestPlaceOrderNonRedDoesNotTouchGate(t *testing.T) {
	now := time.Date(2026, 9, 22, 10, 0, 0, 0, time.UTC)
	tx := &fakePlacementTx{
		availableAt: now.Add(time.Hour),
		now:         now,
	}
	service := &ordering.Service{Store: &fakeStore{tx: tx}}

	_, err := service.PlaceOrder(context.Background(), ordering.Command{
		IdempotencyKey: "blue-ok",
		Lines:          []ordering.Line{{ProductCode: "BLUE", Quantity: 1}},
	})
	if err != nil {
		t.Fatalf("PlaceOrder: %v", err)
	}
	if tx.advancedTo != nil {
		t.Fatal("non-Red Order must not advance the Red gate")
	}
}
