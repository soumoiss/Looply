-- Return only a validated, recent offer owned by the authenticated caller.
-- This function has no write path and returns no private information.
CREATE OR REPLACE FUNCTION public.v22_fcm_authorize_call_ring(p_conversation_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fcm$
 SELECT e.id
   FROM looply_migration.call_signal_events e
   JOIN public.conversations c ON c.id=e.conversation_id AND c.kind='direct'
  WHERE auth.uid() IS NOT NULL
    AND e.conversation_id=p_conversation_id
    AND e.sender_id=public.looply_legacy_uid()
    AND public.v3_is_conversation_member(p_conversation_id)
    AND e.kind='signal'
    AND e.payload->>'type'='offer'
    AND e.payload->>'mode' IN ('audio','video')
    AND e.payload->'description'->>'type'='offer'
    AND e.created_at>clock_timestamp()-interval '20 seconds'
    AND e.expires_at>clock_timestamp()
    AND NOT EXISTS (
       SELECT 1 FROM looply_migration.call_signal_events ended
       WHERE ended.conversation_id=e.conversation_id
         AND ended.id>e.id AND ended.created_at>e.created_at
         AND ended.payload->>'type' IN ('answer','hangup','decline','failed')
    )
  ORDER BY e.id DESC LIMIT 1
$fcm$;
REVOKE ALL ON FUNCTION public.v22_fcm_authorize_call_ring(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v22_fcm_authorize_call_ring(uuid) TO authenticated;

-- Enrich already-eligible notifications with verified sender name. This is
-- SECURITY DEFINER only because the relay role must not read user tables.
-- Every row must first pass v20's recipient and visibility constraints.
CREATE OR REPLACE FUNCTION public.v22_android_fcm_named_candidates()
RETURNS TABLE(
 source text,event_id uuid,kind text,resource_id uuid,
 conversation_id uuid,token_id uuid,fcm_token text,created_at timestamptz,
 actor_name text, call_mode text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fcm$
 SELECT e.source,e.event_id,e.kind,e.resource_id,e.conversation_id,
        e.token_id,e.fcm_token,e.created_at,
        LEFT(COALESCE(NULLIF(BTRIM(p.display_name),''),NULLIF(BTRIM(p.username),''),'Alguém'),64) AS actor_name,
        CASE WHEN e.source='incoming-call' AND c.payload->>'mode' IN ('video','audio')
             THEN c.payload->>'mode' ELSE NULL END AS call_mode
 FROM (
    SELECT v.source,v.event_id,v.kind,v.resource_id,v.conversation_id,
           v.token_id,v.fcm_token,v.created_at
    FROM public.v20_android_fcm_activity_candidates() v
    UNION ALL
    SELECT 'activity',n.id,n.kind,n.resource_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
    UNION ALL
    SELECT 'chat',n.id,
       CASE WHEN EXISTS(SELECT 1 FROM public.chat_media cm
              WHERE cm.message_id=n.message_id AND cm.mime_type LIKE 'audio/%')
            THEN 'voice' ELSE n.kind END,
       n.message_id,n.conversation_id,t.id,t.fcm_token,n.created_at
    FROM public.chat_notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.user_id
    UNION ALL
    SELECT 'letter',n.id,'letter',n.letter_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.letter_event_notifications n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
    WHERE n.event_type='new_received'
    UNION ALL
    SELECT 'story',n.id,'story',n.story_id,NULL::uuid,t.id,t.fcm_token,n.created_at
    FROM public.android_fcm_story_events n
    JOIN public.android_fcm_tokens t ON t.user_id=n.recipient_id
 ) e
 LEFT JOIN LATERAL (
   SELECT CASE e.source
      WHEN 'activity' THEN (SELECT n.actor_id FROM public.notifications n WHERE n.id=e.event_id)
      WHEN 'chat' THEN (SELECT m.sender_id FROM public.chat_messages m WHERE m.id=e.resource_id)
      WHEN 'letter' THEN (SELECT l.sender_id FROM public.letter_event_notifications l WHERE l.id=e.event_id)
      WHEN 'story' THEN (SELECT s.author_id FROM public.stories s WHERE s.id=e.resource_id)
      WHEN 'feed' THEN (SELECT p.author_id FROM public.posts p WHERE p.id=e.resource_id)
      WHEN 'post-mention' THEN (SELECT p.author_id FROM public.posts p WHERE p.id=e.resource_id)
      WHEN 'feed-comment' THEN (SELECT cm.author_id FROM public.comments cm WHERE cm.id=e.event_id)
      WHEN 'gallery' THEN (SELECT gm.owner_id FROM public.community_gallery_media gm WHERE gm.id=e.resource_id)
      WHEN 'gallery-comment' THEN (SELECT gc.author_id FROM public.community_gallery_comments gc WHERE gc.id=e.event_id)
      WHEN 'gallery-mention' THEN (SELECT gc.author_id FROM public.gallery_comment_mentions gm JOIN public.community_gallery_comments gc ON gc.id=gm.comment_id WHERE gm.source='community' AND md5('gcm:'||gm.source||':'||gm.comment_id::text||':'||gm.person_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'gallery-tag' THEN (SELECT gp.created_by FROM public.gallery_media_people gp WHERE gp.source='community' AND md5('gmt:'||gp.source||':'||gp.media_id::text||':'||gp.person_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'story-mention' THEN (SELECT sm.mentioned_by FROM public.story_mentions sm WHERE sm.id=e.event_id)
      WHEN 'community-letter' THEN (SELECT cl.sender_id FROM public.community_letters cl WHERE cl.id=e.event_id)
      WHEN 'music-dedication' THEN (SELECT d.sender_id FROM public.music_dedications d WHERE d.id=e.event_id)
      WHEN 'music-comment' THEN (SELECT mc.author_id FROM public.music_comments mc WHERE mc.id=e.event_id)
      WHEN 'music-page-comment' THEN (SELECT mc.author_id FROM public.music_page_comments mc WHERE mc.id=e.event_id)
      WHEN 'music-admin-comment' THEN (SELECT mc.author_id FROM public.admin_music_track_comments mc WHERE mc.id=e.event_id)
      WHEN 'archive-gallery-comment' THEN (SELECT ac.author_id FROM public.archive_media_comments ac WHERE ac.id=e.event_id)
      WHEN 'incoming-call' THEN (SELECT cs.sender_id FROM looply_migration.call_signal_events cs WHERE md5('cs:'||cs.id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'post-like' THEN (SELECT l.user_id FROM public.post_likes l WHERE md5('pl:'||l.post_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'story-like' THEN (SELECT l.user_id FROM public.story_likes l WHERE md5('sl:'||l.story_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      WHEN 'gallery-like' THEN (SELECT l.user_id FROM public.community_gallery_media_likes l WHERE md5('gl:'||l.media_id::text||':'||l.user_id::text)::uuid=e.event_id LIMIT 1)
      ELSE NULL::uuid
   END AS actor_id
 ) a ON true
 LEFT JOIN public.profiles p ON p.id=a.actor_id
 LEFT JOIN looply_migration.call_signal_events c
   ON e.source='incoming-call' AND md5('cs:'||c.id::text)::uuid=e.event_id
$fcm$;
REVOKE ALL ON FUNCTION public.v22_android_fcm_named_candidates() FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.v22_android_fcm_named_candidates()
  TO looply_push_relay_limited;
