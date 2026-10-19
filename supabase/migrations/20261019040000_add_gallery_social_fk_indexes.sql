-- Add indexes for foreign-key columns identified by Supabase's performance advisor.
-- These indexes improve joins and parent-row updates/deletes without changing access rules.
create index if not exists archive_media_likes_user_id_idx
  on public.archive_media_likes (user_id);

create index if not exists community_gallery_media_private_owner_id_idx
  on public.community_gallery_media (private_owner_id);

create index if not exists community_gallery_media_likes_user_id_idx
  on public.community_gallery_media_likes (user_id);

create index if not exists gallery_media_people_created_by_idx
  on public.gallery_media_people (created_by);

create index if not exists global_announcements_created_by_idx
  on public.global_announcements (created_by);

create index if not exists post_likes_user_id_idx
  on public.post_likes (user_id);

create index if not exists story_likes_user_id_idx
  on public.story_likes (user_id);

create index if not exists story_replies_conversation_id_idx
  on public.story_replies (conversation_id);

create index if not exists story_replies_message_conversation_idx
  on public.story_replies (message_id, conversation_id);

create index if not exists story_views_viewer_id_idx
  on public.story_views (viewer_id);
