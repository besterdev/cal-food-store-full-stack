import type { ProductCode } from "@/features/order/catalog";
import { apiClient, isApiAxiosError } from "@/lib/api-client";

export type OrderErrorKind =
  | "validation"
  | "idempotency_conflict"
  | "red_unavailable"
  | "network"
  | "timeout"
  | "service"
  | "unknown";

export interface OrderLineInput {
  productCode: ProductCode;
  quantity: number;
}

export interface PlaceOrderInput {
  idempotencyKey: string;
  lines: OrderLineInput[];
  memberCardNumber?: string;
}

export interface ReceiptLine {
  productCode: ProductCode;
  productName: string;
  quantity: number;
  unitPriceSatang: number;
  lineTotalBeforeDiscountSatang: number;
}

export interface PairDiscount {
  productCode: "GREEN" | "PINK" | "ORANGE";
  pairCount: number;
  pairedQuantity: number;
  discountRateBasisPoints: number;
  discountSatang: number;
}

export interface OrderReceipt {
  orderId: string;
  acceptedAt: string;
  currency: "THB";
  lines: ReceiptLine[];
  totalBeforeDiscountSatang: number;
  pairDiscounts: PairDiscount[];
  pairDiscountTotalSatang: number;
  memberApplied: boolean;
  memberDiscountSatang: number;
  finalTotalSatang: number;
}

interface FieldErrorWire {
  field?: unknown;
  code?: unknown;
  message?: unknown;
}

interface ErrorResponseWire {
  code?: unknown;
  message?: unknown;
  request_id?: unknown;
  field_errors?: unknown;
  available_at?: unknown;
}

export class OrderError extends Error {
  constructor(
    public readonly kind: OrderErrorKind,
    message: string,
    public readonly retryable: boolean,
    public readonly code?: string,
    public readonly availableAt?: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

const productCodes = new Set<ProductCode>([
  "RED",
  "GREEN",
  "BLUE",
  "YELLOW",
  "PINK",
  "PURPLE",
  "ORANGE",
]);

const parseReceiptLine = (value: unknown): ReceiptLine => {
  if (!value || typeof value !== "object") {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }

  const line = value as Record<string, unknown>;
  if (
    typeof line.product_code !== "string" ||
    !productCodes.has(line.product_code as ProductCode) ||
    typeof line.product_name !== "string" ||
    typeof line.quantity !== "number" ||
    typeof line.unit_price_satang !== "number" ||
    typeof line.line_total_before_discount_satang !== "number"
  ) {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }

  return {
    productCode: line.product_code as ProductCode,
    productName: line.product_name,
    quantity: line.quantity,
    unitPriceSatang: line.unit_price_satang,
    lineTotalBeforeDiscountSatang: line.line_total_before_discount_satang,
  };
};

const parsePairDiscount = (value: unknown): PairDiscount => {
  if (!value || typeof value !== "object") {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }
  const discount = value as Record<string, unknown>;
  if (
    (discount.product_code !== "GREEN" &&
      discount.product_code !== "PINK" &&
      discount.product_code !== "ORANGE") ||
    typeof discount.pair_count !== "number" ||
    typeof discount.paired_quantity !== "number" ||
    discount.discount_rate_basis_points !== 500 ||
    typeof discount.discount_satang !== "number"
  ) {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }

  return {
    productCode: discount.product_code,
    pairCount: discount.pair_count,
    pairedQuantity: discount.paired_quantity,
    discountRateBasisPoints: 500,
    discountSatang: discount.discount_satang,
  };
};

const parseReceipt = (value: unknown): OrderReceipt => {
  if (!value || typeof value !== "object") {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.order_id !== "string" ||
    typeof body.accepted_at !== "string" ||
    body.currency !== "THB" ||
    !Array.isArray(body.lines) ||
    typeof body.total_before_discount_satang !== "number" ||
    !Array.isArray(body.pair_discounts) ||
    typeof body.pair_discount_total_satang !== "number" ||
    typeof body.member_applied !== "boolean" ||
    typeof body.member_discount_satang !== "number" ||
    typeof body.final_total_satang !== "number"
  ) {
    throw new OrderError(
      "unknown",
      "The API returned an invalid Order receipt.",
      false,
    );
  }

  return {
    orderId: body.order_id,
    acceptedAt: body.accepted_at,
    currency: "THB",
    lines: body.lines.map(parseReceiptLine),
    totalBeforeDiscountSatang: body.total_before_discount_satang,
    pairDiscounts: body.pair_discounts.map(parsePairDiscount),
    pairDiscountTotalSatang: body.pair_discount_total_satang,
    memberApplied: body.member_applied,
    memberDiscountSatang: body.member_discount_satang,
    finalTotalSatang: body.final_total_satang,
  };
};

const toOrderError = (error: unknown): OrderError => {
  if (!isApiAxiosError(error)) {
    return new OrderError(
      "unknown",
      "An unexpected error prevented the Order from being placed.",
      false,
    );
  }

  if (!error.response) {
    if (error.code === "ECONNABORTED") {
      return new OrderError(
        "timeout",
        "The Order request timed out. Your draft is preserved — retry with the same intent.",
        true,
      );
    }
    return new OrderError(
      "network",
      "Check your connection, then retry this Order.",
      true,
    );
  }

  const body = error.response.data as ErrorResponseWire | undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const message =
    typeof body?.message === "string"
      ? body.message
      : "The Order could not be placed.";

  if (code === "VALIDATION_ERROR" || code === "MALFORMED_JSON") {
    const fieldErrors = Array.isArray(body?.field_errors)
      ? (body.field_errors as FieldErrorWire[])
      : [];
    const firstMessage =
      typeof fieldErrors[0]?.message === "string"
        ? fieldErrors[0].message
        : message;
    return new OrderError("validation", firstMessage, false, code);
  }
  if (code === "IDEMPOTENCY_CONFLICT") {
    return new OrderError(
      "idempotency_conflict",
      "This Idempotency-Key was already used for a different Order. Edit the draft or start a New Order.",
      false,
      code,
    );
  }
  if (code === "RED_UNAVAILABLE") {
    return new OrderError(
      "red_unavailable",
      message,
      false,
      code,
      typeof body?.available_at === "string" ? body.available_at : undefined,
    );
  }
  if (
    code === "SERVICE_UNAVAILABLE" ||
    error.response.status === 503 ||
    error.response.status >= 500
  ) {
    return new OrderError(
      "service",
      "The Order service is temporarily unavailable. You can retry this unchanged Order.",
      true,
      code,
    );
  }

  return new OrderError("unknown", message, false, code);
};

export const placeOrder = async (
  input: PlaceOrderInput,
): Promise<OrderReceipt> => {
  try {
    const payload: Record<string, unknown> = {
      lines: input.lines.map((line) => ({
        product_code: line.productCode,
        quantity: line.quantity,
      })),
    };
    if (input.memberCardNumber !== undefined) {
      payload.member_card_number = input.memberCardNumber;
    }

    const response = await apiClient.post<unknown>("/api/v1/orders", payload, {
      headers: { "Idempotency-Key": input.idempotencyKey },
    });
    return parseReceipt(response.data);
  } catch (error) {
    if (error instanceof OrderError) {
      throw error;
    }
    throw toOrderError(error);
  }
};

export const formatSatang = (satang: number, currency: "THB" = "THB") =>
  new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(satang / 100);

export const formatThaiDateTime = (isoTimestamp: string) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date(isoTimestamp));
