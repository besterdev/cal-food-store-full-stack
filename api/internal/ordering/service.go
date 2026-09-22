package ordering

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/pricing"
	"github.com/google/uuid"
)

// ProductSnapshot is the authoritative catalog row used while placing an Order.
type ProductSnapshot struct {
	Code            string
	Name            string
	UnitPriceSatang int64
	DisplayOrder    int16
}

// PlacementTx is the transactional Seam used by PlaceOrder.
type PlacementTx interface {
	ClaimIdempotency(ctx context.Context, prepared PreparedIntent, orderID uuid.UUID) (claimed bool, err error)
	LoadReceiptByKey(ctx context.Context, prepared PreparedIntent) (Receipt, error)
	LoadProducts(ctx context.Context, codes []string) (map[string]ProductSnapshot, error)
	ReadClock(ctx context.Context) (time.Time, error)
	LockRedGate(ctx context.Context) (availableAt time.Time, err error)
	AdvanceRedGate(ctx context.Context, from time.Time) error
	InsertAcceptedOrder(ctx context.Context, orderID uuid.UUID, acceptedAt time.Time, breakdown pricing.Breakdown) error
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

// Store opens placement transactions for the Order Module.
type Store interface {
	BeginPlacement(ctx context.Context) (PlacementTx, error)
}

// Service is the Order Module Interface.
type Service struct {
	Store Store
}

// PlaceOrder validates, prices, and atomically accepts an Order Intent.
func (s *Service) PlaceOrder(ctx context.Context, command Command) (Receipt, error) {
	prepared, err := Prepare(command)
	if err != nil {
		return Receipt{}, err
	}

	tx, err := s.Store.BeginPlacement(ctx)
	if err != nil {
		return Receipt{}, fmt.Errorf("%w: begin order transaction: %v", ErrServiceUnavailable, err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	orderID := uuid.Must(uuid.NewV7())
	claimed, err := tx.ClaimIdempotency(ctx, prepared, orderID)
	if err != nil {
		return Receipt{}, err
	}
	if !claimed {
		receipt, replayErr := tx.LoadReceiptByKey(ctx, prepared)
		if replayErr != nil {
			return Receipt{}, replayErr
		}
		if err := tx.Commit(ctx); err != nil {
			return Receipt{}, fmt.Errorf("%w: commit idempotent replay: %v", ErrServiceUnavailable, err)
		}
		return receipt, nil
	}

	codes := make([]string, 0, len(prepared.Lines))
	for _, line := range prepared.Lines {
		codes = append(codes, line.ProductCode)
	}
	products, err := tx.LoadProducts(ctx, codes)
	if err != nil {
		return Receipt{}, err
	}

	pricingInput := pricing.Input{MemberPresent: prepared.MemberPresent}
	containsRed := false
	for _, line := range prepared.Lines {
		product, ok := products[line.ProductCode]
		if !ok {
			return Receipt{}, &ValidationError{Fields: []FieldError{{
				Field: "lines", Code: "UNSUPPORTED", Message: "product_code is not a supported Product",
			}}}
		}
		if line.ProductCode == "RED" {
			containsRed = true
		}
		pricingInput.Lines = append(pricingInput.Lines, pricing.LineInput{
			ProductCode:     product.Code,
			ProductName:     product.Name,
			DisplayOrder:    product.DisplayOrder,
			Quantity:        line.Quantity,
			UnitPriceSatang: product.UnitPriceSatang,
		})
	}

	breakdown, err := pricing.Calculate(pricingInput)
	if err != nil {
		return Receipt{}, fmt.Errorf("%w: %v", ErrInternal, err)
	}

	acceptedAt, err := applyRedGate(ctx, tx, containsRed)
	if err != nil {
		return Receipt{}, err
	}

	if err := tx.InsertAcceptedOrder(ctx, orderID, acceptedAt, breakdown); err != nil {
		return Receipt{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Receipt{}, fmt.Errorf("%w: commit order: %v", ErrServiceUnavailable, err)
	}

	return ReceiptFromBreakdown(orderID, acceptedAt.UTC(), breakdown), nil
}

func applyRedGate(ctx context.Context, tx PlacementTx, containsRed bool) (time.Time, error) {
	if !containsRed {
		now, err := tx.ReadClock(ctx)
		if err != nil {
			return time.Time{}, err
		}
		return now, nil
	}

	availableAt, err := tx.LockRedGate(ctx)
	if err != nil {
		return time.Time{}, err
	}
	now, err := tx.ReadClock(ctx)
	if err != nil {
		return time.Time{}, err
	}
	if now.Before(availableAt) {
		return time.Time{}, &RedConflictError{AvailableAt: availableAt.UTC()}
	}
	if err := tx.AdvanceRedGate(ctx, now); err != nil {
		return time.Time{}, err
	}
	return now, nil
}

// AsServiceUnavailable wraps operational failures when callers need a classified error.
func AsServiceUnavailable(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrServiceUnavailable) {
		return err
	}
	return fmt.Errorf("%w: %v", ErrServiceUnavailable, err)
}
