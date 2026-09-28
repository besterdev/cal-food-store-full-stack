import { Router } from "express";

import { live, ready } from "./health.controller.js";
import type { HealthModel } from "./health.model.js";

export const createHealthRoutes = (health: HealthModel): Router =>
  Router()
    .get("/health/live", live)
    .get("/health/ready", ready(health));
