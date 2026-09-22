package pricing_test

import (
	"testing"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/pricing"
)

func TestCalculateFullPriceNonPairProducts(t *testing.T) {
	breakdown, err := pricing.Calculate(pricing.Input{
		Lines: []pricing.LineInput{
			{ProductCode: "BLUE", ProductName: "Blue set", DisplayOrder: 3, Quantity: 2, UnitPriceSatang: 3000},
			{ProductCode: "YELLOW", ProductName: "Yellow set", DisplayOrder: 4, Quantity: 1, UnitPriceSatang: 5000},
		},
	})
	if err != nil {
		t.Fatalf("Calculate: %v", err)
	}
	if breakdown.TotalBeforeDiscountSatang != 11000 {
		t.Fatalf("total before = %d, want 11000", breakdown.TotalBeforeDiscountSatang)
	}
	if breakdown.PairDiscountTotalSatang != 0 || len(breakdown.PairDiscounts) != 0 {
		t.Fatalf("pair discounts = %#v, want none", breakdown.PairDiscounts)
	}
	if breakdown.MemberApplied || breakdown.MemberDiscountSatang != 0 {
		t.Fatalf("member discount applied unexpectedly: %#v", breakdown)
	}
	if breakdown.FinalTotalSatang != 11000 {
		t.Fatalf("final total = %d, want 11000", breakdown.FinalTotalSatang)
	}
}

func TestCalculateReferenceCases(t *testing.T) {
	cases := []struct {
		name   string
		input  pricing.Input
		before int64
		pair   int64
		member int64
		final  int64
	}{
		{
			name: "orange x2",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "ORANGE", ProductName: "Orange set", DisplayOrder: 7, Quantity: 2, UnitPriceSatang: 12000},
			}},
			before: 24000, pair: 1200, member: 0, final: 22800,
		},
		{
			name: "pink x4",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "PINK", ProductName: "Pink set", DisplayOrder: 5, Quantity: 4, UnitPriceSatang: 8000},
			}},
			before: 32000, pair: 1600, member: 0, final: 30400,
		},
		{
			name: "green x3",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "GREEN", ProductName: "Green set", DisplayOrder: 2, Quantity: 3, UnitPriceSatang: 4000},
			}},
			before: 12000, pair: 400, member: 0, final: 11600,
		},
		{
			name: "orange x2 with member",
			input: pricing.Input{
				MemberPresent: true,
				Lines: []pricing.LineInput{
					{ProductCode: "ORANGE", ProductName: "Orange set", DisplayOrder: 7, Quantity: 2, UnitPriceSatang: 12000},
				},
			},
			before: 24000, pair: 1200, member: 2280, final: 20520,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := pricing.Calculate(tc.input)
			if err != nil {
				t.Fatalf("Calculate: %v", err)
			}
			if got.TotalBeforeDiscountSatang != tc.before ||
				got.PairDiscountTotalSatang != tc.pair ||
				got.MemberDiscountSatang != tc.member ||
				got.FinalTotalSatang != tc.final {
				t.Fatalf("got before=%d pair=%d member=%d final=%d, want %d/%d/%d/%d",
					got.TotalBeforeDiscountSatang, got.PairDiscountTotalSatang, got.MemberDiscountSatang, got.FinalTotalSatang,
					tc.before, tc.pair, tc.member, tc.final)
			}
		})
	}
}
