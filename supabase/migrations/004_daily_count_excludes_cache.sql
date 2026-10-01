-- O teto diário é uma proteção de custo: respostas servidas da cache (custo zero) não contam.
create or replace function public.daily_message_count()
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.messages
  where role = 'assistant'
    and (model is null or model not like 'cache:%')
    and created_at >= (date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon');
$$;

revoke all on function public.daily_message_count() from public, anon, authenticated;
grant execute on function public.daily_message_count() to service_role;
