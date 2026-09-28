import { Router } from "express";

import type { OrderService } from "../../ordering/service.js";
import { writeError, writeOrderError } from "../errors.js";
import {
  decodeCreateOrderRequest,
  toPlaceOrderCommand,
  toReceiptWire,
  validIdempotencyKeyHeader,
} from "../order-wire.js";
import { withTimeout } from "../timeout.js";

export const createOrdersRouter = (deps: {
  orders: OrderService;
  requestTimeoutMs: number;
}): Router => {
  const router = Router();

  router.post("/api/v1/orders", async (req, res) => {
    const key = req.header("Idempotency-Key") ?? "";
    if (!validIdempotencyKeyHeader(key)) {
      writeError(
        res,
        400,
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key must contain 1 through 128 printable ASCII characters.",
        [
          {
            field: "Idempotency-Key",
            code: "REQUIRED",
            message: "header is required",
          },
        ],
      );
      return;
    }

    const decode = decodeCreateOrderRequest(req.body);
    if (!decode.ok) {
      writeError(res, 400, "MALFORMED_JSON", decode.message, decode.fieldErrors);
      return;
    }

    try {
      const receipt = await withTimeout(
        deps.orders.placeOrder(toPlaceOrderCommand(key, decode.request)),
        deps.requestTimeoutMs,
      );
      res.setHeader("Location", `/api/v1/orders/${receipt.orderId}`);
      res.status(201).json(toReceiptWire(receipt));
    } catch (err) {
      writeOrderError(res, err);
    }
  });

  return router;
};
