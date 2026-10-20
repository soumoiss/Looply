-- Gallery uploads create a private pending row and then publish it.
-- The existing UPDATE RLS policy restricts row changes to the owner or an administrator.
-- Grant the SQL privilege required for that policy to be evaluated for authenticated users.
grant update on table public.community_gallery_media to authenticated;
