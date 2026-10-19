-- Persistent likes for archived and community gallery media.
create table if not exists public.archive_media_likes (
  media_id uuid not null references public.archive_media(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);
create table if not exists public.community_gallery_media_likes (
  media_id uuid not null references public.community_gallery_media(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);
alter table public.archive_media_likes enable row level security;
alter table public.community_gallery_media_likes enable row level security;
revoke all on table public.archive_media_likes, public.community_gallery_media_likes from public, anon;
grant select, insert, delete on table public.archive_media_likes, public.community_gallery_media_likes to authenticated;
drop policy if exists archive_gallery_likes_select on public.archive_media_likes;
create policy archive_gallery_likes_select on public.archive_media_likes for select to authenticated using ((select private.can_view_archive_media(media_id)));
drop policy if exists archive_gallery_likes_insert on public.archive_media_likes;
create policy archive_gallery_likes_insert on public.archive_media_likes for insert to authenticated with check (user_id=(select auth.uid()) and (select private.can_view_archive_media(media_id)));
drop policy if exists archive_gallery_likes_delete on public.archive_media_likes;
create policy archive_gallery_likes_delete on public.archive_media_likes for delete to authenticated using (user_id=(select auth.uid()) and (select private.can_view_archive_media(media_id)));
drop policy if exists community_gallery_likes_select on public.community_gallery_media_likes;
create policy community_gallery_likes_select on public.community_gallery_media_likes for select to authenticated using ((select private.can_view_community_gallery_media(media_id)));
drop policy if exists community_gallery_likes_insert on public.community_gallery_media_likes;
create policy community_gallery_likes_insert on public.community_gallery_media_likes for insert to authenticated with check (user_id=(select auth.uid()) and (select private.can_view_community_gallery_media(media_id)));
drop policy if exists community_gallery_likes_delete on public.community_gallery_media_likes;
create policy community_gallery_likes_delete on public.community_gallery_media_likes for delete to authenticated using (user_id=(select auth.uid()) and (select private.can_view_community_gallery_media(media_id)));
do $$ begin
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='archive_media_likes') then execute 'alter publication supabase_realtime add table public.archive_media_likes'; end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_gallery_media_likes') then execute 'alter publication supabase_realtime add table public.community_gallery_media_likes'; end if;
end $$;
