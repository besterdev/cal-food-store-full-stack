import express, { type Express } from "express";

import type { Product } from "../catalog/product.js";
import type { OrderService } from "../ordering/service.js";
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
import { createHealthRouter } from "./routes/health.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createProductsRouter } from "./routes/products.js";
import { createRedAvailabilityRouter } from "./routes/red-availability.js";

const MAX_ORDER_BODY_BYTES = 16 * 1024;

export interface AppDeps {
  listProducts: () => Promise<Product[]>;
  ready: () => Promise<void>;
  orders: OrderService;
  resetRedAvailability?: () => Promise<void>;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  readinessTimeoutMs?: number;
  logger?: RequestLogger;
}

/** Compose Express middleware and versioned routes around domain deps. */
export const createApp = (deps: AppDeps): Express => {
  const requestTimeoutMs = deps.requestTimeoutMs ?? 3000;
  const readinessTimeoutMs = deps.readinessTimeoutMs ?? 2000;
  const logger = deps.logger ?? { info: () => undefined };

  const app = express();
  app.disable("x-powered-by");

  // Request ID must run before body parsing so parse errors still carry request_id.
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware(logger));
  app.use(corsMiddleware(deps.allowedOrigins));
  app.use(express.json({ limit: MAX_ORDER_BODY_BYTES }));

  app.use(
    createHealthRouter({
      ready: deps.ready,
      readinessTimeoutMs,
    }),
  );
  app.use(
    createProductsRouter({
      listProducts: deps.listProducts,
      requestTimeoutMs,
    }),
  );
  app.use(
    createOrdersRouter({
      orders: deps.orders,
      requestTimeoutMs,
    }),
  );
  if (deps.resetRedAvailability) {
    app.use(
      createRedAvailabilityRouter({
        resetRedAvailability: deps.resetRedAvailability,
        requestTimeoutMs,
      }),
    );
  }

  app.use(jsonSyntaxErrorHandler);
  app.use(unexpectedErrorHandler);

  return app;
};
