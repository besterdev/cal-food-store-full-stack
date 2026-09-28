import type { Response } from "express";

import {
  ErrIdempotencyConflict,
  ErrInvalidIdempotencyKey,
  RedConflictError,
  ServiceUnavailableError,
  ValidationError,
  type FieldError,
} from "../modules/ordering/order.js";

interface ErrorBody {
  code: string;
  message: string;
  request_id: string;
  field_errors?: FieldError[];
  available_at?: string;
}

export const writeError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: FieldError[],
  availableAt?: string,
): void => {
  res.locals.errorCode = code;
  const body: ErrorBody = {
    code,
    message,
    request_id: String(res.locals.requestId ?? ""),
  };
  if (fieldErrors && fieldErrors.length > 0) {
    body.field_errors = fieldErrors;
  }
  if (availableAt) {
    body.available_at = availableAt;
  }
  res.status(status).json(body);
};

export const writeOrderError = (res: Response, err: unknown): void => {
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
