-- One authenticated incoming-call inbox instead of one polling request per chat room.
-- Returns signals only for direct conversations that the current Neon principal belongs to.
CREATE OR REPLACE FUNCTION public.v3_call_signal_inbox(
  p_after bigint DEFAULT 0,
  p_from timestamptz DEFAULT NULL
) RETURNS TABLE (
  id bigint, conversation_id uuid, sender_id uuid, kind text, payload jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE v_self uuid;
BEGIN
  IF auth.uid() IS NULL OR p_after IS NULL OR p_after < 0
  THEN RAISE EXCEPTION 'authenticated_call_inbox_required' USING ERRCODE = '42501'; END IF;
  SELECT l.legacy_user_id INTO v_self
    FROM looply_migration.verified_identity_links l
   WHERE l.neon_user_id = auth.uid();
  IF v_self IS NULL
  THEN RAISE EXCEPTION 'linked_identity_required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT e.id, e.conversation_id, e.sender_id, e.kind, e.payload
    FROM looply_migration.call_signal_events e
    JOIN public.conversation_participants m
      ON m.conversation_id = e.conversation_id AND m.user_id = v_self
    JOIN public.conversations c
      ON c.id = e.conversation_id AND c.kind = 'direct'
   WHERE e.sender_id <> v_self
     AND e.kind = 'signal'
     AND e.expires_at > clock_timestamp()
     AND e.id > p_after
     AND (p_from IS NULL OR e.created_at >= p_from)
   ORDER BY e.id ASC
   LIMIT 80;
END;
$fn$;
REVOKE ALL ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_call_signal_inbox(bigint,timestamptz) TO authenticated;
