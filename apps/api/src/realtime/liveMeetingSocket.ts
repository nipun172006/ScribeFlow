import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { logger } from "../config/logger.js";

export function attachLiveMeetingSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/api/meetings/live/socket") {
      return;
    }

    socket.write("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n");
    socket.destroy();
    logger.info("live meeting WebSocket endpoint requested before implementation");
  });

  return wss;
}
