import { Router } from "express";

import {
  OrdersController,
  type OrdersControllerDeps,
} from "./orders.controller.js";

export const createOrdersRoutes = (deps: OrdersControllerDeps): Router => {
  const router = Router();
  const controller = new OrdersController(deps);

  router.post("/orders", controller.create);

  return router;
};
