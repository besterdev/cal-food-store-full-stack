import type { Request, Response } from "express";

import { writeError } from "../middleware/http-errors.js";
import { runWithTimeout } from "../utils/timeout.js";
import type { RedAvailabilityModel } from "./red-availability.model.js";

export interface RedAvailabilityControllerDeps {
  redAvailability: RedAvailabilityModel;
  requestTimeoutMs: number;
}

export class RedAvailabilityController {
  constructor(private readonly deps: RedAvailabilityControllerDeps) {}

  reset = async (_req: Request, res: Response): Promise<void> => {
    try {
      await runWithTimeout(this.deps.requestTimeoutMs, (signal) =>
        this.deps.redAvailability.resetRedAvailability(signal),
      );
      res.status(204).end();
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
