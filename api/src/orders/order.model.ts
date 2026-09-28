import type { Pool, PoolClient } from "pg";

import { PAIR_DISCOUNT_BASIS_POINTS, type Breakdown } from "./order.pricing.js";
import {
  IdempotencyConflictError,
  type PreparedIntent,
  type ProductSnapshot,
  type Receipt,
  type ReceiptLine,
  type RedGateClaim,
} from "./order.types.js";

export class OrderModel {
  constructor(private readonly pool: Pool) {}

  /** Runs `work` in one READ COMMITTED transaction and commits only if it resolves. */
  async inTransaction<T>(
    work: (tx: OrderTransaction) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await work(new OrderTransaction(client));
      await client.query("COMMIT");
      client.release();
      return result;
    } catch (err) {
      await rollbackAndRelease(client);
      throw err;
    }
  }
}

const rollbackAndRelease = async (client: PoolClient): Promise<void> => {
  try {
    await client.query("ROLLBACK");
    client.release();
  } catch (rollbackError) {
    // A connection that cannot roll back must not return to the pool.
    client.release(rollbackError instanceof Error ? rollbackError : true);
  }
};

export class OrderTransaction {
  constructor(private readonly client: PoolClient) {}

  /**
   * Binds the key to this Order. Returns false when the key was already
   * accepted; a concurrent claim for the same key waits for that transaction.
   */
  async claimIdempotencyKey(
    intent: PreparedIntent,
    orderId: string,
  ): Promise<boolean> {
    const result = await this.client.query(
      `
        INSERT INTO order_idempotency (key_digest, intent_digest, order_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (key_digest) DO NOTHING
      `,
      [intent.keyDigest, intent.intentDigest, orderId],
    );
    return result.rowCount === 1;
  }

  /** The Receipt already accepted for this key, if the intent matches. */
  async findReceiptByKey(intent: PreparedIntent): Promise<Receipt> {
    const result = await this.client.query<{
      order_id: string;
      intent_digest: Buffer;
    }>(
      "SELECT order_id, intent_digest FROM order_idempotency WHERE key_digest = $1",
      [intent.keyDigest],
    );
    const binding = result.rows[0];
    if (!binding) {
      throw new Error("idempotency binding not found");
    }
    if (!binding.intent_digest.equals(intent.intentDigest)) {
      throw new IdempotencyConflictError();
    }
    return this.loadReceipt(binding.order_id);
  }

  async loadProducts(codes: string[]): Promise<Map<string, ProductSnapshot>> {
    const result = await this.client.query<ProductSnapshot>(
      `
        SELECT code, name,
               unit_price_satang AS "unitPriceSatang",
               display_order AS "displayOrder"
        FROM products
        WHERE code = ANY($1::text[])
      `,
      [codes],
    );
    return new Map(result.rows.map((product) => [product.code, product]));
  }

  async readClock(): Promise<Date> {
    const result = await this.client.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    const now = result.rows[0]?.now;
    if (!now) {
      throw new Error("database clock returned no rows");
    }
    return now;
  }

  /**
   * Locks the Red gate row, compares it with PostgreSQL time, and advances it
   * by 60 minutes when Red is available. The lock is held until commit or
   * rollback, so concurrent Red Orders serialize here.
   */
  async claimRedGate(): Promise<RedGateClaim> {
    const gate = await this.client.query<{ available_at: Date }>(`
      SELECT GREATEST(available_at, 'epoch'::timestamptz) AS available_at
      FROM red_availability_gate
      WHERE product_code = 'RED'
      FOR UPDATE
    `);
    const availableAt = gate.rows[0]?.available_at;
    if (!availableAt) {
      throw new Error("red availability gate row is missing");
    }

    const now = await this.readClock();
    if (now.getTime() < availableAt.getTime()) {
      return { ok: false, availableAt };
    }

    await this.client.query(
      `
        UPDATE red_availability_gate
        SET available_at = $1::timestamptz + interval '60 minutes'
        WHERE product_code = 'RED'
      `,
      [now],
    );
    return { ok: true, acceptedAt: now };
  }

  async insertOrder(
    orderId: string,
    acceptedAt: Date,
    breakdown: Breakdown,
  ): Promise<void> {
    await this.client.query(
      `
        INSERT INTO orders (
          id, placed_at, currency, member_discount_applied,
          total_before_discount_satang, pair_discount_satang,
          member_discount_satang, final_total_satang
        ) VALUES ($1, $2, 'THB', $3, $4, $5, $6, $7)
      `,
      [
        orderId,
        acceptedAt,
        breakdown.memberApplied,
        breakdown.totalBeforeDiscountSatang,
        breakdown.pairDiscountTotalSatang,
        breakdown.memberDiscountSatang,
        breakdown.finalTotalSatang,
      ],
    );

    for (const line of breakdown.lines) {
      await this.client.query(
        `
          INSERT INTO order_lines (
            order_id, product_code, product_name, display_order, quantity,
            unit_price_satang, line_subtotal_satang, pair_count,
            pair_discount_satang, line_total_after_pair_satang
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          orderId,
          line.productCode,
          line.productName,
          line.displayOrder,
          line.quantity,
          line.unitPriceSatang,
          line.lineSubtotalSatang,
          line.pairCount,
          line.pairDiscountSatang,
          line.lineTotalAfterPairSatang,
        ],
      );
    }
  }

  /** Builds the Receipt from the immutable persisted snapshots. */
  async loadReceipt(orderId: string): Promise<Receipt> {
    const orderResult = await this.client.query<
      Omit<Receipt, "orderId" | "lines" | "pairDiscounts">
    >(
      `
        SELECT placed_at AS "acceptedAt",
               currency,
               total_before_discount_satang AS "totalBeforeDiscountSatang",
               pair_discount_satang AS "pairDiscountTotalSatang",
               member_discount_applied AS "memberApplied",
               member_discount_satang AS "memberDiscountSatang",
               final_total_satang AS "finalTotalSatang"
        FROM orders
        WHERE id = $1
      `,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new Error(`order ${orderId} not found`);
    }

    const linesResult = await this.client.query<
      ReceiptLine & { pairCount: number; pairDiscountSatang: number }
    >(
      `
        SELECT product_code AS "productCode",
               product_name AS "productName",
               quantity,
               unit_price_satang AS "unitPriceSatang",
               line_subtotal_satang AS "lineTotalBeforeDiscountSatang",
               pair_count AS "pairCount",
               pair_discount_satang AS "pairDiscountSatang"
        FROM order_lines
        WHERE order_id = $1
        ORDER BY display_order
      `,
      [orderId],
    );

    return {
      orderId,
      ...order,
      lines: linesResult.rows.map(
        ({ pairCount: _pairCount, pairDiscountSatang: _discount, ...line }) =>
          line,
      ),
      pairDiscounts: linesResult.rows
        .filter((line) => line.pairCount > 0 && line.pairDiscountSatang > 0)
        .map((line) => ({
          productCode: line.productCode,
          pairCount: line.pairCount,
          pairedQuantity: line.pairCount * 2,
          discountRateBasisPoints: PAIR_DISCOUNT_BASIS_POINTS,
          discountSatang: line.pairDiscountSatang,
        })),
    };
  }
}
