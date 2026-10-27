-- Additive Neon-only fallback signaling for October 2026 Looply conversations.
-- Existing users, chats, profiles and media are not changed.
-- This table is deliberately outside the exposed public REST schema.
CREATE TABLE IF NOT EXISTS looply_migration.call_signal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('signal','ttt','invalidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + INTERVAL '2 minutes')
);
CREATE INDEX IF NOT EXISTS call_signal_events_room_cursor
  ON looply_migration.call_signal_events (conversation_id,id);
REVOKE ALL ON looply_migration.call_signal_events FROM PUBLIC;
REVOKE ALL ON looply_migration.call_signal_events FROM authenticated;

CREATE OR REPLACE FUNCTION public.v3_call_signal_send(
  p_conversation_id uuid, p_kind text, p_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE v_sender uuid; v_id bigint;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.v3_is_conversation_member(p_conversation_id)
  THEN RAISE EXCEPTION 'conversation_membership_required' USING ERRCODE='42501'; END IF;
  SELECT l.legacy_user_id INTO v_sender
    FROM looply_migration.verified_identity_links l
   WHERE l.neon_user_id=auth.uid();
  IF v_sender IS NULL
     OR p_kind NOT IN ('signal','ttt','invalidate')
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text)>12000
  THEN RAISE EXCEPTION 'invalid_call_signal' USING ERRCODE='22023'; END IF;
  IF p_kind='signal'
     AND COALESCE(p_payload->>'type','') NOT IN ('ring','offer','answer','ice','hangup','decline','failed')
  THEN RAISE EXCEPTION 'invalid_call_signal_type' USING ERRCODE='22023'; END IF;
  -- One sender may send dozens of ICE candidates, but not a flood of spam.
  IF (SELECT count(*) FROM looply_migration.call_signal_events e
        WHERE e.sender_id=v_sender AND e.created_at>clock_timestamp()-INTERVAL '1 second') >= 30
  THEN RAISE EXCEPTION 'call_signal_rate_limited' USING ERRCODE='22023'; END IF;
  INSERT INTO looply_migration.call_signal_events(conversation_id,sender_id,kind,payload)
  VALUES(p_conversation_id,v_sender,p_kind,p_payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v3_call_signal_list(
  p_conversation_id uuid, p_after bigint DEFAULT 0,
  p_from timestamptz DEFAULT NULL
) RETURNS TABLE(
  id bigint, sender_id uuid, kind text, payload jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE v_sender uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.v3_is_conversation_member(p_conversation_id)
  THEN RAISE EXCEPTION 'conversation_membership_required' USING ERRCODE='42501'; END IF;
  SELECT l.legacy_user_id INTO v_sender
    FROM looply_migration.verified_identity_links l
   WHERE l.neon_user_id=auth.uid();
  IF v_sender IS NULL OR p_after IS NULL OR p_after<0
  THEN RAISE EXCEPTION 'invalid_call_cursor' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT e.id,e.sender_id,e.kind,e.payload
    FROM looply_migration.call_signal_events e
   WHERE e.conversation_id=p_conversation_id
     AND e.sender_id<>v_sender
     AND e.expires_at>clock_timestamp()
     AND e.id>p_after
     AND (p_from IS NULL OR e.created_at >= p_from)
   ORDER BY e.id ASC LIMIT 80;
END;
$fn$;
REVOKE ALL ON FUNCTION public.v3_call_signal_send(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v3_call_signal_list(uuid,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_call_signal_send(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v3_call_signal_list(uuid,bigint,timestamptz) TO authenticated;
