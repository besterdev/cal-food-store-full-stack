import { Router } from "express";

import { createOrder } from "./order.controller.js";
import type { OrderService } from "./order.service.js";

export const createOrderRoutes = (orders: OrderService): Router =>
  Router().post("/orders", createOrder(orders));
