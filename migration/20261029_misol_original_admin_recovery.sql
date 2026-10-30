-- One-record original-letter recovery: admin-authorized explicit text replacement.
-- No passwords or letter text are committed. Legacy cipher is archived before replacement.
-- When password mode is disabled, the card stays private to its recipient and admin.
CREATE TABLE IF NOT EXISTS looply_private.archived_card_recovery_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.archived_cards(id) ON DELETE RESTRICT,
  previous_encrypted_body bytea,
  previous_public_body text,
  previous_source_sha256 text,
  previous_restored_at timestamptz,
  previous_is_protected boolean NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  change_kind text NOT NULL DEFAULT 'explicit_admin_recovery',
  CHECK (previous_encrypted_body IS NOT NULL OR previous_public_body IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS looply_private.archived_card_recovery_integrity (
  card_id uuid PRIMARY KEY REFERENCES public.archived_cards(id) ON DELETE RESTRICT,
  source_sha256 text NOT NULL,
  is_protected boolean NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON looply_private.archived_card_recovery_history, looply_private.archived_card_recovery_integrity FROM PUBLIC, authenticated;

ALTER TABLE looply_private.archived_card_recovery_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE looply_private.archived_card_recovery_integrity ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.v14_admin_recover_archived_card(
  p_card_id uuid, p_new_body text, p_use_password boolean,
  p_new_password text, p_confirm_replace boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog
AS $func$
DECLARE
  v_actor uuid;
  v_old_cipher bytea;
  v_old_sha text;
  v_old_at timestamptz;
  v_plain text;
  v_old_protected boolean;
  v_new_cipher bytea;
  v_sha text;
  v_verified text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  -- Recovery is deliberately scoped to MiSol's one documented original card.
  IF p_card_id IS DISTINCT FROM '98df71c4-cf50-42fe-98d2-357d12633356'::uuid THEN
    RETURN jsonb_build_object('error','recovery_scope_restricted');
  END IF;
  IF p_confirm_replace IS DISTINCT FROM true OR p_use_password IS NULL
     OR p_new_body IS NULL OR length(p_new_body) NOT BETWEEN 1 AND 100000
     OR btrim(p_new_body) = '' THEN
    RETURN jsonb_build_object('error','invalid_recovery_input');
  END IF;
  IF p_use_password AND length(coalesce(p_new_password,'')) NOT BETWEEN 7 AND 256 THEN
    RETURN jsonb_build_object('error','invalid_recovery_password');
  END IF;
  IF NOT p_use_password AND length(coalesce(p_new_password,'')) <> 0 THEN
    RETURN jsonb_build_object('error','unexpected_password');
  END IF;
  SELECT body, is_protected INTO v_plain, v_old_protected
  FROM public.archived_cards
  WHERE id=p_card_id AND original_file='Misolcartaprivada1.txt'
    AND is_private=true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','card_unavailable'); END IF;
  SELECT encrypted_body, source_sha256, restored_at
    INTO v_old_cipher, v_old_sha, v_old_at
  FROM looply_private.archived_card_secrets WHERE card_id=p_card_id FOR UPDATE;
  IF v_old_cipher IS NULL AND v_plain IS NULL THEN
    -- Never silently create a letter if the original has no recoverable record.
    RETURN jsonb_build_object('error','original_record_missing');
  END IF;
  v_sha := encode(public.digest(convert_to(p_new_body,'UTF8'),'sha256'),'hex');
  IF p_use_password THEN
    v_new_cipher := public.pgp_sym_encrypt(
      p_new_body, p_new_password, 'cipher-algo=aes256, compress-algo=1'
    );
    IF public.pgp_sym_decrypt(v_new_cipher,p_new_password) IS DISTINCT FROM p_new_body THEN
      RAISE EXCEPTION 'cipher_verification_failed';
    END IF;
  END IF;
  -- Preserve the previous ciphertext and public-body state BEFORE any replacement.
  INSERT INTO looply_private.archived_card_recovery_history (
    card_id, previous_encrypted_body, previous_public_body,
    previous_source_sha256, previous_restored_at, previous_is_protected,
    changed_by
  ) VALUES (
    p_card_id, v_old_cipher, v_plain, v_old_sha, v_old_at,
    v_old_protected, v_actor
  );
  UPDATE public.archived_cards
    SET is_protected=p_use_password,
        body=CASE WHEN p_use_password THEN NULL ELSE p_new_body END
    WHERE id=p_card_id;
  IF p_use_password THEN
    INSERT INTO looply_private.archived_card_secrets (
      card_id, encrypted_body, source_sha256, restored_at
    ) VALUES (p_card_id,v_new_cipher,v_sha,clock_timestamp())
    ON CONFLICT (card_id) DO UPDATE
      SET encrypted_body=EXCLUDED.encrypted_body,
          source_sha256=EXCLUDED.source_sha256,
          restored_at=EXCLUDED.restored_at;
    SELECT public.pgp_sym_decrypt(encrypted_body,p_new_password)
      INTO v_verified
    FROM looply_private.archived_card_secrets WHERE card_id=p_card_id;
  ELSE
    DELETE FROM looply_private.archived_card_secrets WHERE card_id=p_card_id;
    SELECT body INTO v_verified FROM public.archived_cards WHERE id=p_card_id;
  END IF;
  IF v_verified IS DISTINCT FROM p_new_body THEN
    RAISE EXCEPTION 'content_verification_failed';
  END IF;
  INSERT INTO looply_private.archived_card_recovery_integrity (
    card_id,source_sha256,is_protected,changed_by,changed_at
  ) VALUES (p_card_id,v_sha,p_use_password,v_actor,clock_timestamp())
  ON CONFLICT (card_id) DO UPDATE
    SET source_sha256=EXCLUDED.source_sha256,
        is_protected=EXCLUDED.is_protected,
        changed_by=EXCLUDED.changed_by,
        changed_at=EXCLUDED.changed_at;
  DELETE FROM looply_private.archived_card_unlock_attempts WHERE card_id=p_card_id;
  RETURN jsonb_build_object(
    'updated',true,'verified',true,'is_protected',p_use_password,
    'source_sha256',v_sha
  );
END
$func$;

REVOKE ALL ON FUNCTION public.v14_admin_recover_archived_card(uuid,text,boolean,text,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v14_admin_recover_archived_card(uuid,text,boolean,text,boolean) TO authenticated;
