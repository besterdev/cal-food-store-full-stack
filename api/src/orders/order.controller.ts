import type { Request, Response } from "express";

import { writeError, writeServiceUnavailable } from "../utils/http-error.js";
import type { OrderService } from "./order.service.js";
import {
  IdempotencyConflictError,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type Receipt,
} from "./order.types.js";
import { decodeOrderRequest, isValidIdempotencyKey } from "./order.validation.js";

export const createOrder =
  (orders: OrderService) =>
  async (req: Request, res: Response): Promise<void> => {
    const idempotencyKey = req.header("Idempotency-Key") ?? "";
    if (!isValidIdempotencyKey(idempotencyKey)) {
      writeError(
        res,
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must contain 1 through 128 printable ASCII characters.",
        {
          fieldErrors: [
            {
              field: "Idempotency-Key",
              code: "REQUIRED",
              message: "header is required",
            },
          ],
        },
      );
      return;
    }

    const decoded = decodeOrderRequest(req.body);
    if (!decoded.ok) {
      writeError(res, 400, "MALFORMED_JSON", decoded.message, {
        fieldErrors: decoded.fieldErrors,
      });
      return;
    }

    try {
      const receipt = await orders.placeOrder({
        idempotencyKey,
        ...decoded.request,
      });
      res
        .location(`/api/v1/orders/${receipt.orderId}`)
        .status(201)
        .json(toReceiptView(receipt));
    } catch (err) {
      if (!writeOrderError(res, err)) {
        throw err;
      }
    }
  };

/** Maps business outcomes to public errors; returns false for anything unexpected. */
const writeOrderError = (res: Response, err: unknown): boolean => {
  if (err instanceof ValidationError) {
    writeError(res, 422, "VALIDATION_ERROR", "The Order contains invalid fields.", {
      fieldErrors: err.fields,
    });
  } else if (err instanceof RedConflictError) {
    writeError(
      res,
      409,
      "RED_UNAVAILABLE",
      "Red is unavailable until the specified time.",
      { availableAt: err.availableAt.toISOString().replace(/\.\d{3}Z$/, "Z") },
    );
  } else if (err instanceof IdempotencyConflictError) {
    writeError(
      res,
      409,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used for a different Order Intent.",
    );
  } else if (err instanceof ServiceUnavailableError) {
    writeServiceUnavailable(res);
  } else {
    return false;
  }
  return true;
};

/** Serializes a Receipt into the OpenAPI `OrderReceipt` JSON shape. */
const toReceiptView = (receipt: Receipt) => ({
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
