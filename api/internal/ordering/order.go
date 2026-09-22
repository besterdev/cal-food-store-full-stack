package ordering

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/pricing"
	"github.com/google/uuid"
)

var (
	ErrInvalidIdempotencyKey = errors.New("invalid idempotency key")
	ErrValidation            = errors.New("order validation failed")
	ErrIdempotencyConflict   = errors.New("idempotency conflict")
	ErrRedUnavailable        = errors.New("red unavailable")
	ErrServiceUnavailable    = errors.New("order service unavailable")
	ErrInternal              = errors.New("order internal error")
)

// Line is one requested Order Line before catalog enrichment.
type Line struct {
	ProductCode string
	Quantity    int32
}

// Command is the HTTP-decoded Order placement command.
type Command struct {
	IdempotencyKey   string
	Lines            []Line
	MemberCardNumber *string
}

// FieldError is a stable field-level validation failure.
type FieldError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ValidationError carries field-level details for VALIDATION_ERROR responses.
type ValidationError struct {
	Fields []FieldError
}

func (e *ValidationError) Error() string {
	return ErrValidation.Error()
}

func (e *ValidationError) Unwrap() error {
	return ErrValidation
}

// RedConflictError carries the next available Red timestamp.
type RedConflictError struct {
	AvailableAt time.Time
}

func (e *RedConflictError) Error() string {
	return ErrRedUnavailable.Error()
}

func (e *RedConflictError) Unwrap() error {
	return ErrRedUnavailable
}

// ReceiptLine is one committed Order Line on the public receipt.
type ReceiptLine struct {
	ProductCode                   string
	ProductName                   string
	Quantity                      int32
	UnitPriceSatang               int64
	LineTotalBeforeDiscountSatang int64
}

// PairDiscount mirrors the OpenAPI PairDiscount object.
type PairDiscount struct {
	ProductCode             string
	PairCount               int32
	PairedQuantity          int32
	DiscountRateBasisPoints int32
	DiscountSatang          int64
}

// Receipt is the committed Order receipt returned to the Customer.
type Receipt struct {
	OrderID                   uuid.UUID
	AcceptedAt                time.Time
	Currency                  string
	Lines                     []ReceiptLine
	TotalBeforeDiscountSatang int64
	PairDiscounts             []PairDiscount
	PairDiscountTotalSatang   int64
	MemberApplied             bool
	MemberDiscountSatang      int64
	FinalTotalSatang          int64
}

// PreparedIntent is the structurally validated, canonicalized Order Intent.
type PreparedIntent struct {
	KeyDigest     [32]byte
	IntentDigest  [32]byte
	MemberPresent bool
	Lines         []Line
}

var supportedProducts = map[string]struct{}{
	"RED": {}, "GREEN": {}, "BLUE": {}, "YELLOW": {}, "PINK": {}, "PURPLE": {}, "ORANGE": {},
}

// Prepare validates structural Order rules and builds canonical digests.
func Prepare(command Command) (PreparedIntent, error) {
	if !validIdempotencyKey(command.IdempotencyKey) {
		return PreparedIntent{}, ErrInvalidIdempotencyKey
	}
	if len(command.Lines) == 0 {
		return PreparedIntent{}, &ValidationError{Fields: []FieldError{{
			Field: "lines", Code: "REQUIRED", Message: "at least one Order Line is required",
		}}}
	}
	if len(command.Lines) > 7 {
		return PreparedIntent{}, &ValidationError{Fields: []FieldError{{
			Field: "lines", Code: "OUT_OF_RANGE", Message: "an Order may contain at most seven Order Lines",
		}}}
	}

	seen := make(map[string]struct{}, len(command.Lines))
	normalized := make([]Line, 0, len(command.Lines))
	var fields []FieldError
	for index, line := range command.Lines {
		fieldPrefix := fmt.Sprintf("lines[%d]", index)
		if _, ok := supportedProducts[line.ProductCode]; !ok {
			fields = append(fields, FieldError{
				Field: fieldPrefix + ".product_code", Code: "UNSUPPORTED", Message: "product_code is not a supported Product",
			})
			continue
		}
		if _, duplicate := seen[line.ProductCode]; duplicate {
			fields = append(fields, FieldError{
				Field: fieldPrefix + ".product_code", Code: "DUPLICATE", Message: "product_code must be unique within the Order",
			})
			continue
		}
		if line.Quantity < 1 || line.Quantity > 999 {
			fields = append(fields, FieldError{
				Field: fieldPrefix + ".quantity", Code: "OUT_OF_RANGE", Message: "quantity must be an integer from 1 through 999",
			})
			continue
		}
		seen[line.ProductCode] = struct{}{}
		normalized = append(normalized, line)
	}
	if len(fields) > 0 {
		return PreparedIntent{}, &ValidationError{Fields: fields}
	}

	memberPresent := false
	if command.MemberCardNumber != nil && strings.TrimSpace(*command.MemberCardNumber) != "" {
		memberPresent = true
	}

	sorted := append([]Line(nil), normalized...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ProductCode < sorted[j].ProductCode })

	var canonical bytes.Buffer
	canonical.WriteString("v1\n")
	if memberPresent {
		canonical.WriteString("member=1\n")
	} else {
		canonical.WriteString("member=0\n")
	}
	for _, line := range sorted {
		fmt.Fprintf(&canonical, "%s=%d\n", line.ProductCode, line.Quantity)
	}

	return PreparedIntent{
		KeyDigest:     sha256.Sum256([]byte(command.IdempotencyKey)),
		IntentDigest:  sha256.Sum256(canonical.Bytes()),
		MemberPresent: memberPresent,
		Lines:         sorted,
	}, nil
}

func validIdempotencyKey(value string) bool {
	if len(value) < 1 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if character < 0x20 || character > 0x7e || !unicode.IsPrint(character) {
			return false
		}
	}
	return true
}

// ReceiptFromBreakdown maps a priced breakdown onto the public receipt shape.
func ReceiptFromBreakdown(orderID uuid.UUID, acceptedAt time.Time, breakdown pricing.Breakdown) Receipt {
	lines := make([]ReceiptLine, 0, len(breakdown.Lines))
	for _, line := range breakdown.Lines {
		lines = append(lines, ReceiptLine{
			ProductCode:                   line.ProductCode,
			ProductName:                   line.ProductName,
			Quantity:                      line.Quantity,
			UnitPriceSatang:               line.UnitPriceSatang,
			LineTotalBeforeDiscountSatang: line.LineSubtotalSatang,
		})
	}
	pairDiscounts := make([]PairDiscount, 0, len(breakdown.PairDiscounts))
	for _, discount := range breakdown.PairDiscounts {
		pairDiscounts = append(pairDiscounts, PairDiscount{
			ProductCode:             discount.ProductCode,
			PairCount:               discount.PairCount,
			PairedQuantity:          discount.PairedQuantity,
			DiscountRateBasisPoints: discount.DiscountRateBasisPoints,
			DiscountSatang:          discount.DiscountSatang,
		})
	}
	return Receipt{
		OrderID:                   orderID,
		AcceptedAt:                acceptedAt,
		Currency:                  "THB",
		Lines:                     lines,
		TotalBeforeDiscountSatang: breakdown.TotalBeforeDiscountSatang,
		PairDiscounts:             pairDiscounts,
		PairDiscountTotalSatang:   breakdown.PairDiscountTotalSatang,
		MemberApplied:             breakdown.MemberApplied,
		MemberDiscountSatang:      breakdown.MemberDiscountSatang,
		FinalTotalSatang:          breakdown.FinalTotalSatang,
	}
}
