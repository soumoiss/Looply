-- Avoid overlapping permissive SELECT policies while preserving the existing
-- gallery access rules. Read policies remain the only SELECT policies; writes
-- are authorized separately with the same manager predicate as before.
drop policy if exists community_gallery_comment_recipients_manage
  on public.community_gallery_comment_recipients;
create policy community_gallery_comment_recipients_insert
  on public.community_gallery_comment_recipients
  for insert to authenticated
  with check ((select private.can_manage_community_gallery_comment(comment_id)));
create policy community_gallery_comment_recipients_update
  on public.community_gallery_comment_recipients
  for update to authenticated
  using ((select private.can_manage_community_gallery_comment(comment_id)))
  with check ((select private.can_manage_community_gallery_comment(comment_id)));
create policy community_gallery_comment_recipients_delete
  on public.community_gallery_comment_recipients
  for delete to authenticated
  using ((select private.can_manage_community_gallery_comment(comment_id)));

drop policy if exists community_gallery_commenters_manage
  on public.community_gallery_media_commenters;
create policy community_gallery_commenters_insert
  on public.community_gallery_media_commenters
  for insert to authenticated
  with check ((select private.can_manage_community_gallery_media(media_id)));
create policy community_gallery_commenters_update
  on public.community_gallery_media_commenters
  for update to authenticated
  using ((select private.can_manage_community_gallery_media(media_id)))
  with check ((select private.can_manage_community_gallery_media(media_id)));
create policy community_gallery_commenters_delete
  on public.community_gallery_media_commenters
  for delete to authenticated
  using ((select private.can_manage_community_gallery_media(media_id)));

drop policy if exists community_gallery_recipients_manage
  on public.community_gallery_media_recipients;
create policy community_gallery_recipients_insert
  on public.community_gallery_media_recipients
  for insert to authenticated
  with check ((select private.can_manage_community_gallery_media(media_id)));
create policy community_gallery_recipients_update
  on public.community_gallery_media_recipients
  for update to authenticated
  using ((select private.can_manage_community_gallery_media(media_id)))
  with check ((select private.can_manage_community_gallery_media(media_id)));
create policy community_gallery_recipients_delete
  on public.community_gallery_media_recipients
  for delete to authenticated
  using ((select private.can_manage_community_gallery_media(media_id)));
