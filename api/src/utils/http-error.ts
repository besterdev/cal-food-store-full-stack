import type { Response } from "express";

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

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
  extra: { fieldErrors?: FieldError[]; availableAt?: string } = {},
): void => {
  res.locals.errorCode = code;
  const body: ErrorBody = {
    code,
    message,
    request_id: String(res.locals.requestId ?? ""),
  };
  if (extra.fieldErrors && extra.fieldErrors.length > 0) {
    body.field_errors = extra.fieldErrors;
  }
  if (extra.availableAt) {
    body.available_at = extra.availableAt;
  }
  res.status(status).json(body);
};

export const writeServiceUnavailable = (res: Response): void => {
  writeError(
    res,
    503,
    "SERVICE_UNAVAILABLE",
    "The service is temporarily unavailable.",
  );
};
