"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const STEPS = [
  { name: "Pergunta", detail: "limpa e limitada a 600 caracteres" },
  { name: "Guarda", detail: "regras + Claude Haiku classificam a pergunta" },
  { name: "Pesquisa híbrida", detail: "vetores (Voyage) + palavras-chave no Postgres, fundidas por RRF" },
  { name: "Rerank", detail: "Voyage reordena e fica com os 5 melhores excertos" },
  { name: "Claude", detail: "Claude Sonnet escreve a resposta só com esses excertos" },
  { name: "Verificação", detail: "bloqueia fugas de instruções ou chaves; valida as citações" },
  { name: "Resposta", detail: "com as secções citadas" },
];

export default function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sobre-titulo"
      className="m-auto max-h-[90dvh] w-[min(36rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="sobre-titulo" className="text-lg font-semibold">
            Sobre este assistente
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <section aria-labelledby="sobre-projeto" className="mt-3">
          <h3 id="sobre-projeto" className="font-semibold">
            O projeto
          </h3>
          <p className="mt-1 leading-relaxed">
            O AI First-Responder é um agente de voz multilingue (PT, EN, FR) que atende as chamadas das cabinas públicas de
            desfibrilhadores e recolhe quatro dados essenciais. Depois de uma verificação automática, alerta por SMS socorristas
            formados num raio de cerca de dois quilómetros, com um humano sempre a um passo. Foi desenvolvido na MAKEIT entre
            2025 e 2026, passou dois pilotos aceites pelo cliente e está em produção.
          </p>
        </section>

        <section aria-labelledby="sobre-como" className="mt-4">
          <h3 id="sobre-como" className="font-semibold">
            Como este assistente funciona
          </h3>
          <ol className="mt-2 space-y-0">
            {STEPS.map((s, i) => (
              <li key={s.name} className="relative flex gap-3 pb-3 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span aria-hidden="true" className="absolute left-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-0.5 bg-line" />
                )}
                <span
                  aria-hidden="true"
                  className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-navy2 text-xs font-semibold text-white"
                >
                  {i + 1}
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <span className="text-muted"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-muted">
            Também há limites de pedidos por dispositivo e um teto diário, e os registos são anónimos (sem IP).
          </p>
        </section>

        <section aria-labelledby="sobre-transparencia" className="mt-4 rounded-xl bg-surface-2 p-4">
          <h3 id="sobre-transparencia" className="font-semibold">
            Transparência
          </h3>
          <p className="mt-1 leading-relaxed">
            Isto é uma IA e pode cometer erros. Foi construída por Bruno Sousa com a ajuda do Claude (Anthropic) e responde só
            com base na documentação pública do projeto. Não é um serviço da Medicare nem tem ligação oficial à Medicare, não dá
            conselhos médicos (numa emergência, ligue 112) e não revela dados sob confidencialidade.
          </p>
        </section>
      </div>
    </dialog>
  );
}
