import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, getSupabaseSecretKey } from "./env.js";
import { ApiError } from "../errors/apiError.js";
import type { Database } from "../types/database.types.js";

export type ScribeFlowSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(): ScribeFlowSupabaseClient {
  const secretKey = getSupabaseSecretKey();

  if (!env.SUPABASE_URL || !secretKey) {
    throw ApiError.supabaseNotConfigured();
  }

  return createClient<Database>(env.SUPABASE_URL, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "scribeflow-api",
      },
    },
  });
}
