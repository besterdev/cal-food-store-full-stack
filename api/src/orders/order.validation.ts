import type { FieldError } from "../utils/http-error.js";
import type { OrderLine } from "./order.types.js";

export interface OrderRequest {
  lines: OrderLine[];
  memberCardNumber: string | null;
}

export type DecodeResult =
  | { ok: true; request: OrderRequest }
  | { ok: false; message: string; fieldErrors: FieldError[] };

const IDEMPOTENCY_KEY = /^[\x20-\x7e]{1,128}$/;

/** 1-128 printable ASCII characters. */
export const isValidIdempotencyKey = (value: string): boolean =>
  IDEMPOTENCY_KEY.test(value);

/**
 * Strict structural decode of the create-order body: unknown fields and wrong
 * JSON types are rejected here; Order Line business rules live in `prepare`.
 */
export const decodeOrderRequest = (body: unknown): DecodeResult => {
  if (!isRecord(body)) {
    return { ok: false, message: "Request body is not valid JSON.", fieldErrors: [] };
  }
  const unknownKey = findUnknownKey(body, ["lines", "member_card_number"]);
  if (unknownKey) {
    return unknownField(unknownKey);
  }
  if (!Array.isArray(body.lines)) {
    return invalidType("lines");
  }

  const lines: OrderLine[] = [];
  for (const [index, line] of body.lines.entries()) {
    const field = `lines[${index}]`;
    if (!isRecord(line)) {
      return invalidType(field);
    }
    const unknownLineKey = findUnknownKey(line, ["product_code", "quantity"]);
    if (unknownLineKey) {
      return unknownField(`${field}.${unknownLineKey}`);
    }
    if (typeof line.product_code !== "string") {
      return invalidType(`${field}.product_code`);
    }
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity)) {
      return invalidType(`${field}.quantity`);
    }
    lines.push({ productCode: line.product_code, quantity: line.quantity });
  }

  const memberCardNumber = body.member_card_number ?? null;
  if (memberCardNumber === null || typeof memberCardNumber === "string") {
    return { ok: true, request: { lines, memberCardNumber } };
  }
  return invalidType("member_card_number");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findUnknownKey = (
  record: Record<string, unknown>,
  allowed: string[],
): string | undefined => Object.keys(record).find((key) => !allowed.includes(key));

const unknownField = (field: string): DecodeResult => ({
  ok: false,
  message: "Request body contains an unknown field.",
  fieldErrors: [{ field, code: "UNKNOWN_FIELD", message: "field is not allowed" }],
});

const invalidType = (field: string): DecodeResult => ({
  ok: false,
  message: "Request body contains an invalid field type.",
  fieldErrors: [{ field, code: "INVALID_TYPE", message: "field has an invalid type" }],
});
