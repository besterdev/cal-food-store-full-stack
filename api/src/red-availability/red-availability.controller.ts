import type { Request, Response } from "express";

import { writeServiceUnavailable } from "../utils/http-error.js";
import type { RedAvailabilityModel } from "./red-availability.model.js";

export const resetRedAvailability =
  (redAvailability: RedAvailabilityModel) =>
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await redAvailability.reset();
      res.status(204).end();
    } catch {
      writeServiceUnavailable(res);
    }
  };
