import { AlertCircle } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import Citations from "./Citations";
import type { Dict } from "./i18n";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: Date;
  status: "pending" | "streaming" | "done" | "error";
  citations: string[];
};

const timeFmt = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" });

/** Negrito **x** sem HTML injetado (só nós de texto e <strong>). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Markdown mínimo e seguro: parágrafos e listas (- ou 1.). */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={`my-1 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else {
      flush();
      if (line) blocks.push(<p key={`p${blocks.length}`} className="[&:not(:first-child)]:mt-2">{inline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

function Typing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true" className="typing-dot size-2 rounded-full bg-muted" />
      ))}
    </span>
  );
}

export default function Message({ message: m, t }: { message: UiMessage; t: Dict }) {
  const isUser = m.role === "user";
  return (
    <li className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-tr-md bg-bubble-user px-4 py-2.5 text-bubble-user-fg shadow-sm"
            : `max-w-[88%] rounded-2xl rounded-tl-md border bg-bubble-bot px-4 py-2.5 shadow-sm ${
                m.status === "error" ? "border-brand-red" : "border-line"
              }`
        }
      >
        <span className="sr-only">{isUser ? t.youSaid : t.assistant}</span>
        {m.status === "pending" ? (
          <Typing label={t.typing} />
        ) : (
          <div className="break-words leading-relaxed">
            {m.status === "error" && (
              <p className="mb-1 inline-flex items-center gap-1 text-sm font-semibold">
                <AlertCircle aria-hidden="true" className="size-4 text-brand-red" /> {t.warning}
              </p>
            )}
            {isUser ? <p className="whitespace-pre-wrap">{m.text}</p> : <RichText text={m.text} />}
          </div>
        )}
        <p className={`mt-1 text-right text-[0.7rem] ${isUser ? "text-bubble-user-fg" : "text-muted"}`}>
          <time dateTime={m.time.toISOString()}>{timeFmt.format(m.time)}</time>
        </p>
      </div>
      {!isUser && m.status === "done" && <Citations items={m.citations} label={t.cited} sourcesLabel={t.sources} />}
    </li>
  );
}
