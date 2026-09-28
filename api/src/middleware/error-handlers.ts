import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

import { writeError } from "./http-errors.js";

export const jsonSyntaxErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  next,
) => {
  if (err instanceof SyntaxError || err?.type === "entity.parse.failed") {
    writeError(res, 400, "MALFORMED_JSON", "Request body is not valid JSON.");
    return;
  }
  if (err?.type === "entity.too.large") {
    writeError(res, 400, "MALFORMED_JSON", "Request body is too large.");
    return;
  }
  next(err);
};

export const unexpectedErrorHandler = (
  _err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
};
