import { Router } from "express";
import { featureNotImplemented } from "../controllers/unimplementedController.js";

export const analyticsRoutes = Router();

analyticsRoutes.get(
  "/analytics",
  featureNotImplemented("Cross-meeting analytics are not connected yet."),
);
