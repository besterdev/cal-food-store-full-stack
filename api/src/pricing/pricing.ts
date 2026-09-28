export const ErrArithmetic = new Error("pricing arithmetic overflow");

const PAIR_ELIGIBLE = new Set(["GREEN", "PINK", "ORANGE"]);

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
    throw new Error("pricing requires at least one line");
  }

  const lines = [...input.lines].sort((a, b) => a.displayOrder - b.displayOrder);
  const results: LineResult[] = [];
  const pairDiscounts: PairDiscount[] = [];
  let totalBefore = 0;
  let pairTotal = 0;

  for (const line of lines) {
    const lineSubtotal = checkedMul(line.quantity, line.unitPriceSatang);
    let pairCount = 0;
    let pairDiscount = 0;

    if (PAIR_ELIGIBLE.has(line.productCode)) {
      pairCount = Math.trunc(line.quantity / 2);
      if (pairCount > 0) {
        const pairBase = checkedMul(pairCount * 2, line.unitPriceSatang);
        pairDiscount = roundHalfUpPercent(pairBase, 5);
      }
    }

    const lineAfterPair = checkedSub(lineSubtotal, pairDiscount);
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

    totalBefore = checkedAdd(totalBefore, lineSubtotal);
    pairTotal = checkedAdd(pairTotal, pairDiscount);

    if (pairCount > 0) {
      pairDiscounts.push({
        productCode: line.productCode,
        pairCount,
        pairedQuantity: pairCount * 2,
        discountRateBasisPoints: 500,
        discountSatang: pairDiscount,
      });
    }
  }

  const totalAfterPair = checkedSub(totalBefore, pairTotal);
  let memberDiscount = 0;
  if (input.memberPresent) {
    memberDiscount = roundHalfUpPercent(totalAfterPair, 10);
  }
  const finalTotal = checkedSub(totalAfterPair, memberDiscount);

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

const roundHalfUpPercent = (amount: number, percent: number): number => {
  const scaled = checkedMul(amount, percent);
  return Math.trunc((scaled + 50) / 100);
};

const assertSafeInt = (value: number): number => {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw ErrArithmetic;
  }
  return value;
};

const checkedMul = (a: number, b: number): number => {
  if (a === 0 || b === 0) {
    return 0;
  }
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw ErrArithmetic;
  }
  return product;
};

const checkedAdd = (a: number, b: number): number => assertSafeInt(a + b);

const checkedSub = (a: number, b: number): number => assertSafeInt(a - b);
