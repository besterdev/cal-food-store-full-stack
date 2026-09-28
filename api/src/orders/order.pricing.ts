import { PricingError } from "./order.types.js";

const PAIR_ELIGIBLE = new Set(["GREEN", "PINK", "ORANGE"]);
const PAIR_DISCOUNT_PERCENT = 5;
const MEMBER_DISCOUNT_PERCENT = 10;
export const PAIR_DISCOUNT_BASIS_POINTS = PAIR_DISCOUNT_PERCENT * 100;

export interface LineInput {
  productCode: string;
  productName: string;
  displayOrder: number;
  quantity: number;
  unitPriceSatang: number;
}

export interface PricingInput {
  lines: LineInput[];
  memberPresent: boolean;
}

export interface LineResult {
  productCode: string;
  productName: string;
  displayOrder: number;
  quantity: number;
  unitPriceSatang: number;
  lineSubtotalSatang: number;
  pairCount: number;
  pairDiscountSatang: number;
  lineTotalAfterPairSatang: number;
}

export interface PairDiscount {
  productCode: string;
  pairCount: number;
  pairedQuantity: number;
  discountRateBasisPoints: number;
  discountSatang: number;
}

export interface Breakdown {
  lines: LineResult[];
  totalBeforeDiscountSatang: number;
  pairDiscounts: PairDiscount[];
  pairDiscountTotalSatang: number;
  memberApplied: boolean;
  memberDiscountSatang: number;
  finalTotalSatang: number;
}

/** Prices an Order Intent using integer satang arithmetic (Number / safe int). */
export const calculate = (input: PricingInput): Breakdown => {
  if (input.lines.length === 0) {
    throw new PricingError("pricing requires at least one line");
  }

  const lines = [...input.lines].sort((a, b) => a.displayOrder - b.displayOrder);
  const results: LineResult[] = [];
  const pairDiscounts: PairDiscount[] = [];
  let totalBefore = 0;
  let pairTotal = 0;

  for (const line of lines) {
    const lineSubtotal = safe(line.quantity * line.unitPriceSatang);
    const pairCount = PAIR_ELIGIBLE.has(line.productCode)
      ? Math.trunc(line.quantity / 2)
      : 0;
    const pairDiscount = roundHalfUpPercent(
      safe(pairCount * 2 * line.unitPriceSatang),
      PAIR_DISCOUNT_PERCENT,
    );
    const lineAfterPair = safe(lineSubtotal - pairDiscount);
    results.push({
      productCode: line.productCode,
      productName: line.productName,
      displayOrder: line.displayOrder,
      quantity: line.quantity,
      unitPriceSatang: line.unitPriceSatang,
      lineSubtotalSatang: lineSubtotal,
      pairCount,
      pairDiscountSatang: pairDiscount,
      lineTotalAfterPairSatang: lineAfterPair,
    });

    totalBefore = safe(totalBefore + lineSubtotal);
    pairTotal = safe(pairTotal + pairDiscount);

    if (pairCount > 0) {
      pairDiscounts.push({
        productCode: line.productCode,
        pairCount,
        pairedQuantity: pairCount * 2,
        discountRateBasisPoints: PAIR_DISCOUNT_BASIS_POINTS,
        discountSatang: pairDiscount,
      });
    }
  }

  const totalAfterPair = safe(totalBefore - pairTotal);
  const memberDiscount = input.memberPresent
    ? roundHalfUpPercent(totalAfterPair, MEMBER_DISCOUNT_PERCENT)
    : 0;
  const finalTotal = safe(totalAfterPair - memberDiscount);

  return {
    lines: results,
    totalBeforeDiscountSatang: totalBefore,
    pairDiscounts,
    pairDiscountTotalSatang: pairTotal,
    memberApplied: input.memberPresent,
    memberDiscountSatang: memberDiscount,
    finalTotalSatang: finalTotal,
  };
};

/** Integer percentage of a satang amount, rounded half-up. */
const roundHalfUpPercent = (amount: number, percent: number): number =>
  Math.trunc(safe(safe(amount * percent) + 50) / 100);

/** Every intermediate satang value must stay an exact safe integer. */
const safe = (value: number): number => {
  if (!Number.isSafeInteger(value)) {
    throw new PricingError("pricing arithmetic overflow");
  }
  return value;
};
