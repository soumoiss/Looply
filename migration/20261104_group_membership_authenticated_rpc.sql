-- Authenticated group membership management. Unrestricted client INSERT/DELETE
-- on conversation_participants are intentionally disabled by RLS.
-- Creator-only, existing-group-only; no client-supplied actor IDs.
CREATE OR REPLACE FUNCTION public.v36_add_group_member(p_conversation_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $group$
DECLARE actor uuid := public.looply_legacy_uid();
BEGIN
  IF auth.uid() IS NULL OR actor IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
      JOIN public.conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=actor
      WHERE c.id=p_conversation_id AND c.kind='group' AND c.created_by=actor) THEN
    RAISE EXCEPTION 'group_admin_required' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=p_user_id) THEN
    RETURN true; -- Safe idempotent retried action.
  END IF;
  IF (SELECT COUNT(*) FROM public.conversation_participants WHERE conversation_id=p_conversation_id) >= 50 THEN
    RAISE EXCEPTION 'group_full' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.conversation_participants(conversation_id,user_id) VALUES(p_conversation_id,p_user_id);
  RETURN true;
END $group$;
REVOKE ALL ON FUNCTION public.v36_add_group_member(uuid,uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v36_add_group_member(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v36_remove_group_member(p_conversation_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $group$
DECLARE actor uuid := public.looply_legacy_uid();
BEGIN
  IF auth.uid() IS NULL OR actor IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
      JOIN public.conversation_participants cp ON cp.conversation_id=c.id AND cp.user_id=actor
      WHERE c.id=p_conversation_id AND c.kind='group' AND c.created_by=actor AND c.created_by<>p_user_id) THEN
    RAISE EXCEPTION 'group_admin_required' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=p_user_id;
  RETURN true;
END $group$;
REVOKE ALL ON FUNCTION public.v36_remove_group_member(uuid,uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v36_remove_group_member(uuid,uuid) TO authenticated;
