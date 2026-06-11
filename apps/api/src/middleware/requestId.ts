import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const isReasonableRequestId = (value: string) =>
  value.length > 0 && value.length <= 128;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingRequestId = req.header("x-request-id");
  const requestId =
    incomingRequestId && isReasonableRequestId(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
