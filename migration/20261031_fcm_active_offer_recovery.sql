-- Recover an active offer after launching a killed Android app from a
-- high-priority FCM call. Only the intended, authenticated recipient can read.
CREATE OR REPLACE FUNCTION public.v23_fcm_pending_incoming_offer(p_conversation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT e.payload || jsonb_build_object('senderId',e.sender_id,
                   'conversationId',e.conversation_id)
   FROM looply_migration.call_signal_events e
   JOIN public.conversations c ON c.id=e.conversation_id AND c.kind='direct'
  WHERE auth.uid() IS NOT NULL
    AND e.conversation_id=p_conversation_id
    AND public.v3_is_conversation_member(p_conversation_id)
    AND e.sender_id<>public.looply_legacy_uid()
    AND e.kind='signal' AND e.payload->>'type'='offer'
    AND e.payload->>'mode' IN ('audio','video')
    AND e.payload->'description'->>'type'='offer'
    AND e.created_at>clock_timestamp()-interval '35 seconds'
    AND e.expires_at>clock_timestamp()
    AND NOT EXISTS(
      SELECT 1 FROM looply_migration.call_signal_events ended
       WHERE ended.conversation_id=e.conversation_id AND ended.id>e.id
       AND ended.payload->>'type' IN ('answer','hangup','decline','failed')
    )
 ORDER BY e.id DESC LIMIT 1
$fn$;
REVOKE ALL ON FUNCTION public.v23_fcm_pending_incoming_offer(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v23_fcm_pending_incoming_offer(uuid) TO authenticated;
