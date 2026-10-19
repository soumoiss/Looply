-- Accept a broad range of image/video/audio formats supported by browsers and devices.
-- Project-wide Supabase quotas still apply; remove only gallery-specific MIME, extension,
-- and per-role file-size restrictions that rejected otherwise valid media.
alter table public.community_gallery_media
  drop constraint if exists community_gallery_storage_path_matches_owner;

alter table public.community_gallery_media
  add constraint community_gallery_storage_path_matches_owner
  check (
    storage_path ~ (
      '^gallery/' || owner_id::text ||
      '/[a-f0-9-]{36}\.[a-z0-9]{1,20}$'
    )
  );

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = null,
    updated_at = now()
where id = 'looply-gallery';

drop policy if exists looply_gallery_insert_owner on storage.objects;
create policy looply_gallery_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'looply-gallery'
  and (storage.foldername(name))[1] = 'gallery'
  and private.try_uuid((storage.foldername(name))[2]) = (select auth.uid())
  and storage.filename(name) ~
    '^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.[a-z0-9]{1,20}$'
  and case
    when coalesce(metadata ->> 'size', '') ~ '^[0-9]{1,12}$'
      then (metadata ->> 'size')::bigint >= 1
    else false
  end
);
