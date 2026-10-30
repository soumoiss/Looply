-- Scoped FCM dispatcher. Its database role may read only eligible event rows
-- and device tokens, never modify application content.
CREATE TABLE IF NOT EXISTS public.android_fcm_deliveries (
  source text NOT NULL,
  event_id uuid NOT NULL,
  token_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source,event_id,token_id)
);
ALTER TABLE public.android_fcm_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.android_fcm_deliveries FROM PUBLIC, anonymous, authenticated;
GRANT USAGE ON SCHEMA public TO looply_push_dispatcher;
GRANT SELECT ON public.android_fcm_tokens,public.notifications,public.chat_notifications,public.letter_event_notifications TO looply_push_dispatcher;
GRANT SELECT,INSERT,UPDATE ON public.android_fcm_deliveries TO looply_push_dispatcher;

CREATE POLICY looply_push_dispatcher_tokens ON public.android_fcm_tokens
FOR SELECT TO looply_push_dispatcher USING (true);
CREATE POLICY looply_push_dispatcher_notifications ON public.notifications
FOR SELECT TO looply_push_dispatcher USING (true);
CREATE POLICY looply_push_dispatcher_chat ON public.chat_notifications
FOR SELECT TO looply_push_dispatcher USING (true);
CREATE POLICY looply_push_dispatcher_letters ON public.letter_event_notifications
FOR SELECT TO looply_push_dispatcher USING (true);
CREATE POLICY looply_push_dispatcher_delivery_read ON public.android_fcm_deliveries
FOR SELECT TO looply_push_dispatcher USING (true);
CREATE POLICY looply_push_dispatcher_delivery_insert ON public.android_fcm_deliveries
FOR INSERT TO looply_push_dispatcher WITH CHECK (true);
CREATE POLICY looply_push_dispatcher_delivery_update ON public.android_fcm_deliveries
FOR UPDATE TO looply_push_dispatcher USING (true) WITH CHECK (true);
