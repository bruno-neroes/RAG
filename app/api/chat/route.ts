import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { after } from "next/server";
import { cacheKey, getCached, isSuggested, putCached } from "@/lib/cache";
import { config } from "@/lib/config";
import { logExchange } from "@/lib/log";
import { langfuseSpanProcessor } from "@/lib/observability";
import { normalizeMessages, runPipeline, type PipelineResult } from "@/lib/pipeline";
import { requestCostUsd } from "@/lib/pricing";
import { dailyCapReply, errorReply, rateLimitReply, type Lang } from "@/lib/prompt";
import { checkLimits, clientIp, hashIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 16_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Resumo do pedido para o painel "Como foi gerada a última resposta" (sem conteúdo dos documentos). */
function traceSummary(r: PipelineResult) {
  return {
    label: r.label,
    guardSource: r.guardSource,
    sections: (r.retrieval?.reranked ?? []).map((d) => ({
      section: d.title,
      score: d.rerankScore === null ? null : Number(d.rerankScore.toFixed(3)),
      used: (r.retrieval?.docs ?? []).some((x) => x.id === d.id),
    })),
    candidates: r.retrieval?.candidates.length ?? 0,
    degraded: r.retrieval?.degraded ?? null,
    timings: r.timings,
    tokens: { input: r.usage.guardIn + r.usage.genIn, output: r.usage.guardOut + r.usage.genOut, cacheRead: r.usage.cacheRead },
    costUsd: Number(requestCostUsd(r.usage, r.retrieval?.tokens).toFixed(5)),
  };
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return json(413, { message: "Pedido demasiado grande." });

  let body: { sessionId?: unknown; messages?: unknown; lang?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { message: "Pedido inválido." });
  }
  const lang: Lang = body.lang === "en" ? "en" : "pt";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messages = normalizeMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(400, { message: lang === "en" ? "Please type a question." : "Escreva uma pergunta." });
  }

  const question = messages[messages.length - 1].content;
  // Pergunta do carrossel: é autónoma (não depende do histórico), por isso pode vir da cache
  // exata (custo zero) em qualquer ponto da conversa. Respostas da cache não contam para os
  // limites (são uma proteção de custo; numa sala, muitas pessoas partilham o IP do Wi-Fi).
  const fixed = isSuggested(question);
  const key = fixed ? cacheKey(question) : null;
  const hit = key ? await getCached(key).catch(() => null) : null;

  // 1. Limites: por IP (hash com sal) e teto diário global.
  if (!hit) {
    try {
      const limit = await checkLimits(hashIp(clientIp(req.headers)));
      if (!limit.ok) {
        return json(429, { message: limit.reason === "ip" ? rateLimitReply(lang) : dailyCapReply(lang) });
      }
    } catch {
      return json(503, { message: errorReply(lang) });
    }
  }

  // Envia os spans ao Langfuse depois de a resposta terminar (serverless pode congelar o processo).
  if (langfuseSpanProcessor) after(() => langfuseSpanProcessor!.forceFlush());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      // Um trace por pedido: chat → guard, retrieval, rerank, generation.
      await propagateAttributes(
        { sessionId: sessionId || undefined, traceName: "chat", tags: [lang, hit ? "cache" : "live"] },
        () =>
          startActiveObservation("chat", async (root) => {
            root.update({ input: { question: question.slice(0, 600), lang, turns: messages.length } });
            try {
              if (hit) {
                send("delta", { t: hit.answer });
                const latencyMs = Date.now() - started;
                send("done", {
                  answer: hit.answer,
                  citations: hit.citations,
                  label: "project",
                  blocked: false,
                  latencyMs,
                  model: hit.model,
                  cached: true,
                  trace: { cached: true, latencyMs, costUsd: 0 },
                });
                root.update({ output: { answer: hit.answer, citations: hit.citations }, metadata: { cached: true, latencyMs } });
                await logExchange({
                  sessionId,
                  question,
                  answer: hit.answer,
                  citations: hit.citations,
                  guardLabel: "project",
                  latencyMs,
                  inputTokens: 0,
                  outputTokens: 0,
                  model: `cache:${hit.model ?? ""}`,
                });
                return;
              }

              // Pergunta do carrossel: gera sem histórico, para a resposta poder ir para a cache.
              const result = await runPipeline(fixed ? messages.slice(-1) : messages, {
                onText: (t) => send("delta", { t }),
                onReplace: (text) => send("replace", { text }),
                signal: req.signal,
                trusted: fixed,
                lang,
              });
              const latencyMs = Date.now() - started;
              // Só guarda respostas completas e saudáveis (com citações, sem degradação nem bloqueio).
              if (
                key &&
                result.label === "project" &&
                !result.blocked &&
                result.citations.length > 0 &&
                result.retrieval &&
                !result.retrieval.degraded.embedding &&
                !result.retrieval.degraded.rerank
              ) {
                await putCached(key, question, { answer: result.answer, citations: result.citations, model: result.model });
              }
              const trace = { cached: false, latencyMs, ...traceSummary(result) };
              send("done", {
                answer: result.answer,
                citations: result.citations,
                label: result.label,
                blocked: result.blocked,
                latencyMs,
                model: result.model,
                trace,
              });
              root.update({
                ...(result.label === "personal_data" ? { input: { question: "[omitido: pedido de dados pessoais]", lang } } : {}),
                output: { answer: result.answer, citations: result.citations },
                metadata: { label: result.label, blocked: result.blocked, latencyMs, costUsd: trace.costUsd },
              });
              await logExchange({
                sessionId,
                question,
                answer: result.answer,
                citations: result.citations,
                guardLabel: result.label,
                latencyMs,
                inputTokens: result.usage.guardIn + result.usage.genIn,
                outputTokens: result.usage.guardOut + result.usage.genOut,
                model: result.model,
              });
            } catch (err) {
              root.update({ level: "ERROR", statusMessage: err instanceof Error ? err.name : "erro" });
              if (!req.signal.aborted) {
                console.error("chat: pipeline falhou", err instanceof Error ? err.name : "erro");
                send("error", { message: errorReply(lang) });
                await logExchange({
                  sessionId,
                  question,
                  answer: errorReply(lang),
                  citations: [],
                  guardLabel: "error",
                  latencyMs: Date.now() - started,
                  inputTokens: 0,
                  outputTokens: 0,
                  model: null,
                }).catch(() => {});
              }
            } finally {
              controller.close();
            }
          }),
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function GET(): Response {
  return json(405, { message: `Use POST. Limite de ${config.maxMessageChars} caracteres por mensagem.` });
}
