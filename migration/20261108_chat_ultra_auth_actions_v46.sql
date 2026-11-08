-- Chat Ultra v46: authenticated group rename, unlimited per-user activity acknowledgement and privacy-scoped group read cursors.
CREATE OR REPLACE FUNCTION public.v46_chat_rename_group(p_conversation_id uuid,p_subject text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
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
END;$f$;

REVOKE ALL ON FUNCTION public.v46_chat_rename_group(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v46_chat_rename_group(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_mark_all_activity_seen() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE actor uuid; amount integer:=0;
BEGIN
 actor:=public.looply_legacy_uid();IF actor IS NULL THEN RETURN 0; END IF;
 UPDATE public.chat_notifications SET read_at=pg_catalog.now()
 WHERE user_id=actor AND read_at IS NULL;
 GET DIAGNOSTICS amount=ROW_COUNT;
 RETURN amount;
END;$f$;

REVOKE ALL ON FUNCTION public.v46_chat_mark_all_activity_seen() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v46_chat_mark_all_activity_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_message_receipts(p_conversation_id uuid,p_message_id uuid)
RETURNS TABLE(user_id uuid,username text,display_name text,last_read_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
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
$f$;

REVOKE ALL ON FUNCTION public.v46_chat_message_receipts(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v46_chat_message_receipts(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v46_chat_unread_activity_count() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
 WITH actor AS MATERIALIZED (SELECT public.looply_legacy_uid() AS id)
 SELECT COUNT(*)::integer FROM public.chat_notifications notifications CROSS JOIN actor
 WHERE actor.id IS NOT NULL AND notifications.user_id=actor.id AND notifications.read_at IS NULL;
$f$;
REVOKE ALL ON FUNCTION public.v46_chat_unread_activity_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_unread_activity_count() TO authenticated;
