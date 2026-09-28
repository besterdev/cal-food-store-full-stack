import type { Pool } from "pg";

import { LATEST_VERSION } from "./migrate.js";
import { query } from "./query.js";

export class ReadinessStore {
  constructor(private readonly pool: Pool) {}

  async ready(signal?: AbortSignal): Promise<void> {
    await query(this.pool, "SELECT 1", undefined, signal);
    const result = await query<{ exists: boolean }>(
      this.pool,
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS exists`,
      [LATEST_VERSION],
      signal,
    );
    if (!result.rows[0]?.exists) {
      throw new Error(`required schema version ${LATEST_VERSION} is not applied`);
    }
  }
}
