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
      "headers.authorization",
      "*.headers.authorization",
      "authorization",
      "*.authorization",
      "res.headers.set-cookie",
      "*.token",
      "*.signedToken",
      "*.xSignature",
      "*.signedUrl",
      "audioUrl",
      "*.audioUrl",
      "providerRequest.url",
      "*.providerRequest.url",
      "upload.token",
      "deepgramApiKey",
      "DEEPGRAM_API_KEY",
      "supabaseSecretKey",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    censor: "[REDACTED]",
  },
});
