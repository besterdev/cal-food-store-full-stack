import type { NextFunction, Request, Response } from "express";

export const corsMiddleware = (allowedOrigins: string[]) => {
  const allowed = new Set(
    allowedOrigins.map((origin) => origin.trim()).filter(Boolean),
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header("Origin");
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Idempotency-Key,X-Request-ID",
      );
      res.setHeader("Access-Control-Expose-Headers", "Location,X-Request-ID");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
    }
    next();
  };
};
