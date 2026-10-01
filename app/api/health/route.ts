import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estado sem segredos: só se cada dependência está configurada e se a BD responde.
export async function GET(): Promise<Response> {
  const env = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    voyage: Boolean(process.env.VOYAGE_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    salt: Boolean(process.env.IP_HASH_SALT),
  };
  let chunks: number | null = null;
  if (env.supabase) {
    const { count, error } = await supabaseAdmin().from("chunks").select("id", { count: "exact", head: true });
    if (!error) chunks = count ?? 0;
  }
  const ok = Object.values(env).every(Boolean) && (chunks ?? 0) > 0;
  return new Response(JSON.stringify({ ok, env, chunks }), {
    status: ok ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
