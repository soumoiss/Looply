-- Fix gallery uploads failing at Storage INSERT ... RETURNING and align table policies
-- with the broad media formats supported by the gallery client.
--
-- Supabase Storage returns the newly inserted object metadata to the uploader.
-- Before the gallery metadata row is created, the existing gallery SELECT policy
-- cannot find that row and therefore hides the just-uploaded object from RETURNING.
-- Allow an authenticated owner to read only objects in their own gallery folder.

drop policy if exists looply_gallery_read_own_uploads on storage.objects;
create policy looply_gallery_read_own_uploads
on storage.objects for select to authenticated
using (
  bucket_id = 'looply-gallery'
  and (storage.foldername(name))[1] = 'gallery'
  and private.try_uuid((storage.foldername(name))[2]) = (select auth.uid())
);

-- Preserve ownership and pending-publication checks while removing stale role-based
-- size caps and the old short MIME/extension allowlist.
drop policy if exists community_gallery_owner_insert_pending on public.community_gallery_media;
create policy community_gallery_owner_insert_pending
on public.community_gallery_media for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private_owner_id is null
  and publication_state = 'pending'
  and byte_size >= 1
  and (storage.foldername(storage_path))[1] = 'gallery'
  and private.try_uuid((storage.foldername(storage_path))[2]) = (select auth.uid())
  and storage.filename(storage_path) ~
    '^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.[a-z0-9]{1,20}$'
);

alter table public.community_gallery_media
  drop constraint if exists community_gallery_media_byte_size_check,
  drop constraint if exists community_gallery_media_mime_type_check,
  drop constraint if exists community_gallery_storage_path_matches_owner;

alter table public.community_gallery_media
  add constraint community_gallery_media_byte_size_check
    check (byte_size >= 1),
  add constraint community_gallery_storage_path_matches_owner
    check (
      storage_path ~ (
        '^gallery/' || owner_id::text ||
        '/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.[a-z0-9]{1,20}$'
      )
    );

-- community_gallery_kind_matches_mime continues to require the correct MIME family
-- for image/video/audio, without freezing the project to a short list of subtypes.
