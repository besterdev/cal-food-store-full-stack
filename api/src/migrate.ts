import { Pool } from "pg";

import { loadConfig } from "./config/index.js";
import { applyMigrations } from "./infrastructure/postgres/migrate.js";

let databaseUrl: string;
try {
  databaseUrl = loadConfig().databaseUrl;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await applyMigrations(pool);
  console.log("migrations applied");
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await pool.end();
}
