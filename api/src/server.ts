import { createServer } from "node:http";

import { createApp } from "./app.js";
import { createPool } from "./config/database.js";
import { loadConfig } from "./config/index.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(
    JSON.stringify({
      msg: err instanceof Error ? err.message : String(err),
      level: "error",
    }),
  );
  process.exit(1);
}

const pool = createPool(config.databaseUrl);

const app = createApp({
  pool,
  allowedOrigins: config.allowedOrigins,
  requestTimeoutMs: config.requestTimeoutMs,
  readinessTimeoutMs: config.readinessTimeoutMs,
  logger: {
    info: (message, fields) => {
      console.log(JSON.stringify({ msg: message, level: "info", ...fields }));
    },
  },
});

const server = createServer(app);
server.listen(config.listenPort, () => {
  console.log(
    JSON.stringify({
      msg: "api listening",
      level: "info",
      address: `:${config.listenPort}`,
    }),
  );
});

const shutdown = async (signal: string) => {
  console.log(JSON.stringify({ msg: "shutting down", level: "info", signal }));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
