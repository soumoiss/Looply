-- Additive fast inbound ringing, sharing the existing, authenticated Neon-only
-- signaling records. No Supabase, no additional tables, no migration of users.
-- A single inbox query retrieves all direct-call offers for a signed-in user;
-- the client does not need one polling request per conversation.
CREATE OR REPLACE FUNCTION public.v3_call_signal_inbox(
  p_after bigint DEFAULT 0,
  p_from timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  conversation_id uuid,
  sender_id uuid,
  kind text,
  payload jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_legacy_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_after IS NULL OR p_after < 0 THEN
    RAISE EXCEPTION 'neon_signaling_auth_required' USING ERRCODE = '42501';
  END IF;
  SELECT l.legacy_user_id INTO v_legacy_user_id
  FROM looply_migration.verified_identity_links AS l
  WHERE l.neon_user_id = auth.uid();
  IF v_legacy_user_id IS NULL THEN
    RAISE EXCEPTION 'neon_signaling_identity_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.conversation_id, e.sender_id, e.kind, e.payload
  FROM looply_migration.call_signal_events AS e
  INNER JOIN public.conversation_participants AS cp
    ON cp.conversation_id = e.conversation_id
    AND cp.user_id = v_legacy_user_id
  INNER JOIN public.conversations AS c
    ON c.id = e.conversation_id
    AND c.kind = 'direct'
  WHERE e.sender_id <> v_legacy_user_id
    AND e.expires_at > clock_timestamp()
    AND e.id > p_after
    AND (p_from IS NULL OR e.created_at >= p_from)
    AND e.kind = 'signal'
    AND e.payload->>'type' IN ('offer','hangup','decline','failed')
  ORDER BY e.id ASC
  LIMIT 100;
END
$fn$;
REVOKE ALL ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) TO authenticated;
