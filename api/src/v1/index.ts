import { Router } from "express";

import type { Product } from "../modules/catalog/product.js";
import type { OrderService } from "../modules/ordering/service.js";
import { createOrdersRoutes } from "./features/orders/orders.routes.js";
import { createProductsRoutes } from "./features/products/products.routes.js";
import { createRedAvailabilityRoutes } from "./features/red-availability/red-availability.routes.js";

export interface V1Deps {
  listProducts: (signal?: AbortSignal) => Promise<Product[]>;
  orders: OrderService;
  resetRedAvailability?: (signal?: AbortSignal) => Promise<void>;
  requestTimeoutMs: number;
}

/** Mount versioned Food Store API routes under /api/v1. */
export const createV1Router = (deps: V1Deps): Router => {
  const router = Router();

  router.use(
    createProductsRoutes({
      listProducts: deps.listProducts,
      requestTimeoutMs: deps.requestTimeoutMs,
    }),
  );
  router.use(
    createOrdersRoutes({
      orders: deps.orders,
      requestTimeoutMs: deps.requestTimeoutMs,
    }),
  );
  if (deps.resetRedAvailability) {
    router.use(
      createRedAvailabilityRoutes({
        resetRedAvailability: deps.resetRedAvailability,
        requestTimeoutMs: deps.requestTimeoutMs,
      }),
    );
  }

  return router;
};
