import { Router } from "express";

import {
  OrderController,
  type OrderControllerDeps,
} from "./order.controller.js";

export const createOrderRoutes = (deps: OrderControllerDeps): Router => {
  const router = Router();
  const controller = new OrderController(deps);

  router.post("/orders", controller.create);

  return router;
};
