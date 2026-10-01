import { Bot } from "lucide-react";

/** Linha permanente de transparência: o utilizador sabe sempre que fala com uma IA. */
export default function Disclosure({ text }: { text: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-header-muted">
      <Bot aria-hidden="true" className="size-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
