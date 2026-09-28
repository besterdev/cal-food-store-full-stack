import { v7 as uuidv7 } from "uuid";

import { calculate, type PricingInput } from "../pricing/pricing.js";
import {
  asServiceUnavailable,
  ErrInternal,
  prepare,
  receiptFromBreakdown,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type OrderStore,
  type PlacementTx,
  type PlaceOrderCommand,
  type Receipt,
} from "./order.js";

export class OrderService {
  constructor(private readonly store: OrderStore) {}

  async placeOrder(
    command: PlaceOrderCommand,
    signal?: AbortSignal,
  ): Promise<Receipt> {
    if (signal?.aborted) {
      throw new ServiceUnavailableError("request timed out", signal.reason);
    }

    const prepared = prepare(command);
    const tx = await this.store.beginPlacement(signal);
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

const applyRedGate = async (
  tx: PlacementTx,
  containsRed: boolean,
): Promise<Date> => {
  if (!containsRed) {
    return tx.readClock();
  }

  const availableAt = await tx.lockRedGate();
  const now = await tx.readClock();
  if (now.getTime() < availableAt.getTime()) {
    throw new RedConflictError(new Date(availableAt.toISOString()));
  }
  await tx.advanceRedGate(now);
  return now;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new ServiceUnavailableError("request timed out", signal.reason);
  }
};

export const wrapUnavailable = asServiceUnavailable;
