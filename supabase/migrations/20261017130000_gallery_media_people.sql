-- Identificação de pessoas nas mídias da galeria, gerenciada somente pelo administrador.
create table public.gallery_media_people (
  source text not null check (source in ('archive','community')),
  media_id uuid not null,
  person_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (source, media_id, person_id)
);

create index gallery_media_people_person_idx on public.gallery_media_people(person_id, source, media_id);
create index gallery_media_people_media_idx on public.gallery_media_people(source, media_id);

alter table public.gallery_media_people enable row level security;
revoke all on public.gallery_media_people from public, anon, authenticated;
grant select, insert, delete on public.gallery_media_people to authenticated;

create policy "Members can view tags only for visible media"
on public.gallery_media_people for select to authenticated
using (
  (source = 'archive' and private.can_view_archive_media(media_id))
  or (source = 'community' and private.can_view_community_gallery_media(media_id))
);

create policy "Only administrator can add people tags"
on public.gallery_media_people for insert to authenticated
with check (
  (select private.is_admin())
  and created_by = (select auth.uid())
  and (
    (source = 'archive' and private.can_manage_archive_media(media_id))
    or (source = 'community' and private.can_manage_community_gallery_media(media_id))
  )
);

create policy "Only administrator can remove people tags"
on public.gallery_media_people for delete to authenticated
using (
  (select private.is_admin())
  and (
    (source = 'archive' and private.can_manage_archive_media(media_id))
    or (source = 'community' and private.can_manage_community_gallery_media(media_id))
  )
);
