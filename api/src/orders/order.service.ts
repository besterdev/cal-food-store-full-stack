import { createHash } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

import {
  ErrInternal,
  ErrInvalidIdempotencyKey,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type FieldError,
} from "./order.errors.js";
import type { OrderModel } from "./order.model.js";
import { calculate, type Breakdown, type PricingInput } from "./order.pricing.js";
import type {
  OrderLine,
  PlacementTx,
  PlaceOrderCommand,
  PreparedIntent,
  Receipt,
} from "./order.types.js";

const SUPPORTED_PRODUCTS = new Set([
  "RED",
  "GREEN",
  "BLUE",
  "YELLOW",
  "PINK",
  "PURPLE",
  "ORANGE",
]);

export class OrderService {
  constructor(private readonly orders: OrderModel) {}

  async placeOrder(
    command: PlaceOrderCommand,
    signal?: AbortSignal,
  ): Promise<Receipt> {
    if (signal?.aborted) {
      throw new ServiceUnavailableError("request timed out", signal.reason);
    }

    const prepared = prepare(command);
    const tx = await this.orders.beginPlacement(signal);
    try {
      throwIfAborted(signal);
      const orderId = uuidv7();
      const claimed = await tx.claimIdempotency(prepared, orderId);
      if (!claimed) {
        const receipt = await tx.loadReceiptByKey(prepared);
        await tx.commit();
        return receipt;
      }

      const codes = prepared.lines.map((line) => line.productCode);
      const products = await tx.loadProducts(codes);

      const pricingInput: PricingInput = {
        memberPresent: prepared.memberPresent,
        lines: [],
      };
      let containsRed = false;

      for (const line of prepared.lines) {
        const product = products.get(line.productCode);
        if (!product) {
          throw new ValidationError([
            {
              field: "lines",
              code: "UNSUPPORTED",
              message: "product_code is not a supported Product",
            },
          ]);
        }
        if (line.productCode === "RED") {
          containsRed = true;
        }
        pricingInput.lines.push({
          productCode: product.code,
          productName: product.name,
          displayOrder: product.displayOrder,
          quantity: line.quantity,
          unitPriceSatang: product.unitPriceSatang,
        });
      }

      let breakdown;
      try {
        breakdown = calculate(pricingInput);
      } catch (err) {
        throw Object.assign(new Error(ErrInternal.message, { cause: err }), {
          name: "InternalError",
        });
      }

      throwIfAborted(signal);
      const acceptedAt = await applyRedGate(tx, containsRed);
      await tx.insertAcceptedOrder(orderId, acceptedAt, breakdown);
      await tx.commit();
      return receiptFromBreakdown(
        orderId,
        new Date(acceptedAt.toISOString()),
        breakdown,
      );
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // ignore rollback errors after a prior failure
      }
      if (signal?.aborted) {
        throw new ServiceUnavailableError("request timed out", err);
      }
      throw err;
    }
  }
}

/** Validates structural Order rules and builds canonical digests. */
export const prepare = (command: PlaceOrderCommand): PreparedIntent => {
  if (!validIdempotencyKey(command.idempotencyKey)) {
    throw ErrInvalidIdempotencyKey;
  }
  if (command.lines.length === 0) {
    throw new ValidationError([
      {
        field: "lines",
        code: "REQUIRED",
        message: "at least one Order Line is required",
      },
    ]);
  }
  if (command.lines.length > 7) {
    throw new ValidationError([
      {
        field: "lines",
        code: "OUT_OF_RANGE",
        message: "an Order may contain at most seven Order Lines",
      },
    ]);
  }

  const seen = new Set<string>();
  const normalized: OrderLine[] = [];
  const fields: FieldError[] = [];

  command.lines.forEach((line, index) => {
    const fieldPrefix = `lines[${index}]`;
    if (!SUPPORTED_PRODUCTS.has(line.productCode)) {
      fields.push({
        field: `${fieldPrefix}.product_code`,
        code: "UNSUPPORTED",
        message: "product_code is not a supported Product",
      });
      return;
    }
    if (seen.has(line.productCode)) {
      fields.push({
        field: `${fieldPrefix}.product_code`,
        code: "DUPLICATE",
        message: "product_code must be unique within the Order",
      });
      return;
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 999
    ) {
      fields.push({
        field: `${fieldPrefix}.quantity`,
        code: "OUT_OF_RANGE",
        message: "quantity must be an integer from 1 through 999",
      });
      return;
    }
    seen.add(line.productCode);
    normalized.push(line);
  });

  if (fields.length > 0) {
    throw new ValidationError(fields);
  }

  const memberPresent =
    command.memberCardNumber !== undefined &&
    command.memberCardNumber !== null &&
    command.memberCardNumber.trim() !== "";

  const sorted = [...normalized].sort((a, b) =>
    a.productCode < b.productCode ? -1 : a.productCode > b.productCode ? 1 : 0,
  );

  let canonical = "v1\n";
  canonical += memberPresent ? "member=1\n" : "member=0\n";
  for (const line of sorted) {
    canonical += `${line.productCode}=${line.quantity}\n`;
  }

  return {
    keyDigest: createHash("sha256").update(command.idempotencyKey).digest(),
    intentDigest: createHash("sha256").update(canonical).digest(),
    memberPresent,
    lines: sorted,
  };
};

export const validIdempotencyKey = (value: string): boolean => {
  if (value.length < 1 || value.length > 128) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return false;
    }
  }
  return true;
};

const receiptFromBreakdown = (
  orderId: string,
  acceptedAt: Date,
  breakdown: Breakdown,
): Receipt => ({
  orderId,
  acceptedAt,
  currency: "THB",
  lines: breakdown.lines.map((line) => ({
    productCode: line.productCode,
    productName: line.productName,
    quantity: line.quantity,
    unitPriceSatang: line.unitPriceSatang,
    lineTotalBeforeDiscountSatang: line.lineSubtotalSatang,
  })),
  totalBeforeDiscountSatang: breakdown.totalBeforeDiscountSatang,
  pairDiscounts: breakdown.pairDiscounts.map((discount) => ({
    productCode: discount.productCode,
    pairCount: discount.pairCount,
    pairedQuantity: discount.pairedQuantity,
    discountRateBasisPoints: discount.discountRateBasisPoints,
    discountSatang: discount.discountSatang,
  })),
  pairDiscountTotalSatang: breakdown.pairDiscountTotalSatang,
  memberApplied: breakdown.memberApplied,
  memberDiscountSatang: breakdown.memberDiscountSatang,
  finalTotalSatang: breakdown.finalTotalSatang,
});

const applyRedGate = async (
  tx: PlacementTx,
  containsRed: boolean,
): Promise<Date> => {
  if (!containsRed) {
    return tx.readClock();
  }

  const claim = await tx.claimRedGate();
  if (!claim.ok) {
    throw new RedConflictError(new Date(claim.availableAt.toISOString()));
  }
  return claim.acceptedAt;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new ServiceUnavailableError("request timed out", signal.reason);
  }
};
