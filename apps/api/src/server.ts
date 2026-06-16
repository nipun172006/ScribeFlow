import { createServer } from "node:http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { attachLiveMeetingSocket } from "./realtime/liveMeetingSocket.js";

const app = createApp();
const server = createServer(app);
const liveMeetingSocketServer = attachLiveMeetingSocket(server);

server.listen(env.PORT, "0.0.0.0", () => {
  logger.info(
    {
      port: env.PORT,
      host: "0.0.0.0",
    },
    "scribeflow-api listening",
  );
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "shutdown requested");

  liveMeetingSocketServer.close();
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "server shutdown failed");
      process.exit(1);
    }

    logger.info("server shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
