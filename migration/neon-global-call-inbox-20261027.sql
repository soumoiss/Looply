-- Additive, least-privilege inbox for rapidly detecting calls on EVERY Looply page.
-- No Supabase dependency, no alteration of existing conversations or accounts.
-- Only signals sent to authenticated participants of DIRECT conversations are returned.
CREATE OR REPLACE FUNCTION public.v3_call_signal_inbox(
  p_after bigint DEFAULT 0,
  p_from timestamptz DEFAULT NULL
) RETURNS TABLE(
  id bigint,
  conversation_id uuid,
  sender_id uuid,
  kind text,
  payload jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE v_user uuid;
BEGIN
  IF auth.uid() IS NULL OR p_after IS NULL OR p_after < 0
  THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  SELECT l.legacy_user_id INTO v_user
    FROM looply_migration.verified_identity_links l
   WHERE l.neon_user_id = auth.uid();
  IF v_user IS NULL
  THEN RAISE EXCEPTION 'identity_link_required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT e.id, e.conversation_id, e.sender_id, e.kind, e.payload
      FROM looply_migration.call_signal_events e
      JOIN public.conversation_participants p
        ON p.conversation_id = e.conversation_id AND p.user_id = v_user
      JOIN public.conversations c ON c.id = e.conversation_id AND c.kind = 'direct'
     WHERE e.sender_id <> v_user
       AND e.kind = 'signal'
       AND e.payload->>'type' IN ('offer','hangup','decline','failed')
       AND e.expires_at > clock_timestamp()
       AND e.id > p_after
       AND e.created_at >= GREATEST(COALESCE(p_from, clock_timestamp() - INTERVAL '35 seconds'),
                                    clock_timestamp() - INTERVAL '35 seconds')
     ORDER BY e.id
     LIMIT 80;
END;
$fn$;
REVOKE ALL ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) TO authenticated;
