create index if not exists conversation_favorites_conversation_id_idx
  on public.conversation_favorites (conversation_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'conversation_favorites'
     ) then
    alter publication supabase_realtime add table public.conversation_favorites;
  end if;
end
$$;
