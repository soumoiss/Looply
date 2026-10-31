-- Additive Android FCM coverage. No existing messages, content or tokens are modified.
-- This function is callable ONLY by the limited push relay. It returns
-- eligible delivery metadata but never user-generated private content.
CREATE OR REPLACE FUNCTION public.v20_android_fcm_activity_candidates()
RETURNS TABLE(
  source text,event_id uuid,kind text,resource_id uuid,
  conversation_id uuid,token_id uuid,fcm_token text,created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fcm$
  -- New visible posts: public to members, selected to explicit recipients.
  SELECT 'feed'::text,p.id,'post'::text,p.id,NULL::uuid,
         t.id,t.fcm_token,p.created_at
    FROM public.posts p
    JOIN public.android_fcm_tokens t ON t.user_id<>p.author_id
   WHERE p.created_at>now()-interval '2 hours'
     AND (p.visibility='public' OR (p.visibility='selected' AND EXISTS
       (SELECT 1 FROM public.post_recipients r WHERE r.post_id=p.id AND r.recipient_id=t.user_id)))
  UNION ALL
  -- Comments on my post, or responses to a comment I authored.
  SELECT 'feed-comment',c.id,'comment',c.post_id,NULL::uuid,
         t.id,t.fcm_token,c.created_at
    FROM public.comments c
    JOIN public.posts p ON p.id=c.post_id
    JOIN public.android_fcm_tokens t ON t.user_id<>c.author_id
   WHERE c.created_at>now()-interval '2 hours'
     AND (t.user_id=p.author_id OR EXISTS
       (SELECT 1 FROM public.comments parent
        WHERE parent.id=c.parent_comment_id AND parent.author_id=t.user_id))
     AND (p.visibility='public' OR p.author_id=t.user_id OR
       EXISTS (SELECT 1 FROM public.post_recipients pr WHERE pr.post_id=p.id AND pr.recipient_id=t.user_id))
  UNION ALL
  -- New media is eligible only when actually published and accessible.
  SELECT 'gallery',m.id,'gallery',m.id,NULL::uuid,
         t.id,t.fcm_token,m.created_at
    FROM public.community_gallery_media m
    JOIN public.android_fcm_tokens t ON t.user_id<>m.owner_id
   WHERE m.created_at>now()-interval '2 hours'
     AND m.publication_state='published' AND m.private_owner_id IS NULL
     AND (m.visibility='members' OR EXISTS
       (SELECT 1 FROM public.gallery_media_viewers v
        WHERE v.media_id=m.id AND v.user_id=t.user_id))
  UNION ALL
  -- Gallery comments alert their owner and explicitly addressed recipients.
  SELECT 'gallery-comment',c.id,'gallery_comment',m.id,NULL::uuid,
         t.id,t.fcm_token,c.created_at
    FROM public.community_gallery_comments c
    JOIN public.community_gallery_media m ON m.id=c.media_id
    JOIN public.android_fcm_tokens t ON t.user_id<>c.author_id
   WHERE c.created_at>now()-interval '2 hours'
     AND m.publication_state='published'
     AND (m.owner_id=t.user_id OR
       (m.private_owner_id IS NULL AND
        (m.visibility='members' OR EXISTS
          (SELECT 1 FROM public.gallery_media_viewers v
           WHERE v.media_id=m.id AND v.user_id=t.user_id))
        AND EXISTS
          (SELECT 1 FROM public.community_gallery_comment_recipients r
           WHERE r.comment_id=c.id AND r.user_id=t.user_id)))
  UNION ALL
  -- Tags/mentions in the feed.
  SELECT 'post-mention',
         md5('pm:'||pm.post_id::text||':'||pm.person_id::text)::uuid,
         'mention',p.id,NULL::uuid,t.id,t.fcm_token,pm.created_at
    FROM public.post_mentions pm JOIN public.posts p ON p.id=pm.post_id
    JOIN public.android_fcm_tokens t ON t.user_id=pm.person_id
   WHERE pm.created_at>now()-interval '2 hours' AND pm.person_id<>p.author_id
     AND (p.visibility='public' OR EXISTS
       (SELECT 1 FROM public.post_recipients r WHERE r.post_id=p.id AND r.recipient_id=pm.person_id))
  UNION ALL
  -- Story mentions remain restricted to the story's visibility.
  SELECT 'story-mention',m.id,'story_mention',s.id,NULL::uuid,
         t.id,t.fcm_token,m.created_at
    FROM public.story_mentions m JOIN public.stories s ON s.id=m.story_id
    JOIN public.android_fcm_tokens t ON t.user_id=m.mentioned_user_id
   WHERE m.created_at>now()-interval '2 hours' AND m.mentioned_user_id<>s.author_id
     AND (s.visibility='public' OR EXISTS
       (SELECT 1 FROM public.story_recipients r WHERE r.story_id=s.id AND r.recipient_id=t.user_id))
  UNION ALL
  SELECT 'gallery-mention',
         md5('gcm:'||g.source||':'||g.comment_id::text||':'||g.person_id::text)::uuid,
         'gallery_mention',c.media_id,NULL::uuid,t.id,t.fcm_token,g.created_at
    FROM public.gallery_comment_mentions g
    JOIN public.community_gallery_comments c ON c.id=g.comment_id AND g.source='community'
    JOIN public.community_gallery_media m ON m.id=c.media_id
    JOIN public.android_fcm_tokens t ON t.user_id=g.person_id
   WHERE g.created_at>now()-interval '2 hours' AND g.person_id<>c.author_id
     AND m.publication_state='published' AND m.private_owner_id IS NULL
     AND (m.visibility='members' OR EXISTS
       (SELECT 1 FROM public.gallery_media_viewers v WHERE v.media_id=m.id AND v.user_id=t.user_id))
  UNION ALL
  SELECT 'gallery-tag',
         md5('gmt:'||g.source||':'||g.media_id::text||':'||g.person_id::text)::uuid,
         'gallery_mention',m.id,NULL::uuid,t.id,t.fcm_token,g.created_at
    FROM public.gallery_media_people g
    JOIN public.community_gallery_media m ON m.id=g.media_id AND g.source='community'
    JOIN public.android_fcm_tokens t ON t.user_id=g.person_id
   WHERE g.created_at>now()-interval '2 hours' AND g.person_id<>m.owner_id
     AND m.publication_state='published' AND m.private_owner_id IS NULL
     AND (m.visibility='members' OR EXISTS
       (SELECT 1 FROM public.gallery_media_viewers v WHERE v.media_id=m.id AND v.user_id=t.user_id))
  UNION ALL
  -- Likes target only the owner; no content excerpts are sent to FCM.
  SELECT 'post-like',md5('pl:'||l.post_id::text||':'||l.user_id::text)::uuid,
         'like',p.id,NULL::uuid,t.id,t.fcm_token,l.created_at
    FROM public.post_likes l JOIN public.posts p ON p.id=l.post_id
    JOIN public.android_fcm_tokens t ON t.user_id=p.author_id AND t.user_id<>l.user_id
   WHERE l.created_at>now()-interval '2 hours'
  UNION ALL
  SELECT 'story-like',md5('sl:'||l.story_id::text||':'||l.user_id::text)::uuid,
         'story_like',s.id,NULL::uuid,t.id,t.fcm_token,l.created_at
    FROM public.story_likes l JOIN public.stories s ON s.id=l.story_id
    JOIN public.android_fcm_tokens t ON t.user_id=s.author_id AND t.user_id<>l.user_id
   WHERE l.created_at>now()-interval '2 hours'
  UNION ALL
  SELECT 'gallery-like',md5('gl:'||l.media_id::text||':'||l.user_id::text)::uuid,
         'gallery_like',m.id,NULL::uuid,t.id,t.fcm_token,l.created_at
    FROM public.community_gallery_media_likes l
    JOIN public.community_gallery_media m ON m.id=l.media_id
    JOIN public.android_fcm_tokens t ON t.user_id=m.owner_id AND t.user_id<>l.user_id
   WHERE l.created_at>now()-interval '2 hours' AND m.publication_state='published'
  UNION ALL
  -- Community letters are private. Only the actual recipient is notified.
  SELECT 'community-letter',l.id,'letter',l.id,NULL::uuid,
         t.id,t.fcm_token,l.created_at
    FROM public.community_letters l
    JOIN public.android_fcm_tokens t ON t.user_id=l.recipient_id AND t.user_id<>l.sender_id
   WHERE l.created_at>now()-interval '2 hours'
     AND NOT EXISTS (SELECT 1 FROM public.letter_event_notifications n
       WHERE n.letter_id=l.id AND n.recipient_id=t.user_id AND n.event_type='new_received')
  UNION ALL
  SELECT 'music-dedication',d.id,'dedication',d.id,NULL::uuid,
         t.id,t.fcm_token,d.created_at
    FROM public.music_dedications d
    JOIN public.android_fcm_tokens t ON t.user_id=d.recipient_id AND t.user_id<>d.sender_id
   WHERE d.created_at>now()-interval '2 hours'
  UNION ALL
  -- A closed Android app has no JS subscription. Only genuine call offers
  -- from conversation participants are candidates for high priority FCM.
  SELECT 'incoming-call',md5('cs:'||c.id::text)::uuid,'call',
         c.conversation_id,c.conversation_id,
         t.id,t.fcm_token,c.created_at
    FROM looply_migration.call_signal_events c
    JOIN public.conversation_participants cp ON cp.conversation_id=c.conversation_id
    JOIN public.android_fcm_tokens t ON t.user_id=cp.user_id AND t.user_id<>c.sender_id
   WHERE c.kind='signal' AND c.payload->>'type'='offer'
     AND c.created_at>now()-interval '90 seconds'
     AND (c.expires_at IS NULL OR c.expires_at>now())
$fcm$;
REVOKE ALL ON FUNCTION public.v20_android_fcm_activity_candidates() FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.v20_android_fcm_activity_candidates()
  TO looply_push_relay_limited;
