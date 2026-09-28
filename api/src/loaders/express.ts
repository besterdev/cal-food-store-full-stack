import express, { type Express } from "express";

import { corsMiddleware } from "../middleware/cors.js";
import {
  jsonSyntaxErrorHandler,
  unexpectedErrorHandler,
} from "../middleware/error-handlers.js";
import { requestIdMiddleware } from "../middleware/request-id.js";
import {
  requestLogMiddleware,
  type RequestLogger,
} from "../middleware/request-log.js";
import { securityMiddleware } from "../middleware/security.js";

const MAX_ORDER_BODY_BYTES = 16 * 1024;

export interface ExpressLoaderOptions {
  allowedOrigins: string[];
  logger: RequestLogger;
}

export const loadMiddleware = (
  app: Express,
  options: ExpressLoaderOptions,
): void => {
  app.disable("x-powered-by");
  app.use(securityMiddleware);
  // Request ID before body parsing so malformed JSON still carries request_id.
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware(options.logger));
  app.use(corsMiddleware(options.allowedOrigins));
  app.use(express.json({ limit: MAX_ORDER_BODY_BYTES }));
};

export const loadErrorHandlers = (app: Express): void => {
  app.use(jsonSyntaxErrorHandler);
  app.use(unexpectedErrorHandler);
};
