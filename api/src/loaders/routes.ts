import { Router, type Express } from "express"
import type { Pool } from "pg"

import { HealthModel } from "../health/health.model.js"
import { createHealthRoutes } from "../health/health.routes.js"
import { OrderModel } from "../orders/order.model.js"
import { createOrderRoutes } from "../orders/order.routes.js"
import { OrderService } from "../orders/order.service.js"
import { ProductModel } from "../products/product.model.js"
import { createProductRoutes } from "../products/product.routes.js"
import { RedAvailabilityModel } from "../red-availability/red-availability.model.js"
import { createRedAvailabilityRoutes } from "../red-availability/red-availability.routes.js"

/** Health checks at the root; Food Store features under /api/v1. */
export const loadRoutes = (app: Express, pool: Pool): void => {
  app.use(createHealthRoutes(new HealthModel(pool)))
  app.use(
    "/api/v1",
    Router()
      .use(createProductRoutes(new ProductModel(pool)))
      .use(createOrderRoutes(new OrderService(new OrderModel(pool))))
      .use(createRedAvailabilityRoutes(new RedAvailabilityModel(pool))),
  )
}
