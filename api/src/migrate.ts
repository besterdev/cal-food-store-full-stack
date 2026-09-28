import { Pool } from "pg";

import { applyMigrations } from "./postgres/migrate.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
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
