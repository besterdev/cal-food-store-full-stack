import type { Request, Response } from "express";

import type { OrderService } from "../../../modules/ordering/service.js";
import { writeError, writeOrderError } from "../../../middleware/http-errors.js";
import { runWithTimeout } from "../../../utils/timeout.js";
import {
  decodeCreateOrderRequest,
  toPlaceOrderCommand,
  toReceiptWire,
  validIdempotencyKeyHeader,
} from "./orders.wire.js";

export interface OrdersControllerDeps {
  orders: OrderService;
  requestTimeoutMs: number;
}

export class OrdersController {
  constructor(private readonly deps: OrdersControllerDeps) {}

  create = async (req: Request, res: Response): Promise<void> => {
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
      const receipt = await runWithTimeout(
        this.deps.requestTimeoutMs,
        (signal) =>
          this.deps.orders.placeOrder(
            toPlaceOrderCommand(key, decode.request),
            signal,
          ),
      );
      res.setHeader("Location", `/api/v1/orders/${receipt.orderId}`);
      res.status(201).json(toReceiptWire(receipt));
    } catch (err) {
      writeOrderError(res, err);
    }
  };
}
