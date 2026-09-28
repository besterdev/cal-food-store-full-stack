import express, { type Express } from "express";
import type { Pool } from "pg";

import { loadErrorHandlers, loadMiddleware } from "./loaders/express.js";
import { loadRoutes } from "./loaders/routes.js";
import { silentLogger, type Logger } from "./utils/logger.js";

export interface AppOptions {
  pool: Pool;
  allowedOrigins: string[];
  logger?: Logger;
}

export const createApp = ({
  pool,
  allowedOrigins,
  logger = silentLogger,
}: AppOptions): Express => {
  const app = express();

  loadMiddleware(app, { allowedOrigins, logger });
  loadRoutes(app, pool);
  loadErrorHandlers(app, logger);

  return app;
};
