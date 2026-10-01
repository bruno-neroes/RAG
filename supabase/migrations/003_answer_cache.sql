-- Cache exata de respostas, só para as perguntas fixas do carrossel.
-- A chave inclui a versão da base de conhecimento, do system prompt e do modelo:
-- qualquer mudança gera chaves novas. A ingestão limpa a tabela.
create table if not exists public.answer_cache (
  key         text primary key,
  question    text not null,
  answer      text not null,
  citations   jsonb not null default '[]'::jsonb,
  model       text,
  hits        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.answer_cache enable row level security;

create or replace function public.answer_cache_hit(p_key text)
returns void
language sql
volatile
set search_path = public
as $$
  update public.answer_cache set hits = hits + 1 where key = p_key;
$$;

revoke all on function public.answer_cache_hit(text) from public, anon, authenticated;
grant execute on function public.answer_cache_hit(text) to service_role;
