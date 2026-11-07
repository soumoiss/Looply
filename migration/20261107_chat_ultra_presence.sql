-- Authenticated, privacy-scoped online presence for Looply Chat Ultra.
-- The security-definer functions derive the actor from Neon JWT; no client-set user IDs.
CREATE TABLE IF NOT EXISTS public.chat_presence_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.chat_presence_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_presence_sessions FROM PUBLIC;
REVOKE ALL ON public.chat_presence_sessions FROM authenticated;

CREATE OR REPLACE FUNCTION public.v37_chat_presence_heartbeat()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid;
BEGIN
  actor := public.looply_legacy_uid();
  IF actor IS NULL THEN RETURN false; END IF;
  INSERT INTO public.chat_presence_sessions(user_id,last_seen_at)
  VALUES(actor,pg_catalog.now())
  ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.v37_chat_presence_visible(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, last_seen_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  WITH actor AS MATERIALIZED (
    SELECT public.looply_legacy_uid() AS id
  )
  SELECT presence.user_id,presence.last_seen_at
  FROM public.chat_presence_sessions presence
  CROSS JOIN actor
  WHERE actor.id IS NOT NULL
    AND presence.user_id<>actor.id
    AND presence.user_id=ANY(p_user_ids)
    AND presence.last_seen_at>pg_catalog.now()-interval '85 seconds'
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants myself
      JOIN public.conversation_participants other
        ON other.conversation_id=myself.conversation_id
      WHERE myself.user_id=actor.id AND other.user_id=presence.user_id
    )
  ORDER BY presence.last_seen_at DESC
  LIMIT 120;
$fn$;
REVOKE ALL ON FUNCTION public.v37_chat_presence_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v37_chat_presence_visible(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v37_chat_presence_heartbeat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.v37_chat_presence_visible(uuid[]) TO authenticated;