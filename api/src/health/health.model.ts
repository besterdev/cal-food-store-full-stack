import type { Pool } from "pg";

import { LATEST_VERSION } from "../config/migrations.js";

export class HealthModel {
  constructor(private readonly pool: Pool) {}

  /** Ready when PostgreSQL answers and the latest migration is applied. */
  async ready(): Promise<void> {
    const result = await this.pool.query<{ applied: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS applied",
      [LATEST_VERSION],
    );
    if (!result.rows[0]?.applied) {
      throw new Error(`schema version ${LATEST_VERSION} is not applied`);
    }
  }
}
