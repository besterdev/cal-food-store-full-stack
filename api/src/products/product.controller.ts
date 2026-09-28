import type { Request, Response } from "express";

import { writeError } from "../middleware/http-errors.js";
import { runWithTimeout } from "../utils/timeout.js";
import { ErrInvalidCatalog, type ProductModel } from "./product.model.js";

export interface ProductControllerDeps {
  products: ProductModel;
  requestTimeoutMs: number;
}

export class ProductController {
  constructor(private readonly deps: ProductControllerDeps) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    try {
      const products = await runWithTimeout(
        this.deps.requestTimeoutMs,
        (signal) => this.deps.products.listProducts(signal),
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
  };
}
