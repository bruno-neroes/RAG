import { HeartPulse, Info, Languages } from "lucide-react";
import Disclosure from "./Disclosure";
import type { Dict } from "./i18n";

export default function Header({ t, onAbout, onToggleLang }: { t: Dict; onAbout: () => void; onToggleLang: () => void }) {
  const otherLang = t.switchLangShort === "EN" ? "en" : "pt-PT";
  return (
    <header className="on-dark bg-header text-header-fg shadow-md">
      <div className="mx-auto flex w-full max-w-2xl items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-navy2" aria-hidden="true">
          <HeartPulse className="size-6 text-brand-red" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">{t.title}</h1>
          <Disclosure text={t.disclosure} />
          <p className="mt-0.5 text-xs leading-snug text-header-muted">{t.byline}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={onAbout}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-white/30 px-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            <Info aria-hidden="true" className="size-4" />
            {t.about}
          </button>
          <button
            type="button"
            onClick={onToggleLang}
            lang={otherLang}
            aria-label={t.switchLang}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-white/30 px-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            <Languages aria-hidden="true" className="size-4" />
            <span aria-hidden="true">{t.switchLangShort}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
