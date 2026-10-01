import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// Só servidor. A chave vem de ANTHROPIC_API_KEY (lida pelo SDK).
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 30_000 });
  return client;
}
