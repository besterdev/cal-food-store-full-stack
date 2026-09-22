package postgres

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/pricing"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

type placementTx struct {
	tx pgx.Tx
}

// BeginPlacement opens a READ COMMITTED transaction for Order acceptance.
func (s *Store) BeginPlacement(ctx context.Context) (ordering.PlacementTx, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, ordering.AsServiceUnavailable(fmt.Errorf("begin order transaction: %w", err))
	}
	return &placementTx{tx: tx}, nil
}

func (t *placementTx) ClaimIdempotency(ctx context.Context, prepared ordering.PreparedIntent, orderID uuid.UUID) (bool, error) {
	var inserted uuid.UUID
	err := t.tx.QueryRow(ctx, `
		INSERT INTO order_idempotency (key_digest, intent_digest, order_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (key_digest) DO NOTHING
		RETURNING order_id
	`, prepared.KeyDigest[:], prepared.IntentDigest[:], orderID).Scan(&inserted)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return false, classifyDBError("claim idempotency", err)
}

func (t *placementTx) LoadReceiptByKey(ctx context.Context, prepared ordering.PreparedIntent) (ordering.Receipt, error) {
	var (
		orderID      uuid.UUID
		intentDigest []byte
	)
	err := t.tx.QueryRow(ctx, `
		SELECT order_id, intent_digest
		FROM order_idempotency
		WHERE key_digest = $1
	`, prepared.KeyDigest[:]).Scan(&orderID, &intentDigest)
	if err != nil {
		return ordering.Receipt{}, classifyDBError("load idempotency binding", err)
	}
	if len(intentDigest) != 32 || !bytes.Equal(intentDigest, prepared.IntentDigest[:]) {
		return ordering.Receipt{}, ordering.ErrIdempotencyConflict
	}
	return t.loadReceipt(ctx, orderID)
}

func (t *placementTx) loadReceipt(ctx context.Context, orderID uuid.UUID) (ordering.Receipt, error) {
	var receipt ordering.Receipt
	receipt.OrderID = orderID
	receipt.Currency = "THB"
	err := t.tx.QueryRow(ctx, `
		SELECT placed_at,
		       total_before_discount_satang,
		       pair_discount_satang,
		       member_discount_applied,
		       member_discount_satang,
		       final_total_satang
		FROM orders
		WHERE id = $1
	`, orderID).Scan(
		&receipt.AcceptedAt,
		&receipt.TotalBeforeDiscountSatang,
		&receipt.PairDiscountTotalSatang,
		&receipt.MemberApplied,
		&receipt.MemberDiscountSatang,
		&receipt.FinalTotalSatang,
	)
	if err != nil {
		return ordering.Receipt{}, classifyDBError("load order", err)
	}
	receipt.AcceptedAt = receipt.AcceptedAt.UTC()

	rows, err := t.tx.Query(ctx, `
		SELECT product_code, product_name, quantity, unit_price_satang, line_subtotal_satang,
		       pair_count, pair_discount_satang, display_order
		FROM order_lines
		WHERE order_id = $1
		ORDER BY display_order ASC
	`, orderID)
	if err != nil {
		return ordering.Receipt{}, classifyDBError("load order lines", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			line       ordering.ReceiptLine
			pairCount  int32
			pairAmount int64
			display    int16
		)
		if err := rows.Scan(
			&line.ProductCode,
			&line.ProductName,
			&line.Quantity,
			&line.UnitPriceSatang,
			&line.LineTotalBeforeDiscountSatang,
			&pairCount,
			&pairAmount,
			&display,
		); err != nil {
			return ordering.Receipt{}, classifyDBError("scan order line", err)
		}
		_ = display
		receipt.Lines = append(receipt.Lines, line)
		if pairCount > 0 && pairAmount > 0 {
			receipt.PairDiscounts = append(receipt.PairDiscounts, ordering.PairDiscount{
				ProductCode:             line.ProductCode,
				PairCount:               pairCount,
				PairedQuantity:          pairCount * 2,
				DiscountRateBasisPoints: 500,
				DiscountSatang:          pairAmount,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return ordering.Receipt{}, classifyDBError("iterate order lines", err)
	}
	if receipt.PairDiscounts == nil {
		receipt.PairDiscounts = []ordering.PairDiscount{}
	}
	return receipt, nil
}

func (t *placementTx) LoadProducts(ctx context.Context, codes []string) (map[string]ordering.ProductSnapshot, error) {
	rows, err := t.tx.Query(ctx, `
		SELECT code, name, unit_price_satang, display_order
		FROM products
		WHERE code = ANY($1)
	`, codes)
	if err != nil {
		return nil, classifyDBError("load products", err)
	}
	defer rows.Close()

	products := make(map[string]ordering.ProductSnapshot, len(codes))
	for rows.Next() {
		var product ordering.ProductSnapshot
		if err := rows.Scan(&product.Code, &product.Name, &product.UnitPriceSatang, &product.DisplayOrder); err != nil {
			return nil, classifyDBError("scan product", err)
		}
		products[product.Code] = product
	}
	if err := rows.Err(); err != nil {
		return nil, classifyDBError("iterate products", err)
	}
	if len(products) != len(codes) {
		return nil, &ordering.ValidationError{Fields: []ordering.FieldError{{
			Field: "lines", Code: "UNSUPPORTED", Message: "product_code is not a supported Product",
		}}}
	}
	return products, nil
}

func (t *placementTx) ReadClock(ctx context.Context) (time.Time, error) {
	var now time.Time
	if err := t.tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return time.Time{}, classifyDBError("read database time", err)
	}
	return now, nil
}

func (t *placementTx) LockRedGate(ctx context.Context) (time.Time, error) {
	var availableAt pgtype.Timestamptz
	if err := t.tx.QueryRow(ctx, `
		SELECT available_at
		FROM red_availability_gate
		WHERE product_code = 'RED'
		FOR UPDATE
	`).Scan(&availableAt); err != nil {
		return time.Time{}, classifyDBError("lock red gate", err)
	}
	return gateTime(availableAt), nil
}

// gateTime maps PostgreSQL timestamptz, including the seeded -infinity value,
// into a comparable Go time. Negative infinity means Red is immediately available.
func gateTime(value pgtype.Timestamptz) time.Time {
	switch value.InfinityModifier {
	case pgtype.NegativeInfinity:
		return time.Time{}
	case pgtype.Infinity:
		return time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
	default:
		return value.Time
	}
}

func (t *placementTx) AdvanceRedGate(ctx context.Context, from time.Time) error {
	if _, err := t.tx.Exec(ctx, `
		UPDATE red_availability_gate
		SET available_at = $1::timestamptz + interval '60 minutes'
		WHERE product_code = 'RED'
	`, from); err != nil {
		return classifyDBError("update red gate", err)
	}
	return nil
}

func (t *placementTx) InsertAcceptedOrder(ctx context.Context, orderID uuid.UUID, acceptedAt time.Time, breakdown pricing.Breakdown) error {
	if _, err := t.tx.Exec(ctx, `
		INSERT INTO orders (
			id, placed_at, currency, member_discount_applied,
			total_before_discount_satang, pair_discount_satang,
			member_discount_satang, final_total_satang
		) VALUES ($1, $2, 'THB', $3, $4, $5, $6, $7)
	`, orderID, acceptedAt, breakdown.MemberApplied,
		breakdown.TotalBeforeDiscountSatang, breakdown.PairDiscountTotalSatang,
		breakdown.MemberDiscountSatang, breakdown.FinalTotalSatang,
	); err != nil {
		return classifyDBError("insert order", err)
	}

	for _, line := range breakdown.Lines {
		if _, err := t.tx.Exec(ctx, `
			INSERT INTO order_lines (
				order_id, product_code, product_name, display_order, quantity,
				unit_price_satang, line_subtotal_satang, pair_count,
				pair_discount_satang, line_total_after_pair_satang
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, orderID, line.ProductCode, line.ProductName, line.DisplayOrder, line.Quantity,
			line.UnitPriceSatang, line.LineSubtotalSatang, line.PairCount,
			line.PairDiscountSatang, line.LineTotalAfterPairSatang,
		); err != nil {
			return classifyDBError("insert order line", err)
		}
	}
	return nil
}

func (t *placementTx) Commit(ctx context.Context) error {
	if err := t.tx.Commit(ctx); err != nil {
		return classifyDBError("commit", err)
	}
	return nil
}

func (t *placementTx) Rollback(ctx context.Context) error {
	return t.tx.Rollback(ctx)
}

func classifyDBError(operation string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return ordering.AsServiceUnavailable(fmt.Errorf("%s: %s", operation, pgErr.Code))
	}
	return ordering.AsServiceUnavailable(fmt.Errorf("%s: %w", operation, err))
}
