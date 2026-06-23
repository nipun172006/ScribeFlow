import { Router } from "express";
import { crossMeetingAnalyticsSchema } from "@scribeflow/shared";
import type { ApiDependencies } from "../dependencies.js";

export function createAnalyticsRoutes(dependencies: ApiDependencies) {
  const router = Router();

  router.get("/analytics", async (_req, res, next) => {
    try {
      const analytics = await dependencies
        .getMeetingRepository()
        .getCrossMeetingAnalytics();

      res.json(crossMeetingAnalyticsSchema.parse(analytics));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
