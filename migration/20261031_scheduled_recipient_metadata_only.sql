-- Metadata-only inbox. Never grant SELECT on scheduled_letters to recipients:
-- that table contains plaintext/ciphertext and must remain sender-scoped.
CREATE OR REPLACE FUNCTION public.v26_scheduled_recipient_inbox()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'sender_id',s.sender_id,'recipient_id',s.recipient_id,
   'deliver_at',s.deliver_at,'created_at',s.created_at,'status',s.status,
   'delivered_letter_id',CASE WHEN s.status='delivered' THEN s.delivered_letter_id ELSE NULL END
 ) ORDER BY s.created_at DESC),'[]'::jsonb)
 FROM public.scheduled_letters s
 WHERE s.recipient_id=(SELECT public.looply_legacy_uid())
   AND s.status IN ('scheduled','sending','failed','delivered')
   AND (SELECT public.looply_legacy_uid()) IS NOT NULL;
$body$;
REVOKE ALL ON FUNCTION public.v26_scheduled_recipient_inbox() FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v26_scheduled_recipient_inbox() TO authenticated;
