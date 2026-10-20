-- Storage upload performs INSERT ... RETURNING. Before a story_media row exists,
-- the author still needs to read only the object whose parent story they own.
create policy looply_media_read_own_unregistered_story_upload
on storage.objects for select to authenticated
using (
  bucket_id = 'looply-media'
  and (storage.foldername(name))[1] = 'stories'
  and exists (
    select 1 from public.stories story
    where story.id = private.try_uuid((storage.foldername(name))[2])
      and story.author_id = (select auth.uid())
  )
);

-- The same INSERT ... RETURNING requirement applies to a new comment attachment
-- before its comment_media metadata row has been created.
create policy looply_media_read_own_unregistered_comment_upload
on storage.objects for select to authenticated
using (
  bucket_id = 'looply-media'
  and (storage.foldername(name))[1] = 'comments'
  and exists (
    select 1 from public.comments comment
    where comment.id = private.try_uuid((storage.foldername(name))[3])
      and comment.post_id = private.try_uuid((storage.foldername(name))[2])
      and comment.author_id = (select auth.uid())
  )
);
