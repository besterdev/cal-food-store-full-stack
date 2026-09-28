import { Router } from "express";

import {
  ProductController,
  type ProductControllerDeps,
} from "./product.controller.js";

export const createProductRoutes = (deps: ProductControllerDeps): Router => {
  const router = Router();
  const controller = new ProductController(deps);

  router.get("/products", controller.list);

  return router;
};
