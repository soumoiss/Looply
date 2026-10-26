-- Additive Neon media permissions. Preserve Supabase legacy files solely for rollback.
-- Authenticated RLS resolves the signed Neon principal to the preserved legacy UUID.
create or replace function public.v3_can_view_story(p_story_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select (select public.looply_legacy_uid()) is not null and exists (
  select 1 from public.stories s where s.id=p_story_id and s.expires_at>pg_catalog.now()
    and (s.author_id=(select public.looply_legacy_uid()) or s.visibility='public'
      or (s.visibility='selected' and exists (select 1 from public.story_recipients r where r.story_id=s.id and r.recipient_id=(select public.looply_legacy_uid()))))
)
$$;

revoke all on function public.v3_can_view_story(uuid) from public,anonymous;

grant execute on function public.v3_can_view_story(uuid) to authenticated;

create or replace function public.v3_is_conversation_participant(p_conversation_id uuid) returns boolean language sql stable security definer set search_path='' as $$
select (select public.looply_legacy_uid()) is not null and exists (
 select 1 from public.conversation_participants p where p.conversation_id=p_conversation_id and p.user_id=(select public.looply_legacy_uid())
)
$$;

revoke all on function public.v3_is_conversation_participant(uuid) from public,anonymous;

grant execute on function public.v3_is_conversation_participant(uuid) to authenticated;

create policy looply_v4_read_member_profiles on public.profiles for select to authenticated using (profile_visibility in ('members','public'));

create policy looply_v4_post_insert on public.posts for insert to authenticated with check (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_post_update on public.posts for update to authenticated using (author_id=(select public.looply_legacy_uid())) with check (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_post_delete on public.posts for delete to authenticated using (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_post_media_select on public.post_media for select to authenticated using (exists(select 1 from public.posts p where p.id=post_id));

create policy looply_v4_post_media_insert on public.post_media for insert to authenticated with check (exists(select 1 from public.posts p where p.id=post_id and p.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_post_media_delete on public.post_media for delete to authenticated using (exists(select 1 from public.posts p where p.id=post_id and p.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_comment_read on public.comments for select to authenticated using (exists(select 1 from public.posts p where p.id=post_id));

create policy looply_v4_comment_insert on public.comments for insert to authenticated with check (author_id=(select public.looply_legacy_uid()) and exists(select 1 from public.posts p where p.id=post_id));

create policy looply_v4_comment_update on public.comments for update to authenticated using (author_id=(select public.looply_legacy_uid())) with check (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_comment_delete on public.comments for delete to authenticated using (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_comment_media_read on public.comment_media for select to authenticated using (exists(select 1 from public.comments c where c.id=comment_id));

create policy looply_v4_comment_media_insert on public.comment_media for insert to authenticated with check (author_id=(select public.looply_legacy_uid()) and exists(select 1 from public.comments c where c.id=comment_id and c.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_story_read on public.stories for select to authenticated using (public.v3_can_view_story(id));

create policy looply_v4_story_insert on public.stories for insert to authenticated with check (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_story_delete on public.stories for delete to authenticated using (author_id=(select public.looply_legacy_uid()));

create policy looply_v4_story_media_read on public.story_media for select to authenticated using (public.v3_can_view_story(story_id));

create policy looply_v4_story_media_insert on public.story_media for insert to authenticated with check (exists(select 1 from public.stories s where s.id=story_id and s.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_story_recipients_read on public.story_recipients for select to authenticated using (recipient_id=(select public.looply_legacy_uid()) or exists(select 1 from public.stories s where s.id=story_id and s.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_story_recipients_insert on public.story_recipients for insert to authenticated with check (exists(select 1 from public.stories s where s.id=story_id and s.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_story_like_read on public.story_likes for select to authenticated using (public.v3_can_view_story(story_id));

create policy looply_v4_story_like_insert on public.story_likes for insert to authenticated with check (user_id=(select public.looply_legacy_uid()) and public.v3_can_view_story(story_id));

create policy looply_v4_story_like_delete on public.story_likes for delete to authenticated using (user_id=(select public.looply_legacy_uid()));

create policy looply_v4_story_view_select on public.story_views for select to authenticated using (viewer_id=(select public.looply_legacy_uid()) or exists(select 1 from public.stories s where s.id=story_id and s.author_id=(select public.looply_legacy_uid())));

create policy looply_v4_story_view_insert on public.story_views for insert to authenticated with check (viewer_id=(select public.looply_legacy_uid()) and public.v3_can_view_story(story_id));

create policy looply_v4_post_like_read on public.post_likes for select to authenticated using (exists(select 1 from public.posts p where p.id=post_id));

create policy looply_v4_post_like_insert on public.post_likes for insert to authenticated with check (user_id=(select public.looply_legacy_uid()) and exists(select 1 from public.posts p where p.id=post_id));

create policy looply_v4_post_like_delete on public.post_likes for delete to authenticated using (user_id=(select public.looply_legacy_uid()));

create policy looply_v4_conv_read on public.conversations for select to authenticated using (public.v3_is_conversation_participant(id));

create policy looply_v4_conv_participant_read on public.conversation_participants for select to authenticated using (public.v3_is_conversation_participant(conversation_id));

create policy looply_v4_chat_read on public.chat_messages for select to authenticated using (public.v3_is_conversation_participant(conversation_id));

create policy looply_v4_chat_insert on public.chat_messages for insert to authenticated with check (sender_id=(select public.looply_legacy_uid()) and public.v3_is_conversation_participant(conversation_id));

create policy looply_v4_chat_update on public.chat_messages for update to authenticated using (public.v3_is_conversation_participant(conversation_id)) with check (public.v3_is_conversation_participant(conversation_id));

create policy looply_v4_chat_delete on public.chat_messages for delete to authenticated using (sender_id=(select public.looply_legacy_uid()));

create policy looply_v4_chat_media_read on public.chat_media for select to authenticated using (public.v3_is_conversation_participant(conversation_id));

create policy looply_v4_chat_media_insert on public.chat_media for insert to authenticated with check (created_by=(select public.looply_legacy_uid()) and exists(select 1 from public.chat_messages m where m.id=message_id and m.sender_id=(select public.looply_legacy_uid()) and m.conversation_id=conversation_id));

create policy looply_v4_letters_read on public.community_letters for select to authenticated using (sender_id=(select public.looply_legacy_uid()) or recipient_id=(select public.looply_legacy_uid()));

create policy looply_v4_letters_insert on public.community_letters for insert to authenticated with check (sender_id=(select public.looply_legacy_uid()));

create policy looply_v4_letters_update on public.community_letters for update to authenticated using (sender_id=(select public.looply_legacy_uid())) with check (sender_id=(select public.looply_legacy_uid()));

create policy looply_v4_archive_read on public.archive_media for select to authenticated using (visibility in ('members','public'));

create policy looply_v4_gallery_desc_read on public.gallery_media_descriptions for select to authenticated using (source='community' and exists(select 1 from public.community_gallery_media m where m.id=media_id));

create policy looply_v4_gallery_desc_insert on public.gallery_media_descriptions for insert to authenticated with check (source='community' and user_id=(select public.looply_legacy_uid()) and exists(select 1 from public.community_gallery_media m where m.id=media_id and m.owner_id=(select public.looply_legacy_uid())));

create policy looply_v4_gallery_desc_update on public.gallery_media_descriptions for update to authenticated using (user_id=(select public.looply_legacy_uid())) with check (user_id=(select public.looply_legacy_uid()));

create policy looply_v4_gallery_people_read on public.gallery_media_people for select to authenticated using (source='community' and exists(select 1 from public.community_gallery_media m where m.id=media_id));

create policy looply_v4_gallery_people_insert on public.gallery_media_people for insert to authenticated with check (source='community' and created_by=(select public.looply_legacy_uid()) and exists(select 1 from public.community_gallery_media m where m.id=media_id and m.owner_id=(select public.looply_legacy_uid())));

grant select on public.profiles,public.posts,public.post_media,public.comments,public.comment_media,public.stories,public.story_media,public.story_recipients,public.story_views,public.story_likes,public.post_likes,public.conversations,public.conversation_participants,public.chat_messages,public.chat_media,public.community_letters,public.archive_media,public.gallery_media_descriptions,public.gallery_media_people to authenticated;

grant insert on public.posts,public.post_media,public.comments,public.comment_media,public.stories,public.story_media,public.story_recipients,public.story_views,public.story_likes,public.post_likes,public.chat_messages,public.chat_media,public.community_letters,public.gallery_media_descriptions,public.gallery_media_people to authenticated;

grant update on public.posts,public.comments,public.chat_messages,public.community_letters,public.gallery_media_descriptions to authenticated;

grant delete on public.posts,public.post_media,public.comments,public.stories,public.story_likes,public.post_likes,public.chat_messages to authenticated;
