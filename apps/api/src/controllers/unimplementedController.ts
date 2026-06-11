import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/apiError.js";

export function featureNotImplemented(message: string) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next(ApiError.notImplemented(message));
  };
}
