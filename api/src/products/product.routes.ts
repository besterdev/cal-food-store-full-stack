import { Router } from "express";

import { listProducts } from "./product.controller.js";
import type { ProductModel } from "./product.model.js";

export const createProductRoutes = (products: ProductModel): Router =>
  Router().get("/products", listProducts(products));
