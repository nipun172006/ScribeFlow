import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../errors/apiError.js";

export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.routeNotFound(`No route found for ${req.method} ${req.path}.`));
}
