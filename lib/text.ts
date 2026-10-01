// Utilitários puros (sem I/O): sanitização, chunking e citações. Testados em tests/text.test.ts.

/** Remove caracteres de controlo, neutraliza etiquetas tipo XML e normaliza espaços. */
export function sanitize(input: string, maxChars: number): string {
  return (
    input
      .normalize("NFC")
      // caracteres de controlo (mantém \n e \t, que viram espaço/linha abaixo)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
      // Impede que o utilizador forje/feche blocos <documents>/<document> do pedido ao modelo.
      .replace(/</g, "‹")
      .replace(/>/g, "›")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxChars)
  );
}

export type Section = { section: string; body: string };

/** Divide o markdown por secções `## `. O texto antes da primeira secção é ignorado (título do doc). */
export function splitSections(markdown: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) out.push(current);
      current = { section: m[1], body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out.map((s) => ({ section: s.section, body: s.body.trim() })).filter((s) => s.body.length > 0);
}

/**
 * Estimativa de tokens (≈ 4 caracteres por token), só para decidir cortes.
 * Os tokens reais de embedding são os que a Voyage devolve em `usage`.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type Chunk = { section: string; title: string; content: string };

/**
 * Um chunk por secção. Se a secção passar de `maxTokens`, divide por itens de lista ou
 * parágrafos (blocos de linhas), agrupando-os até ao limite e mantendo o título.
 */
export function chunkSections(sections: Section[], maxTokens = 700): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (approxTokens(s.body) <= maxTokens) {
      chunks.push({ section: s.section, title: s.section, content: s.body });
      continue;
    }
    // Unidades: cada item de lista (- ou 1.) ou parágrafo.
    const units = s.body.split(/\n(?=\s*(?:[-*]|\d+\.)\s)|\n{2,}/).map((u) => u.trim()).filter(Boolean);
    const groups: string[] = [];
    let buf = "";
    for (const u of units) {
      const next = buf ? `${buf}\n${u}` : u;
      if (buf && approxTokens(next) > maxTokens) {
        groups.push(buf);
        buf = u;
      } else {
        buf = next;
      }
    }
    if (buf) groups.push(buf);
    groups.forEach((g, i) =>
      chunks.push({
        section: s.section,
        title: groups.length > 1 ? `${s.section} (parte ${i + 1}/${groups.length})` : s.section,
        content: g,
      }),
    );
  }
  return chunks;
}

/** Texto que é embutido: cabeçalho contextual + conteúdo. */
export function contextualText(docName: string, c: Chunk): string {
  return `Documento: ${docName} · Secção: ${c.title}\n\n${c.content}`;
}

const CITATION_RE = /\[\s*Sec[çc][ãa]o\s*:\s*([^\]\n]+?)\s*\]/gi;

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(parte \d+\/\d+\)/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Extrai as citações `[Secção: título]` do texto, mantém só as que correspondem a secções
 * que estavam no contexto, e devolve o texto sem marcadores.
 */
export function extractCitations(
  text: string,
  contextSections: string[],
): { text: string; citations: string[]; dropped: string[] } {
  const allowed = new Map(contextSections.map((s) => [norm(s), s]));
  const citations: string[] = [];
  const dropped: string[] = [];
  for (const m of text.matchAll(CITATION_RE)) {
    // Uma marca pode conter várias secções separadas por ";".
    for (const part of m[1].split(/\s*;\s*/)) {
      const hit = allowed.get(norm(part));
      if (hit) {
        if (!citations.includes(hit)) citations.push(hit);
      } else if (!dropped.includes(part)) {
        dropped.push(part);
      }
    }
  }
  const clean = text
    .replace(CITATION_RE, "")
    .replace(/^\s*(Fontes?|Citações|Citação)\s*:\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: clean, citations, dropped };
}

/** Pergunta curta ou anafórica → precisa do histórico para a pesquisa. */
export function needsHistory(question: string): boolean {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return true;
  return /^(e\s+(isso|esse|essa|isto|este|esta|aquilo|ele|ela|eles|elas|então|depois|porquê|como|quanto)|porqu[eê]\s+isso|and\s+(that|this|why|how)|what about)\b/i.test(
    question.trim(),
  );
}
