// npm run warm [url] — pré-aquece a cache exata com as 20 perguntas do carrossel, através do
// endpoint real (mesmo caminho do browser). Correr depois de cada `npm run ingest` + deploy.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const { suggested } = JSON.parse(readFileSync("eval/questions.json", "utf8")) as { suggested: { id: string; q: string }[] };

async function ask(q: string): Promise<{ cached: boolean; citations: number; ms: number; status: number }> {
  const t = Date.now();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: randomUUID(), messages: [{ role: "user", content: q }] }),
  });
  const text = await res.text();
  const done = /event: done\ndata: (.*)\n/.exec(text);
  const d = done ? JSON.parse(done[1]) : {};
  return { cached: Boolean(d.cached), citations: (d.citations ?? []).length, ms: Date.now() - t, status: res.status };
}

async function main() {
  console.log(`A aquecer ${base}`);
  for (const s of suggested) {
    const r = await ask(s.q);
    console.log(`${s.id} ${r.status} ${r.cached ? "cache" : "gerada"} cit=${r.citations} ${r.ms}ms`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
