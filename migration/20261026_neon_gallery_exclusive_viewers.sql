-- Exclusive gallery objects stay private to their owner and listed viewer UUIDs.
create table if not exists public.gallery_media_viewers (
 media_id uuid not null references public.community_gallery_media(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 primary key(media_id,user_id)
);
alter table public.gallery_media_viewers enable row level security;
create policy looply_v4_gallery_viewer_self_read on public.gallery_media_viewers for select to authenticated using (user_id=(select public.looply_legacy_uid()));
create policy looply_v4_gallery_viewer_owner_add on public.gallery_media_viewers for insert to authenticated with check (
 exists (select 1 from public.community_gallery_media m where m.id=media_id and m.owner_id=(select public.looply_legacy_uid()) and m.publication_state='pending')
);
create policy looply_v4_gallery_exclusive_read on public.community_gallery_media for select to authenticated using (
 publication_state='published' and visibility='exclusive'
 and exists(select 1 from public.gallery_media_viewers v where v.media_id=id and v.user_id=(select public.looply_legacy_uid()))
);
grant select,insert on public.gallery_media_viewers to authenticated;
