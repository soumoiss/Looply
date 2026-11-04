-- Authenticated, participant-scoped chat reports (never publicly readable).
CREATE TABLE IF NOT EXISTS public.chat_conversation_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_conversation_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.chat_conversation_reports TO authenticated;
CREATE POLICY looply_chat_reports_insert ON public.chat_conversation_reports
 FOR INSERT TO authenticated WITH CHECK (
   reporter_id=public.looply_legacy_uid()
   AND public.v3_is_conversation_participant(conversation_id)
 );
CREATE POLICY looply_chat_reports_read_self ON public.chat_conversation_reports
 FOR SELECT TO authenticated USING (reporter_id=public.looply_legacy_uid());
