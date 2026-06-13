import { Router } from "express";
import { z } from "zod";
import { searchInputSchema, uuidSchema } from "@scribeflow/shared";
import { validateRequest } from "../middleware/validateRequest.js";
import { ApiError } from "../errors/apiError.js";
import type { ApiDependencies } from "../dependencies.js";

const meetingIdParamsSchema = z.object({
  meetingId: uuidSchema,
});

export function createSearchRoutes(dependencies: ApiDependencies) {
  const router = Router();

  router.post(
    "/meetings/:meetingId/index",
    validateRequest({ params: meetingIdParamsSchema }),
    async (_req, res, next) => {
      try {
        const params = res.locals.params as { meetingId: string };
        const repository = dependencies.getMeetingRepository();
        const indexingService = dependencies.getMeetingIndexingService();

        const detail = await repository.getMeetingDetail(params.meetingId);
        if (!detail) {
          throw ApiError.meetingNotFound();
        }

        const result = await indexingService.indexMeeting(detail);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/search",
    validateRequest({ body: searchInputSchema }),
    async (_req, res, next) => {
      try {
        const body = res.locals.body as z.infer<typeof searchInputSchema>;
        const searchService = dependencies.getMeetingSearchService();

        const results = await searchService.search(body.query, body.limit ?? 10);
        res.json({ results });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
