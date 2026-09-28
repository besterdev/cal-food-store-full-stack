import type { Pool, PoolClient } from "pg";

import { query } from "../config/database.js";
import {
  asServiceUnavailable,
  classifyDbError,
  ErrIdempotencyConflict,
  ValidationError,
} from "./order.errors.js";
import type { Breakdown } from "./order.pricing.js";
import type {
  PlacementTx,
  PreparedIntent,
  ProductSnapshot,
  Receipt,
  RedGateClaim,
} from "./order.types.js";

export class OrderModel {
  constructor(private readonly pool: Pool) {}

  async beginPlacement(signal?: AbortSignal): Promise<PlacementTx> {
    if (signal?.aborted) {
      throw asServiceUnavailable(signal.reason ?? new Error("aborted"));
    }
    const client = await this.pool.connect();
    try {
      await query(
        client,
        "BEGIN ISOLATION LEVEL READ COMMITTED",
        undefined,
        signal,
      );
    } catch (err) {
      client.release();
      throw asServiceUnavailable(err);
    }
    return new PlacementTransaction(client, signal);
  }
}

class PlacementTransaction implements PlacementTx {
  private settled = false;

  constructor(
    private readonly client: PoolClient,
    private readonly signal?: AbortSignal,
  ) {}

  async claimIdempotency(
    prepared: PreparedIntent,
    orderId: string,
  ): Promise<boolean> {
    try {
      const result = await query<{ order_id: string }>(
        this.client,
        `
          INSERT INTO order_idempotency (key_digest, intent_digest, order_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (key_digest) DO NOTHING
          RETURNING order_id
        `,
        [prepared.keyDigest, prepared.intentDigest, orderId],
        this.signal,
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      throw classifyDbError("claim idempotency", err);
    }
  }

  async loadReceiptByKey(prepared: PreparedIntent): Promise<Receipt> {
    try {
      const binding = await query<{
        order_id: string;
        intent_digest: Buffer;
      }>(
        this.client,
        `
          SELECT order_id, intent_digest
          FROM order_idempotency
          WHERE key_digest = $1
        `,
        [prepared.keyDigest],
        this.signal,
      );
      const row = binding.rows[0];
      if (!row) {
        throw classifyDbError("load idempotency binding", new Error("no rows"));
      }
      if (
        !Buffer.isBuffer(row.intent_digest) ||
        row.intent_digest.length !== 32 ||
        !row.intent_digest.equals(prepared.intentDigest)
      ) {
        throw ErrIdempotencyConflict;
      }
      return this.loadReceipt(row.order_id);
    } catch (err) {
      if (err === ErrIdempotencyConflict) {
        throw err;
      }
      throw classifyDbError("load idempotency binding", err);
    }
  }

  private async loadReceipt(orderId: string): Promise<Receipt> {
    const order = await query<{
      placed_at: Date;
      total_before_discount_satang: string;
      pair_discount_satang: string;
      member_discount_applied: boolean;
      member_discount_satang: string;
      final_total_satang: string;
    }>(
      this.client,
      `
        SELECT placed_at,
               total_before_discount_satang,
               pair_discount_satang,
               member_discount_applied,
               member_discount_satang,
               final_total_satang
        FROM orders
        WHERE id = $1
      `,
      [orderId],
      this.signal,
    );
    const orderRow = order.rows[0];
    if (!orderRow) {
      throw classifyDbError("load order", new Error("no rows"));
    }

    const linesResult = await query<{
      product_code: string;
      product_name: string;
      quantity: number;
      unit_price_satang: string;
      line_subtotal_satang: string;
      pair_count: number;
      pair_discount_satang: string;
      display_order: number;
    }>(
      this.client,
      `
        SELECT product_code, product_name, quantity, unit_price_satang, line_subtotal_satang,
               pair_count, pair_discount_satang, display_order
        FROM order_lines
        WHERE order_id = $1
        ORDER BY display_order ASC
      `,
      [orderId],
      this.signal,
    );

    const receipt: Receipt = {
      orderId,
      acceptedAt: new Date(orderRow.placed_at.toISOString()),
      currency: "THB",
      lines: [],
      totalBeforeDiscountSatang: Number(orderRow.total_before_discount_satang),
      pairDiscounts: [],
      pairDiscountTotalSatang: Number(orderRow.pair_discount_satang),
      memberApplied: orderRow.member_discount_applied,
      memberDiscountSatang: Number(orderRow.member_discount_satang),
      finalTotalSatang: Number(orderRow.final_total_satang),
    };

    for (const line of linesResult.rows) {
      receipt.lines.push({
        productCode: line.product_code,
        productName: line.product_name,
        quantity: line.quantity,
        unitPriceSatang: Number(line.unit_price_satang),
        lineTotalBeforeDiscountSatang: Number(line.line_subtotal_satang),
      });
      if (line.pair_count > 0 && Number(line.pair_discount_satang) > 0) {
        receipt.pairDiscounts.push({
          productCode: line.product_code,
          pairCount: line.pair_count,
          pairedQuantity: line.pair_count * 2,
          discountRateBasisPoints: 500,
          discountSatang: Number(line.pair_discount_satang),
        });
      }
    }

    return receipt;
  }

  async loadProducts(codes: string[]): Promise<Map<string, ProductSnapshot>> {
    try {
      const result = await query<{
        code: string;
        name: string;
        unit_price_satang: string;
        display_order: number;
      }>(
        this.client,
        `
          SELECT code, name, unit_price_satang, display_order
          FROM products
          WHERE code = ANY($1::text[])
        `,
        [codes],
        this.signal,
      );
      const products = new Map<string, ProductSnapshot>();
      for (const row of result.rows) {
        products.set(row.code, {
          code: row.code,
          name: row.name,
          unitPriceSatang: Number(row.unit_price_satang),
          displayOrder: row.display_order,
        });
      }
      if (products.size !== codes.length) {
        throw new ValidationError([
          {
            field: "lines",
            code: "UNSUPPORTED",
            message: "product_code is not a supported Product",
          },
        ]);
      }
      return products;
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err;
      }
      throw classifyDbError("load products", err);
    }
  }

  async readClock(): Promise<Date> {
    try {
      const result = await query<{ now: Date }>(
        this.client,
        `SELECT clock_timestamp() AS now`,
        undefined,
        this.signal,
      );
      const now = result.rows[0]?.now;
      if (!now) {
        throw new Error("missing clock");
      }
      return now;
    } catch (err) {
      throw classifyDbError("read database time", err);
    }
  }

  /**
   * Lock the Red gate row, compare it with PostgreSQL time, and advance it by
   * 60 minutes when Red is available. The row lock is held until commit or
   * rollback, so concurrent Red Orders serialize here.
   */
  async claimRedGate(): Promise<RedGateClaim> {
    const availableAt = await this.lockRedGate();
    const now = await this.readClock();
    if (now.getTime() < availableAt.getTime()) {
      return { ok: false, availableAt };
    }
    await this.advanceRedGate(now);
    return { ok: true, acceptedAt: now };
  }

  private async lockRedGate(): Promise<Date> {
    try {
      const result = await query<{ available_at: Date | null }>(
        this.client,
        `
          SELECT CASE
            WHEN available_at = '-infinity'::timestamptz THEN NULL
            ELSE available_at
          END AS available_at
          FROM red_availability_gate
          WHERE product_code = 'RED'
          FOR UPDATE
        `,
        undefined,
        this.signal,
      );
      const value = result.rows[0]?.available_at;
      if (value === undefined) {
        throw new Error("missing red gate");
      }
      return value === null ? new Date(0) : value;
    } catch (err) {
      throw classifyDbError("lock red gate", err);
    }
  }

  private async advanceRedGate(from: Date): Promise<void> {
    try {
      await query(
        this.client,
        `
          UPDATE red_availability_gate
          SET available_at = $1::timestamptz + interval '60 minutes'
          WHERE product_code = 'RED'
        `,
        [from],
        this.signal,
      );
    } catch (err) {
      throw classifyDbError("update red gate", err);
    }
  }

  async insertAcceptedOrder(
    orderId: string,
    acceptedAt: Date,
    breakdown: Breakdown,
  ): Promise<void> {
    try {
      await query(
        this.client,
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
        this.signal,
      );

      for (const line of breakdown.lines) {
        await query(
          this.client,
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
          this.signal,
        );
      }
    } catch (err) {
      throw classifyDbError("insert order", err);
    }
  }

  async commit(): Promise<void> {
    if (this.settled) {
      return;
    }
    this.settled = true;
    try {
      await this.client.query("COMMIT");
    } catch (err) {
      try {
        await this.client.query("ROLLBACK");
      } catch {
        // ignore secondary rollback failure
      }
      throw classifyDbError("commit", err);
    } finally {
      this.client.release();
    }
  }

  async rollback(): Promise<void> {
    if (this.settled) {
      return;
    }
    this.settled = true;
    try {
      await this.client.query("ROLLBACK");
    } finally {
      this.client.release();
    }
  }
}
