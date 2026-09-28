import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { prepare } from "./order.service.js";
import { ValidationError } from "./order.types.js";

describe("prepare", () => {
  it("builds canonical digests independent of line order", () => {
    const a = prepare({
      idempotencyKey: "key-1",
      lines: [
        { productCode: "ORANGE", quantity: 2 },
        { productCode: "BLUE", quantity: 1 },
      ],
      memberCardNumber: "  card  ",
    });
    const b = prepare({
      idempotencyKey: "key-1",
      lines: [
        { productCode: "BLUE", quantity: 1 },
        { productCode: "ORANGE", quantity: 2 },
      ],
      memberCardNumber: "card",
    });

    expect(a.intentDigest.equals(b.intentDigest)).toBe(true);
    expect(a.memberPresent).toBe(true);
    expect(a.keyDigest.equals(createHash("sha256").update("key-1").digest())).toBe(
      true,
    );
  });

  it("treats whitespace-only member card as absent", () => {
    const prepared = prepare({
      idempotencyKey: "key-2",
      lines: [{ productCode: "BLUE", quantity: 1 }],
      memberCardNumber: "   ",
    });
    expect(prepared.memberPresent).toBe(false);
  });

  it("rejects duplicate products", () => {
    expect(() =>
      prepare({
        idempotencyKey: "key-3",
        lines: [
          { productCode: "BLUE", quantity: 1 },
          { productCode: "BLUE", quantity: 2 },
        ],
        memberCardNumber: null,
      }),
    ).toThrow(ValidationError);
  });
});
