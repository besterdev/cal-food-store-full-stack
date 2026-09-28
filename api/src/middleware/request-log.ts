import type { NextFunction, Request, Response } from "express";

import type { LogFields, Logger } from "../utils/logger.js";

export const requestLogMiddleware =
  (logger: Logger) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now();
    res.on("finish", () => {
      const fields: LogFields = {
        request_id: res.locals.requestId,
        method: req.method,
        route: req.path,
        status_class: `${Math.floor(res.statusCode / 100)}xx`,
        duration_ms: Date.now() - started,
      };
      if (typeof res.locals.errorCode === "string") {
        fields.error_code = res.locals.errorCode;
      }
      logger.info("http request", fields);
    });
    next();
  };
