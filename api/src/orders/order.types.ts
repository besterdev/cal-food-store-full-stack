import type { FieldError } from "../utils/http-error.js";

export interface OrderLine {
  productCode: string;
  quantity: number;
}

export interface PlaceOrderCommand {
  idempotencyKey: string;
  lines: OrderLine[];
  memberCardNumber: string | null;
}

/** Validated, canonical Order Intent; the raw Member Card never leaves `prepare`. */
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

export type RedGateClaim =
  | { ok: true; acceptedAt: Date }
  | { ok: false; availableAt: Date };

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

/** Base class for business outcomes the controller maps to a public error code. */
export class OrderError extends Error {}

export class ValidationError extends OrderError {
  constructor(readonly fields: FieldError[]) {
    super("order validation failed");
  }
}

export class RedConflictError extends OrderError {
  constructor(readonly availableAt: Date) {
    super("red unavailable");
  }
}

export class IdempotencyConflictError extends OrderError {
  constructor() {
    super("idempotency key reused for a different order intent");
  }
}

export class PricingError extends OrderError {}

/** Infrastructure failure (database down, timeout, commit failure). */
export class ServiceUnavailableError extends Error {
  constructor(cause: unknown) {
    super("order service unavailable", { cause });
  }
}
