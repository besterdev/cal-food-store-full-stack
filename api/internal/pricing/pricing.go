package pricing

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// ErrArithmetic indicates a checked monetary calculation could not fit in int64 satang.
var ErrArithmetic = errors.New("pricing arithmetic overflow")

var pairEligible = map[string]struct{}{
	"GREEN":  {},
	"PINK":   {},
	"ORANGE": {},
}

// LineInput is one validated Order Line with an authoritative Product snapshot.
type LineInput struct {
	ProductCode     string
	ProductName     string
	DisplayOrder    int16
	Quantity        int32
	UnitPriceSatang int64
}

// Input is the Pricing Module input after catalog validation.
type Input struct {
	Lines         []LineInput
	MemberPresent bool
}

// LineResult is the priced snapshot for one Order Line.
type LineResult struct {
	ProductCode              string
	ProductName              string
	DisplayOrder             int16
	Quantity                 int32
	UnitPriceSatang          int64
	LineSubtotalSatang       int64
	PairCount                int32
	PairDiscountSatang       int64
	LineTotalAfterPairSatang int64
}

// PairDiscount is one receipt row for an eligible Product with at least one Pair.
type PairDiscount struct {
	ProductCode             string
	PairCount               int32
	PairedQuantity          int32
	DiscountRateBasisPoints int32
	DiscountSatang          int64
}

// Breakdown is the immutable Pricing Breakdown for an accepted Order.
type Breakdown struct {
	Lines                     []LineResult
	TotalBeforeDiscountSatang int64
	PairDiscounts             []PairDiscount
	PairDiscountTotalSatang   int64
	MemberApplied             bool
	MemberDiscountSatang      int64
	FinalTotalSatang          int64
}

// Calculate prices an Order Intent using integer satang arithmetic.
func Calculate(input Input) (Breakdown, error) {
	if len(input.Lines) == 0 {
		return Breakdown{}, fmt.Errorf("pricing requires at least one line")
	}

	lines := append([]LineInput(nil), input.Lines...)
	sort.SliceStable(lines, func(i, j int) bool {
		return lines[i].DisplayOrder < lines[j].DisplayOrder
	})

	results := make([]LineResult, 0, len(lines))
	pairDiscounts := make([]PairDiscount, 0, 3)
	var totalBefore int64
	var pairTotal int64

	for _, line := range lines {
		lineSubtotal, err := checkedMulInt64(int64(line.Quantity), line.UnitPriceSatang)
		if err != nil {
			return Breakdown{}, err
		}

		pairCount := int32(0)
		pairDiscount := int64(0)
		if _, ok := pairEligible[line.ProductCode]; ok {
			pairCount = line.Quantity / 2
			if pairCount > 0 {
				pairBase, err := checkedMulInt64(int64(pairCount)*2, line.UnitPriceSatang)
				if err != nil {
					return Breakdown{}, err
				}
				pairDiscount, err = roundHalfUpPercent(pairBase, 5)
				if err != nil {
					return Breakdown{}, err
				}
			}
		}

		lineAfterPair, err := checkedSubInt64(lineSubtotal, pairDiscount)
		if err != nil {
			return Breakdown{}, err
		}

		results = append(results, LineResult{
			ProductCode:              line.ProductCode,
			ProductName:              line.ProductName,
			DisplayOrder:             line.DisplayOrder,
			Quantity:                 line.Quantity,
			UnitPriceSatang:          line.UnitPriceSatang,
			LineSubtotalSatang:       lineSubtotal,
			PairCount:                pairCount,
			PairDiscountSatang:       pairDiscount,
			LineTotalAfterPairSatang: lineAfterPair,
		})

		totalBefore, err = checkedAddInt64(totalBefore, lineSubtotal)
		if err != nil {
			return Breakdown{}, err
		}
		pairTotal, err = checkedAddInt64(pairTotal, pairDiscount)
		if err != nil {
			return Breakdown{}, err
		}
		if pairCount > 0 {
			pairDiscounts = append(pairDiscounts, PairDiscount{
				ProductCode:             line.ProductCode,
				PairCount:               pairCount,
				PairedQuantity:          pairCount * 2,
				DiscountRateBasisPoints: 500,
				DiscountSatang:          pairDiscount,
			})
		}
	}

	totalAfterPair, err := checkedSubInt64(totalBefore, pairTotal)
	if err != nil {
		return Breakdown{}, err
	}

	memberDiscount := int64(0)
	if input.MemberPresent {
		memberDiscount, err = roundHalfUpPercent(totalAfterPair, 10)
		if err != nil {
			return Breakdown{}, err
		}
	}

	finalTotal, err := checkedSubInt64(totalAfterPair, memberDiscount)
	if err != nil {
		return Breakdown{}, err
	}

	return Breakdown{
		Lines:                     results,
		TotalBeforeDiscountSatang: totalBefore,
		PairDiscounts:             pairDiscounts,
		PairDiscountTotalSatang:   pairTotal,
		MemberApplied:             input.MemberPresent,
		MemberDiscountSatang:      memberDiscount,
		FinalTotalSatang:          finalTotal,
	}, nil
}

func roundHalfUpPercent(amount int64, percent int64) (int64, error) {
	scaled, err := checkedMulInt64(amount, percent)
	if err != nil {
		return 0, err
	}
	return (scaled + 50) / 100, nil
}

func checkedMulInt64(a, b int64) (int64, error) {
	if a == 0 || b == 0 {
		return 0, nil
	}
	if a > 0 && b > 0 && a > math.MaxInt64/b {
		return 0, ErrArithmetic
	}
	if a > 0 && b < 0 && b < math.MinInt64/a {
		return 0, ErrArithmetic
	}
	if a < 0 && b > 0 && a < math.MinInt64/b {
		return 0, ErrArithmetic
	}
	if a < 0 && b < 0 && a < math.MaxInt64/b {
		return 0, ErrArithmetic
	}
	return a * b, nil
}

func checkedAddInt64(a, b int64) (int64, error) {
	if b > 0 && a > math.MaxInt64-b {
		return 0, ErrArithmetic
	}
	if b < 0 && a < math.MinInt64-b {
		return 0, ErrArithmetic
	}
	return a + b, nil
}

func checkedSubInt64(a, b int64) (int64, error) {
	if b > 0 && a < math.MinInt64+b {
		return 0, ErrArithmetic
	}
	if b < 0 && a > math.MaxInt64+b {
		return 0, ErrArithmetic
	}
	return a - b, nil
}
