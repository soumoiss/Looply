-- Minimal RLS needed for the authenticated Neon profile and gallery upload flows.
-- Every ownership comparison resolves the Neon JWT to its preserved legacy profile ID.
grant select on public.profiles, public.community_gallery_media to authenticated;
grant update (display_name, bio, profile_visibility, playlist_url, avatar_path)
  on public.profiles to authenticated;
grant insert (owner_id, storage_path, file_name, kind, mime_type, byte_size, caption, visibility, comment_access, private_owner_id, publication_state)
  on public.community_gallery_media to authenticated;
grant update (publication_state) on public.community_gallery_media to authenticated;

drop policy if exists looply_v3_own_profile_update on public.profiles;
create policy looply_v3_own_profile_update on public.profiles
  for update to authenticated
  using (id = (select public.looply_legacy_uid()))
  with check (id = (select public.looply_legacy_uid()));

drop policy if exists looply_v3_gallery_read_owner_or_visible on public.community_gallery_media;
create policy looply_v3_gallery_read_owner_or_visible on public.community_gallery_media
  for select to authenticated
  using (
    owner_id = (select public.looply_legacy_uid())
    or (
      publication_state = 'published'
      and private_owner_id is null
      and visibility = 'members'
    )
  );

drop policy if exists looply_v3_gallery_insert_pending_owner on public.community_gallery_media;
create policy looply_v3_gallery_insert_pending_owner on public.community_gallery_media
  for insert to authenticated
  with check (
    owner_id = (select public.looply_legacy_uid())
    and private_owner_id is null
    and publication_state = 'pending'
    and byte_size between 1 and 104857600
    and storage_path ~ ('^gallery/' || (select public.looply_legacy_uid())::text || '/[a-f0-9-]{36}[.][a-z0-9]{1,20}$')
  );

drop policy if exists looply_v3_gallery_publish_owner on public.community_gallery_media;
create policy looply_v3_gallery_publish_owner on public.community_gallery_media
  for update to authenticated
  using (owner_id = (select public.looply_legacy_uid()) and publication_state = 'pending')
  with check (owner_id = (select public.looply_legacy_uid()) and publication_state = 'published');

create or replace function public.v3_cleanup_pending_gallery_media(p_media_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare actor uuid := (select public.looply_legacy_uid());
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.community_gallery_media where id = p_media_id and owner_id = actor and publication_state = 'pending';
  if not found then raise exception 'Pending gallery media not found or not owned by caller' using errcode = '42501'; end if;
end;
$function$;
revoke all on function public.v3_cleanup_pending_gallery_media(uuid) from public, anonymous;
grant execute on function public.v3_cleanup_pending_gallery_media(uuid) to authenticated;
