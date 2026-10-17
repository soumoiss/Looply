-- Restore persistent story views and likes used by src/stories.js.
create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index if not exists story_views_story_viewed_idx on public.story_views(story_id, viewed_at desc);
create table if not exists public.story_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists story_likes_story_created_idx on public.story_likes(story_id, created_at desc);
alter table public.story_views enable row level security;
alter table public.story_likes enable row level security;
revoke all on public.story_views from public, anon, authenticated;
revoke all on public.story_likes from public, anon, authenticated;
grant select on public.story_views to authenticated;
grant select, insert, delete on public.story_likes to authenticated;
drop policy if exists story_views_owner_read on public.story_views;
create policy story_views_owner_read on public.story_views for select to authenticated
using (exists (select 1 from public.stories s where s.id = story_views.story_id and s.author_id = (select auth.uid())));
drop policy if exists story_likes_read_own_or_story_owner on public.story_likes;
create policy story_likes_read_own_or_story_owner on public.story_likes for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.stories s where s.id = story_likes.story_id and s.author_id = (select auth.uid())));
drop policy if exists story_likes_insert_own_visible_story on public.story_likes;
create policy story_likes_insert_own_visible_story on public.story_likes for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
 select 1 from public.stories s where s.id = story_likes.story_id and s.author_id <> (select auth.uid())
 and s.expires_at > now() and (s.visibility = 'public' or (s.visibility = 'selected' and exists (
 select 1 from public.story_recipients r where r.story_id = s.id and r.recipient_id = (select auth.uid())
 )))));
drop policy if exists story_likes_delete_own on public.story_likes;
create policy story_likes_delete_own on public.story_likes for delete to authenticated using (user_id = (select auth.uid()));
create or replace function public.record_story_view(p_story_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
 if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
 if not exists (select 1 from public.stories s where s.id = p_story_id and s.author_id <> v_user_id
 and s.expires_at > pg_catalog.now() and (s.visibility = 'public' or (s.visibility = 'selected' and exists (
 select 1 from public.story_recipients r where r.story_id = s.id and r.recipient_id = v_user_id
 )))) then raise exception 'story_not_visible' using errcode = '42501'; end if;
 insert into public.story_views(story_id,viewer_id,viewed_at) values(p_story_id,v_user_id,pg_catalog.now())
 on conflict(story_id,viewer_id) do nothing;
end; $$;
revoke all on function public.record_story_view(uuid) from public, anon;
grant execute on function public.record_story_view(uuid) to authenticated;
