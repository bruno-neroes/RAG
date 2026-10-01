import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approxTokens, chunkSections, extractCitations, needsHistory, sanitize, splitSections } from "@/lib/text";

const md = readFileSync("knowledge/projeto.md", "utf8");

describe("chunking", () => {
  const sections = splitSections(md);
  const chunks = chunkSections(sections, 700);

  it("encontra uma secção por cabeçalho ##", () => {
    const headings = md.split("\n").filter((l) => l.startsWith("## ")).length;
    expect(sections.length).toBe(headings);
  });

  it("cobre todas as secções esperadas pelas perguntas de avaliação", () => {
    const q = JSON.parse(readFileSync("eval/questions.json", "utf8"));
    const names = new Set(chunks.map((c) => c.section));
    for (const s of q.suggested) expect(names.has(s.expect_section)).toBe(true);
  });

  it("nenhum chunk passa muito do limite", () => {
    for (const c of chunks) expect(approxTokens(c.content)).toBeLessThanOrEqual(900);
  });

  it("divide secções longas mantendo o título", () => {
    const long = { section: "X", body: Array.from({ length: 40 }, (_, i) => `- item ${i} ${"palavra ".repeat(20)}`).join("\n") };
    const parts = chunkSections([long], 200);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.section).toBe("X");
    expect(parts[0].title).toMatch(/^X \(parte 1\//);
  });
});

describe("citações", () => {
  const ctx = ["Impacto", "Perguntas frequentes"];
  it("mantém só secções do contexto e limpa o texto", () => {
    const r = extractCitations("Custa 0,17 €.\n\n[Secção: Impacto] [Secção: Inventada]", ctx);
    expect(r.citations).toEqual(["Impacto"]);
    expect(r.dropped).toEqual(["Inventada"]);
    expect(r.text).toBe("Custa 0,17 €.");
  });
  it("aceita o formato inglês [Section: ...]", () => {
    const r = extractCitations("Costs 0.17 €.\n\n[Section: Impacto]", ctx);
    expect(r.citations).toEqual(["Impacto"]);
    expect(r.text).toBe("Costs 0.17 €.");
  });
  it("tolera acentos, maiúsculas e várias secções numa marca", () => {
    const r = extractCitations("ok [Seccao: perguntas FREQUENTES; Impacto]", ctx);
    expect(r.citations).toEqual(["Perguntas frequentes", "Impacto"]);
  });
});

describe("sanitização", () => {
  it("remove controlo, neutraliza etiquetas e corta", () => {
    const s = sanitize("ola\u0000  <document>x</document>   mundo", 600);
    expect(s).toBe("ola ‹document›x‹/document› mundo");
    expect(sanitize("a".repeat(700), 600).length).toBe(600);
  });
});

describe("histórico", () => {
  it("deteta perguntas curtas e anáforas", () => {
    expect(needsHistory("e isso?")).toBe(true);
    expect(needsHistory("E isso custa quanto ao todo?")).toBe(true);
    expect(needsHistory("O que são as Watchtowers?")).toBe(false);
  });
});
