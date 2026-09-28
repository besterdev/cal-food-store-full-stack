import { createPool } from "./config/database.js";
import { loadConfig } from "./config/env.js";
import { applyMigrations } from "./config/migrations.js";
import { errorMessage, jsonLogger as logger } from "./utils/logger.js";

const MIGRATION_TIMEOUT_MS = 60_000;

let exitCode = 0;
const pool = createPool(loadConfig().databaseUrl, MIGRATION_TIMEOUT_MS);

try {
  await applyMigrations(pool);
  logger.info("migrations applied");
} catch (err) {
  logger.error("migrations failed", { error: errorMessage(err) });
  exitCode = 1;
} finally {
  await pool.end();
}

process.exit(exitCode);
