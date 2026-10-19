-- Allow users to read their own pending gallery rows.
-- The gallery inserts a row with publication_state='pending' and uses INSERT ... RETURNING
-- to retrieve its id before publishing it. The previous SELECT policy only called
-- can_view_community_gallery_media(), which intentionally hides pending rows from viewers,
-- including the owner. Keep pending uploads private from everyone except their owner.

drop policy if exists community_gallery_members_read on public.community_gallery_media;
create policy community_gallery_members_read
on public.community_gallery_media
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select private.can_view_community_gallery_media(community_gallery_media.id))
);
