-- Sender-only hidden archive. Deleting from the sender's list never erases
-- a recipient's received letter, private ciphertext or historical records.
CREATE TABLE IF NOT EXISTS public.looply_sent_letter_hidden (
 sender_id uuid NOT NULL REFERENCES public.profiles(id),
 letter_kind text NOT NULL CHECK(letter_kind IN ('community','scheduled')),
 letter_id uuid NOT NULL, hidden_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sender_id,letter_kind,letter_id)
);
ALTER TABLE public.looply_sent_letter_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY looply_hidden_sent_own_read ON public.looply_sent_letter_hidden
 FOR SELECT TO authenticated USING(sender_id=(SELECT public.looply_legacy_uid()));
REVOKE ALL ON public.looply_sent_letter_hidden FROM PUBLIC,anonymous;
GRANT SELECT ON public.looply_sent_letter_hidden TO authenticated;
CREATE OR REPLACE FUNCTION public.v26_hide_sent_letter(p_kind text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
DECLARE actor uuid:=(SELECT public.looply_legacy_uid()); current_status text; canceled boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'login_required' USING ERRCODE='42501'; END IF;
 IF p_kind='community' THEN
   IF NOT EXISTS(SELECT 1 FROM public.community_letters WHERE id=p_id AND sender_id=actor)
     THEN RAISE EXCEPTION 'letter_not_found' USING ERRCODE='42501'; END IF;
 ELSIF p_kind='scheduled' THEN
   SELECT status INTO current_status FROM public.scheduled_letters WHERE id=p_id AND sender_id=actor FOR UPDATE;
   IF current_status IS NULL THEN RAISE EXCEPTION 'scheduled_letter_not_found' USING ERRCODE='42501'; END IF;
   IF current_status IN ('scheduled','failed') THEN
     SELECT public.v24_cancel_scheduled_letter(p_id) INTO canceled;
     IF canceled IS DISTINCT FROM true THEN RAISE EXCEPTION 'cannot_cancel_pending_letter' USING ERRCODE='22023'; END IF;
   ELSIF current_status='sending' THEN
     RAISE EXCEPTION 'letter_currently_sending' USING ERRCODE='22023';
   END IF;
 ELSE
   RAISE EXCEPTION 'invalid_letter_kind' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.looply_sent_letter_hidden(sender_id,letter_kind,letter_id)
 VALUES(actor,p_kind,p_id) ON CONFLICT(sender_id,letter_kind,letter_id) DO NOTHING;
 RETURN true;
END;$body$;
CREATE OR REPLACE FUNCTION public.v26_hidden_sent_ids()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',letter_kind,'id',letter_id)),'[]'::jsonb)
 FROM public.looply_sent_letter_hidden WHERE sender_id=(SELECT public.looply_legacy_uid())
 AND (SELECT public.looply_legacy_uid()) IS NOT NULL;
$body$;
REVOKE ALL ON FUNCTION public.v26_hide_sent_letter(text,uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v26_hidden_sent_ids() FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v26_hide_sent_letter(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v26_hidden_sent_ids() TO authenticated;
