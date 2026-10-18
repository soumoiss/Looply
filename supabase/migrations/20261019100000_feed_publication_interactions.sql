-- Stage 4: persistent idempotent post likes and safe external links.
alter table public.posts add column if not exists external_url text;
alter table public.posts drop constraint if exists posts_external_url_https_check;
alter table public.posts add constraint posts_external_url_https_check
  check (external_url is null or (external_url ~ '^https://[^[:space:]]+$' and char_length(external_url) <= 2048));
grant update (external_url) on public.posts to authenticated;

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
revoke all on table public.post_likes from public, anon, authenticated;
grant select, insert, delete on public.post_likes to authenticated;
create policy post_likes_read_visible on public.post_likes for select to authenticated
  using ((select private.can_view_post(post_id)));
create policy post_likes_insert_own on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_view_post(post_id)));
create policy post_likes_delete_own on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.can_view_post(post_id)));

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='post_likes') then
    execute 'alter publication supabase_realtime add table public.post_likes';
  end if;
end;
$publication$;
