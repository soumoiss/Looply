-- Allow authenticated users to create posts that include an external social/video URL.
-- The frontend inserts external_url in the same INSERT as body and visibility.
grant insert (external_url) on public.posts to authenticated;
