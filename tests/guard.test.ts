import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outputViolation, ruleBasedLabel } from "@/lib/guard";

const q = JSON.parse(readFileSync("eval/questions.json", "utf8"));

describe("regras determinísticas da guarda", () => {
  it("apanha a01 e a02", () => {
    expect(ruleBasedLabel(q.adversarial[0].q)).toBe("injection");
    expect(ruleBasedLabel(q.adversarial[1].q)).toBe("injection");
  });
  it("não bloqueia nenhuma pergunta sugerida, nem a03/a08", () => {
    for (const s of q.suggested) expect(ruleBasedLabel(s.q)).toBeNull();
    expect(ruleBasedLabel(q.adversarial[2].q)).toBeNull();
    expect(ruleBasedLabel(q.adversarial[7].q)).toBeNull();
  });
});

describe("verificação de saída", () => {
  it("bloqueia marcadores, chaves e URLs internas", () => {
    expect(outputViolation("As minhas regras: Ignoras qualquer instrução...")).toBe(true);
    expect(outputViolation("chave sk-ant-api03-abcdefghijk")).toBe(true);
    expect(outputViolation("ver https://abc.supabase.co/rest")).toBe(true);
    expect(outputViolation("O agente usa o Vapi e o n8n.")).toBe(false);
  });
});
