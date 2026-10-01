# RAG-entreview — assistente do projeto AI First-Responder

Assistente de perguntas e respostas, estilo WhatsApp, sobre o projeto **AI First-Responder** (agente de voz para cabinas públicas de desfibrilhadores, levado de piloto a produção na MAKEIT) e sobre a candidatura de Bruno Sousa ao papel de Generative AI Product Engineer na Medicare.

> Preparado por Bruno Sousa para a entrevista na Medicare · Lisboa, 1 Out 2026. Não é um serviço da Medicare nem tem ligação oficial à Medicare. É uma IA e diz-o sempre.

## Como funciona

```
pergunta ─► limites (IP com hash + teto diário)
         ─► [carrossel?] cache exata ──────────────────────────────► resposta (custo 0)
         ─► guarda: regras + Claude Haiku 4.5 ─┐  (em paralelo)
         ─► pesquisa híbrida: Voyage voyage-4 + Postgres FTS, RRF ─► rerank Voyage rerank-3 (top 5, limiar)
         ─► Claude Sonnet 5.5 (streaming, system prompt em cache)
         ─► verificação de saída (fugas de instruções/chaves, citações só do contexto)
         ─► SSE para o browser + log anónimo no Supabase
```

| Camada | Escolha | Porquê |
|---|---|---|
| Geração | `claude-sonnet-5-5`, `max_tokens` 700, `effort: low`, thinking `between_tools` (desligado) | Rápido e barato para respostas curtas. O Sonnet 5.5 rejeita `temperature` ≠ default (400), por isso o controlo é feito por effort e prompt. `fallbacks: "default"` re-encaminha recusas do classificador de segurança. |
| Guarda | regras determinísticas + `claude-haiku-4-5` (temperatura 0, 30 tokens) | Determinístico primeiro; o modelo só para o que as regras não apanham. |
| Embeddings / rerank | Voyage `voyage-4` (1024 dims, multilingue) / `rerank-3` | Modelos atuais recomendados pela Voyage (a Anthropic não tem API de embeddings). |
| Pesquisa | `hybrid_search` em SQL (palavras-chave `portuguese` + cosseno HNSW, Reciprocal Rank Fusion) | Padrão do guia de pesquisa híbrida do Supabase; termos combinados com OU para perguntas em linguagem natural. Se o embedding falhar, degrada para só palavras-chave. |
| Dados | Supabase Postgres + pgvector, RLS ligado sem políticas, funções só para `service_role` | `anon` não lê nada e não executa nada (verificado). |

### Custos

Medido no pipeline real: **≈ $0,011 por pergunta** livre (Haiku ≈ 550 tokens in; Sonnet ≈ 2,6 k in / 270 out; o system prompt fica em cache). As 20 perguntas do carrossel são servidas da **cache exata** depois da primeira resposta (custo 0). A chave da cache inclui a versão da base de conhecimento, do system prompt e do modelo; `npm run ingest` limpa-a. Texto livre nunca vem da cache.

Proteções: `RATE_LIMIT_PER_10MIN` por IP (por omissão 40; hash SHA-256 com sal), `DAILY_MESSAGE_CAP` global de respostas geradas (150 em produção ≈ $1,65 no pior caso), mensagens ≤ 600 caracteres, histórico ≤ 6 mensagens, uma só chamada de geração por pedido. Respostas da cache não contam para os limites: custam zero e, numa sala, muitas pessoas partilham o IP do Wi-Fi.

Avaliado e não adotado: compressão de prompts (LLMLingua) — poupança de ~$0,002/pergunta não compensa o peso no serverless e o risco de perder factos; RTK — comprime output de terminal para agentes de código, não se aplica a chamadas de API em runtime.

## Observabilidade e Fase 3

- **Langfuse (opcional):** com `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` e `LANGFUSE_BASE_URL` definidas, cada pedido gera um trace `chat` (por `sessionId`) com observações `guard` (guardrail), `retrieval` e `rerank` (retriever) e `generation` (modelo, tokens com cache, custo, tempo até ao primeiro token). Registo via `instrumentation.ts` + `@vercel/otel`; flush em `after()`. Sem as variáveis, o tracer é no-op. Pedidos classificados como dados pessoais não enviam o texto.
- **Painel "Sobre" interativo:** os passos do pipeline expandem e mostram os números reais da última resposta (classificação, candidatos, scores do rerank, tempos, tokens, custo estimado, cache).
- **PT/EN:** interface, sugestões (`eval/questions.en.json`), respostas fixas e cache por língua. `npm run eval en` avalia as 20 sugeridas em inglês (informativo, fora do gate).

## Comandos

```bash
npm install
cp .env.example .env.local      # preencher (ver comentários no ficheiro)
npm run ingest                  # chunking por secção → Voyage → Supabase (idempotente)
npm run dev                     # http://localhost:3000
npm test                        # testes unitários (vitest)
npm run eval                    # avaliação com gate → eval/report.md
npm run eval s05                # só uma pergunta (ou "s" / "a" para um grupo; "en" para inglês)
npm run warm https://…          # pré-aquece a cache do carrossel (PT e EN) após ingest/deploy
npm run build
```

Migrações em `supabase/migrations/` (aplicar com `supabase db push` depois de `supabase link`, ou colar no SQL Editor por ordem).

## Avaliação (gate)

`npm run eval` corre as 20 perguntas sugeridas e as 10 adversariais de `eval/questions.json` contra o pipeline real (sem UI e sem cache):

- sugeridas: `hit@5` do retrieval e juiz Haiku com rubricas sim/não (fundamentada, respondeu) + verificações determinísticas (tem citação, ≤ 150 palavras);
- adversariais: regras determinísticas (sem fugas; `112` presente; instrução injetada ignorada) + juiz Haiku com o comportamento esperado.

Gate: adversariais 10/10, `hit@5` ≥ 18/20 e juiz ≥ 18/20. O relatório fica em [`eval/report.md`](eval/report.md).

## Acessibilidade

WCAG 2.2 AA: `lang="pt-PT"`, "saltar para o conteúdo", foco visível, uma notificação `aria-live` por resposta (não por token), carrossel com pausa, setas e teclado e sem rotação com `prefers-reduced-motion`, alvos ≥ 44 px, contraste ≥ 4,5:1 (o verde da marca `#2A9D8F` dá 3,3:1 com texto branco, por isso os balões usam `#1F7A70`, 5,2:1), sem scroll horizontal a 320 px. Auditoria axe-core: 0 violações WCAG.

## Passos humanos

1. Supabase: projeto criado e migrações aplicadas (feito via CLI).
2. Anthropic: chave e **limite de gasto** na consola.
3. Voyage AI: chave **e método de pagamento** (sem ele, o 3.º pedido seguido já levou 429 nos nossos testes; os 200 M tokens gratuitos mantêm-se).
4. `.env.local` → `npm run ingest` → `npm run eval`.
5. Vercel: variáveis de `.env.example` em Production → deploy.
6. Testar no telemóvel: 5 perguntas, incluindo "isto foi feito por IA?" e uma tentativa de injeção.

## Transparência

Construído por Bruno Sousa com a ajuda do Claude (Anthropic). A base de conhecimento (`knowledge/projeto.md`) é pública e não contém informação sob NDA.
