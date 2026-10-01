import { createHash } from "node:crypto";
import { config, requireEnv } from "./config";
import { supabaseAdmin } from "./supabase";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}|${requireEnv("IP_HASH_SALT")}`).digest("hex");
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export type LimitCheck = { ok: true } | { ok: false; reason: "ip" | "daily" };

export async function checkLimits(ipHash: string): Promise<LimitCheck> {
  const db = supabaseAdmin();
  const [rl, daily] = await Promise.all([
    db.rpc("check_rate_limit", { p_ip_hash: ipHash, p_window_minutes: 10, p_max: config.rateLimitPer10Min }),
    db.rpc("daily_message_count"),
  ]);
  if (rl.error || daily.error) throw new Error("verificação de limites falhou");
  if (rl.data !== true) return { ok: false, reason: "ip" };
  if ((daily.data as number) >= config.dailyMessageCap) return { ok: false, reason: "daily" };
  return { ok: true };
}
