-- Looply Android: per-device FCM token registration under verified Neon identity.
-- Tokens are never readable through public Data API tables.
CREATE TABLE IF NOT EXISTS public.android_fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  fcm_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT android_fcm_tokens_user_device_unique UNIQUE (user_id,device_id),
  CONSTRAINT android_fcm_tokens_token_limit CHECK (length(fcm_token) BETWEEN 25 AND 4096)
);
ALTER TABLE public.android_fcm_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.android_fcm_tokens FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.v16_register_android_fcm_token(
  p_device_id uuid, p_fcm_token text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE owner_id uuid := public.looply_legacy_uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_device_id IS NULL OR p_fcm_token IS NULL OR
    length(p_fcm_token) NOT BETWEEN 25 AND 4096 OR
    p_fcm_token !~ '^[A-Za-z0-9._:~\\-]+$'
  THEN RAISE EXCEPTION 'Invalid device token' USING ERRCODE='22023'; END IF;
  -- A token can move between the previous and current signed-in user on a
  -- shared Android phone. No token is returned or exposed to the frontend.
  UPDATE public.android_fcm_tokens
    SET user_id=owner_id,device_id=p_device_id,updated_at=now()
    WHERE fcm_token=p_fcm_token;
  IF NOT FOUND THEN
    INSERT INTO public.android_fcm_tokens(user_id,device_id,fcm_token)
    VALUES(owner_id,p_device_id,p_fcm_token)
    ON CONFLICT (user_id,device_id) DO UPDATE
      SET fcm_token=EXCLUDED.fcm_token, updated_at=now();
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.v16_register_android_fcm_token(uuid,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v16_register_android_fcm_token(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v16_unregister_android_fcm_token(
  p_device_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE owner_id uuid := public.looply_legacy_uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  DELETE FROM public.android_fcm_tokens WHERE user_id=owner_id AND device_id=p_device_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.v16_unregister_android_fcm_token(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v16_unregister_android_fcm_token(uuid) TO authenticated;
