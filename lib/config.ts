// Configuração central. Só é importado por código de servidor e scripts.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  chatModel: process.env.CHAT_MODEL || "claude-sonnet-5-5",
  guardModel: process.env.GUARD_MODEL || "claude-haiku-4-5",
  embedModel: process.env.VOYAGE_EMBED_MODEL || "voyage-4",
  rerankModel: process.env.VOYAGE_RERANK_MODEL || "rerank-3",
  embedDim: 1024,
  maxOutputTokens: 700,
  matchCount: 12,
  rerankTopK: 5,
  rerankMinScore: num("RERANK_MIN_SCORE", 0.3),
  rateLimitPer10Min: num("RATE_LIMIT_PER_10MIN", 20),
  dailyMessageCap: num("DAILY_MESSAGE_CAP", 400),
  maxHistory: 6,
  maxMessageChars: 600,
  docName: "AI First-Responder",
} as const;

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente em falta: ${name}`);
  return v;
}
