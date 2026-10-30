-- V19. Produce an authoritative notification for every NEW chat message.
-- Previously chat_messages had no AFTER INSERT trigger, so new messages
-- did not enter chat_notifications (and could not enter the FCM dispatch queue).
-- Do not backfill old messages or re-notify anyone about historical content.
CREATE OR REPLACE FUNCTION public.v19_queue_chat_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
BEGIN
  INSERT INTO public.chat_notifications
    (user_id,conversation_id,message_id,kind,preview,created_at)
  SELECT cp.user_id, NEW.conversation_id, NEW.id, 'message',
         'Nova mensagem no Looply', NEW.created_at
    FROM public.conversation_participants AS cp
   WHERE cp.conversation_id=NEW.conversation_id
     AND cp.user_id<>NEW.sender_id
  ON CONFLICT (user_id,message_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.v19_queue_chat_notifications() FROM PUBLIC, anonymous,authenticated;

CREATE TRIGGER looply_v19_chat_notification_on_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.v19_queue_chat_notifications();
