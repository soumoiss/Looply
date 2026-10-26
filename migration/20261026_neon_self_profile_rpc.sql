-- Owner-scoped profile save for Neon Data API. No Supabase dependency.
-- A signed Neon session is required; no browser-supplied owner UUID is trusted.
-- SECURITY DEFINER avoids fragile direct PATCH grants while retaining strict ownership.
CREATE OR REPLACE FUNCTION public.v3_save_self_profile(
  p_previous_avatar text,
  p_next_avatar text,
  p_replace_avatar boolean,
  p_display_name text,
  p_bio text,
  p_profile_visibility text,
  p_playlist_url text
)
RETURNS TABLE (
  id uuid,
  avatar_path text,
  display_name text,
  bio text,
  profile_visibility text,
  playlist_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := (SELECT public.looply_legacy_uid());
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Neon authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_replace_avatar AND p_next_avatar IS NOT NULL
     AND p_next_avatar !~ ('^avatars/' || actor::text || '/[a-f0-9-]{36}[.](jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid owner-scoped avatar path' USING ERRCODE = '22023';
  END IF;

  IF p_display_name IS NULL OR char_length(p_display_name) NOT BETWEEN 1 AND 80
     OR p_bio IS NULL OR char_length(p_bio) > 280
     OR p_profile_visibility NOT IN ('public', 'members', 'private')
     OR (p_playlist_url IS NOT NULL AND p_playlist_url !~
       '^https://(www[.]|music[.])?youtube[.]com/playlist[?]list=[A-Za-z0-9_-]{1,100}(&[A-Za-z0-9_=&%-]*)?$') THEN
    RAISE EXCEPTION 'Invalid profile fields' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    UPDATE public.profiles AS profile
    SET display_name = p_display_name,
        bio = p_bio,
        profile_visibility = p_profile_visibility,
        playlist_url = p_playlist_url,
        avatar_path = CASE WHEN p_replace_avatar THEN p_next_avatar ELSE profile.avatar_path END,
        updated_at = pg_catalog.now()
    WHERE profile.id = actor
      AND profile.avatar_path IS NOT DISTINCT FROM p_previous_avatar
    RETURNING profile.id, profile.avatar_path, profile.display_name,
              profile.bio, profile.profile_visibility, profile.playlist_url;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile changed or is not owned by caller' USING ERRCODE = '40001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.v3_save_self_profile(text,text,boolean,text,text,text,text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v3_save_self_profile(text,text,boolean,text,text,text,text) TO authenticated;
