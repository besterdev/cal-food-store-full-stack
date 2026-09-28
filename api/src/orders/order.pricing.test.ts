import { describe, expect, it } from "vitest";

import { calculate, type PricingInput } from "./order.pricing.js";

describe("calculate", () => {
  it("prices full-price non-pair products", () => {
    const breakdown = calculate({
      lines: [
        {
          productCode: "BLUE",
          productName: "Blue set",
          displayOrder: 3,
          quantity: 2,
          unitPriceSatang: 3000,
        },
        {
          productCode: "YELLOW",
          productName: "Yellow set",
          displayOrder: 4,
          quantity: 1,
          unitPriceSatang: 5000,
        },
      ],
      memberPresent: false,
    });

    expect(breakdown.totalBeforeDiscountSatang).toBe(11000);
    expect(breakdown.pairDiscountTotalSatang).toBe(0);
    expect(breakdown.pairDiscounts).toHaveLength(0);
    expect(breakdown.memberApplied).toBe(false);
    expect(breakdown.memberDiscountSatang).toBe(0);
    expect(breakdown.finalTotalSatang).toBe(11000);
  });

  it.each([
    {
      name: "orange x2",
      input: {
        memberPresent: false,
        lines: [
          {
            productCode: "ORANGE",
            productName: "Orange set",
            displayOrder: 7,
            quantity: 2,
            unitPriceSatang: 12000,
          },
        ],
      } satisfies PricingInput,
      before: 24000,
      pairTotal: 1200,
      member: 0,
      final: 22800,
      pairRows: [
        {
          productCode: "ORANGE",
          pairCount: 1,
          pairedQuantity: 2,
          discountRateBasisPoints: 500,
          discountSatang: 1200,
        },
      ],
    },
    {
      name: "pink x4",
      input: {
        memberPresent: false,
        lines: [
          {
            productCode: "PINK",
            productName: "Pink set",
            displayOrder: 5,
            quantity: 4,
            unitPriceSatang: 8000,
          },
        ],
      } satisfies PricingInput,
      before: 32000,
      pairTotal: 1600,
      member: 0,
      final: 30400,
      pairRows: [
        {
          productCode: "PINK",
          pairCount: 2,
          pairedQuantity: 4,
          discountRateBasisPoints: 500,
          discountSatang: 1600,
        },
      ],
    },
    {
      name: "green x3 odd remainder at full price",
      input: {
        memberPresent: false,
        lines: [
          {
            productCode: "GREEN",
            productName: "Green set",
            displayOrder: 2,
            quantity: 3,
            unitPriceSatang: 4000,
          },
        ],
      } satisfies PricingInput,
      before: 12000,
      pairTotal: 400,
      member: 0,
      final: 11600,
      pairRows: [
        {
          productCode: "GREEN",
          pairCount: 1,
          pairedQuantity: 2,
          discountRateBasisPoints: 500,
          discountSatang: 400,
        },
      ],
    },
    {
      name: "orange x1 zero pairs",
      input: {
        memberPresent: false,
        lines: [
          {
            productCode: "ORANGE",
            productName: "Orange set",
            displayOrder: 7,
            quantity: 1,
            unitPriceSatang: 12000,
          },
        ],
      } satisfies PricingInput,
      before: 12000,
      pairTotal: 0,
      member: 0,
      final: 12000,
      pairRows: [],
    },
    {
      name: "orange x2 with member after pair",
      input: {
        memberPresent: true,
        lines: [
          {
            productCode: "ORANGE",
            productName: "Orange set",
            displayOrder: 7,
            quantity: 2,
            unitPriceSatang: 12000,
          },
        ],
      } satisfies PricingInput,
      before: 24000,
      pairTotal: 1200,
      member: 2280,
      final: 20520,
      pairRows: [
        {
          productCode: "ORANGE",
          pairCount: 1,
          pairedQuantity: 2,
          discountRateBasisPoints: 500,
          discountSatang: 1200,
        },
      ],
    },
    {
      name: "member only without pair products",
      input: {
        memberPresent: true,
        lines: [
          {
            productCode: "BLUE",
            productName: "Blue set",
            displayOrder: 3,
            quantity: 1,
            unitPriceSatang: 3000,
          },
        ],
      } satisfies PricingInput,
      before: 3000,
      pairTotal: 0,
      member: 300,
      final: 2700,
      pairRows: [],
    },
  ])("$name", ({ input, before, pairTotal, member, final, pairRows }) => {
    const got = calculate(input);
    expect(got.totalBeforeDiscountSatang).toBe(before);
    expect(got.pairDiscountTotalSatang).toBe(pairTotal);
    expect(got.memberDiscountSatang).toBe(member);
    expect(got.finalTotalSatang).toBe(final);
    expect(got.finalTotalSatang).toBe(
      got.totalBeforeDiscountSatang -
        got.pairDiscountTotalSatang -
        got.memberDiscountSatang,
    );
    expect(got.pairDiscounts).toEqual(pairRows);
  });

  it("rounds pair discount half-up", () => {
    const got = calculate({
      memberPresent: false,
      lines: [
        {
          productCode: "GREEN",
          productName: "Green set",
          displayOrder: 2,
          quantity: 2,
          unitPriceSatang: 5,
        },
      ],
    });
    expect(got.pairDiscountTotalSatang).toBe(1);
    expect(got.finalTotalSatang).toBe(9);
  });

  it("rounds member discount half-up after pair", () => {
    const got = calculate({
      memberPresent: true,
      lines: [
        {
          productCode: "BLUE",
          productName: "Blue set",
          displayOrder: 3,
          quantity: 3,
          unitPriceSatang: 5,
        },
      ],
    });
    expect(got.pairDiscountTotalSatang).toBe(0);
    expect(got.memberDiscountSatang).toBe(2);
    expect(got.finalTotalSatang).toBe(13);
    expect(got.memberApplied).toBe(true);
  });
});
