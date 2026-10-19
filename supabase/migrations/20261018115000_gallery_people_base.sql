-- Base table for people tags on archived and community gallery media.
create table if not exists public.gallery_media_people (
  source text not null check (source in ('archive','community')),
  media_id uuid not null,
  person_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source,media_id,person_id)
);
create index if not exists gallery_media_people_person_idx on public.gallery_media_people(person_id,source,media_id);
alter table public.gallery_media_people enable row level security;
revoke all on table public.gallery_media_people from public,anon;
grant select,insert,delete on table public.gallery_media_people to authenticated;
drop policy if exists gallery_people_visible_media_read on public.gallery_media_people;
create policy gallery_people_visible_media_read on public.gallery_media_people for select to authenticated
using ((source='archive' and (select private.can_view_archive_media(media_id))) or (source='community' and (select private.can_view_community_gallery_media(media_id))));
