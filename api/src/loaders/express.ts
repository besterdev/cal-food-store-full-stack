import express, { type Express } from "express";

import { corsMiddleware } from "../middleware/cors.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import { requestLogMiddleware } from "../middleware/request-log.js";
import { securityMiddleware } from "../middleware/security.js";
import type { Logger } from "../utils/logger.js";

const MAX_BODY_BYTES = 16 * 1024;

export interface MiddlewareOptions {
  allowedOrigins: string[];
  logger: Logger;
}

export const loadMiddleware = (
  app: Express,
  { allowedOrigins, logger }: MiddlewareOptions,
): void => {
  app.disable("x-powered-by");
  app.use(securityMiddleware);
  // Request ID before body parsing so malformed JSON still carries request_id.
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware(logger));
  app.use(corsMiddleware(allowedOrigins));
  app.use(express.json({ limit: MAX_BODY_BYTES }));
};

export const loadErrorHandlers = (app: Express, logger: Logger): void => {
  app.use(errorHandler(logger));
};
