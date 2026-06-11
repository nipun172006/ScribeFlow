import { Router } from "express";
import { searchInputSchema } from "@scribeflow/shared";
import { featureNotImplemented } from "../controllers/unimplementedController.js";
import { validateRequest } from "../middleware/validateRequest.js";

export const searchRoutes = Router();

searchRoutes.post(
  "/search",
  validateRequest({ body: searchInputSchema }),
  featureNotImplemented("Transcript and summary search are not indexed yet."),
);
