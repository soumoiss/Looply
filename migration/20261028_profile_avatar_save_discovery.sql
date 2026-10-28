-- All authenticated Looply members may discover other users' public profile fields.
-- This does NOT alter private media, messages, letters or unauthenticated access.
DROP POLICY IF EXISTS looply_v4_read_member_profiles ON public.profiles;
DROP POLICY IF EXISTS looply_v9_member_discovery ON public.profiles;
CREATE POLICY looply_v9_member_discovery ON public.profiles
 FOR SELECT TO authenticated USING (public.looply_legacy_uid() IS NOT NULL);

-- Avatar-only save does not touch name, bio, playlist URL or legacy visibility.
-- Compare-and-swap protects an avatar edited concurrently in another session.
CREATE OR REPLACE FUNCTION public.v9_save_self_avatar(
 p_previous_avatar text,
 p_next_avatar text
) RETURNS TABLE(id uuid, avatar_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE actor uuid := public.looply_legacy_uid();
BEGIN
 IF actor IS NULL THEN
  RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
 END IF;
 IF p_next_avatar IS NULL
    OR p_next_avatar !~ ('^avatars/' || actor::text || '/[a-f0-9-]{36}[.](jpg|jpeg|png|webp)$')
 THEN
  RAISE EXCEPTION 'Invalid avatar path' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 UPDATE public.profiles AS profile
 SET avatar_path=p_next_avatar, updated_at=pg_catalog.now()
 WHERE profile.id=actor AND profile.avatar_path IS NOT DISTINCT FROM p_previous_avatar
 RETURNING profile.id,profile.avatar_path;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Avatar changed in another session' USING ERRCODE='40001';
 END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.v9_save_self_avatar(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v9_save_self_avatar(text,text) TO authenticated;
