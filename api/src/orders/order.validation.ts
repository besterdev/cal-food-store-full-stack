import type { FieldError, PlaceOrderCommand, Receipt } from "../../../modules/ordering/order.js";

interface CreateOrderLineWire {
  product_code: string;
  quantity: number;
}

interface CreateOrderRequestWire {
  lines: CreateOrderLineWire[];
  member_card_number?: string | null;
}

export type DecodeOrderResult =
  | { ok: true; request: CreateOrderRequestWire }
  | { ok: false; message: string; fieldErrors?: FieldError[] };

/** Strictly decode a create-order JSON body; rejects unknown fields. */
export const decodeCreateOrderRequest = (body: unknown): DecodeOrderResult => {
  if (body === undefined || body === null || typeof body !== "object") {
    return { ok: false, message: "Request body is not valid JSON." };
  }

  const record = body as Record<string, unknown>;
  const allowedKeys = new Set(["lines", "member_card_number"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        message: "Request body contains an unknown field.",
        fieldErrors: [
          { field: key, code: "UNKNOWN_FIELD", message: "field is not allowed" },
        ],
      };
    }
  }

  if (!("lines" in record)) {
    return {
      ok: false,
      message: "Request body contains an invalid field type.",
      fieldErrors: [
        {
          field: "lines",
          code: "INVALID_TYPE",
          message: "field has an invalid type",
        },
      ],
    };
  }

  if (!Array.isArray(record.lines)) {
    return {
      ok: false,
      message: "Request body contains an invalid field type.",
      fieldErrors: [
        {
          field: "lines",
          code: "INVALID_TYPE",
          message: "field has an invalid type",
        },
      ],
    };
  }

  const lines: CreateOrderLineWire[] = [];
  for (let index = 0; index < record.lines.length; index += 1) {
    const line = record.lines[index];
    if (line === null || typeof line !== "object" || Array.isArray(line)) {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}]`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    const lineRecord = line as Record<string, unknown>;
    for (const key of Object.keys(lineRecord)) {
      if (key !== "product_code" && key !== "quantity") {
        return {
          ok: false,
          message: "Request body contains an unknown field.",
          fieldErrors: [
            {
              field: `lines[${index}].${key}`,
              code: "UNKNOWN_FIELD",
              message: "field is not allowed",
            },
          ],
        };
      }
    }
    if (typeof lineRecord.product_code !== "string") {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}].product_code`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    if (
      typeof lineRecord.quantity !== "number" ||
      !Number.isInteger(lineRecord.quantity)
    ) {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: `lines[${index}].quantity`,
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    lines.push({
      product_code: lineRecord.product_code,
      quantity: lineRecord.quantity,
    });
  }

  let memberCardNumber: string | null | undefined;
  if ("member_card_number" in record) {
    const value = record.member_card_number;
    if (value !== null && typeof value !== "string") {
      return {
        ok: false,
        message: "Request body contains an invalid field type.",
        fieldErrors: [
          {
            field: "member_card_number",
            code: "INVALID_TYPE",
            message: "field has an invalid type",
          },
        ],
      };
    }
    memberCardNumber = value as string | null;
  }

  return {
    ok: true,
    request: {
      lines,
      ...(memberCardNumber !== undefined
        ? { member_card_number: memberCardNumber }
        : {}),
    },
  };
};

export const toPlaceOrderCommand = (
  idempotencyKey: string,
  request: CreateOrderRequestWire,
): PlaceOrderCommand => ({
  idempotencyKey,
  lines: request.lines.map((line) => ({
    productCode: line.product_code,
    quantity: line.quantity,
  })),
  memberCardNumber: request.member_card_number ?? null,
});

export const toReceiptWire = (receipt: Receipt) => ({
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

export const validIdempotencyKeyHeader = (value: string): boolean => {
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
