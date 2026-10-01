import { supabaseAdmin } from "./supabase";

export type LogEntry = {
  sessionId: string;
  question: string;
  answer: string;
  citations: string[];
  guardLabel: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Log anónimo: sem IP, sem identificadores além de um UUID de sessão gerado no browser. */
export async function logExchange(e: LogEntry): Promise<void> {
  if (!UUID_RE.test(e.sessionId)) return;
  // Pedidos de dados pessoais: não guardar o texto da pergunta.
  const question = e.guardLabel === "personal_data" ? "[omitido: pedido de dados pessoais]" : e.question;
  const { error } = await supabaseAdmin()
    .from("messages")
    .insert([
      { session_id: e.sessionId, role: "user", content: question, guard_label: e.guardLabel },
      {
        session_id: e.sessionId,
        role: "assistant",
        content: e.answer,
        citations: e.citations,
        guard_label: e.guardLabel,
        latency_ms: e.latencyMs,
        input_tokens: e.inputTokens,
        output_tokens: e.outputTokens,
        model: e.model,
      },
    ]);
  if (error) console.error("log: insert falhou", error.code);
}
