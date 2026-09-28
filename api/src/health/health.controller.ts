import type { Request, Response } from "express";

import { writeError } from "../middleware/http-errors.js";
import { runWithTimeout } from "../utils/timeout.js";
import type { HealthModel } from "./health.model.js";

export interface HealthControllerDeps {
  health: HealthModel;
  readinessTimeoutMs: number;
}

export class HealthController {
  constructor(private readonly deps: HealthControllerDeps) {}

  live = (_req: Request, res: Response): void => {
    res.status(200).json({ status: "ok" });
  };

  ready = async (_req: Request, res: Response): Promise<void> => {
    try {
      await runWithTimeout(this.deps.readinessTimeoutMs, (signal) =>
        this.deps.health.ready(signal),
      );
      res.status(200).json({ status: "ok" });
    } catch {
      writeError(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "The service is temporarily unavailable.",
      );
    }
  };
}
