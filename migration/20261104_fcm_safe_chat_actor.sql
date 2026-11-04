-- Restrict sender identity lookup to the verified destination token.
CREATE OR REPLACE FUNCTION public.v36_fcm_safe_chat_actor(p_event_id uuid,p_token_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT m.sender_id
 FROM public.chat_notifications n
 JOIN public.android_fcm_tokens t ON t.id=p_token_id AND t.user_id=n.user_id
 JOIN public.chat_messages m ON m.id=n.message_id AND m.conversation_id=n.conversation_id
 WHERE n.id=p_event_id
 LIMIT 1
$f$;
REVOKE ALL ON FUNCTION public.v36_fcm_safe_chat_actor(uuid,uuid) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.v36_fcm_safe_chat_actor(uuid,uuid) TO looply_push_relay_limited;
