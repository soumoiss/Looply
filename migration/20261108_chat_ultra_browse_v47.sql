-- Authorized, keyset-paginated views for message search, attachments, and saved messages.
-- RPCs never return rows from a conversation that the actor cannot currently access.
CREATE OR REPLACE FUNCTION public.v47_chat_search(
 p_conversation_id uuid,p_query text,p_before_at timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 51,p_sender_id uuid DEFAULT NULL)
RETURNS TABLE(message_id uuid,sender_id uuid,body text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
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
$fn$;
CREATE OR REPLACE FUNCTION public.v47_chat_media(
 p_conversation_id uuid,p_media_kind text DEFAULT 'all',p_before_at timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 51)
RETURNS TABLE(message_id uuid,media_id uuid,file_name text,mime_type text,storage_path text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
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
$fn$;
CREATE OR REPLACE FUNCTION public.v47_chat_saved(
 p_conversation_id uuid,p_before_at timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 51)
RETURNS TABLE(message_id uuid,sender_id uuid,body text,saved_at timestamptz,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
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
$fn$;
REVOKE ALL ON FUNCTION public.v47_chat_search(uuid,text,timestamptz,uuid,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v47_chat_media(uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v47_chat_saved(uuid,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v47_chat_search(uuid,text,timestamptz,uuid,integer,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v47_chat_media(uuid,text,timestamptz,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v47_chat_saved(uuid,timestamptz,uuid,integer) TO authenticated;
