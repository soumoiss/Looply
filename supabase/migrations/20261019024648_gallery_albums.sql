create table if not exists public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gallery_albums_owner_created_idx on public.gallery_albums(owner_id,created_at desc);
alter table public.gallery_albums enable row level security;
revoke all on public.gallery_albums from public,anon;
grant select,insert,update,delete on public.gallery_albums to authenticated;
drop policy if exists gallery_albums_owner_select on public.gallery_albums;
create policy gallery_albums_owner_select on public.gallery_albums for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists gallery_albums_owner_insert on public.gallery_albums;
create policy gallery_albums_owner_insert on public.gallery_albums for insert to authenticated with check (owner_id=(select auth.uid()));
drop policy if exists gallery_albums_owner_update on public.gallery_albums;
create policy gallery_albums_owner_update on public.gallery_albums for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
drop policy if exists gallery_albums_owner_delete on public.gallery_albums;
create policy gallery_albums_owner_delete on public.gallery_albums for delete to authenticated using (owner_id=(select auth.uid()));

create table if not exists public.gallery_album_items (
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  source text not null check (source in ('archive','community')),
  media_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (album_id,source,media_id)
);
create index if not exists gallery_album_items_media_idx on public.gallery_album_items(source,media_id);
alter table public.gallery_album_items enable row level security;
revoke all on public.gallery_album_items from public,anon;
grant select,insert,delete on public.gallery_album_items to authenticated;
drop policy if exists gallery_album_items_owner_select on public.gallery_album_items;
create policy gallery_album_items_owner_select on public.gallery_album_items for select to authenticated
using (
  exists (select 1 from public.gallery_albums album where album.id=album_id and album.owner_id=(select auth.uid()))
  and (
    (source='community' and (select private.can_view_community_gallery_media(media_id)))
    or (source='archive' and (select private.can_view_archive_media(media_id)))
  )
);
drop policy if exists gallery_album_items_owner_insert on public.gallery_album_items;
create policy gallery_album_items_owner_insert on public.gallery_album_items for insert to authenticated
with check (
  exists (select 1 from public.gallery_albums album where album.id=album_id and album.owner_id=(select auth.uid()))
  and (
    (source='community' and (select private.can_view_community_gallery_media(media_id)))
    or (source='archive' and (select private.can_view_archive_media(media_id)))
  )
);
drop policy if exists gallery_album_items_owner_delete on public.gallery_album_items;
create policy gallery_album_items_owner_delete on public.gallery_album_items for delete to authenticated
using (exists (select 1 from public.gallery_albums album where album.id=album_id and album.owner_id=(select auth.uid())));
