import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../http/app.js";
import { OrderService } from "../ordering/service.js";
import { applyMigrations } from "../postgres/migrate.js";
import { PostgresStore } from "../postgres/store.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("HTTP order contract", () => {
  let pool: Pool;
  let store: PostgresStore;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await applyMigrations(pool);
    store = new PostgresStore(pool);
    app = createApp({
      listProducts: () => store.listProducts(),
      ready: () => store.ready(),
      orders: new OrderService(store),
      resetRedAvailability: () => store.resetRedAvailability(),
      allowedOrigins: ["http://localhost:3000"],
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE order_lines, order_idempotency, orders RESTART IDENTITY");
    await store.resetRedAvailability();
  });

  it("lists exactly seven seeded products", async () => {
    const response = await request(app).get("/api/v1/products").expect(200);
    expect(response.body.products).toHaveLength(7);
    expect(response.body.products[0]).toMatchObject({
      code: "RED",
      unit_price_satang: 5000,
      currency: "THB",
      display_order: 1,
    });
  });

  it("places a non-discounted order", async () => {
    const key = randomUUID();
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", key)
      .send({
        lines: [{ product_code: "BLUE", quantity: 2 }],
      })
      .expect(201);

    expect(response.body.final_total_satang).toBe(6000);
    expect(response.body.pair_discount_total_satang).toBe(0);
    expect(response.body.member_applied).toBe(false);
    expect(response.headers.location).toMatch(/^\/api\/v1\/orders\//);
  });

  it("applies pair then member discounts", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .send({
        lines: [{ product_code: "ORANGE", quantity: 2 }],
        member_card_number: "MEMBER-1",
      })
      .expect(201);

    expect(response.body.total_before_discount_satang).toBe(24000);
    expect(response.body.pair_discount_total_satang).toBe(1200);
    expect(response.body.member_discount_satang).toBe(2280);
    expect(response.body.final_total_satang).toBe(20520);
  });

  it("replays identical idempotent intents", async () => {
    const key = randomUUID();
    const body = { lines: [{ product_code: "YELLOW", quantity: 1 }] };
    const first = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);
    const second = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", key)
      .send(body)
      .expect(201);

    expect(second.body.order_id).toBe(first.body.order_id);
    expect(second.body.final_total_satang).toBe(first.body.final_total_satang);
  });

  it("rejects idempotency conflict for a different intent", async () => {
    const key = randomUUID();
    await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", key)
      .send({ lines: [{ product_code: "BLUE", quantity: 1 }] })
      .expect(201);

    const conflict = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", key)
      .send({ lines: [{ product_code: "BLUE", quantity: 2 }] })
      .expect(409);

    expect(conflict.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("enforces the red availability window", async () => {
    await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .send({ lines: [{ product_code: "RED", quantity: 1 }] })
      .expect(201);

    const blocked = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .send({ lines: [{ product_code: "RED", quantity: 1 }] })
      .expect(409);

    expect(blocked.body.code).toBe("RED_UNAVAILABLE");
    expect(blocked.body.available_at).toBeTruthy();

    await request(app).post("/api/v1/red-availability/reset").expect(204);

    await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .send({ lines: [{ product_code: "RED", quantity: 1 }] })
      .expect(201);
  });

  it("rejects unknown JSON fields", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .send({
        lines: [{ product_code: "BLUE", quantity: 1 }],
        tip: 100,
      })
      .expect(400);

    expect(response.body.code).toBe("MALFORMED_JSON");
  });

  it("requires an idempotency key", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .send({ lines: [{ product_code: "BLUE", quantity: 1 }] })
      .expect(400);

    expect(response.body.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });

  it("returns a request_id when JSON is malformed", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set("Idempotency-Key", randomUUID())
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);

    expect(response.body.code).toBe("MALFORMED_JSON");
    expect(response.body.request_id).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toMatch(/^req_/);
  });
});
