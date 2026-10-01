import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./config";

// Cliente com a service role key: só servidor. Nunca importar a partir de componentes.
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
