import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import type { ApiDependencies } from "./dependencies.js";
import { createApiDependencies } from "./dependencies.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundMiddleware } from "./middleware/notFound.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createApiRoutes } from "./routes/index.js";

export function createApp(dependencies: ApiDependencies = createApiDependencies()) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const header = req.headers["x-request-id"];
        return Array.isArray(header) ? (header[0] ?? "unknown") : (header ?? "unknown");
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use("/api", createApiRoutes(dependencies));

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
