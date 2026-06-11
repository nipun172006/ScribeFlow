import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { ApiError } from "../errors/apiError.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = String(res.locals.requestId ?? "unknown-request");

  const apiError =
    error instanceof ApiError
      ? error
      : error instanceof ZodError
        ? ApiError.badRequest("Request validation failed.", error.flatten())
        : new ApiError(
            500,
            "INTERNAL_SERVER_ERROR",
            "Something went wrong while handling the request.",
          );

  const shouldLogAsError = apiError.statusCode >= 500;
  const logPayload = {
    err: error,
    requestId,
    method: req.method,
    path: req.path,
    statusCode: apiError.statusCode,
  };

  if (shouldLogAsError) {
    logger.error(logPayload, "request failed");
  } else {
    logger.info(logPayload, "request rejected");
  }

  res.status(apiError.statusCode).json(apiError.toResponse(requestId));
};
