import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import { corsAllowedOrigins, env } from "./config/env.js";
import { logger } from "./config/logger.js";
import type { ApiDependencies } from "./dependencies.js";
import { createApiDependencies } from "./dependencies.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundMiddleware } from "./middleware/notFound.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createApiRoutes } from "./routes/index.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWebDistPath = path.resolve(moduleDir, "../../..", "apps/web/dist");

export function resolveWebDistPath() {
  return env.WEB_DIST_PATH
    ? path.resolve(process.cwd(), env.WEB_DIST_PATH)
    : defaultWebDistPath;
}

function configureProductionFrontendServing(app: express.Express) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const webDistPath = resolveWebDistPath();
  const indexHtmlPath = path.join(webDistPath, "index.html");

  app.use(express.static(webDistPath));
  app.get("*", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(indexHtmlPath, (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

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
      origin: (origin, callback) => {
        if (!origin || corsAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use("/api", createApiRoutes(dependencies));

  configureProductionFrontendServing(app);

  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
