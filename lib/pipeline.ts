import type Anthropic from "@anthropic-ai/sdk";
import { startObservation } from "@langfuse/tracing";
import { anthropic } from "./anthropic";
import { config } from "./config";
import { classify, outputViolation, ruleBasedLabel } from "./guard";
import { buildUserTurn, fixedReply, outputBlockedReply, SYSTEM_PROMPT, type GuardLabel, type Lang } from "./prompt";
import { generationCostUsd } from "./pricing";
import { retrieve, type RetrievalResult } from "./retrieve";
import { extractCitations, needsHistory, sanitize } from "./text";

// Pipeline de resposta, partilhado pelo /api/chat e pelo scripts/eval.ts.
// Uma chamada ao classificador + no máximo uma chamada de geração. Nunca há loops.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type PipelineResult = {
  label: GuardLabel;
  guardSource: string;
  answer: string; // texto final, sem marcadores de citação
  rawAnswer: string; // texto do modelo tal como gerado (vazio se resposta fixa)
  citations: string[];
  droppedCitations: string[];
  blocked: boolean; // verificação de saída substituiu a resposta
  retrieval: RetrievalResult | null;
  model: string | null;
  usage: {
    guardIn: number;
    guardOut: number;
    genIn: number;
    genOut: number;
    cacheRead: number;
    cacheWrite: number;
  };
  timings: { guardMs: number; retrievalMs: number; // retrievalMs: espera adicional depois da guarda
    generationMs: number; firstTokenMs: number | null; totalMs: number };
};

export type PipelineHooks = {
  /** Texto incremental do modelo. */
  onText?: (delta: string) => void;
  /** Chamado quando a verificação interrompe o stream e substitui a resposta. */
  onReplace?: (text: string) => void;
  signal?: AbortSignal;
  /** Pergunta fixa do carrossel: conhecida e segura, salta o classificador (poupa uma chamada). */
  trusted?: boolean;
  /** Língua da interface, usada nas respostas fixas (o modelo responde na língua da pergunta). */
  lang?: Lang;
};

/** Normaliza e limita o histórico recebido do cliente. */
export function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const msgs: ChatMessage[] = [];
  for (const m of input.slice(-config.maxHistory)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const clean = sanitize(content, config.maxMessageChars);
    if (clean) msgs.push({ role, content: clean });
  }
  // A API exige que a conversa comece em `user` e alterne papéis.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const alternated: ChatMessage[] = [];
  for (const m of msgs) {
    const last = alternated[alternated.length - 1];
    if (last && last.role === m.role) alternated[alternated.length - 1] = m;
    else alternated.push(m);
  }
  return alternated;
}

export async function runPipeline(messages: ChatMessage[], hooks: PipelineHooks = {}): Promise<PipelineResult> {
  const t0 = Date.now();
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") throw new Error("A última mensagem tem de ser do utilizador.");
  const question = last.content;

  const usage = { guardIn: 0, guardOut: 0, genIn: 0, genOut: 0, cacheRead: 0, cacheWrite: 0 };

  // 1+2. Guarda de entrada e retrieval em paralelo (o retrieval não gasta tokens da Anthropic;
  //      se a guarda recusar, o resultado da pesquisa é simplesmente descartado).
  //      Pergunta curta ou anafórica: junta a pergunta anterior do utilizador
  //      (sem chamada extra ao modelo — custo e latência controlados).
  const prevUser = [...messages.slice(0, -1)].reverse().find((m) => m.role === "user");
  const searchQuery = prevUser && needsHistory(question) ? `${prevUser.content} ${question}` : question;
  const obvious = !hooks.trusted && ruleBasedLabel(question) !== null;
  const retrievalPromise = (obvious ? Promise.reject(new Error("bloqueado pelas regras")) : retrieve(searchQuery)).then(
    (r) => ({ ok: true as const, r, at: Date.now() }),
    (e: unknown) => ({ ok: false as const, e, at: Date.now() }),
  );
  const lang: Lang = hooks.lang ?? "pt";
  const guardSpan = startObservation("guard", { input: { question } }, { asType: "guardrail" });
  const guard = hooks.trusted
    ? { label: "project" as const, source: "trusted", inputTokens: 0, outputTokens: 0 }
    : await classify(question);
  usage.guardIn = guard.inputTokens;
  usage.guardOut = guard.outputTokens;
  const t1 = Date.now();
  guardSpan
    .update({
      ...(guard.label === "personal_data" ? { input: { question: "[omitido: pedido de dados pessoais]" } } : {}),
      output: { label: guard.label, source: guard.source },
      metadata: { model: config.guardModel, inputTokens: guard.inputTokens, outputTokens: guard.outputTokens },
    })
    .end();

  if (guard.label !== "project") {
    const answer = fixedReply(guard.label, question, lang);
    return {
      label: guard.label,
      guardSource: guard.source,
      answer,
      rawAnswer: "",
      citations: [],
      droppedCitations: [],
      blocked: false,
      retrieval: null,
      model: null,
      usage,
      timings: { guardMs: t1 - t0, retrievalMs: 0, generationMs: 0, firstTokenMs: null, totalMs: Date.now() - t0 },
    };
  }

  const settled = await retrievalPromise;
  if (!settled.ok) throw settled.e;
  const retrieval = settled.r;
  const t2 = Date.now();

  // 3. Geração (streaming). Histórico anterior em texto simples; documentos só no último turno.
  const history: Anthropic.Beta.BetaMessageParam[] = messages
    .slice(0, -1)
    .map((m) => ({ role: m.role, content: m.content }));
  const contextSections = [...new Set(retrieval.docs.map((d) => d.section))];

  let raw = "";
  let blocked = false;
  let firstTokenMs: number | null = null;

  const generation = startObservation(
    "generation",
    {
      model: config.chatModel,
      modelParameters: { max_tokens: config.maxOutputTokens, effort: "low", thinking: "between_tools" },
      input: { question, sections: contextSections, historyTurns: history.length },
    },
    { asType: "generation" },
  );

  const stream = anthropic().beta.messages.stream(
    {
      model: config.chatModel,
      max_tokens: config.maxOutputTokens,
      // Sonnet 5.5 não aceita temperature ≠ default; o controlo é feito por effort + thinking off.
      thinking: { type: "between_tools" },
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [...history, { role: "user", content: buildUserTurn(question, retrieval.docs) }],
    },
    { signal: hooks.signal },
  );

  // 4. Verificação incremental: se aparecer algo proibido, corta o stream de imediato.
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - t0;
        generation.update({ completionStartTime: new Date() });
      }
      raw += event.delta.text;
      if (outputViolation(raw)) {
        blocked = true;
        stream.abort();
        break;
      }
      hooks.onText?.(event.delta.text);
    }
  }

  let model: string | null = config.chatModel;
  if (!blocked) {
    const final = await stream.finalMessage();
    model = final.model;
    usage.genIn = final.usage.input_tokens;
    usage.genOut = final.usage.output_tokens;
    usage.cacheRead = final.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite = final.usage.cache_creation_input_tokens ?? 0;
    if (final.stop_reason === "refusal") blocked = true;
  }
  const t3 = Date.now();

  // 5. Verificação final + citações só de secções que estavam no contexto.
  let answer: string;
  let citations: string[] = [];
  let droppedCitations: string[] = [];
  if (blocked || outputViolation(raw)) {
    blocked = true;
    answer = outputBlockedReply(lang);
  } else {
    const extracted = extractCitations(raw, contextSections);
    answer = extracted.text;
    citations = extracted.citations;
    droppedCitations = extracted.dropped;
  }
  if (blocked) hooks.onReplace?.(answer);

  generation
    .update({
      model: model ?? config.chatModel,
      output: { answer, citations, droppedCitations },
      usageDetails: {
        input: usage.genIn,
        output: usage.genOut,
        cache_read_input_tokens: usage.cacheRead,
        cache_creation_input_tokens: usage.cacheWrite,
      },
      costDetails: { total: generationCostUsd(usage) },
      ...(blocked ? { level: "WARNING" as const, statusMessage: "resposta substituída pela verificação de saída" } : {}),
    })
    .end();

  return {
    label: "project",
    guardSource: guard.source,
    answer,
    rawAnswer: raw,
    citations,
    droppedCitations,
    blocked,
    retrieval,
    model,
    usage,
    timings: { guardMs: t1 - t0, retrievalMs: t2 - t1, generationMs: t3 - t2, firstTokenMs, totalMs: Date.now() - t0 },
  };
}
