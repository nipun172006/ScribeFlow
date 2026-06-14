import { z } from "zod";
import { audioUploadPolicy } from "@scribeflow/shared";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalSecretSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);

const optionalDefaultLanguageSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).max(24).default("en"),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.string().min(1).default("info"),
  DEEPGRAM_API_KEY: optionalSecretSchema,
  DEEPGRAM_MODEL: z.string().min(1).default("nova-3"),
  DEEPGRAM_DIARIZE_MODEL: z.string().min(1).default("latest"),
  DEEPGRAM_DEFAULT_LANGUAGE: optionalDefaultLanguageSchema,
  DEEPGRAM_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(115_000),
  DEEPGRAM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  GEMINI_API_KEY: optionalSecretSchema,
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(60_000),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-2"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  SUPABASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  SUPABASE_SECRET_KEY: optionalSecretSchema,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecretSchema,
  SUPABASE_AUDIO_BUCKET: z.string().min(1).default("meeting-audio"),
  SUPABASE_SIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(7200),
  SUPABASE_SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_AUDIO_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(audioUploadPolicy.maxFileSizeBytes),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

const isCurrentSupabaseSecretKey = (value: string | undefined) =>
  Boolean(value?.startsWith("sb_secret_"));

const isLegacyServiceRoleKey = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  const [, payload] = value.split(".");
  if (!payload) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return decoded.role === "service_role";
  } catch {
    return false;
  }
};

export const supabaseBackendKeyConfigured =
  isCurrentSupabaseSecretKey(env.SUPABASE_SECRET_KEY) ||
  isLegacyServiceRoleKey(env.SUPABASE_SERVICE_ROLE_KEY);

export const providerConfig = {
  deepgramConfigured: Boolean(env.DEEPGRAM_API_KEY),
  geminiConfigured: Boolean(env.GEMINI_API_KEY),
  supabaseConfigured: Boolean(env.SUPABASE_URL && supabaseBackendKeyConfigured),
} as const;

export const getSupabaseSecretKey = () =>
  isCurrentSupabaseSecretKey(env.SUPABASE_SECRET_KEY)
    ? env.SUPABASE_SECRET_KEY
    : isLegacyServiceRoleKey(env.SUPABASE_SERVICE_ROLE_KEY)
      ? env.SUPABASE_SERVICE_ROLE_KEY
      : undefined;
