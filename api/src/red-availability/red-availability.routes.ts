import { Router } from "express";

import { resetRedAvailability } from "./red-availability.controller.js";
import type { RedAvailabilityModel } from "./red-availability.model.js";

export const createRedAvailabilityRoutes = (
  redAvailability: RedAvailabilityModel,
): Router =>
  Router().post("/red-availability/reset", resetRedAvailability(redAvailability));
