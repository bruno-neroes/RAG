import { config, requireEnv } from "./config";

// Cliente mínimo da API REST da Voyage AI (embeddings + rerank).
// https://docs.voyageai.com/reference/embeddings-api · https://docs.voyageai.com/reference/reranker-api
const BASE = "https://api.voyageai.com/v1";

const RETRIES = Number(process.env.VOYAGE_RETRIES ?? 2);

async function post<T>(path: string, body: unknown, timeoutMs = 10000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${requireEnv("VOYAGE_API_KEY")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    // 429/5xx: backoff curto (respeita Retry-After até 4 s). Número de tentativas limitado.
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 4000) : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    // Não propagar o corpo (pode ecoar o pedido); só o estado.
    throw new Error(`Voyage ${path} falhou: HTTP ${res.status}`);
  }
}

type EmbedResponse = { data: { embedding: number[]; index: number }[]; usage: { total_tokens: number } };

export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<{ vectors: number[][]; tokens: number }> {
  const r = await post<EmbedResponse>("/embeddings", {
    input: texts,
    model: config.embedModel,
    input_type: inputType,
    output_dimension: config.embedDim,
  });
  const vectors = r.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  return { vectors, tokens: r.usage.total_tokens };
}

type RerankResponse = { data: { index: number; relevance_score: number }[]; usage: { total_tokens: number } };

export async function rerank(
  query: string,
  documents: string[],
  topK: number,
): Promise<{ results: { index: number; score: number }[]; tokens: number }> {
  if (documents.length === 0) return { results: [], tokens: 0 };
  const r = await post<RerankResponse>("/rerank", {
    query,
    documents,
    model: config.rerankModel,
    top_k: Math.min(topK, documents.length),
  });
  return { results: r.data.map((d) => ({ index: d.index, score: d.relevance_score })), tokens: r.usage.total_tokens };
}
