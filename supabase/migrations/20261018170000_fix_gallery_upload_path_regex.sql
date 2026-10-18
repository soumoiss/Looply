-- Fix escaped-dot regexes that rejected valid gallery object paths such as UUID.jpg.
-- Existing community media is preserved; only path validation is corrected.
alter table public.community_gallery_media
  drop constraint if exists community_gallery_storage_path_matches_owner;

alter table public.community_gallery_media
  add constraint community_gallery_storage_path_matches_owner
  check (
    storage_path ~ (
      '^gallery/' || owner_id::text ||
      '/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|heic|mp4|webm|mp3|m4a|ogg|wav|aac)$'
    )
  );

drop policy if exists looply_gallery_insert_owner on storage.objects;
create policy looply_gallery_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'looply-gallery'
  and (storage.foldername(name))[1] = 'gallery'
  and private.try_uuid((storage.foldername(name))[2]) = (select auth.uid())
  and storage.filename(name) ~
    '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|heic|mp4|webm|mp3|m4a|ogg|wav|aac)$'
  and case
    when coalesce(metadata ->> 'size', '') ~ '^[0-9]{1,12}$'
      then (metadata ->> 'size')::bigint between 1 and
        case when (select private.is_admin()) then 209715200 else 104857600 end
    else false
  end
);
