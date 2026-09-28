import type { Request, Response } from "express";

import { writeError } from "../middleware/http-errors.js";
import { runWithTimeout } from "../utils/timeout.js";
import {
  ErrIdempotencyConflict,
  ErrInvalidIdempotencyKey,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
} from "./order.errors.js";
import { validIdempotencyKey, type OrderService } from "./order.service.js";
import {
  decodeCreateOrderRequest,
  toPlaceOrderCommand,
} from "./order.validation.js";
import { toReceiptView } from "./order.view.js";

export interface OrderControllerDeps {
  orders: OrderService;
  requestTimeoutMs: number;
}

export class OrderController {
  constructor(private readonly deps: OrderControllerDeps) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const key = req.header("Idempotency-Key") ?? "";
    if (!validIdempotencyKey(key)) {
      writeInvalidIdempotencyKey(res);
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
      res.status(201).json(toReceiptView(receipt));
    } catch (err) {
      writeOrderError(res, err);
    }
  };
}

const writeInvalidIdempotencyKey = (res: Response): void => {
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
};

const writeOrderError = (res: Response, err: unknown): void => {
  if (err instanceof ValidationError) {
    writeError(
      res,
      422,
      "VALIDATION_ERROR",
      "The Order contains invalid fields.",
      err.fields,
    );
    return;
  }
  if (err instanceof RedConflictError) {
    writeError(
      res,
      409,
      "RED_UNAVAILABLE",
      "Red is unavailable until the specified time.",
      undefined,
      err.availableAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    );
    return;
  }
  if (err === ErrInvalidIdempotencyKey) {
    writeInvalidIdempotencyKey(res);
    return;
  }
  if (err === ErrIdempotencyConflict) {
    writeError(
      res,
      409,
      "IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used for a different Order Intent.",
    );
    return;
  }
  if (err instanceof ServiceUnavailableError) {
    writeError(
      res,
      503,
      "SERVICE_UNAVAILABLE",
      "The service is temporarily unavailable.",
    );
    return;
  }
  writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
