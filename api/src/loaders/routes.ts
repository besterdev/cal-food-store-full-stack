import { Router, type Express } from "express";
import type { Pool } from "pg";

import { HealthModel } from "../health/health.model.js";
import { createHealthRoutes } from "../health/health.routes.js";
import { OrderModel } from "../orders/order.model.js";
import { createOrderRoutes } from "../orders/order.routes.js";
import { OrderService } from "../orders/order.service.js";
import { ProductModel } from "../products/product.model.js";
import { createProductRoutes } from "../products/product.routes.js";
import { RedAvailabilityModel } from "../red-availability/red-availability.model.js";
import { createRedAvailabilityRoutes } from "../red-availability/red-availability.routes.js";

export interface RoutesLoaderOptions {
  pool: Pool;
  requestTimeoutMs: number;
  readinessTimeoutMs: number;
}

/** Mount health checks at the root and Food Store features under /api/v1. */
export const loadRoutes = (app: Express, options: RoutesLoaderOptions): void => {
  const { pool, requestTimeoutMs, readinessTimeoutMs } = options;

  app.use(
    createHealthRoutes({
      health: new HealthModel(pool),
      readinessTimeoutMs,
    }),
  );

  const v1 = Router();
  v1.use(
    createProductRoutes({
      products: new ProductModel(pool),
      requestTimeoutMs,
    }),
  );
  v1.use(
    createOrderRoutes({
      orders: new OrderService(new OrderModel(pool)),
      requestTimeoutMs,
    }),
  );
  v1.use(
    createRedAvailabilityRoutes({
      redAvailability: new RedAvailabilityModel(pool),
      requestTimeoutMs,
    }),
  );
  app.use("/api/v1", v1);
};
