import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";

export const healthRoutes = Router();

healthRoutes.get("/health", getHealth);
