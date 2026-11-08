-- Snapshot of Neon production v46 RPCs for reproducible authorized chat browsing.
-- RLS-matched scope and JWT are checked within each function.

CREATE OR REPLACE FUNCTION public.v46_chat_mark_all_activities_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE actor uuid; changed integer;
 BEGIN
 actor:=public.looply_legacy_uid();IF actor IS NULL THEN RETURN 0;END IF;
 UPDATE public.chat_notifications SET read_at=pg_catalog.now()
 WHERE user_id=actor AND read_at IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed;
 END;$function$;
REVOKE ALL ON FUNCTION public.v46_chat_mark_all_activities_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_mark_all_activities_read() TO authenticated;

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

CREATE OR REPLACE FUNCTION public.v46_chat_media_items(p_conversation_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 40)
 RETURNS TABLE(message_id uuid, created_at timestamp with time zone, storage_path text, mime_type text, file_name text, byte_size bigint, expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT m.id,m.created_at,media.storage_path,media.mime_type,media.file_name,media.byte_size,m.expires_at
 FROM public.chat_media media
 JOIN public.chat_messages m ON m.id=media.message_id AND m.conversation_id=media.conversation_id
 WHERE media.conversation_id=p_conversation_id
 AND EXISTS(SELECT 1 FROM public.conversation_participants p
 WHERE p.conversation_id=media.conversation_id AND p.user_id=public.looply_legacy_uid())
 AND (p_before IS NULL OR m.created_at<p_before)
 AND (m.expires_at IS NULL OR m.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(m.conversation_id,m.id,m.created_at)
 ORDER BY m.created_at DESC,media.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),50);
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_media_items(p_conversation_id uuid, p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_media_items(p_conversation_id uuid, p_before timestamp with time zone, p_limit integer) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.v46_chat_notifications(p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, message_id uuid, kind text, preview text, created_at timestamp with time zone, read_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT note.id,note.conversation_id,note.message_id,note.kind,note.preview,note.created_at,note.read_at
 FROM public.chat_notifications note
 WHERE note.user_id=public.looply_legacy_uid() AND (p_before IS NULL OR note.created_at<p_before)
 ORDER BY note.created_at DESC,note.id DESC
 LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),50);
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_notifications(p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_notifications(p_before timestamp with time zone, p_limit integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_receipts(p_conversation_id uuid)
 RETURNS TABLE(user_id uuid, last_read_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT member.user_id,member.last_read_at FROM public.conversation_participants member
 WHERE member.conversation_id=p_conversation_id
 AND EXISTS(SELECT 1 FROM public.conversation_participants p
 WHERE p.conversation_id=member.conversation_id AND p.user_id=public.looply_legacy_uid())
 ORDER BY member.joined_at ASC LIMIT 100;
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_receipts(p_conversation_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_receipts(p_conversation_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 DECLARE actor uuid; name text;
 BEGIN
 actor:=public.looply_legacy_uid();name:=pg_catalog.btrim(COALESCE(p_subject,''));
 IF actor IS NULL OR char_length(name)<1 OR char_length(name)>120 THEN RETURN false; END IF;
 UPDATE public.conversations SET subject=name,updated_at=pg_catalog.now()
 WHERE id=p_conversation_id AND kind='group' AND created_by=actor
 AND EXISTS(SELECT 1 FROM public.conversation_participants p
 WHERE p.conversation_id=p_conversation_id AND p.user_id=actor);
 RETURN FOUND;
 END;$function$;
REVOKE ALL ON FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_rename_group(p_conversation_id uuid, p_subject text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_saved_items(p_conversation_id uuid, p_only_pinned boolean DEFAULT false, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 40)
 RETURNS TABLE(message_id uuid, body text, sender_id uuid, created_at timestamp with time zone, saved boolean, pinned boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT m.id,m.body,m.sender_id,m.created_at,f.saved_at IS NOT NULL,f.pinned_at IS NOT NULL
 FROM public.chat_message_flags f
 JOIN public.chat_messages m ON m.id=f.message_id AND m.conversation_id=f.conversation_id
 WHERE f.user_id=public.looply_legacy_uid()
 AND f.conversation_id=p_conversation_id
 AND EXISTS(SELECT 1 FROM public.conversation_participants p
 WHERE p.conversation_id=p_conversation_id AND p.user_id=f.user_id)
 AND (f.saved_at IS NOT NULL OR f.pinned_at IS NOT NULL)
 AND (COALESCE(p_only_pinned,false)=false OR f.pinned_at IS NOT NULL)
 AND (p_before IS NULL OR m.created_at<p_before)
 AND (m.expires_at IS NULL OR m.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(m.conversation_id,m.id,m.created_at)
 ORDER BY m.created_at DESC,m.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),50);
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_saved_items(p_conversation_id uuid, p_only_pinned boolean, p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_saved_items(p_conversation_id uuid, p_only_pinned boolean, p_before timestamp with time zone, p_limit integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_search(p_conversation_id uuid, p_query text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 40)
 RETURNS TABLE(message_id uuid, sender_id uuid, body text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT m.id,m.sender_id,m.body,m.created_at FROM public.chat_messages m
 WHERE m.conversation_id=p_conversation_id
 AND EXISTS(SELECT 1 FROM public.conversation_participants p
 WHERE p.conversation_id=m.conversation_id AND p.user_id=public.looply_legacy_uid())
 AND p_query IS NOT NULL AND char_length(pg_catalog.btrim(p_query)) BETWEEN 2 AND 100
 AND position(pg_catalog.lower(pg_catalog.btrim(p_query)) in pg_catalog.lower(m.body))>0
 AND (p_before IS NULL OR m.created_at<p_before)
 AND (m.expires_at IS NULL OR m.expires_at>pg_catalog.now())
 AND public.v44_chat_message_visible(m.conversation_id,m.id,m.created_at)
 ORDER BY m.created_at DESC,m.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),50);
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_search(p_conversation_id uuid, p_query text, p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_search(p_conversation_id uuid, p_query text, p_before timestamp with time zone, p_limit integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_unread_activity_count()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT LEAST(count(*)::integer,9999) FROM public.chat_notifications
 WHERE user_id=public.looply_legacy_uid() AND read_at IS NULL;
 $function$;
REVOKE ALL ON FUNCTION public.v46_chat_unread_activity_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_unread_activity_count() TO authenticated;
