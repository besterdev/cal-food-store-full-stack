import { createHash } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

import type { FieldError } from "../utils/http-error.js";
import type { OrderModel, OrderTransaction } from "./order.model.js";
import { calculate } from "./order.pricing.js";
import {
  OrderError,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type PlaceOrderCommand,
  type PreparedIntent,
  type Receipt,
} from "./order.types.js";

const PRODUCT_CODES = new Set([
  "RED",
  "GREEN",
  "BLUE",
  "YELLOW",
  "PINK",
  "PURPLE",
  "ORANGE",
]);
const MAX_LINES = 7;
const MAX_QUANTITY = 999;

export class OrderService {
  constructor(private readonly orders: OrderModel) {}

  /** Validates, prices, and commits one Order, or replays an accepted intent. */
  async placeOrder(command: PlaceOrderCommand): Promise<Receipt> {
    const intent = prepare(command);
    try {
      return await this.orders.inTransaction((tx) => place(tx, intent));
    } catch (err) {
      if (err instanceof OrderError) {
        throw err;
      }
      throw new ServiceUnavailableError(err);
    }
  }
}

const place = async (
  tx: OrderTransaction,
  intent: PreparedIntent,
): Promise<Receipt> => {
  const orderId = uuidv7();
  if (!(await tx.claimIdempotencyKey(intent, orderId))) {
    return tx.findReceiptByKey(intent);
  }

  const products = await tx.loadProducts(
    intent.lines.map((line) => line.productCode),
  );
  const breakdown = calculate({
    memberPresent: intent.memberPresent,
    lines: intent.lines.map((line) => {
      const product = products.get(line.productCode);
      if (!product) {
        throw new Error(`product ${line.productCode} is missing from the catalog`);
      }
      return {
        productCode: product.code,
        productName: product.name,
        displayOrder: product.displayOrder,
        unitPriceSatang: product.unitPriceSatang,
        quantity: line.quantity,
      };
    }),
  });

  const acceptedAt = await acceptanceTime(tx, intent);
  await tx.insertOrder(orderId, acceptedAt, breakdown);
  return tx.loadReceipt(orderId);
};

/** Red Orders take the Red gate; every other Order just reads PostgreSQL time. */
const acceptanceTime = async (
  tx: OrderTransaction,
  intent: PreparedIntent,
): Promise<Date> => {
  if (!intent.lines.some((line) => line.productCode === "RED")) {
    return tx.readClock();
  }
  const claim = await tx.claimRedGate();
  if (!claim.ok) {
    throw new RedConflictError(claim.availableAt);
  }
  return claim.acceptedAt;
};

/** Applies the Order Line rules and builds the canonical idempotency digests. */
export const prepare = (command: PlaceOrderCommand): PreparedIntent => {
  if (command.lines.length === 0) {
    throw lineCountError("REQUIRED", "at least one Order Line is required");
  }
  if (command.lines.length > MAX_LINES) {
    throw lineCountError(
      "OUT_OF_RANGE",
      "an Order may contain at most seven Order Lines",
    );
  }

  const seen = new Set<string>();
  const fields: FieldError[] = [];
  command.lines.forEach((line, index) => {
    const field = `lines[${index}]`;
    if (!PRODUCT_CODES.has(line.productCode)) {
      fields.push({
        field: `${field}.product_code`,
        code: "UNSUPPORTED",
        message: "product_code is not a supported Product",
      });
    } else if (seen.has(line.productCode)) {
      fields.push({
        field: `${field}.product_code`,
        code: "DUPLICATE",
        message: "product_code must be unique within the Order",
      });
    } else if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      fields.push({
        field: `${field}.quantity`,
        code: "OUT_OF_RANGE",
        message: "quantity must be an integer from 1 through 999",
      });
    }
    seen.add(line.productCode);
  });
  if (fields.length > 0) {
    throw new ValidationError(fields);
  }

  const memberPresent = (command.memberCardNumber ?? "").trim() !== "";
  const lines = [...command.lines].sort((a, b) =>
    a.productCode < b.productCode ? -1 : 1,
  );
  const canonicalIntent = [
    "v1",
    `member=${memberPresent ? 1 : 0}`,
    ...lines.map((line) => `${line.productCode}=${line.quantity}`),
    "",
  ].join("\n");

  return {
    keyDigest: sha256(command.idempotencyKey),
    intentDigest: sha256(canonicalIntent),
    memberPresent,
    lines,
  };
};

const lineCountError = (code: string, message: string): ValidationError =>
  new ValidationError([{ field: "lines", code, message }]);

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();
