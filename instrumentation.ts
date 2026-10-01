// Next.js chama register() uma vez por instância do servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { langfuseSpanProcessor } = await import("./lib/observability");
  if (!langfuseSpanProcessor) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({ serviceName: "rag-entreview", spanProcessors: [langfuseSpanProcessor] });
}
