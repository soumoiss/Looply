-- Comentários pessoais independentes para cada faixa da playlist ou coleção.
-- track_key usa youtube:<videoId> ou library:<uuid>; os registros não se misturam entre músicas.
create table public.music_track_comments (
  id uuid primary key default gen_random_uuid(),
  track_key text not null,
  track_title text not null,
  author_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint music_track_comments_key_format check (
    track_key ~ '^(youtube:[A-Za-z0-9_-]{11}|library:[0-9a-f-]{36})$'
  ),
  constraint music_track_comments_title_length check (
    char_length(btrim(track_title)) between 1 and 160
  ),
  constraint music_track_comments_body_length check (
    char_length(btrim(body)) between 1 and 2000
  )
);

create index music_track_comments_owner_track_idx
  on public.music_track_comments (author_id, track_key, created_at);

alter table public.music_track_comments enable row level security;
revoke all on table public.music_track_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.music_track_comments to authenticated;

create policy music_track_comments_select_own
  on public.music_track_comments for select to authenticated
  using ((select auth.uid()) = author_id);

create policy music_track_comments_insert_own
  on public.music_track_comments for insert to authenticated
  with check ((select auth.uid()) = author_id);

create policy music_track_comments_update_own
  on public.music_track_comments for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy music_track_comments_delete_own
  on public.music_track_comments for delete to authenticated
  using ((select auth.uid()) = author_id);
