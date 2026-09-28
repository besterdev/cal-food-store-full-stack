import type { Pool, PoolClient } from "pg";

import type { Product } from "../catalog/product.js";
import { ErrInvalidCatalog } from "../catalog/product.js";
import {
  asServiceUnavailable,
  ErrIdempotencyConflict,
  ValidationError,
  type OrderStore,
  type PlacementTx,
  type PreparedIntent,
  type ProductSnapshot,
  type Receipt,
} from "../ordering/order.js";
import type { Breakdown } from "../pricing/pricing.js";
import { LATEST_VERSION } from "./migrate.js";

const CONTRACT_PRODUCTS: Product[] = [
  {
    code: "RED",
    name: "Red set",
    unit_price_satang: 5000,
    currency: "THB",
    display_order: 1,
    color_token: "red",
  },
  {
    code: "GREEN",
    name: "Green set",
    unit_price_satang: 4000,
    currency: "THB",
    display_order: 2,
    color_token: "green",
  },
  {
    code: "BLUE",
    name: "Blue set",
    unit_price_satang: 3000,
    currency: "THB",
    display_order: 3,
    color_token: "blue",
  },
  {
    code: "YELLOW",
    name: "Yellow set",
    unit_price_satang: 5000,
    currency: "THB",
    display_order: 4,
    color_token: "yellow",
  },
  {
    code: "PINK",
    name: "Pink set",
    unit_price_satang: 8000,
    currency: "THB",
    display_order: 5,
    color_token: "pink",
  },
  {
    code: "PURPLE",
    name: "Purple set",
    unit_price_satang: 9000,
    currency: "THB",
    display_order: 6,
    color_token: "purple",
  },
  {
    code: "ORANGE",
    name: "Orange set",
    unit_price_satang: 12000,
    currency: "THB",
    display_order: 7,
    color_token: "orange",
  },
];

export class PostgresStore implements OrderStore {
  constructor(private readonly pool: Pool) {}

  async listProducts(): Promise<Product[]> {
    const result = await this.pool.query<{
      code: string;
      name: string;
      unit_price_satang: string | number;
      currency: string;
      display_order: string | number;
      color_token: string;
    }>(`
      SELECT code, name, unit_price_satang, currency, display_order, color_token
      FROM products
      ORDER BY display_order ASC
    `);
    const products: Product[] = result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      unit_price_satang: Number(row.unit_price_satang),
      currency: row.currency,
      display_order: Number(row.display_order),
      color_token: row.color_token,
    }));
    if (!matchesContract(products)) {
      throw ErrInvalidCatalog;
    }
    return products;
  }

  async resetRedAvailability(): Promise<void> {
    const result = await this.pool.query(`
      UPDATE red_availability_gate
      SET available_at = '-infinity'::timestamptz
      WHERE product_code = 'RED'
    `);
    if (result.rowCount !== 1) {
      throw new Error(
        `reset red availability: expected 1 gate row, got ${result.rowCount ?? 0}`,
      );
    }
  }

  async ready(): Promise<void> {
    await this.pool.query("SELECT 1");
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS exists`,
      [LATEST_VERSION],
    );
    if (!result.rows[0]?.exists) {
      throw new Error(`required schema version ${LATEST_VERSION} is not applied`);
    }
  }

  async beginPlacement(): Promise<PlacementTx> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    } catch (err) {
      client.release();
      throw asServiceUnavailable(err);
    }
    return new PlacementTransaction(client);
  }
}

class PlacementTransaction implements PlacementTx {
  private settled = false;

  constructor(private readonly client: PoolClient) {}

  async claimIdempotency(
    prepared: PreparedIntent,
    orderId: string,
  ): Promise<boolean> {
    try {
      const result = await this.client.query<{ order_id: string }>(
        `
          INSERT INTO order_idempotency (key_digest, intent_digest, order_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (key_digest) DO NOTHING
          RETURNING order_id
        `,
        [prepared.keyDigest, prepared.intentDigest, orderId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      throw classifyDbError("claim idempotency", err);
    }
  }

  async loadReceiptByKey(prepared: PreparedIntent): Promise<Receipt> {
    try {
      const binding = await this.client.query<{
        order_id: string;
        intent_digest: Buffer;
      }>(
        `
          SELECT order_id, intent_digest
          FROM order_idempotency
          WHERE key_digest = $1
        `,
        [prepared.keyDigest],
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
    const order = await this.client.query<{
      placed_at: Date;
      total_before_discount_satang: string;
      pair_discount_satang: string;
      member_discount_applied: boolean;
      member_discount_satang: string;
      final_total_satang: string;
    }>(
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
    );
    const orderRow = order.rows[0];
    if (!orderRow) {
      throw classifyDbError("load order", new Error("no rows"));
    }

    const linesResult = await this.client.query<{
      product_code: string;
      product_name: string;
      quantity: number;
      unit_price_satang: string;
      line_subtotal_satang: string;
      pair_count: number;
      pair_discount_satang: string;
      display_order: number;
    }>(
      `
        SELECT product_code, product_name, quantity, unit_price_satang, line_subtotal_satang,
               pair_count, pair_discount_satang, display_order
        FROM order_lines
        WHERE order_id = $1
        ORDER BY display_order ASC
      `,
      [orderId],
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
      const result = await this.client.query<{
        code: string;
        name: string;
        unit_price_satang: string;
        display_order: number;
      }>(
        `
          SELECT code, name, unit_price_satang, display_order
          FROM products
          WHERE code = ANY($1::text[])
        `,
        [codes],
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
      const result = await this.client.query<{ now: Date }>(
        `SELECT clock_timestamp() AS now`,
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

  async lockRedGate(): Promise<Date> {
    try {
      // Map -infinity to epoch so JS Date comparisons stay finite.
      const result = await this.client.query<{ available_at: Date | null }>(`
        SELECT CASE
          WHEN available_at = '-infinity'::timestamptz THEN NULL
          ELSE available_at
        END AS available_at
        FROM red_availability_gate
        WHERE product_code = 'RED'
        FOR UPDATE
      `);
      const value = result.rows[0]?.available_at;
      if (value === undefined) {
        throw new Error("missing red gate");
      }
      return value === null ? new Date(0) : value;
    } catch (err) {
      throw classifyDbError("lock red gate", err);
    }
  }

  async advanceRedGate(from: Date): Promise<void> {
    try {
      await this.client.query(
        `
          UPDATE red_availability_gate
          SET available_at = $1::timestamptz + interval '60 minutes'
          WHERE product_code = 'RED'
        `,
        [from],
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
    } catch (err) {
      throw classifyDbError("insert order", err);
    }
  }

  async commit(): Promise<void> {
    if (this.settled) {
      return;
    }
    try {
      await this.client.query("COMMIT");
      this.settled = true;
    } catch (err) {
      throw classifyDbError("commit", err);
    } finally {
      this.client.release();
    }
  }

  async rollback(): Promise<void> {
    if (this.settled) {
      return;
    }
    try {
      await this.client.query("ROLLBACK");
    } finally {
      this.settled = true;
      this.client.release();
    }
  }
}

const matchesContract = (products: Product[]): boolean => {
  if (products.length !== CONTRACT_PRODUCTS.length) {
    return false;
  }
  return CONTRACT_PRODUCTS.every((expected, index) => {
    const got = products[index];
    return (
      got !== undefined &&
      got.code === expected.code &&
      got.name === expected.name &&
      Number(got.unit_price_satang) === expected.unit_price_satang &&
      got.currency === expected.currency &&
      Number(got.display_order) === expected.display_order &&
      got.color_token === expected.color_token
    );
  });
};

const classifyDbError = (operation: string, err: unknown) =>
  asServiceUnavailable(
    new Error(
      `${operation}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    ),
  );
