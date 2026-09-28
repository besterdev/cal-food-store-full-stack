import { Router } from "express";

import {
  HealthController,
  type HealthControllerDeps,
} from "./health.controller.js";

export const createHealthRoutes = (deps: HealthControllerDeps): Router => {
  const router = Router();
  const controller = new HealthController(deps);

  router.get("/health/live", controller.live);
  router.get("/health/ready", controller.ready);

  return router;
};
