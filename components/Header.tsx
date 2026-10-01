import { HeartPulse, Info } from "lucide-react";
import Disclosure from "./Disclosure";

export default function Header({ onAbout }: { onAbout: () => void }) {
  return (
    <header className="on-dark bg-header text-header-fg shadow-md">
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-navy2" aria-hidden="true">
          <HeartPulse className="size-6 text-brand-red" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">AI First-Responder</h1>
          <Disclosure />
          <p className="mt-0.5 text-xs leading-snug text-header-muted">
            Preparado por Bruno Sousa para a entrevista na Medicare · Generative AI Product Engineer · Lisboa, 1 Out 2026
          </p>
        </div>
        <button
          type="button"
          onClick={onAbout}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/30 px-3 text-sm font-medium transition-colors hover:bg-white/10"
        >
          <Info aria-hidden="true" className="size-4" />
          Sobre
        </button>
      </div>
    </header>
  );
}
