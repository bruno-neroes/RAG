// Preços em USD por milhão de tokens (tabelas públicas da Anthropic e da Voyage, consultadas a 2026-10-01).
export const PRICE = {
  sonnetIn: 2.0,
  sonnetOut: 10.0,
  sonnetCacheRead: 0.2,
  sonnetCacheWrite: 2.5, // 1,25× o input (TTL de 5 min)
  haikuIn: 1.0,
  haikuOut: 5.0,
  voyageEmbed: 0.06,
  voyageRerank: 0.05,
};

export type UsageLike = {
  guardIn: number;
  guardOut: number;
  genIn: number;
  genOut: number;
  cacheRead: number;
  cacheWrite: number;
};

export function generationCostUsd(u: Pick<UsageLike, "genIn" | "genOut" | "cacheRead" | "cacheWrite">): number {
  return (u.genIn * PRICE.sonnetIn + u.genOut * PRICE.sonnetOut + u.cacheRead * PRICE.sonnetCacheRead + u.cacheWrite * PRICE.sonnetCacheWrite) / 1e6;
}

export function requestCostUsd(u: UsageLike, voyage: { embed: number; rerank: number } = { embed: 0, rerank: 0 }): number {
  return (
    generationCostUsd(u) +
    (u.guardIn * PRICE.haikuIn + u.guardOut * PRICE.haikuOut + voyage.embed * PRICE.voyageEmbed + voyage.rerank * PRICE.voyageRerank) / 1e6
  );
}
