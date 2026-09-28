import { randomBytes } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

const REQUEST_ID = /^req_[A-Za-z0-9_-]{1,124}$/;

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.header("X-Request-ID");
  const requestId =
    incoming && REQUEST_ID.test(incoming)
      ? incoming
      : `req_${randomBytes(16).toString("hex")}`;

  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};
