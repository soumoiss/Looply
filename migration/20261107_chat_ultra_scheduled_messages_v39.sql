-- Looply Chat Ultra 3.0, server-side scheduled messages, independent
-- of the device/WebView. The existing Cloudflare FCM worker runs each minute.
-- Idempotency: scheduled row ID equals the eventual chat_messages ID.
CREATE TABLE IF NOT EXISTS public.chat_scheduled_messages (
 id uuid PRIMARY KEY,
 requester_id uuid NOT NULL REFERENCES public.profiles(id),
 conversation_id uuid NOT NULL REFERENCES public.conversations(id),
 reply_to uuid NULL REFERENCES public.chat_messages(id) ON DELETE SET NULL,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),
 deliver_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled'
   CHECK(status IN ('scheduled','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 sent_at timestamptz,
 sent_message_id uuid NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE SET NULL,
 last_error_code text
);
CREATE INDEX IF NOT EXISTS chat_scheduled_due_idx
 ON public.chat_scheduled_messages(deliver_at,next_attempt_at,id)
 WHERE status IN ('scheduled','failed');
CREATE INDEX IF NOT EXISTS chat_scheduled_owner_idx
 ON public.chat_scheduled_messages(requester_id,conversation_id,created_at DESC);
ALTER TABLE public.chat_scheduled_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_scheduled_messages FROM PUBLIC;
REVOKE ALL ON public.chat_scheduled_messages FROM authenticated;
REVOKE ALL ON public.chat_scheduled_messages FROM looply_push_relay_limited;

CREATE OR REPLACE FUNCTION public.v39_schedule_chat_message(
  p_request_id uuid,p_conversation_id uuid,p_body text,
  p_deliver_at timestamptz,p_reply_to uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $func$
DECLARE actor uuid; saved uuid;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL OR p_request_id IS NULL OR p_conversation_id IS NULL OR
    p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 5000 OR
    p_deliver_at IS NULL OR p_deliver_at<pg_catalog.now()+interval '1 minute'
    OR p_deliver_at>pg_catalog.now()+interval '90 days'
 THEN RETURN NULL; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.conversation_participants cp
   WHERE cp.conversation_id=p_conversation_id AND cp.user_id=actor
 ) THEN RETURN NULL; END IF;
 IF p_reply_to IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.chat_messages m
   WHERE m.id=p_reply_to AND m.conversation_id=p_conversation_id
 ) THEN RETURN NULL; END IF;
 INSERT INTO public.chat_scheduled_messages
  (id,requester_id,conversation_id,body,deliver_at,reply_to)
 VALUES (p_request_id,actor,p_conversation_id,p_body,p_deliver_at,p_reply_to)
 ON CONFLICT (id) DO NOTHING;
 SELECT id INTO saved FROM public.chat_scheduled_messages
  WHERE id=p_request_id AND requester_id=actor
    AND conversation_id=p_conversation_id AND body=p_body
    AND deliver_at=p_deliver_at;
 RETURN saved;
END;
$func$;

CREATE OR REPLACE FUNCTION public.v39_cancel_chat_schedule(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $func$
DECLARE actor uuid; changed integer;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL OR p_id IS NULL THEN RETURN false; END IF;
 UPDATE public.chat_scheduled_messages s
 SET status='cancelled',updated_at=pg_catalog.now()
 WHERE s.id=p_id AND s.requester_id=actor
   AND s.status IN ('scheduled','failed') AND s.deliver_at>pg_catalog.now();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed>0;
END;
$func$;

CREATE OR REPLACE FUNCTION public.v39_list_chat_schedules(p_conversation_id uuid)
RETURNS TABLE(id uuid,body text,deliver_at timestamptz,
  status text,sent_message_id uuid,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $func$
 SELECT s.id,s.body,s.deliver_at,s.status,s.sent_message_id,s.created_at
 FROM public.chat_scheduled_messages s
 WHERE s.requester_id=public.looply_legacy_uid()
   AND s.conversation_id=p_conversation_id
   AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.user_id=public.looply_legacy_uid()
      AND cp.conversation_id=p_conversation_id
   )
 ORDER BY s.created_at DESC LIMIT 70;
$func$;

CREATE OR REPLACE FUNCTION public.v39_dispatch_scheduled_chat(p_limit integer DEFAULT 50)
RETURNS TABLE(processed integer,sent integer,failed integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $func$
DECLARE r record; claim uuid; error_code text;
BEGIN
 processed:=0;sent:=0;failed:=0;
 FOR r IN
   SELECT id,requester_id,conversation_id FROM public.chat_scheduled_messages
   WHERE status IN ('scheduled','failed')
     AND deliver_at<=pg_catalog.now() AND next_attempt_at<=pg_catalog.now()
   ORDER BY deliver_at,id
   LIMIT least(greatest(coalesce(p_limit,50),1),50)
   FOR UPDATE SKIP LOCKED
 LOOP
   processed:=processed+1;
   IF NOT EXISTS (
     SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id=r.conversation_id AND cp.user_id=r.requester_id
   ) THEN
     UPDATE public.chat_scheduled_messages
     SET status='cancelled',updated_at=pg_catalog.now(),
       last_error_code='membership_revoked'
     WHERE id=r.id;
     CONTINUE;
   END IF;
   BEGIN
     UPDATE public.chat_scheduled_messages
     SET status='sending',updated_at=pg_catalog.now(),attempts=attempts+1
     WHERE id=r.id;
     INSERT INTO public.chat_messages
       (id,conversation_id,sender_id,body,reply_to)
     SELECT id,conversation_id,requester_id,body,reply_to
       FROM public.chat_scheduled_messages WHERE id=r.id
     ON CONFLICT (id) DO NOTHING
     RETURNING id INTO claim;
     IF claim IS NULL THEN
       SELECT m.id INTO claim FROM public.chat_messages m
       JOIN public.chat_scheduled_messages s ON s.id=m.id
       WHERE s.id=r.id AND m.conversation_id=s.conversation_id
         AND m.sender_id=s.requester_id AND m.body=s.body;
     END IF;
     IF claim IS NULL THEN RAISE EXCEPTION 'chat_schedule_delivery_not_confirmed'; END IF;
     UPDATE public.chat_scheduled_messages
     SET status='sent',updated_at=pg_catalog.now(),sent_at=pg_catalog.now(),
       sent_message_id=claim,last_error_code=NULL
     WHERE id=r.id;
     sent:=sent+1;
   EXCEPTION WHEN OTHERS THEN
     GET STACKED DIAGNOSTICS error_code=RETURNED_SQLSTATE;
     UPDATE public.chat_scheduled_messages
     SET status='failed',attempts=attempts+1,updated_at=pg_catalog.now(),
       last_error_code=error_code,
       next_attempt_at=pg_catalog.now()+
         pg_catalog.make_interval(mins=>least(60,(power(2,least(attempts+1,6)))::integer))
     WHERE id=r.id;
     failed:=failed+1;
   END;
 END LOOP;
 RETURN NEXT;
END;
$func$;
REVOKE ALL ON FUNCTION public.v39_schedule_chat_message(uuid,uuid,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v39_cancel_chat_schedule(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v39_list_chat_schedules(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v39_dispatch_scheduled_chat(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v39_schedule_chat_message(uuid,uuid,text,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v39_cancel_chat_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v39_list_chat_schedules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v39_dispatch_scheduled_chat(integer) TO looply_push_relay_limited;