-- Looply: scheduled delivery of community letters (additive; no historical rows rewritten).
-- Apply to the original Neon database (project looply-v3-migration) BEFORE deploying the Worker/UI.
BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 120),
  body text,
  is_protected boolean NOT NULL DEFAULT false,
  password_salt text,
  password_iv text,
  password_ciphertext text,
  password_hint text,
  deliver_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sending','delivered','canceled','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_letter_id uuid UNIQUE REFERENCES public.community_letters(id) ON DELETE SET NULL,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT scheduled_letters_distinct_members CHECK (sender_id <> recipient_id),
  CONSTRAINT scheduled_letters_content_shape CHECK (
    (NOT is_protected AND body IS NOT NULL AND length(btrim(body)) BETWEEN 1 AND 5000
      AND password_salt IS NULL AND password_iv IS NULL AND password_ciphertext IS NULL)
    OR (is_protected AND body IS NULL
      AND password_salt ~ '^[A-Za-z0-9_-]{22}$'
      AND password_iv ~ '^[A-Za-z0-9_-]{16}$'
      AND length(password_ciphertext) BETWEEN 22 AND 7000
      AND password_ciphertext ~ '^[A-Za-z0-9_-]+$')
  ),
  CONSTRAINT scheduled_letters_password_hint_length CHECK (password_hint IS NULL OR length(password_hint) <= 240),
  CONSTRAINT scheduled_letters_sender_request_key UNIQUE (sender_id,request_id)
);

-- A single identifier ensures idempotence across delivery worker retries.
ALTER TABLE public.community_letters
  ADD COLUMN IF NOT EXISTS scheduled_letter_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS community_letters_scheduled_letter_uidx
  ON public.community_letters(scheduled_letter_id) WHERE scheduled_letter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS scheduled_letters_due_idx
  ON public.scheduled_letters(deliver_at,next_attempt_at,id)
  WHERE status IN ('scheduled','failed');
CREATE INDEX IF NOT EXISTS scheduled_letters_sender_idx
  ON public.scheduled_letters(sender_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.scheduled_letter_delivery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheduled_letter_id uuid NOT NULL REFERENCES public.scheduled_letters(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('delivered','failed','canceled','rescheduled')),
  sqlstate text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_letter_events_idx
  ON public.scheduled_letter_delivery_events(scheduled_letter_id,created_at DESC);

-- RLS applies also to admin users: a scheduled letter belongs to its sender alone.
ALTER TABLE public.scheduled_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_letter_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scheduled_letters,public.scheduled_letter_delivery_events FROM PUBLIC,anonymous,authenticated;
GRANT SELECT ON public.scheduled_letters,public.scheduled_letter_delivery_events TO authenticated;
DROP POLICY IF EXISTS scheduled_sender_select ON public.scheduled_letters;
CREATE POLICY scheduled_sender_select ON public.scheduled_letters FOR SELECT TO authenticated
  USING (sender_id = (SELECT public.looply_legacy_uid()));
DROP POLICY IF EXISTS scheduled_event_sender_select ON public.scheduled_letter_delivery_events;
CREATE POLICY scheduled_event_sender_select ON public.scheduled_letter_delivery_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scheduled_letters sl
                WHERE sl.id = scheduled_letter_id
                  AND sl.sender_id = (SELECT public.looply_legacy_uid())));

-- The browser never supplies the authenticated sender: resolve from Neon JWT.
CREATE OR REPLACE FUNCTION public.v24_create_scheduled_letter(
 p_request_id uuid, p_recipient_id uuid, p_subject text, p_body text,
 p_is_protected boolean, p_password_salt text, p_password_iv text,
 p_password_ciphertext text, p_password_hint text, p_deliver_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_sender uuid := public.looply_legacy_uid(); v_id uuid;
BEGIN
 IF v_sender IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF p_request_id IS NULL OR p_deliver_at IS NULL OR p_deliver_at <= clock_timestamp()
   THEN RAISE EXCEPTION 'future_delivery_required'; END IF;
 INSERT INTO public.scheduled_letters
  (request_id,sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,
   password_ciphertext,password_hint,deliver_at)
 VALUES
  (p_request_id,v_sender,p_recipient_id,p_subject,p_body,coalesce(p_is_protected,false),
   p_password_salt,p_password_iv,p_password_ciphertext,p_password_hint,p_deliver_at)
 ON CONFLICT (sender_id,request_id) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN
   SELECT id INTO v_id FROM public.scheduled_letters
   WHERE sender_id=v_sender AND request_id=p_request_id;
 END IF;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.v24_update_scheduled_letter(
 p_id uuid, p_recipient_id uuid, p_subject text, p_body text,
 p_is_protected boolean, p_password_salt text, p_password_iv text,
 p_password_ciphertext text, p_password_hint text, p_deliver_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_sender uuid := public.looply_legacy_uid();
BEGIN
 IF v_sender IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF p_deliver_at IS NULL OR p_deliver_at <= clock_timestamp()
   THEN RAISE EXCEPTION 'future_delivery_required'; END IF;
 UPDATE public.scheduled_letters SET
  recipient_id=p_recipient_id,subject=p_subject,body=p_body,
  is_protected=coalesce(p_is_protected,false),
  password_salt=p_password_salt,password_iv=p_password_iv,
  password_ciphertext=p_password_ciphertext,password_hint=p_password_hint,
  deliver_at=p_deliver_at,status='scheduled',attempts=0,
  next_attempt_at=now(),last_error_code=NULL,updated_at=now()
 WHERE id=p_id AND sender_id=v_sender AND status IN ('scheduled','failed');
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.scheduled_letter_delivery_events(scheduled_letter_id,status)
 VALUES (p_id,'rescheduled');
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.v24_cancel_scheduled_letter(p_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE v_sender uuid := public.looply_legacy_uid();
BEGIN
 IF v_sender IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 UPDATE public.scheduled_letters
 SET status='canceled',updated_at=now()
 WHERE id=p_id AND sender_id=v_sender AND status IN ('scheduled','failed');
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO public.scheduled_letter_delivery_events(scheduled_letter_id,status)
 VALUES(p_id,'canceled');
 RETURN true;
END $$;

-- Executes in one PostgreSQL transaction. Row locks serialize cancel/edit/cron.
-- The INSERT and delivered status commit together; any INSERT error rolls back
-- its subtransaction, recording only a retryable failure and SQLSTATE.
CREATE OR REPLACE FUNCTION public.v24_dispatch_scheduled_letters(p_limit integer DEFAULT 50)
 RETURNS TABLE(processed integer, delivered integer, failed integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE r record; v_letter_id uuid; v_error text;
BEGIN
 processed:=0; delivered:=0; failed:=0;
 FOR r IN
   SELECT id FROM public.scheduled_letters
   WHERE status IN ('scheduled','failed')
     AND deliver_at <= now() AND next_attempt_at <= now()
   ORDER BY deliver_at,id
   LIMIT least(greatest(coalesce(p_limit,50),1),50)
   FOR UPDATE SKIP LOCKED
 LOOP
   processed:=processed+1;
   BEGIN
     v_letter_id:=NULL;
     UPDATE public.scheduled_letters SET status='sending',attempts=attempts+1,updated_at=now()
     WHERE id=r.id;
     INSERT INTO public.community_letters
       (sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,
        password_ciphertext,password_hint,attachments,scheduled_letter_id)
     SELECT sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,
            password_ciphertext,password_hint,'[]'::jsonb,id
     FROM public.scheduled_letters WHERE id=r.id
     ON CONFLICT DO NOTHING RETURNING id INTO v_letter_id;
     IF v_letter_id IS NULL THEN
       SELECT id INTO v_letter_id FROM public.community_letters
       WHERE scheduled_letter_id=r.id;
     END IF;
     IF v_letter_id IS NULL THEN RAISE EXCEPTION 'scheduled_letter_not_inserted'; END IF;
     UPDATE public.scheduled_letters SET
       status='delivered',delivered_at=now(),delivered_letter_id=v_letter_id,
       updated_at=now(),last_error_code=NULL
     WHERE id=r.id;
     INSERT INTO public.scheduled_letter_delivery_events(scheduled_letter_id,status)
     VALUES(r.id,'delivered');
     delivered:=delivered+1;
   EXCEPTION WHEN OTHERS THEN
     GET STACKED DIAGNOSTICS v_error = RETURNED_SQLSTATE;
     -- The UPDATE inside BEGIN was rolled back with the failed INSERT.
     -- Increment attempts here, outside the failed subtransaction.
     UPDATE public.scheduled_letters SET status='failed',
       attempts=attempts+1,last_error_code=v_error, updated_at=now(),
       next_attempt_at=now()+make_interval(mins=>least(60,(power(2,least(attempts+1,6)))::integer))
     WHERE id=r.id;
     INSERT INTO public.scheduled_letter_delivery_events(scheduled_letter_id,status,sqlstate)
     VALUES(r.id,'failed',v_error);
     failed:=failed+1;
   END;
 END LOOP;
 RETURN NEXT;
END $$;

-- No public invocation of SECURITY DEFINER mutation/dispatch endpoints.
REVOKE ALL ON FUNCTION public.v24_create_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v24_update_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v24_cancel_scheduled_letter(uuid) FROM PUBLIC,anonymous;
REVOKE ALL ON FUNCTION public.v24_dispatch_scheduled_letters(integer) FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.v24_create_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v24_update_scheduled_letter(uuid,uuid,text,text,boolean,text,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v24_cancel_scheduled_letter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v24_dispatch_scheduled_letters(integer) TO looply_push_relay_limited;

COMMENT ON FUNCTION public.v24_dispatch_scheduled_letters(integer)
 IS 'Called exclusively by limited Cloudflare FCM relay once per minute; atomic, idempotent delivery.';
COMMIT;