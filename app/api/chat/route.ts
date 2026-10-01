import { cacheKey, getCached, isSuggested, putCached } from "@/lib/cache";
import { config } from "@/lib/config";
import { logExchange } from "@/lib/log";
import { normalizeMessages, runPipeline } from "@/lib/pipeline";
import { DAILY_CAP_REPLY, ERROR_REPLY, RATE_LIMIT_REPLY } from "@/lib/prompt";
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

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return json(413, { message: "Pedido demasiado grande." });

  let body: { sessionId?: unknown; messages?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { message: "Pedido inválido." });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const messages = normalizeMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(400, { message: "Escreva uma pergunta." });
  }

  // 1. Limites: por IP (hash com sal) e teto diário global.
  try {
    const limit = await checkLimits(hashIp(clientIp(req.headers)));
    if (!limit.ok) {
      return json(429, { message: limit.reason === "ip" ? RATE_LIMIT_REPLY : DAILY_CAP_REPLY });
    }
  } catch {
    return json(503, { message: ERROR_REPLY });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const question = messages[messages.length - 1].content;
      // Pergunta do carrossel, sem histórico: pode vir da cache exata (custo zero).
      const fixed = messages.length === 1 && isSuggested(question);
      const key = fixed ? cacheKey(question) : null;

      try {
        if (key) {
          const hit = await getCached(key).catch(() => null);
          if (hit) {
            send("delta", { t: hit.answer });
            const latencyMs = Date.now() - started;
            send("done", { answer: hit.answer, citations: hit.citations, label: "project", blocked: false, latencyMs, model: hit.model, cached: true });
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
        }

        const result = await runPipeline(messages, {
          onText: (t) => send("delta", { t }),
          onReplace: (text) => send("replace", { text }),
          signal: req.signal,
          trusted: fixed,
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
        send("done", {
          answer: result.answer,
          citations: result.citations,
          label: result.label,
          blocked: result.blocked,
          latencyMs,
          model: result.model,
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
        if (!req.signal.aborted) {
          console.error("chat: pipeline falhou", err instanceof Error ? err.name : "erro");
          send("error", { message: ERROR_REPLY });
          await logExchange({
            sessionId,
            question,
            answer: ERROR_REPLY,
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
