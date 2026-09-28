import { createServer } from "node:http";

import { Pool } from "pg";

import { createApp } from "./http/app.js";
import { OrderService } from "./ordering/service.js";
import { PostgresStore } from "./postgres/store.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(JSON.stringify({ msg: "DATABASE_URL is required", level: "error" }));
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const store = new PostgresStore(pool);
const orders = new OrderService(store);

const app = createApp({
  listProducts: () => store.listProducts(),
  ready: () => store.ready(),
  orders,
  resetRedAvailability: () => store.resetRedAvailability(),
  allowedOrigins: allowedOrigins(),
  logger: {
    info: (message, fields) => {
      console.log(JSON.stringify({ msg: message, level: "info", ...fields }));
    },
  },
});

const address = process.env.API_ADDRESS?.trim();
const port = Number(process.env.PORT ?? "8080");
const listenPort = address?.startsWith(":")
  ? Number(address.slice(1) || port)
  : port;

const server = createServer(app);
server.listen(listenPort, () => {
  console.log(
    JSON.stringify({
      msg: "api listening",
      level: "info",
      address: `:${listenPort}`,
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

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
