import { createHash } from "node:crypto";
import questions from "@/eval/questions.json";
import questionsEn from "@/eval/questions.en.json";
import { config } from "./config";
import { KB_VERSION } from "./kb-version.generated";
import { SYSTEM_PROMPT } from "./prompt";
import { supabaseAdmin } from "./supabase";

// Cache exata só para as perguntas fixas do carrossel, em PT e EN (texto conhecido, sem dados pessoais).
// Texto livre nunca é servido da cache: um falso "match" daria uma resposta errada.

function normalize(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUGGESTED = new Set([...questions.suggested, ...questionsEn.suggested].map((s) => normalize(s.q)));
const PROMPT_VERSION = createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);

export function isSuggested(question: string): boolean {
  return SUGGESTED.has(normalize(question));
}

export function cacheKey(question: string): string {
  return createHash("sha256")
    .update([normalize(question), KB_VERSION, PROMPT_VERSION, config.chatModel].join("|"))
    .digest("hex");
}

export type CachedAnswer = { answer: string; citations: string[]; model: string | null };

export async function getCached(key: string): Promise<CachedAnswer | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("answer_cache").select("answer, citations, model").eq("key", key).maybeSingle();
  if (error || !data) return null;
  void db.rpc("answer_cache_hit", { p_key: key }).then(() => {});
  return { answer: data.answer, citations: (data.citations as string[]) ?? [], model: data.model };
}

export async function putCached(key: string, question: string, a: CachedAnswer): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("answer_cache")
    .upsert({ key, question, answer: a.answer, citations: a.citations, model: a.model }, { onConflict: "key" });
  if (error) console.error("cache: upsert falhou", error.code);
}
