import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

export const LATEST_VERSION = 2;

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);

/** Apply every unapplied SQL migration in version order. */
export const applyMigrations = async (pool: Pool): Promise<void> => {
  const entries = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of entries) {
    const version = migrationVersion(name);
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    await applyOne(pool, version, name, sql);
  }
};

const applyOne = async (
  pool: Pool,
  version: number,
  name: string,
  sql: string,
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(741852963)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);

    const exists = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS exists`,
      [version],
    );
    if (exists.rows[0]?.exists) {
      await client.query("COMMIT");
      return;
    }

    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`,
      [version, name],
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
};

const migrationVersion = (name: string): number => {
  const prefix = name.split("_")[0];
  const version = Number(prefix);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`migration ${name} has invalid version`);
  }
  return version;
};