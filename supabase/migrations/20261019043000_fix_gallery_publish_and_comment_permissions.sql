-- Restore gallery publishing for authenticated members and let every authorized viewer comment.
-- RLS still restricts each insert/update to the owner and to valid gallery paths.
grant select, insert on table public.community_gallery_media to authenticated;
grant update (publication_state) on table public.community_gallery_media to authenticated;

drop policy if exists community_gallery_owner_insert on public.community_gallery_media;
drop policy if exists community_gallery_owner_insert_pending on public.community_gallery_media;
create policy community_gallery_owner_insert_pending
on public.community_gallery_media
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private_owner_id is null
  and publication_state = 'pending'
  and byte_size between 1 and case
    when (select private.is_admin()) then 209715200
    else 104857600
  end
  and (storage.foldername(storage_path))[1] = 'gallery'
  and private.try_uuid((storage.foldername(storage_path))[2]) = (select auth.uid())
  and storage.filename(storage_path) ~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|heic|mp4|webm|mp3|m4a|ogg|wav|aac)$'
);

-- Existing UPDATE RLS policy limits state changes to the owner/admin. Column-level
-- UPDATE grant above means authenticated clients can only publish their own pending row.
-- The existing publication-state trigger prevents a published row being reverted.

create or replace function private.can_comment_community_gallery_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_view_community_gallery_media(p_media_id);
$function$;

create or replace function private.can_comment_archive_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_view_archive_media(p_media_id);
$function$;

revoke all on function private.can_comment_community_gallery_media(uuid) from public, anon;
revoke all on function private.can_comment_archive_media(uuid) from public, anon;
grant execute on function private.can_comment_community_gallery_media(uuid) to authenticated;
grant execute on function private.can_comment_archive_media(uuid) to authenticated;

-- Normalize existing media to the intended default: anyone who can view can comment.
update public.community_gallery_media set comment_access = 'viewers' where comment_access is distinct from 'viewers';
update public.archive_media set comment_access = 'viewers' where comment_access is distinct from 'viewers';
