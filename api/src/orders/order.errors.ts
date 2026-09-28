export const ErrInvalidIdempotencyKey = new Error("invalid idempotency key");
export const ErrValidation = new Error("order validation failed");
export const ErrIdempotencyConflict = new Error("idempotency conflict");
export const ErrRedUnavailable = new Error("red unavailable");
export const ErrInternal = new Error("order internal error");

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class ValidationError extends Error {
  readonly fields: FieldError[];

  constructor(fields: FieldError[]) {
    super(ErrValidation.message);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class RedConflictError extends Error {
  readonly availableAt: Date;

  constructor(availableAt: Date) {
    super(ErrRedUnavailable.message);
    this.name = "RedConflictError";
    this.availableAt = availableAt;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ServiceUnavailableError";
  }
}

export const asServiceUnavailable = (err: unknown): ServiceUnavailableError => {
  if (err instanceof ServiceUnavailableError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ServiceUnavailableError(message, err);
};

export const classifyDbError = (
  operation: string,
  err: unknown,
): ServiceUnavailableError =>
  asServiceUnavailable(
    new Error(
      `${operation}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    ),
  );
