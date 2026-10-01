"use client";

import { Loader2, SendHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Dict } from "./i18n";

export default function Composer({ t, onSend, busy, maxChars }: { t: Dict; onSend: (q: string) => void; busy: boolean; maxChars: number }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();
  const hintId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    onSend(q);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const remaining = maxChars - value.length;

  return (
    <form onSubmit={submit} className="flex items-end gap-2 py-2" aria-busy={busy}>
      <div className="flex-1">
        <label htmlFor="pergunta" className="sr-only">
          {t.inputLabel}
        </label>
        <textarea
          id="pergunta"
          ref={ref}
          rows={1}
          value={value}
          maxLength={maxChars}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.placeholder}
          aria-describedby={`${counterId} ${hintId}`}
          className="block min-h-11 w-full resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 text-base text-fg placeholder:text-muted focus:border-brand-green"
        />
        <div className="mt-1 flex justify-between px-1 text-xs text-muted">
          <span id={hintId}>{t.hint}</span>
          <span id={counterId} aria-live={remaining <= 50 ? "polite" : "off"}>
            {value.length}/{maxChars}
            <span className="sr-only"> {t.chars}</span>
          </span>
        </div>
      </div>
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="mb-6 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bubble-user text-bubble-user-fg shadow-sm transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
            <span className="sr-only">{t.sending}</span>
          </>
        ) : (
          <>
            <SendHorizontal aria-hidden="true" className="size-5" />
            <span className="sr-only">{t.send}</span>
          </>
        )}
      </button>
    </form>
  );
}
