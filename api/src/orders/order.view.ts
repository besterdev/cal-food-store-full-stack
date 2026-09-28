import type { Receipt } from "./order.types.js";

/** Serializes a Receipt into the OpenAPI `OrderReceipt` JSON shape. */
export const toReceiptView = (receipt: Receipt) => ({
  order_id: receipt.orderId,
  accepted_at: receipt.acceptedAt.toISOString(),
  currency: receipt.currency,
  lines: receipt.lines.map((line) => ({
    product_code: line.productCode,
    product_name: line.productName,
    quantity: line.quantity,
    unit_price_satang: line.unitPriceSatang,
    line_total_before_discount_satang: line.lineTotalBeforeDiscountSatang,
  })),
  total_before_discount_satang: receipt.totalBeforeDiscountSatang,
  pair_discounts: receipt.pairDiscounts.map((discount) => ({
    product_code: discount.productCode,
    pair_count: discount.pairCount,
    paired_quantity: discount.pairedQuantity,
    discount_rate_basis_points: discount.discountRateBasisPoints,
    discount_satang: discount.discountSatang,
  })),
  pair_discount_total_satang: receipt.pairDiscountTotalSatang,
  member_applied: receipt.memberApplied,
  member_discount_satang: receipt.memberDiscountSatang,
  final_total_satang: receipt.finalTotalSatang,
});
