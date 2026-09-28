import type { Request, Response } from "express";

import { writeServiceUnavailable } from "../utils/http-error.js";
import type { HealthModel } from "./health.model.js";

export const live = (_req: Request, res: Response): void => {
  res.status(200).json({ status: "ok" });
};

export const ready =
  (health: HealthModel) =>
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await health.ready();
      res.status(200).json({ status: "ok" });
    } catch {
      writeServiceUnavailable(res);
    }
  };
