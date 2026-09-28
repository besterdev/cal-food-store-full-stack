import { createServer } from "node:http";

import { createApp } from "./app.js";
import { createPool } from "./config/database.js";
import { loadConfig } from "./config/env.js";
import { errorMessage, jsonLogger as logger } from "./utils/logger.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  logger.error(errorMessage(err));
  process.exit(1);
}

const pool = createPool(config.databaseUrl, config.databaseTimeoutMs);
pool.on("error", (err) => {
  logger.error("idle database connection failed", { error: err.message });
});

const server = createServer(
  createApp({ pool, allowedOrigins: config.allowedOrigins, logger }),
);
server.listen(config.port, () => {
  logger.info("api listening", { port: config.port });
});

const shutdown = (signal: string): void => {
  logger.info("shutting down", { signal });
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
