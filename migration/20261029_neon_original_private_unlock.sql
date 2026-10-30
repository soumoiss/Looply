-- Recover the password-protected original archive without storing secret text or passwords in Git.
-- The one-time recovery inserts encrypted material separately, after operator validation.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS looply_private;
REVOKE ALL ON SCHEMA looply_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS looply_private.archived_card_secrets (
  card_id uuid PRIMARY KEY REFERENCES public.archived_cards(id) ON DELETE CASCADE,
  encrypted_body bytea NOT NULL,
  source_sha256 text,
  restored_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS looply_private.archived_card_unlock_attempts (
  card_id uuid NOT NULL REFERENCES public.archived_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY(card_id,user_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA looply_private FROM PUBLIC,authenticated;
ALTER TABLE looply_private.archived_card_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE looply_private.archived_card_unlock_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.v13_unlock_archived_card(p_card_id uuid, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog
AS $func$
DECLARE
  v_actor uuid;
  v_encrypted bytea;
  v_body text;
  v_attempts integer;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF p_card_id IS NULL OR p_password IS NULL OR length(p_password) < 1 OR length(p_password) > 256 THEN
    RAISE EXCEPTION 'invalid_card_unlock' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.archived_cards card
    WHERE card.id=p_card_id AND card.is_protected
      AND (
        EXISTS (
          SELECT 1 FROM looply_migration.verified_identity_links identity_link
          WHERE identity_link.legacy_user_id=card.recipient_id
            AND identity_link.neon_user_id=v_actor
        )
        OR public.v3_self_is_admin()
      )
  ) THEN
    RAISE EXCEPTION 'card_unavailable' USING ERRCODE='42501';
  END IF;
  SELECT secret.encrypted_body INTO v_encrypted
  FROM looply_private.archived_card_secrets secret WHERE secret.card_id=p_card_id;
  IF v_encrypted IS NULL THEN RETURN jsonb_build_object('error','protected_archive_not_restored'); END IF;
  INSERT INTO looply_private.archived_card_unlock_attempts(card_id,user_id,window_started_at,attempts)
  VALUES(p_card_id,v_actor,clock_timestamp(),1)
  ON CONFLICT(card_id,user_id) DO UPDATE SET
    attempts=CASE WHEN excluded.window_started_at-looply_private.archived_card_unlock_attempts.window_started_at >= interval '15 minutes'
                  THEN 1 ELSE looply_private.archived_card_unlock_attempts.attempts+1 END,
    window_started_at=CASE WHEN excluded.window_started_at-looply_private.archived_card_unlock_attempts.window_started_at >= interval '15 minutes'
                           THEN excluded.window_started_at ELSE looply_private.archived_card_unlock_attempts.window_started_at END
  RETURNING attempts INTO v_attempts;
  IF v_attempts > 8 THEN RETURN jsonb_build_object('error','too_many_unlock_attempts'); END IF;
  BEGIN
    v_body:=public.pgp_sym_decrypt(v_encrypted,p_password);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error','incorrect_password');
  END;
  DELETE FROM looply_private.archived_card_unlock_attempts
  WHERE card_id=p_card_id AND user_id=v_actor;
  RETURN jsonb_build_object('body',v_body);
END
$func$;
REVOKE ALL ON FUNCTION public.v13_unlock_archived_card(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v13_unlock_archived_card(uuid,text) TO authenticated;
