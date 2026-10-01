"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AboutSheet from "./AboutSheet";
import Composer from "./Composer";
import Header from "./Header";
import Message, { type UiMessage } from "./Message";
import SuggestionCarousel from "./SuggestionCarousel";

const MAX_CHARS = 600;
const HISTORY_SENT = 6;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem("afr-session");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("afr-session", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Enquanto o texto chega em stream, esconde os marcadores [Secção: ...] (vêm como chips no fim). */
function stripMarkers(text: string): string {
  return text
    .replace(/\[\s*Sec[çc][ãa]o\s*:[^\]]*\]/gi, "")
    .replace(/\[\s*S[^\]]*$/i, "")
    .trimEnd();
}

type SseEvent = { event: string; data: unknown };

async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      try {
        yield { event, data: JSON.parse(data) };
      } catch {
        /* bloco incompleto ou inválido: ignora */
      }
    }
  }
}

export default function Chat({ suggestions, starters }: { suggestions: string[]; starters: string[] }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const sessionRef = useRef<string>("");
  const listEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionRef.current = getSessionId();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listEndRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages]);

  const patch = useCallback((id: string, fn: (m: UiMessage) => UiMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, MAX_CHARS);
      if (!question || busy) return;

      const now = new Date();
      const userMsg: UiMessage = { id: newId(), role: "user", text: question, time: now, status: "done", citations: [] };
      const botId = newId();
      const botMsg: UiMessage = { id: botId, role: "assistant", text: "", time: now, status: "pending", citations: [] };

      const history = [...messages, userMsg]
        .filter((m) => m.status === "done" && m.text)
        .slice(-HISTORY_SENT)
        .map((m) => ({ role: m.role, content: m.text }));

      setMessages((prev) => [...prev, userMsg, botMsg]);
      setBusy(true);
      setAnnouncement("");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let finalText = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionRef.current, messages: history }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          let message = "Não consegui responder agora. Tente outra vez daqui a pouco.";
          try {
            const j = await res.json();
            if (typeof j?.message === "string") message = j.message;
          } catch {}
          finalText = message;
          patch(botId, (m) => ({ ...m, text: message, status: "error", time: new Date() }));
          return;
        }

        let streamed = "";
        for await (const { event, data } of readSse(res)) {
          const d = data as Record<string, unknown>;
          if (event === "delta" && typeof d.t === "string") {
            streamed += d.t;
            const visible = stripMarkers(streamed);
            patch(botId, (m) => ({ ...m, text: visible, status: "streaming" }));
          } else if (event === "replace" && typeof d.text === "string") {
            streamed = d.text;
            patch(botId, (m) => ({ ...m, text: d.text as string }));
          } else if (event === "done") {
            finalText = String(d.answer ?? "");
            patch(botId, (m) => ({
              ...m,
              text: finalText,
              citations: Array.isArray(d.citations) ? (d.citations as string[]) : [],
              status: "done",
              time: new Date(),
            }));
          } else if (event === "error") {
            finalText = String(d.message ?? "Erro.");
            patch(botId, (m) => ({ ...m, text: finalText, status: "error", time: new Date() }));
          }
        }
      } catch {
        if (!ctrl.signal.aborted) {
          finalText = "A ligação falhou. Verifique a rede e tente outra vez.";
          patch(botId, (m) => ({ ...m, text: finalText, status: "error", time: new Date() }));
        }
      } finally {
        setBusy(false);
        // Uma única notificação por resposta, quando termina (não por token).
        if (finalText) setAnnouncement(`Resposta do assistente: ${finalText.replace(/\*\*|^#+\s*/gm, "")}`);
      }
    },
    [busy, messages, patch],
  );

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#conversa"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-fg focus:shadow-lg"
      >
        Saltar para o conteúdo
      </a>

      <Header onAbout={() => setAboutOpen(true)} />

      <main id="conversa" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none" aria-label="Conversa">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
          <Welcome starters={starters} onPick={send} disabled={busy} />
          <ol className="flex flex-col gap-3" aria-label="Mensagens">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </ol>
          <div ref={listEndRef} />
        </div>
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <section
        aria-label="Escrever uma pergunta"
        className="border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
      >
        <div className="mx-auto w-full max-w-2xl px-4 pt-2">
          <SuggestionCarousel items={suggestions} onPick={send} disabled={busy} />
          <Composer onSend={send} busy={busy} maxChars={MAX_CHARS} />
        </div>
        <footer className="mx-auto w-full max-w-2xl px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 text-center text-xs text-muted">
          Assistente de IA · respostas baseadas na documentação do projeto · pode cometer erros ·{" "}
          <button type="button" onClick={() => setAboutOpen(true)} className="inline-flex min-h-6 items-center underline underline-offset-2">
            Sobre
          </button>
        </footer>
      </section>

      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function Welcome({ starters, onPick, disabled }: { starters: string[]; onPick: (q: string) => void; disabled: boolean }) {
  return (
    <section aria-labelledby="boas-vindas" className="flex flex-col gap-3">
      <div className="max-w-[88%] self-start rounded-2xl rounded-tl-md border border-line bg-bubble-bot px-4 py-3 shadow-sm">
        <h2 id="boas-vindas" className="sr-only">
          Boas-vindas
        </h2>
        <p>
          Olá! Sou um <strong>assistente de IA</strong> sobre o <strong>AI First-Responder</strong> — o agente de voz para
          cabinas públicas de desfibrilhadores que o Bruno Sousa levou de piloto a produção na MAKEIT.
        </p>
        <p className="mt-2">Respondo com base na documentação do projeto e indico as secções que usei. Por onde quer começar?</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Perguntas para começar">
        {starters.map((q) => (
          <li key={q}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(q)}
              className="min-h-11 rounded-full border border-brand-green/60 bg-chip px-4 py-2 text-left text-sm font-medium text-chip-fg transition-colors hover:border-brand-green hover:bg-surface disabled:opacity-60"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
