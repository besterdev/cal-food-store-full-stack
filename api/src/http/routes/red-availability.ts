import { Router } from "express";

import { writeError } from "../errors.js";
import { withTimeout } from "../timeout.js";

export const createRedAvailabilityRouter = (deps: {
  resetRedAvailability: () => Promise<void>;
  requestTimeoutMs: number;
}): Router => {
  const router = Router();

  router.post("/api/v1/red-availability/reset", async (_req, res) => {
    try {
      await withTimeout(
        deps.resetRedAvailability(),
        deps.requestTimeoutMs,
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
  });

  return router;
};
