import pg from "pg";
import type { Pool } from "pg";

// Satang amounts are stored as bigint but always fit in a safe JavaScript integer.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

/**
 * PostgreSQL enforces every deadline: waiting for a connection, a single
 * statement, a row lock, and an idle open transaction.
 */
export const createPool = (databaseUrl: string, timeoutMs = 3000): Pool =>
  new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    lock_timeout: timeoutMs,
    idle_in_transaction_session_timeout: timeoutMs * 2,
  });
