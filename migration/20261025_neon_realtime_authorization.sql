-- Applied to Neon PG17 (main), 2026-10-25. Repeatable; no dependency on Neon Realtime.
-- Data API identity derives from Auth JWT. Never trust a browser-provided user_id.
CREATE OR REPLACE FUNCTION public.v3_is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
 SELECT auth.uid() IS NOT NULL AND p_conversation_id IS NOT NULL
 AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    JOIN looply_migration.verified_identity_links links
      ON links.legacy_user_id = cp.user_id
    WHERE cp.conversation_id = p_conversation_id
      AND links.neon_user_id = auth.uid()
 );
$$;
REVOKE ALL ON FUNCTION public.v3_is_conversation_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_is_conversation_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v3_list_my_conversations()
RETURNS TABLE(conversation_id uuid, kind text, subject text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
 SELECT c.id, c.kind, c.subject
 FROM public.conversations AS c
 JOIN public.conversation_participants cp ON cp.conversation_id = c.id
 JOIN looply_migration.verified_identity_links links ON links.legacy_user_id = cp.user_id
 WHERE auth.uid() IS NOT NULL AND links.neon_user_id = auth.uid()
 ORDER BY c.updated_at DESC LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.v3_list_my_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v3_list_my_conversations() TO authenticated;
