-- V28: One admin entry notification per genuine browser/app session.
-- No presence heartbeat, no 3-minute timer, no change to letters or call pushes.
-- resource_id for admin_online is a session UUID, never a private resource.
CREATE UNIQUE INDEX IF NOT EXISTS looply_v28_admin_online_session_once
  ON public.looply_admin_activity_notifications(actor_id,resource_id)
  WHERE kind='admin_online' AND resource_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.v28_register_app_open(p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_actor uuid; v_admin uuid;
BEGIN
  v_actor:=public.looply_legacy_uid();
  IF v_actor IS NULL THEN RETURN false; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'invalid_app_session' USING ERRCODE='22023'; END IF;
  v_admin:=public.v23_peixinho_admin_id();
  IF v_admin IS NULL OR v_actor=v_admin THEN RETURN true; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_actor::text));
  -- A new session can only send one notification, regardless of page navigation,
  -- page visibility/focus changes, parallel requests or stale cached frontend.
  -- The short secondary guard prevents noisy multi-tab launches.
  IF EXISTS (
    SELECT 1 FROM public.looply_admin_activity_notifications n
    WHERE n.actor_id=v_actor AND n.kind='admin_online'
      AND n.created_at>clock_timestamp()-interval '60 seconds'
  ) THEN RETURN true; END IF;
  INSERT INTO public.looply_admin_activity_notifications
    (admin_id,actor_id,kind,resource_id,resource_label)
  VALUES (v_admin,v_actor,'admin_online',p_session_id,'Acessou o aplicativo')
  ON CONFLICT DO NOTHING;
  RETURN true;
END
$fn$;
REVOKE ALL ON FUNCTION public.v28_register_app_open(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v28_register_app_open(uuid) TO authenticated;

-- Disable obsolete endpoint immediately: older cached clients must not create
-- a new admin event whenever Android focus or page visibility changes.
CREATE OR REPLACE FUNCTION public.v23_register_app_open()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT (public.looply_legacy_uid() IS NOT NULL);
$fn$;
REVOKE ALL ON FUNCTION public.v23_register_app_open() FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v23_register_app_open() TO authenticated;
