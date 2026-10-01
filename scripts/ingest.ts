// npm run ingest — lê knowledge/projeto.md, divide por secções, embute na Voyage e grava no Supabase.
// Idempotente: apaga os chunks do documento e recria-os.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../lib/config";
import { supabaseAdmin } from "../lib/supabase";
import { approxTokens, chunkSections, contextualText, splitSections } from "../lib/text";
import { embed } from "../lib/voyage";

const DOC_ID = "projeto.md";

async function main() {
  const md = readFileSync(path.join(process.cwd(), "knowledge", DOC_ID), "utf8");
  const chunks = chunkSections(splitSections(md), 700);
  const texts = chunks.map((c) => contextualText(config.docName, c));

  const { vectors, tokens } = await embed(texts, "document");
  if (vectors.length !== chunks.length) throw new Error("Número de embeddings não bate com o de chunks.");

  const rows = chunks.map((c, i) => ({
    doc: DOC_ID,
    section: c.section,
    title: c.title,
    content: c.content,
    tokens: approxTokens(texts[i]),
    embedding: vectors[i],
  }));

  const db = supabaseAdmin();
  const del = await db.from("chunks").delete().eq("doc", DOC_ID);
  if (del.error) throw new Error(`Apagar chunks falhou: ${del.error.code}`);
  const ins = await db.from("chunks").insert(rows);
  if (ins.error) throw new Error(`Inserir chunks falhou: ${ins.error.code} ${ins.error.message}`);

  const { count } = await db.from("chunks").select("id", { count: "exact", head: true }).eq("doc", DOC_ID);

  // Versão da base de conhecimento: entra na chave da cache de respostas. Ingerir limpa a cache.
  const kbVersion = createHash("sha256").update(md).update(config.embedModel).digest("hex").slice(0, 12);
  writeFileSync(
    path.join(process.cwd(), "lib", "kb-version.generated.ts"),
    `// Gerado por scripts/ingest.ts — não editar à mão.\nexport const KB_VERSION = "${kbVersion}";\n`,
  );
  const clear = await db.from("answer_cache").delete().neq("key", "");
  if (clear.error) throw new Error(`Limpar a cache falhou: ${clear.error.code}`);

  console.log(`Modelo de embeddings: ${config.embedModel} (${config.embedDim} dims)`);
  console.log(`Chunks: ${chunks.length} (na BD: ${count})`);
  console.log(`Tokens de embedding (Voyage): ${tokens}`);
  console.log(`Versão da KB: ${kbVersion} (cache de respostas limpa)`);
  for (const r of rows) console.log(`  · ${r.title} — ~${r.tokens} tokens`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
