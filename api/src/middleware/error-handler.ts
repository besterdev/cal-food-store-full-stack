import type { ErrorRequestHandler } from "express";

import { errorMessage, type Logger } from "../utils/logger.js";
import { writeError } from "../utils/http-error.js";

interface BodyParserError {
  type?: string;
}

/** Maps body-parser failures to MALFORMED_JSON and everything else to 500. */
export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err: unknown, _req, res, _next) => {
    const type = (err as BodyParserError | null)?.type;
    if (type === "entity.parse.failed") {
      writeError(res, 400, "MALFORMED_JSON", "Request body is not valid JSON.");
      return;
    }
    if (type === "entity.too.large") {
      writeError(res, 400, "MALFORMED_JSON", "Request body is too large.");
      return;
    }

    logger.error("unexpected error", {
      request_id: res.locals.requestId,
      error: errorMessage(err),
    });
    writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
  };
