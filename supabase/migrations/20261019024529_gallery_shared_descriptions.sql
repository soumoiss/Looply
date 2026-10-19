drop policy if exists gallery_personal_description_read on public.gallery_media_descriptions;
create policy gallery_description_read_visible
on public.gallery_media_descriptions
for select to authenticated
using (
  (source = 'archive' and (select private.can_view_archive_media(media_id)))
  or
  (source = 'community' and (select private.can_view_community_gallery_media(media_id)))
);
create index if not exists gallery_media_descriptions_media_updated_idx
on public.gallery_media_descriptions(source, media_id, updated_at desc);