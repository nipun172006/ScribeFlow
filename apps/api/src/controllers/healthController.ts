import type { Request, Response } from "express";
import { providerConfig } from "../config/env.js";

export function getHealth(_req: Request, res: Response) {
  res.json({
    ok: true,
    service: "scribeflow-api",
    timestamp: new Date().toISOString(),
    dependencies: providerConfig,
  });
}
