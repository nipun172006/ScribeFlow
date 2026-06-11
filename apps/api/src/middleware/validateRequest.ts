import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ApiError } from "../errors/apiError.js";

type RequestSchemas = {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
};

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

const hasInvalidUuidIssue = (error: z.ZodError) =>
  error.issues.some(
    (issue) => issue.code === "invalid_string" && issue.validation === "uuid",
  );

export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bodyResult = schemas.body?.safeParse(req.body);
    if (bodyResult && !bodyResult.success) {
      next(
        ApiError.badRequest(
          "Request body validation failed.",
          formatZodError(bodyResult.error),
        ),
      );
      return;
    }

    const paramsResult = schemas.params?.safeParse(req.params);
    if (paramsResult && !paramsResult.success) {
      next(
        hasInvalidUuidIssue(paramsResult.error)
          ? ApiError.invalidUuid("Route parameter must be a valid UUID.")
          : ApiError.badRequest(
              "Route parameter validation failed.",
              formatZodError(paramsResult.error),
            ),
      );
      return;
    }

    const queryResult = schemas.query?.safeParse(req.query);
    if (queryResult && !queryResult.success) {
      next(
        ApiError.badRequest(
          "Query parameter validation failed.",
          formatZodError(queryResult.error),
        ),
      );
      return;
    }

    res.locals.body = bodyResult?.data;
    res.locals.params = paramsResult?.data;
    res.locals.query = queryResult?.data;
    next();
  };
}
