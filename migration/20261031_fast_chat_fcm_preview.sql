-- Immediate FCM is a server-side notification for a REAL, committed message.
-- The browser never supplies the notification's text or recipient.
CREATE OR REPLACE FUNCTION public.v27_fcm_authorize_chat_message(p_message_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
 SELECT m.id FROM public.chat_messages m
 WHERE m.id=p_message_id
   AND m.sender_id=(SELECT public.looply_legacy_uid())
   AND m.created_at > pg_catalog.now() - interval '90 seconds'
   AND EXISTS (SELECT 1 FROM public.chat_notifications n
     WHERE n.message_id=m.id AND n.user_id<>m.sender_id)
 LIMIT 1
$body$;

-- Only the exact intended token's chat notification can provide a preview.
-- This RPC is NOT available to normal authenticated clients.
CREATE OR REPLACE FUNCTION public.v27_fcm_safe_chat_preview(p_event_id uuid,p_token_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
 SELECT LEFT(regexp_replace(btrim(COALESCE(n.preview,'')),'[[:cntrl:]]+',' ','g'),120)
 FROM public.chat_notifications n
 JOIN public.android_fcm_tokens t ON t.id=p_token_id AND t.user_id=n.user_id
 WHERE n.id=p_event_id
 LIMIT 1
$body$;
REVOKE ALL ON FUNCTION public.v27_fcm_authorize_chat_message(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v27_fcm_safe_chat_preview(uuid,uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v27_fcm_authorize_chat_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v27_fcm_safe_chat_preview(uuid,uuid) TO looply_push_relay_limited;
