ALTER TABLE public.scheduled_letters
  ADD COLUMN IF NOT EXISTS seal text CHECK (seal IS NULL OR char_length(seal) BETWEEN 1 AND 64);

CREATE OR REPLACE FUNCTION public.v29_create_scheduled_letter(
  p_request_id uuid, p_recipient_id uuid, p_subject text, p_body text,
  p_is_protected boolean, p_password_salt text, p_password_iv text,
  p_password_ciphertext text, p_password_hint text, p_deliver_at timestamptz, p_seal text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE letter_id uuid;
BEGIN
  letter_id := public.v24_create_scheduled_letter(
    p_request_id,p_recipient_id,p_subject,p_body,p_is_protected,p_password_salt,
    p_password_iv,p_password_ciphertext,p_password_hint,p_deliver_at);
  UPDATE public.scheduled_letters SET seal=p_seal
    WHERE id=letter_id AND sender_id=public.looply_legacy_uid() AND status='scheduled' AND seal IS NULL;
  RETURN letter_id;
END;
$$;
REVOKE ALL ON FUNCTION public.v29_create_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v29_create_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v29_update_scheduled_letter(
  p_id uuid, p_recipient_id uuid, p_subject text, p_body text,
  p_is_protected boolean, p_password_salt text, p_password_iv text,
  p_password_ciphertext text, p_password_hint text, p_deliver_at timestamptz, p_seal text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NOT public.v24_update_scheduled_letter(
    p_id,p_recipient_id,p_subject,p_body,p_is_protected,p_password_salt,
    p_password_iv,p_password_ciphertext,p_password_hint,p_deliver_at) THEN
    RETURN false;
  END IF;
  UPDATE public.scheduled_letters SET seal=p_seal
    WHERE id=p_id AND sender_id=public.looply_legacy_uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.v29_update_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v29_update_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.looply_copy_scheduled_letter_seal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE scheduled_seal text;
BEGIN
  SELECT seal INTO scheduled_seal FROM public.scheduled_letters
  WHERE id=NEW.scheduled_letter_id AND sender_id=NEW.sender_id AND recipient_id=NEW.recipient_id;
  IF scheduled_seal IS NOT NULL THEN
    NEW.model_style := coalesce(NEW.model_style,'{}'::jsonb) || jsonb_build_object('seal',scheduled_seal);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.looply_copy_scheduled_letter_seal() FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE TRIGGER looply_copy_scheduled_letter_seal
  BEFORE INSERT ON public.community_letters FOR EACH ROW
  WHEN (NEW.scheduled_letter_id IS NOT NULL)
  EXECUTE FUNCTION public.looply_copy_scheduled_letter_seal();
