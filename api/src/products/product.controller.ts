import type { Request, Response } from "express";

import { ErrInvalidCatalog, type Product } from "../../../modules/catalog/product.js";
import { writeError } from "../../../middleware/http-errors.js";
import { runWithTimeout } from "../../../utils/timeout.js";

export interface ProductsControllerDeps {
  listProducts: (signal?: AbortSignal) => Promise<Product[]>;
  requestTimeoutMs: number;
}

export class ProductsController {
  constructor(private readonly deps: ProductsControllerDeps) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    try {
      const products = await runWithTimeout(
        this.deps.requestTimeoutMs,
        (signal) => this.deps.listProducts(signal),
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
