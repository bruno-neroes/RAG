"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

const INTERVAL_MS = 4000;

/**
 * Carrossel de sugestões em loop. Roda a cada 4 s; pára com rato por cima, foco ou toque;
 * não roda com prefers-reduced-motion; tem botão de pausa (WCAG 2.2.2), setas e teclado.
 */
export default function SuggestionCarousel({
  items,
  onPick,
  disabled,
}: {
  items: string[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const trackRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const playing = !reducedMotion && !userPaused && !hovered && !focused;

  const go = useCallback(
    (next: number) => {
      const n = items.length;
      setIndex(((next % n) + n) % n);
    },
    [items.length],
  );

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [playing, items.length]);

  // Desloca a faixa para a sugestão atual sem mexer no scroll da página.
  useEffect(() => {
    const track = trackRef.current;
    const el = itemRefs.current[index];
    if (!track || !el) return;
    track.scrollTo({ left: el.offsetLeft - track.offsetLeft, behavior: reducedMotion ? "auto" : "smooth" });
  }, [index, reducedMotion]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
      itemRefs.current[(index + 1) % items.length]?.querySelector("button")?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
      itemRefs.current[(index - 1 + items.length) % items.length]?.querySelector("button")?.focus();
    }
  };

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Perguntas sugeridas"
      className="flex items-center gap-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      onTouchStart={() => setUserPaused(true)}
    >
      {!reducedMotion && (
        <button
          type="button"
          onClick={() => setUserPaused((p) => !p)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          {userPaused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          <span className="sr-only">{userPaused ? "Retomar rotação das sugestões" : "Pausar rotação das sugestões"}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => go(index - 1)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        <span className="sr-only">Sugestão anterior</span>
      </button>

      <ul
        ref={trackRef}
        onKeyDown={onKeyDown}
        className="no-scrollbar flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto py-1"
      >
        {items.map((q, i) => (
          <li
            key={q}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="snap-start"
            aria-roledescription="sugestão"
            aria-label={`${i + 1} de ${items.length}`}
          >
            <button
              type="button"
              disabled={disabled}
              tabIndex={i === index ? 0 : -1}
              onClick={() => {
                setIndex(i);
                onPick(q);
              }}
              className={`min-h-11 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                i === index
                  ? "border-brand-green bg-chip text-chip-fg"
                  : "border-line bg-surface text-fg hover:border-brand-green"
              }`}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => go(index + 1)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <ChevronRight aria-hidden="true" className="size-5" />
        <span className="sr-only">Sugestão seguinte</span>
      </button>
    </section>
  );
}
