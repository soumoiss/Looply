-- Repair Looply gallery upload RLS: use exact PostgreSQL regexes and do not
-- depend on Storage-generated metadata being present during INSERT ... RETURNING.
-- Ownership, bucket, folder, and opaque filename checks remain enforced.
drop policy if exists looply_gallery_insert_owner on storage.objects;
create policy looply_gallery_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'looply-gallery'
  and (storage.foldername(name))[1] = 'gallery'
  and private.try_uuid((storage.foldername(name))[2]) = (select auth.uid())
  and storage.filename(name) ~ $re$^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[.][a-z0-9]{1,20}$$re$
);

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
  and storage.filename(storage_path) ~ $re$^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[.][a-z0-9]{1,20}$$re$
);

alter table public.community_gallery_media
  drop constraint if exists community_gallery_storage_path_matches_owner;
alter table public.community_gallery_media
  add constraint community_gallery_storage_path_matches_owner
  check (
    storage_path ~ (
      '^gallery/' || owner_id::text ||
      $re$/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[.][a-z0-9]{1,20}$$re$
    )
  );
