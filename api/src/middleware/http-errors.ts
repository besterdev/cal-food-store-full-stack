import type { Response } from "express";

export interface ErrorField {
  field: string;
  code: string;
  message: string;
}

interface ErrorBody {
  code: string;
  message: string;
  request_id: string;
  field_errors?: ErrorField[];
  available_at?: string;
}

export const writeError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: ErrorField[],
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
