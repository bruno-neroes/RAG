import { LangfuseSpanProcessor } from "@langfuse/otel";

// Langfuse é opcional: só liga com as três variáveis definidas. Sem elas, as chamadas de
// tracing usam o tracer no-op do OpenTelemetry e a app funciona igual.
export const langfuseEnabled = Boolean(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_BASE_URL,
);

// exportMode "immediate": em serverless o processo pode congelar depois da resposta.
export const langfuseSpanProcessor = langfuseEnabled ? new LangfuseSpanProcessor({ exportMode: "immediate" }) : null;
