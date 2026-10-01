import { BookOpen } from "lucide-react";

export default function Citations({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="sr-only">Fontes:</span>
      <ul className="flex flex-wrap gap-1.5" aria-label="Secções citadas">
        {items.map((c) => (
          <li
            key={c}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-chip px-2.5 py-1 text-xs font-medium text-chip-fg"
          >
            <BookOpen aria-hidden="true" className="size-3.5 shrink-0" />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
