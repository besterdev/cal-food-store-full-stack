import { Router } from "express";

import { ErrInvalidCatalog, type Product } from "../../catalog/product.js";
import { writeError } from "../errors.js";
import { withTimeout } from "../timeout.js";

export const createProductsRouter = (deps: {
  listProducts: () => Promise<Product[]>;
  requestTimeoutMs: number;
}): Router => {
  const router = Router();

  router.get("/api/v1/products", async (_req, res) => {
    try {
      const products = await withTimeout(
        deps.listProducts(),
        deps.requestTimeoutMs,
      );
      res.status(200).json({ products });
    } catch (err) {
      if (err === ErrInvalidCatalog) {
        writeError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
        return;
      }
      writeError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "The service is temporarily unavailable.",
      );
    }
  });

  return router;
};
