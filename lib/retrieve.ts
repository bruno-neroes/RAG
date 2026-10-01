import { config } from "./config";
import { supabaseAdmin } from "./supabase";
import { embed, rerank } from "./voyage";
import type { ContextDoc } from "./prompt";

export type RetrievedDoc = ContextDoc & { id: string; rrf: number; rerankScore: number | null };

export type RetrievalResult = {
  query: string;
  candidates: RetrievedDoc[]; // saída da pesquisa híbrida (até matchCount)
  reranked: RetrievedDoc[]; // top-K depois do rerank (antes do limiar)
  docs: RetrievedDoc[]; // os que passam o limiar e vão para o modelo
  timings: { embedMs: number; searchMs: number; rerankMs: number };
  tokens: { embed: number; rerank: number };
  degraded: { embedding: boolean; rerank: boolean };
};

type Row = { id: string; section: string; title: string; content: string; score: number };

export async function retrieve(query: string): Promise<RetrievalResult> {
  const t0 = Date.now();
  // Se o embedding falhar (limite/indisponibilidade da Voyage), a pesquisa degrada para
  // só palavras-chave em vez de falhar o pedido.
  let queryEmbedding: number[] | null = null;
  let embedTokens = 0;
  try {
    const e = await embed([query], "query");
    queryEmbedding = e.vectors[0];
    embedTokens = e.tokens;
  } catch {
    queryEmbedding = null;
  }
  const t1 = Date.now();

  const { data, error } = await supabaseAdmin().rpc("hybrid_search", {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: config.matchCount,
  });
  if (error) throw new Error(`hybrid_search falhou: ${error.code ?? "erro"}`);
  const t2 = Date.now();

  const candidates: RetrievedDoc[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    section: r.section,
    title: r.title,
    content: r.content,
    rrf: r.score,
    rerankScore: null,
  }));

  let reranked: RetrievedDoc[];
  let rerankTokens = 0;
  let rerankFailed = false;
  try {
    const { results: ranks, tokens } = await rerank(
      query,
      candidates.map((c) => `${c.title}\n\n${c.content}`),
      config.rerankTopK,
    );
    rerankTokens = tokens;
    reranked = ranks.map((r) => ({ ...candidates[r.index], rerankScore: r.score }));
  } catch {
    // Rerank indisponível: degrada para a ordem RRF, sem limiar.
    rerankFailed = true;
    reranked = candidates.slice(0, config.rerankTopK);
  }
  const t3 = Date.now();

  const docs = reranked.filter((d) => d.rerankScore === null || d.rerankScore >= config.rerankMinScore);

  return {
    query,
    candidates,
    reranked,
    docs,
    timings: { embedMs: t1 - t0, searchMs: t2 - t1, rerankMs: t3 - t2 },
    tokens: { embed: embedTokens, rerank: rerankTokens },
    degraded: { embedding: queryEmbedding === null, rerank: rerankFailed },
  };
}
