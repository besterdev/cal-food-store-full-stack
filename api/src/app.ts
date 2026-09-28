import express, { type Express } from "express";

import type { Product } from "./modules/catalog/product.js";
import type { OrderService } from "./modules/ordering/service.js";
import { corsMiddleware } from "./middleware/cors.js";
import {
  jsonSyntaxErrorHandler,
  unexpectedErrorHandler,
} from "./middleware/error-handlers.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import {
  requestLogMiddleware,
  type RequestLogger,
} from "./middleware/request-log.js";
import { securityMiddleware } from "./middleware/security.js";
import { createHealthRoutes } from "./v1/features/health/health.routes.js";
import { createV1Router } from "./v1/index.js";

const MAX_ORDER_BODY_BYTES = 16 * 1024;

export interface AppDeps {
  listProducts: (signal?: AbortSignal) => Promise<Product[]>;
  ready: (signal?: AbortSignal) => Promise<void>;
  orders: OrderService;
  resetRedAvailability?: (signal?: AbortSignal) => Promise<void>;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  readinessTimeoutMs?: number;
  logger?: RequestLogger;
}

/**
 * Composition root: middleware → health → /api/v1 features → centralized errors.
 * Structure follows feature-based MVC with API versioning.
 */
export const createApp = (deps: AppDeps): Express => {
  const requestTimeoutMs = deps.requestTimeoutMs ?? 3000;
  const readinessTimeoutMs = deps.readinessTimeoutMs ?? 2000;
  const logger = deps.logger ?? { info: () => undefined };

  const app = express();
  app.disable("x-powered-by");

  app.use(securityMiddleware);
  // Request ID before body parsing so malformed JSON still carries request_id.
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware(logger));
  app.use(corsMiddleware(deps.allowedOrigins));
  app.use(express.json({ limit: MAX_ORDER_BODY_BYTES }));

  app.use(
    createHealthRoutes({
      ready: deps.ready,
      readinessTimeoutMs,
    }),
  );

  const v1Deps = {
    listProducts: deps.listProducts,
    orders: deps.orders,
    requestTimeoutMs,
    ...(deps.resetRedAvailability
      ? { resetRedAvailability: deps.resetRedAvailability }
      : {}),
  };
  app.use("/api/v1", createV1Router(v1Deps));

  app.use(jsonSyntaxErrorHandler);
  app.use(unexpectedErrorHandler);

  return app;
};
