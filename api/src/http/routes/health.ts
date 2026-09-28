import { Router } from "express";

import { writeError } from "../errors.js";
import { withTimeout } from "../timeout.js";

export const createHealthRouter = (deps: {
  ready: () => Promise<void>;
  readinessTimeoutMs: number;
}): Router => {
  const router = Router();

  router.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.get("/health/ready", async (_req, res) => {
    try {
      await withTimeout(deps.ready(), deps.readinessTimeoutMs);
      res.status(200).json({ status: "ok" });
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
