import { Router } from "express";

import {
  ProductsController,
  type ProductsControllerDeps,
} from "./products.controller.js";

export const createProductsRoutes = (deps: ProductsControllerDeps): Router => {
  const router = Router();
  const controller = new ProductsController(deps);

  router.get("/products", controller.list);

  return router;
};
