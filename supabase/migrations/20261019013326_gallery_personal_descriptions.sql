-- Per-user descriptions and categories for shared gallery media.
create table if not exists public.gallery_media_descriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('archive','community')),
  media_id uuid not null,
  description text not null default '' check (char_length(description) <= 10000),
  category text not null default 'photo' check (category in ('photo','illustration','design','news','video','audio')),
  updated_at timestamptz not null default now(),
  primary key (user_id, source, media_id)
);
alter table public.gallery_media_descriptions enable row level security;
revoke all on public.gallery_media_descriptions from public, anon;
grant select, insert, update, delete on public.gallery_media_descriptions to authenticated;
drop policy if exists gallery_personal_description_read on public.gallery_media_descriptions;
create policy gallery_personal_description_read on public.gallery_media_descriptions for select to authenticated
using (user_id=(select auth.uid()) and ((source='archive' and (select private.can_view_archive_media(media_id))) or (source='community' and (select private.can_view_community_gallery_media(media_id)))));
drop policy if exists gallery_personal_description_insert on public.gallery_media_descriptions;
create policy gallery_personal_description_insert on public.gallery_media_descriptions for insert to authenticated
with check (user_id=(select auth.uid()) and ((source='archive' and (select private.can_view_archive_media(media_id))) or (source='community' and (select private.can_view_community_gallery_media(media_id))));
drop policy if exists gallery_personal_description_update on public.gallery_media_descriptions;
create policy gallery_personal_description_update on public.gallery_media_descriptions for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists gallery_personal_description_delete on public.gallery_media_descriptions;
create policy gallery_personal_description_delete on public.gallery_media_descriptions for delete to authenticated using (user_id=(select auth.uid()));
