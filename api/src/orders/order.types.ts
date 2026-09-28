import type { Breakdown } from "./order.pricing.js";

export interface OrderLine {
  productCode: string;
  quantity: number;
}

export interface PlaceOrderCommand {
  idempotencyKey: string;
  lines: OrderLine[];
  memberCardNumber?: string | null;
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

export type RedGateClaim =
  | { ok: true; acceptedAt: Date }
  | { ok: false; availableAt: Date };

export interface PlacementTx {
  claimIdempotency(prepared: PreparedIntent, orderId: string): Promise<boolean>;
  loadReceiptByKey(prepared: PreparedIntent): Promise<Receipt>;
  loadProducts(codes: string[]): Promise<Map<string, ProductSnapshot>>;
  readClock(): Promise<Date>;
  claimRedGate(): Promise<RedGateClaim>;
  insertAcceptedOrder(orderId: string, acceptedAt: Date, breakdown: Breakdown): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
