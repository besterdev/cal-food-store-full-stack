import express, { type Express } from "express";
import type { Pool } from "pg";

import { loadErrorHandlers, loadMiddleware } from "./loaders/express.js";
import { loadRoutes } from "./loaders/routes.js";
import type { RequestLogger } from "./middleware/request-log.js";

export interface AppOptions {
  pool: Pool;
  allowedOrigins: string[];
  requestTimeoutMs?: number;
  readinessTimeoutMs?: number;
  logger?: RequestLogger;
}

export const createApp = (options: AppOptions): Express => {
  const app = express();

  loadMiddleware(app, {
    allowedOrigins: options.allowedOrigins,
    logger: options.logger ?? { info: () => undefined },
  });
  loadRoutes(app, {
    pool: options.pool,
    requestTimeoutMs: options.requestTimeoutMs ?? 3000,
    readinessTimeoutMs: options.readinessTimeoutMs ?? 2000,
  });
  loadErrorHandlers(app);

  return app;
};
