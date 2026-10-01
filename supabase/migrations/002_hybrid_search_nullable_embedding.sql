-- Degradação graciosa: se o embedding da pergunta não estiver disponível (ex.: limite da Voyage),
-- a pesquisa híbrida corre só com palavras-chave em vez de falhar.
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
    where query_embedding is not null
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

revoke all on function public.hybrid_search(text, extensions.vector, int, int) from public, anon, authenticated;
grant execute on function public.hybrid_search(text, extensions.vector, int, int) to service_role;
