import { Router } from "express";
import type { ApiDependencies } from "../dependencies.js";
import { createActionItemRoutes } from "./actionItemRoutes.js";
import { analyticsRoutes } from "./analyticsRoutes.js";
import { healthRoutes } from "./healthRoutes.js";
import { createMeetingRoutes } from "./meetingRoutes.js";
import { createSearchRoutes } from "./searchRoutes.js";

export function createApiRoutes(dependencies: ApiDependencies) {
  const apiRoutes = Router();

  apiRoutes.use(healthRoutes);
  apiRoutes.use(createMeetingRoutes(dependencies));
  apiRoutes.use(createActionItemRoutes(dependencies));
  apiRoutes.use(createSearchRoutes(dependencies));
  apiRoutes.use(analyticsRoutes);

  return apiRoutes;
}
