-- Verified production RPC definitions; saved for reproducible deploy.
-- All functions determine authenticated actor from looply_legacy_uid().
CREATE OR REPLACE FUNCTION public.v46_chat_mark_all_activity_seen()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid; amount integer:=0;
BEGIN
 actor:=public.looply_legacy_uid();IF actor IS NULL THEN RETURN 0; END IF;
 UPDATE public.chat_notifications SET read_at=pg_catalog.now()
 WHERE user_id=actor AND read_at IS NULL;
 GET DIAGNOSTICS amount=ROW_COUNT;
 RETURN amount;
END;$function$;
REVOKE ALL ON FUNCTION public.v46_chat_mark_all_activity_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_mark_all_activity_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_message_receipts(p_conversation_id uuid, p_message_id uuid)
 RETURNS TABLE(user_id uuid, username text, display_name text, last_read_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id)
SELECT member.user_id,p.username,p.display_name,member.last_read_at
FROM public.conversation_participants AS member
JOIN public.profiles AS p ON p.id=member.user_id
CROSS JOIN actor
WHERE actor.id IS NOT NULL AND member.conversation_id=p_conversation_id
 AND EXISTS(SELECT 1 FROM public.conversation_participants own
  WHERE own.conversation_id=p_conversation_id AND own.user_id=actor.id)
 AND EXISTS(SELECT 1 FROM public.chat_messages m
  WHERE m.id=p_message_id AND m.conversation_id=p_conversation_id
    AND m.sender_id=actor.id AND (m.expires_at IS NULL OR m.expires_at>pg_catalog.now()))
 AND member.user_id<>actor.id ORDER BY p.username LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.v46_chat_message_receipts(p_conversation_id uuid, p_message_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_message_receipts(p_conversation_id uuid, p_message_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid; clean text;
BEGIN
  actor:=public.looply_legacy_uid();clean:=pg_catalog.btrim(p_subject);
  IF actor IS NULL OR clean IS NULL OR pg_catalog.char_length(clean)<1 OR pg_catalog.char_length(clean)>120
    OR clean~'[\x00-\x1f\x7f]' THEN RETURN false; END IF;
  UPDATE public.conversations AS room SET subject=clean,updated_at=pg_catalog.now()
  WHERE room.id=p_conversation_id AND room.kind='group' AND room.created_by=actor
    AND EXISTS(SELECT 1 FROM public.conversation_participants AS member
      WHERE member.user_id=actor AND member.conversation_id=room.id);
  RETURN FOUND;
END;$function$;
REVOKE ALL ON FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_unread_activity_count()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id)
 SELECT COUNT(*)::integer FROM public.chat_notifications notifications CROSS JOIN actor
 WHERE actor.id IS NOT NULL AND notifications.user_id=actor.id AND notifications.read_at IS NULL;
$function$;
REVOKE ALL ON FUNCTION public.v46_chat_unread_activity_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_unread_activity_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.v47_chat_media(p_conversation_id uuid, p_media_kind text DEFAULT 'all'::text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51)
 RETURNS TABLE(message_id uuid, media_id uuid, file_name text, mime_type text, storage_path text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
 SELECT msg.id,media.id,media.file_name,media.mime_type,media.storage_path,msg.created_at
 FROM public.chat_media media JOIN public.chat_messages msg ON msg.id=media.message_id
 CROSS JOIN actor
 WHERE actor.id IS NOT NULL AND msg.conversation_id=p_conversation_id
 AND media.conversation_id=msg.conversation_id
 AND (p_before_at IS NULL OR (msg.created_at,media.id)<(p_before_at,p_before_id))
 AND (p_media_kind='all' OR
   (p_media_kind='photo' AND media.mime_type LIKE 'image/%') OR
   (p_media_kind='video' AND media.mime_type LIKE 'video/%') OR
   (p_media_kind='audio' AND media.mime_type LIKE 'audio/%') OR
   (p_media_kind='file' AND media.mime_type NOT LIKE 'image/%'
    AND media.mime_type NOT LIKE 'audio/%' AND media.mime_type NOT LIKE 'video/%'))
 AND (msg.expires_at IS NULL OR msg.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(msg.conversation_id,msg.id,msg.created_at)
 ORDER BY msg.created_at DESC,media.id DESC LIMIT LEAST(GREATEST(p_limit,1),51);
$function$;
REVOKE ALL ON FUNCTION public.v47_chat_media(p_conversation_id uuid, p_media_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v47_chat_media(p_conversation_id uuid, p_media_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v47_chat_saved(p_conversation_id uuid, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51)
 RETURNS TABLE(message_id uuid, sender_id uuid, body text, saved_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH actor AS MATERIALIZED(SELECT public.looply_legacy_uid() AS id)
 SELECT msg.id,msg.sender_id,msg.body,flags.saved_at,msg.created_at
 FROM public.chat_message_flags flags
 JOIN public.chat_messages msg ON msg.id=flags.message_id
 CROSS JOIN actor
 WHERE actor.id IS NOT NULL AND flags.user_id=actor.id
 AND flags.conversation_id=p_conversation_id AND flags.saved_at IS NOT NULL
 AND msg.conversation_id=p_conversation_id
 AND (p_before_at IS NULL OR (flags.saved_at,msg.id)<(p_before_at,p_before_id))
 AND (msg.expires_at IS NULL OR msg.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(msg.conversation_id,msg.id,msg.created_at)
 ORDER BY flags.saved_at DESC,msg.id DESC LIMIT LEAST(GREATEST(p_limit,1),51);
$function$;
REVOKE ALL ON FUNCTION public.v47_chat_saved(p_conversation_id uuid, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v47_chat_saved(p_conversation_id uuid, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v47_chat_search(p_conversation_id uuid, p_query text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 51, p_sender_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(message_id uuid, sender_id uuid, body text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id),
      q AS MATERIALIZED (SELECT pg_catalog.btrim(p_query) AS term)
 SELECT msg.id,msg.sender_id,msg.body,msg.created_at
 FROM public.chat_messages msg CROSS JOIN actor CROSS JOIN q
 WHERE actor.id IS NOT NULL AND q.term<>'' AND pg_catalog.length(q.term)<=120
 AND msg.conversation_id=p_conversation_id
 AND (p_sender_id IS NULL OR msg.sender_id=p_sender_id)
 AND (p_before_at IS NULL OR (msg.created_at,msg.id)<(p_before_at,p_before_id))
 AND pg_catalog.strpos(pg_catalog.lower(msg.body),pg_catalog.lower(q.term))>0
 AND (msg.expires_at IS NULL OR msg.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(msg.conversation_id,msg.id,msg.created_at)
 ORDER BY msg.created_at DESC,msg.id DESC LIMIT LEAST(GREATEST(p_limit,1),51);
$function$;
REVOKE ALL ON FUNCTION public.v47_chat_search(p_conversation_id uuid, p_query text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer, p_sender_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v47_chat_search(p_conversation_id uuid, p_query text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer, p_sender_id uuid) TO authenticated;
