-- Music permissions hardening (2026-10-28). No data is deleted or rewritten.
-- Existing Neon Auth -> legacy UUID and admin verification are reused.
-- A dedicated SECURITY DEFINER function permits only the sender to update
-- the note of their own dedication; other columns and other recipients stay untouched.
CREATE OR REPLACE FUNCTION public.v6_update_own_music_dedication(p_dedication_id uuid, p_note text)
RETURNS TABLE(id uuid, dedication_note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  actor uuid := (SELECT public.looply_legacy_uid());
BEGIN
  IF actor IS NULL OR p_dedication_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NULL OR char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Invalid dedication note' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    UPDATE public.music_dedications AS d
       SET dedication_note = p_note
     WHERE d.id = p_dedication_id AND d.sender_id = actor
     RETURNING d.id, d.dedication_note;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dedication not found or edit denied' USING ERRCODE = '42501';
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.v6_update_own_music_dedication(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v6_update_own_music_dedication(uuid,text) TO authenticated;

-- Protect playlist_url on EVERY update path: profile form, generic REST PATCH,
-- and v3_save_self_profile RPC. Admin status comes from verified Neon Auth.
CREATE OR REPLACE FUNCTION public.v6_guard_playlist_url_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF NEW.playlist_url IS DISTINCT FROM OLD.playlist_url
     AND NOT COALESCE((SELECT public.v3_self_is_admin()),false) THEN
    RAISE EXCEPTION 'Only administrators may change playlist URL' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DO $triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'v6_protect_profile_playlist_url'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER v6_protect_profile_playlist_url
      BEFORE UPDATE OF playlist_url ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.v6_guard_playlist_url_update();
  END IF;
END;
$triggers$;
