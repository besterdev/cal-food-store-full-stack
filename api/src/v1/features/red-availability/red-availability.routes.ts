import { Router } from "express";

import {
  RedAvailabilityController,
  type RedAvailabilityControllerDeps,
} from "./red-availability.controller.js";

export const createRedAvailabilityRoutes = (
  deps: RedAvailabilityControllerDeps,
): Router => {
  const router = Router();
  const controller = new RedAvailabilityController(deps);

  router.post("/red-availability/reset", controller.reset);

  return router;
};
