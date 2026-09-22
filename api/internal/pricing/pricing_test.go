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

func TestCalculatePairDiscountCases(t *testing.T) {
	cases := []struct {
		name             string
		input            pricing.Input
		before           int64
		pairTotal        int64
		member           int64
		final            int64
		pairRows         []pricing.PairDiscount
		wantPairRowCount int
	}{
		{
			name: "orange x2",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "ORANGE", ProductName: "Orange set", DisplayOrder: 7, Quantity: 2, UnitPriceSatang: 12000},
			}},
			before: 24000, pairTotal: 1200, member: 0, final: 22800,
			pairRows: []pricing.PairDiscount{{
				ProductCode: "ORANGE", PairCount: 1, PairedQuantity: 2, DiscountRateBasisPoints: 500, DiscountSatang: 1200,
			}},
			wantPairRowCount: 1,
		},
		{
			name: "pink x4",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "PINK", ProductName: "Pink set", DisplayOrder: 5, Quantity: 4, UnitPriceSatang: 8000},
			}},
			before: 32000, pairTotal: 1600, member: 0, final: 30400,
			pairRows: []pricing.PairDiscount{{
				ProductCode: "PINK", PairCount: 2, PairedQuantity: 4, DiscountRateBasisPoints: 500, DiscountSatang: 1600,
			}},
			wantPairRowCount: 1,
		},
		{
			name: "green x3 odd remainder at full price",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "GREEN", ProductName: "Green set", DisplayOrder: 2, Quantity: 3, UnitPriceSatang: 4000},
			}},
			before: 12000, pairTotal: 400, member: 0, final: 11600,
			pairRows: []pricing.PairDiscount{{
				ProductCode: "GREEN", PairCount: 1, PairedQuantity: 2, DiscountRateBasisPoints: 500, DiscountSatang: 400,
			}},
			wantPairRowCount: 1,
		},
		{
			name: "orange x1 zero pairs",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "ORANGE", ProductName: "Orange set", DisplayOrder: 7, Quantity: 1, UnitPriceSatang: 12000},
			}},
			before: 12000, pairTotal: 0, member: 0, final: 12000,
			wantPairRowCount: 0,
		},
		{
			name: "ineligible red blue yellow purple never pair",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "RED", ProductName: "Red set", DisplayOrder: 1, Quantity: 4, UnitPriceSatang: 5000},
				{ProductCode: "BLUE", ProductName: "Blue set", DisplayOrder: 3, Quantity: 2, UnitPriceSatang: 3000},
				{ProductCode: "YELLOW", ProductName: "Yellow set", DisplayOrder: 4, Quantity: 2, UnitPriceSatang: 5000},
				{ProductCode: "PURPLE", ProductName: "Purple set", DisplayOrder: 6, Quantity: 2, UnitPriceSatang: 9000},
			}},
			before: 54000, pairTotal: 0, member: 0, final: 54000,
			wantPairRowCount: 0,
		},
		{
			name: "mixed eligible and ineligible",
			input: pricing.Input{Lines: []pricing.LineInput{
				{ProductCode: "GREEN", ProductName: "Green set", DisplayOrder: 2, Quantity: 3, UnitPriceSatang: 4000},
				{ProductCode: "PINK", ProductName: "Pink set", DisplayOrder: 5, Quantity: 4, UnitPriceSatang: 8000},
				{ProductCode: "BLUE", ProductName: "Blue set", DisplayOrder: 3, Quantity: 1, UnitPriceSatang: 3000},
			}},
			before: 47000, pairTotal: 2000, member: 0, final: 45000,
			pairRows: []pricing.PairDiscount{
				{ProductCode: "GREEN", PairCount: 1, PairedQuantity: 2, DiscountRateBasisPoints: 500, DiscountSatang: 400},
				{ProductCode: "PINK", PairCount: 2, PairedQuantity: 4, DiscountRateBasisPoints: 500, DiscountSatang: 1600},
			},
			wantPairRowCount: 2,
		},
		{
			name: "orange x2 with member after pair",
			input: pricing.Input{
				MemberPresent: true,
				Lines: []pricing.LineInput{
					{ProductCode: "ORANGE", ProductName: "Orange set", DisplayOrder: 7, Quantity: 2, UnitPriceSatang: 12000},
				},
			},
			before: 24000, pairTotal: 1200, member: 2280, final: 20520,
			pairRows: []pricing.PairDiscount{{
				ProductCode: "ORANGE", PairCount: 1, PairedQuantity: 2, DiscountRateBasisPoints: 500, DiscountSatang: 1200,
			}},
			wantPairRowCount: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := pricing.Calculate(tc.input)
			if err != nil {
				t.Fatalf("Calculate: %v", err)
			}
			if got.TotalBeforeDiscountSatang != tc.before ||
				got.PairDiscountTotalSatang != tc.pairTotal ||
				got.MemberDiscountSatang != tc.member ||
				got.FinalTotalSatang != tc.final {
				t.Fatalf("got before=%d pair=%d member=%d final=%d, want %d/%d/%d/%d",
					got.TotalBeforeDiscountSatang, got.PairDiscountTotalSatang, got.MemberDiscountSatang, got.FinalTotalSatang,
					tc.before, tc.pairTotal, tc.member, tc.final)
			}
			if got.FinalTotalSatang != got.TotalBeforeDiscountSatang-got.PairDiscountTotalSatang-got.MemberDiscountSatang {
				t.Fatalf("invariant broken: final=%d before=%d pair=%d member=%d",
					got.FinalTotalSatang, got.TotalBeforeDiscountSatang, got.PairDiscountTotalSatang, got.MemberDiscountSatang)
			}
			var pairRowSum int64
			for _, row := range got.PairDiscounts {
				pairRowSum += row.DiscountSatang
			}
			if pairRowSum != got.PairDiscountTotalSatang {
				t.Fatalf("pair row sum = %d, want total %d", pairRowSum, got.PairDiscountTotalSatang)
			}
			if len(got.PairDiscounts) != tc.wantPairRowCount {
				t.Fatalf("pair row count = %d, want %d (%#v)", len(got.PairDiscounts), tc.wantPairRowCount, got.PairDiscounts)
			}
			for index, want := range tc.pairRows {
				gotRow := got.PairDiscounts[index]
				if gotRow != want {
					t.Fatalf("pair row[%d] = %#v, want %#v", index, gotRow, want)
				}
			}
		})
	}
}

func TestCalculatePairDiscountRoundsHalfUp(t *testing.T) {
	// Paired base 10 satang * 5% = 0.5 satang → rounds to 1.
	got, err := pricing.Calculate(pricing.Input{Lines: []pricing.LineInput{
		{ProductCode: "GREEN", ProductName: "Green set", DisplayOrder: 2, Quantity: 2, UnitPriceSatang: 5},
	}})
	if err != nil {
		t.Fatalf("Calculate: %v", err)
	}
	if got.PairDiscountTotalSatang != 1 || got.FinalTotalSatang != 9 {
		t.Fatalf("got pair=%d final=%d, want pair=1 final=9", got.PairDiscountTotalSatang, got.FinalTotalSatang)
	}
}
