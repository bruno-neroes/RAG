"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { STEPS, type Dict, type Lang, type LastTrace, type StepKey } from "./i18n";

function fmtMs(ms: number | null | undefined, lang: Lang): string {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString(lang === "en" ? "en-GB" : "pt-PT", { maximumFractionDigits: 1 })} s`;
}

function fmtUsd(v: number, lang: Lang): string {
  return `$${v.toLocaleString(lang === "en" ? "en-GB" : "pt-PT", { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`;
}

/** Valor curto que cada passo mostra para a última resposta. */
function stepValue(key: StepKey, last: LastTrace | null, t: Dict, lang: Lang): string | null {
  if (!last) return null;
  if (last.cached) return key === "answer" ? `${fmtMs(last.latencyMs, lang)} · cache · $0` : key === "input" ? null : "—";
  switch (key) {
    case "input":
      return null;
    case "guard":
      return last.label ? `${t.labels[last.label] ?? last.label} · ${t.guardBy[last.guardSource ?? ""] ?? last.guardSource}` : null;
    case "retrieval":
      return last.label === "project" ? `${last.candidates ?? 0} ${t.candidates}` : "—";
    case "rerank": {
      const used = last.sections?.filter((s) => s.used).length ?? 0;
      return last.label === "project" ? `${used}/${last.sections?.length ?? 0} ${t.used}` : "—";
    }
    case "generation":
      return last.timings?.firstTokenMs ? `${t.t.firstToken}: ${fmtMs(last.timings.firstTokenMs, lang)}` : "—";
    case "check":
      return null;
    case "answer":
      return `${fmtMs(last.latencyMs, lang)} · ${fmtUsd(last.costUsd, lang)}`;
  }
}

export default function AboutSheet({
  t,
  lang,
  last,
  open,
  onClose,
}: {
  t: Dict;
  lang: Lang;
  last: LastTrace | null;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState<StepKey | null>(null);
  const baseId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const steps = STEPS[lang];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={`${baseId}-title`}
      className="m-auto max-h-[90dvh] w-[min(36rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${baseId}-title`} className="text-lg font-semibold">
            {t.aboutTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="-mr-2 -mt-2 inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{t.close}</span>
          </button>
        </div>

        <section aria-labelledby={`${baseId}-project`} className="mt-3">
          <h3 id={`${baseId}-project`} className="font-semibold">
            {t.project}
          </h3>
          <p className="mt-1 leading-relaxed">{t.projectText}</p>
        </section>

        <section aria-labelledby={`${baseId}-how`} className="mt-4">
          <h3 id={`${baseId}-how`} className="font-semibold">
            {t.how}
          </h3>
          <p className="text-sm text-muted">{t.howHint}</p>
          <ol className="mt-2">
            {steps.map((s, i) => {
              const isOpen = expanded === s.key;
              const value = stepValue(s.key, last, t, lang);
              const panelId = `${baseId}-step-${s.key}`;
              return (
                <li key={s.key} className="relative flex gap-3 pb-2 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className="absolute left-[0.6875rem] top-7 h-[calc(100%-1.25rem)] w-0.5 bg-line" />
                  )}
                  <span
                    aria-hidden="true"
                    className="relative z-10 mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-navy2 text-xs font-semibold text-white"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setExpanded(isOpen ? null : s.key)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <strong>{s.name}</strong>
                        <span className="text-muted"> — {s.detail}</span>
                        {value && (
                          <span className="mt-1 block w-fit rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-chip-fg">
                            {value}
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <div id={panelId} hidden={!isOpen} className="px-2 pb-1 pt-1 text-sm leading-relaxed">
                      {s.more}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-sm text-muted">{t.limits}</p>
        </section>

        <section aria-labelledby={`${baseId}-last`} className="mt-4 rounded-xl border border-line p-4">
          <h3 id={`${baseId}-last`} className="font-semibold">
            {t.lastTitle}
          </h3>
          {!last ? (
            <p className="mt-1 text-sm text-muted">{t.lastNone}</p>
          ) : last.cached ? (
            <p className="mt-1 text-sm">
              {t.cachedNote} ({fmtMs(last.latencyMs, lang)})
            </p>
          ) : (
            <LastDetails last={last} t={t} lang={lang} />
          )}
        </section>

        <section aria-labelledby={`${baseId}-transp`} className="mt-4 rounded-xl bg-surface-2 p-4">
          <h3 id={`${baseId}-transp`} className="font-semibold">
            {t.transparency}
          </h3>
          <p className="mt-1 leading-relaxed">{t.transparencyText}</p>
        </section>
      </div>
    </dialog>
  );
}

function LastDetails({ last, t, lang }: { last: LastTrace; t: Dict; lang: Lang }) {
  const tm = last.timings;
  return (
    <dl className="mt-2 grid gap-3 text-sm">
      <div>
        <dt className="font-medium">{t.guardLabel}</dt>
        <dd className="text-muted">
          {t.labels[last.label ?? ""] ?? last.label} · {t.guardBy[last.guardSource ?? ""] ?? last.guardSource}
        </dd>
      </div>

      {last.sections && last.sections.length > 0 && (
        <div>
          <dt className="font-medium">
            {t.sectionsFound} <span className="font-normal text-muted">({last.candidates} {t.candidates})</span>
          </dt>
          <dd>
            <ul className="mt-1 grid gap-1.5">
              {last.sections.map((s) => (
                <li key={s.section} lang="pt-PT">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={s.used ? "" : "text-muted line-through decoration-1"}>{s.section}</span>
                    <span className="shrink-0 tabular-nums text-muted" lang={lang === "en" ? "en" : "pt-PT"}>
                      {s.score === null ? "—" : s.score.toFixed(2)} · {s.used ? t.used : t.discarded}
                    </span>
                  </div>
                  {s.score !== null && (
                    <div aria-hidden="true" className="mt-0.5 h-1.5 rounded-full bg-surface-2">
                      <div
                        className={`h-1.5 rounded-full ${s.used ? "bg-brand-green" : "bg-muted"}`}
                        style={{ width: `${Math.max(4, Math.min(100, s.score * 100))}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}

      {tm && (
        <div>
          <dt className="font-medium">{t.timeline}</dt>
          <dd className="text-muted">
            {t.t.guard} {fmtMs(tm.guardMs, lang)} · {t.t.retrieval} {fmtMs(tm.retrievalMs, lang)} · {t.t.firstToken}{" "}
            {fmtMs(tm.firstTokenMs, lang)} · {t.t.total} {fmtMs(last.latencyMs, lang)}
          </dd>
        </div>
      )}

      {last.tokens && (
        <div>
          <dt className="font-medium">{t.tokens}</dt>
          <dd className="text-muted">
            {last.tokens.input} {t.tokensIn} ({last.tokens.cacheRead} {t.tokensCache}) · {last.tokens.output} {t.tokensOut}
          </dd>
        </div>
      )}

      <div>
        <dt className="font-medium">{t.cost}</dt>
        <dd className="text-muted">{fmtUsd(last.costUsd, lang)}</dd>
      </div>

      {last.degraded && (last.degraded.embedding || last.degraded.rerank) && (
        <div>
          <dt className="font-medium">{t.degraded}</dt>
          <dd className="text-muted">
            {last.degraded.embedding ? "embedding" : ""} {last.degraded.rerank ? "rerank" : ""}
          </dd>
        </div>
      )}
    </dl>
  );
}
