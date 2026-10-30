-- The original text is not inferred from corrupted ciphertext. The ADM must
-- submit the replacement/original body and password in one authorized RPC.
DROP FUNCTION IF EXISTS public.v13_admin_change_archived_card_password(uuid,text,text);

CREATE FUNCTION public.v13_admin_change_archived_card_password(
  p_card_id uuid,
  p_new_password text,
  p_new_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_card_id IS NULL OR length(coalesce(p_new_password,'')) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'invalid_password_change_request' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_new_body,'')) NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'explicit_archive_body_required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.archived_cards WHERE id=p_card_id AND is_protected=true) THEN
    RETURN jsonb_build_object('error','card_unavailable');
  END IF;
  PERFORM 1 FROM looply_private.archived_card_secrets WHERE card_id=p_card_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','protected_archive_not_restored'); END IF;
  UPDATE looply_private.archived_card_secrets
  SET encrypted_body=public.pgp_sym_encrypt(p_new_body,p_new_password,'cipher-algo=aes256, compress-algo=1'),
      source_sha256=encode(public.digest(convert_to(p_new_body,'UTF8'),'sha256'),'hex'),
      restored_at=clock_timestamp()
  WHERE card_id=p_card_id;
  DELETE FROM looply_private.archived_card_unlock_attempts WHERE card_id=p_card_id;
  RETURN jsonb_build_object('updated',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.v13_admin_change_archived_card_password(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.v13_admin_change_archived_card_password(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.v13_admin_change_archived_card_password(uuid,text,text) TO authenticated;
