import type { Pool } from "pg";

export class RedAvailabilityModel {
  constructor(private readonly pool: Pool) {}

  /** Demo helper: makes Red available immediately. */
  async reset(): Promise<void> {
    const result = await this.pool.query(`
      UPDATE red_availability_gate
      SET available_at = '-infinity'::timestamptz
      WHERE product_code = 'RED'
    `);
    if (result.rowCount !== 1) {
      throw new Error(`expected 1 red gate row, got ${result.rowCount ?? 0}`);
    }
  }
}
