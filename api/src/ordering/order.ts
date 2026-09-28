import { createHash } from "node:crypto";

import type { Breakdown } from "../pricing/pricing.js";

export const ErrInvalidIdempotencyKey = new Error("invalid idempotency key");
export const ErrValidation = new Error("order validation failed");
export const ErrIdempotencyConflict = new Error("idempotency conflict");
export const ErrRedUnavailable = new Error("red unavailable");
export const ErrServiceUnavailable = new Error("order service unavailable");
export const ErrInternal = new Error("order internal error");

export interface OrderLine {
  productCode: string;
  quantity: number;
}

export interface PlaceOrderCommand {
  idempotencyKey: string;
  lines: OrderLine[];
  memberCardNumber?: string | null;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class ValidationError extends Error {
  readonly fields: FieldError[];

  constructor(fields: FieldError[]) {
    super(ErrValidation.message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class RedConflictError extends Error {
  readonly availableAt: Date;

  constructor(availableAt: Date) {
    super(ErrRedUnavailable.message);
    this.name = "RedConflictError";
    this.availableAt = availableAt;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ServiceUnavailableError";
  }
}

export interface ReceiptLine {
  productCode: string;
  productName: string;
  quantity: number;
  unitPriceSatang: number;
  lineTotalBeforeDiscountSatang: number;
}

export interface ReceiptPairDiscount {
  productCode: string;
  pairCount: number;
  pairedQuantity: number;
  discountRateBasisPoints: number;
  discountSatang: number;
}

export interface Receipt {
  orderId: string;
  acceptedAt: Date;
  currency: string;
  lines: ReceiptLine[];
  totalBeforeDiscountSatang: number;
  pairDiscounts: ReceiptPairDiscount[];
  pairDiscountTotalSatang: number;
  memberApplied: boolean;
  memberDiscountSatang: number;
  finalTotalSatang: number;
}

export interface PreparedIntent {
  keyDigest: Buffer;
  intentDigest: Buffer;
  memberPresent: boolean;
  lines: OrderLine[];
}

export interface ProductSnapshot {
  code: string;
  name: string;
  unitPriceSatang: number;
  displayOrder: number;
}

export interface PlacementTx {
  claimIdempotency(prepared: PreparedIntent, orderId: string): Promise<boolean>;
  loadReceiptByKey(prepared: PreparedIntent): Promise<Receipt>;
  loadProducts(codes: string[]): Promise<Map<string, ProductSnapshot>>;
  readClock(): Promise<Date>;
  lockRedGate(): Promise<Date>;
  advanceRedGate(from: Date): Promise<void>;
  insertAcceptedOrder(orderId: string, acceptedAt: Date, breakdown: Breakdown): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface OrderStore {
  beginPlacement(): Promise<PlacementTx>;
}

const SUPPORTED_PRODUCTS = new Set([
  "RED",
  "GREEN",
  "BLUE",
  "YELLOW",
  "PINK",
  "PURPLE",
  "ORANGE",
]);

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

const validIdempotencyKey = (value: string): boolean => {
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

export const receiptFromBreakdown = (
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

export const asServiceUnavailable = (err: unknown): ServiceUnavailableError => {
  if (err instanceof ServiceUnavailableError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ServiceUnavailableError(message, err);
};
