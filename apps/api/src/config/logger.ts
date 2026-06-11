import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-signature",
      "req.headers['x-signature']",
      "res.headers.set-cookie",
      "*.token",
      "*.signedToken",
      "*.xSignature",
      "upload.token",
      "supabaseSecretKey",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    censor: "[REDACTED]",
  },
});
