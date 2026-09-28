import { randomBytes } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.header("X-Request-ID");
  const requestId =
    incoming && validRequestId(incoming) ? incoming : generateRequestId();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};

const validRequestId = (value: string): boolean => {
  if (value.length < 5 || value.length > 128 || !value.startsWith("req_")) {
    return false;
  }
  for (let i = 4; i < value.length; i += 1) {
    const character = value[i]!;
    if (
      !(
        (character >= "a" && character <= "z") ||
        (character >= "A" && character <= "Z") ||
        (character >= "0" && character <= "9") ||
        character === "_" ||
        character === "-"
      )
    ) {
      return false;
    }
  }
  return true;
};

const generateRequestId = (): string =>
  `req_${randomBytes(16).toString("hex")}`;
