import type { Request, Response } from "express";

import { writeServiceUnavailable } from "../utils/http-error.js";
import type { ProductModel } from "./product.model.js";

export const listProducts =
  (products: ProductModel) =>
  async (_req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({ products: await products.listProducts() });
    } catch {
      writeServiceUnavailable(res);
    }
  };
