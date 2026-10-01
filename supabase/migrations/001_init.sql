-- RAG-entreview · esquema inicial
-- Acesso exclusivo pelo servidor (service role). RLS ativo em todas as tabelas, sem políticas:
-- anon e authenticated não leem nem escrevem nada. As funções também não lhes são expostas.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Chunks da base de conhecimento
-- ---------------------------------------------------------------------------
create table if not exists public.chunks (
  id          uuid primary key default gen_random_uuid(),
  doc         text not null,
  section     text not null,
  title       text not null,
  content     text not null,
  tokens      int  not null default 0,
  embedding   extensions.vector(1024) not null,
  fts         tsvector generated always as
                (to_tsvector('portuguese', coalesce(title, '') || ' ' || content)) stored,
  created_at  timestamptz not null default now()
);

create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists chunks_fts_idx on public.chunks using gin (fts);
create index if not exists chunks_doc_idx on public.chunks (doc);

-- ---------------------------------------------------------------------------
-- Pesquisa híbrida: palavras-chave (ts_rank_cd) + semântica (cosseno), fundidas por RRF.
-- Segue o padrão do guia "Hybrid search" do Supabase. Diferença deliberada: os termos da
-- pergunta são combinados com OU em vez de E — numa pergunta em linguagem natural,
-- exigir todos os termos deixa a lista de palavras-chave quase sempre vazia.
-- ---------------------------------------------------------------------------
create or replace function public.hybrid_search(
  query_text      text,
  query_embedding extensions.vector(1024),
  match_count     int default 12,
  rrf_k           int default 60
)
returns table (id uuid, section text, title text, content text, score double precision)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select nullif(
      replace(websearch_to_tsquery('portuguese', query_text)::text, ' & ', ' | '),
      ''
    ) as tsq
  ),
  full_text as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.fts, to_tsquery('portuguese', q.tsq)) desc) as rank_ix
    from public.chunks c, q
    where q.tsq is not null
      and c.fts @@ to_tsquery('portuguese', q.tsq)
    order by rank_ix
    limit least(match_count, 30) * 2
  ),
  semantic as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rank_ix
    from public.chunks c
    order by rank_ix
    limit least(match_count, 30) * 2
  )
  select c.id, c.section, c.title, c.content,
         coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0)
       + coalesce(1.0 / (rrf_k + se.rank_ix), 0.0) as score
  from full_text ft
  full outer join semantic se on ft.id = se.id
  join public.chunks c on c.id = coalesce(ft.id, se.id)
  order by score desc
  limit least(match_count, 30);
$$;

-- ---------------------------------------------------------------------------
-- Limite de pedidos por IP (só o hash com sal; nunca o IP em claro)
-- ---------------------------------------------------------------------------
create table if not exists public.request_log (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists request_log_ip_created_idx
  on public.request_log (ip_hash, created_at desc);

-- Regista o pedido e devolve true se ainda estiver dentro do limite da janela.
create or replace function public.check_rate_limit(
  p_ip_hash        text,
  p_window_minutes int,
  p_max            int
)
returns boolean
language plpgsql
volatile
set search_path = public
as $$
declare
  n int;
begin
  -- Limpeza oportunista: nada com mais de um dia é necessário.
  delete from public.request_log where created_at < now() - interval '1 day';

  insert into public.request_log (ip_hash) values (p_ip_hash);

  select count(*) into n
  from public.request_log
  where ip_hash = p_ip_hash
    and created_at > now() - make_interval(mins => p_window_minutes);

  return n <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Logs anónimos de conversa
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id             bigint generated always as identity primary key,
  session_id     uuid not null,
  role           text not null check (role in ('user', 'assistant')),
  content        text not null,
  citations      jsonb not null default '[]'::jsonb,
  guard_label    text check (guard_label in ('project', 'offtopic', 'injection', 'personal_data', 'medical', 'rate_limited', 'error')),
  latency_ms     int,
  input_tokens   int,
  output_tokens  int,
  model          text,
  created_at     timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at desc);
create index if not exists messages_session_idx on public.messages (session_id, created_at);

-- Respostas do assistente desde a meia-noite de Lisboa (teto diário global).
create or replace function public.daily_message_count()
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.messages
  where role = 'assistant'
    and created_at >= (date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon');
$$;

-- ---------------------------------------------------------------------------
-- RLS ligado, sem políticas. Funções só para a service role.
-- ---------------------------------------------------------------------------
alter table public.chunks      enable row level security;
alter table public.request_log enable row level security;
alter table public.messages    enable row level security;

revoke all on function public.hybrid_search(text, extensions.vector, int, int) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, int, int)                 from public, anon, authenticated;
revoke all on function public.daily_message_count()                            from public, anon, authenticated;
grant execute on function public.hybrid_search(text, extensions.vector, int, int) to service_role;
grant execute on function public.check_rate_limit(text, int, int)                 to service_role;
grant execute on function public.daily_message_count()                            to service_role;
