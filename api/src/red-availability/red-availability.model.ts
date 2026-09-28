import type { Pool } from "pg";

import { query } from "../config/database.js";

export class RedAvailabilityModel {
  constructor(private readonly pool: Pool) {}

  async resetRedAvailability(signal?: AbortSignal): Promise<void> {
    const result = await query(
      this.pool,
      `
        UPDATE red_availability_gate
        SET available_at = '-infinity'::timestamptz
        WHERE product_code = 'RED'
      `,
      undefined,
      signal,
    );
    if (result.rowCount !== 1) {
      throw new Error(
        `reset red availability: expected 1 gate row, got ${result.rowCount ?? 0}`,
      );
    }
  }
}
