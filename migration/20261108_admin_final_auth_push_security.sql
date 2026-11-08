-- Looply 2026-11-08. Códigos de falha de login provenientes do cliente não são evidência autenticada.
-- Login rejection reports are explicitly marked as client-reported; sessions from Neon Auth are authoritative.
CREATE TABLE IF NOT EXISTS public.looply_admin_login_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 username text NOT NULL CHECK(length(username) BETWEEN 3 AND 30),
 outcome text NOT NULL CHECK(outcome='failed_client_report'),
 error_code text NOT NULL CHECK(error_code IN ('invalid_credentials','service_unavailable','unknown')),
 source text NOT NULL DEFAULT 'web_client',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS looply_admin_login_attempts_recent_idx ON public.looply_admin_login_attempts(created_at DESC);

ALTER TABLE public.looply_admin_login_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.looply_admin_login_attempts FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.v48_record_failed_login(p_username text,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE user_name text:=lower(btrim(coalesce(p_username,''))); code text:=coalesce(p_error_code,'unknown');
BEGIN
 IF user_name !~ '^[a-z0-9_]{3,30}$' THEN RETURN false; END IF;
 IF code NOT IN ('invalid_credentials','service_unavailable') THEN code:='unknown'; END IF;
 -- Throttle untrusted reports; they are not presented as server-verified failures.
 IF (SELECT count(*) FROM public.looply_admin_login_attempts
     WHERE username=user_name AND created_at>now()-interval '1 hour') >= 30 THEN RETURN false; END IF;
 INSERT INTO public.looply_admin_login_attempts(username,outcome,error_code)
 VALUES(user_name,'failed_client_report',code);
 RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_record_failed_login(text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.v48_record_failed_login(text,text) TO anonymous, authenticated;

CREATE TABLE IF NOT EXISTS public.looply_admin_ip_blocks(
 network cidr PRIMARY KEY,
 reason text NOT NULL DEFAULT '',
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz
);

ALTER TABLE public.looply_admin_ip_blocks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.looply_admin_ip_blocks FROM PUBLIC, anonymous, authenticated;

CREATE TABLE IF NOT EXISTS public.looply_admin_push_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 target_user_id uuid REFERENCES public.profiles(id),
 recipient_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.looply_admin_push_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.looply_admin_push_messages FROM PUBLIC, anonymous, authenticated;

DO $fn$
DECLARE constraint_expr text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO constraint_expr
 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_kind_check';
 IF constraint_expr IS NOT NULL AND position('admin_broadcast' in constraint_expr)=0 THEN
  ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
  EXECUTE format('ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK ((%s) OR kind IN (%L,%L))',
    constraint_expr,'admin_broadcast','story_view');
 END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.v48_admin_final_actions(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; item_id uuid; v_network cidr; v_reason text; v_count integer:=0; v_title text; v_body text; v_target uuid; result jsonb; v_offset integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501'; END IF;
 actor:=public.looply_legacy_uid();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND lower(username)='peixinho')
 THEN RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501'; END IF;
 v_offset:=least(10000,greatest(0,coalesce((p_payload->>'offset')::integer,0)));
 CASE p_action
 WHEN 'login_attempts_list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result FROM (
   SELECT id,username,outcome,error_code,created_at,'client_report'::text AS origin FROM public.looply_admin_login_attempts
   UNION ALL
   SELECT s.id,p.username,'authenticated_session'::text,'verified'::text,s."createdAt",'neon_auth'::text
   FROM neon_auth.session s
   JOIN looply_migration.verified_identity_links l ON l.neon_user_id=s."userId"
   JOIN public.profiles p ON p.id=l.legacy_user_id
   ORDER BY created_at DESC LIMIT 200 OFFSET v_offset
  ) q;
 WHEN 'ip_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('network',i.network::text,'reason',i.reason,
   'created_at',i.created_at,'expires_at',i.expires_at) ORDER BY i.created_at DESC),'[]'::jsonb)
  INTO result FROM public.looply_admin_ip_blocks i;
 WHEN 'ip_add' THEN
  BEGIN v_network:=(p_payload->>'network')::cidr;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_ip_or_cidr' USING ERRCODE='22023'; END;
  v_reason:=left(btrim(coalesce(p_payload->>'reason','')),240);
  IF v_network IS NULL THEN RAISE EXCEPTION 'invalid_ip_or_cidr' USING ERRCODE='22023'; END IF;
  INSERT INTO public.looply_admin_ip_blocks(network,reason,created_by)
   VALUES(v_network,v_reason,actor)
   ON CONFLICT(network) DO UPDATE SET reason=excluded.reason,created_by=excluded.created_by,
    created_at=now(),expires_at=null;
  result:=jsonb_build_object('network',v_network::text,'blocked',true);
 WHEN 'ip_remove' THEN
  BEGIN v_network:=(p_payload->>'network')::cidr;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_ip_or_cidr' USING ERRCODE='22023'; END;
  DELETE FROM public.looply_admin_ip_blocks WHERE network=v_network;
  IF NOT FOUND THEN RAISE EXCEPTION 'block_not_found' USING ERRCODE='22023'; END IF;
  result:=jsonb_build_object('network',v_network::text,'blocked',false);
 WHEN 'push_create' THEN
  v_title:=btrim(coalesce(p_payload->>'title',''));
  v_body:=btrim(coalesce(p_payload->>'body',''));
  IF length(v_title) NOT BETWEEN 1 AND 120 OR length(v_body) NOT BETWEEN 1 AND 1000
  THEN RAISE EXCEPTION 'push_content_invalid' USING ERRCODE='22023'; END IF;
  IF nullif(p_payload->>'targetUserId','') IS NOT NULL THEN
   v_target:=(p_payload->>'targetUserId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_target)
   THEN RAISE EXCEPTION 'push_target_not_found' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.looply_admin_push_messages(title,body,created_by,target_user_id)
   VALUES(v_title,v_body,actor,v_target) RETURNING id INTO item_id;
  INSERT INTO public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
   SELECT p.id,actor,'admin_broadcast',item_id,item_id,left(v_title||' — '||v_body,180)
   FROM public.profiles p WHERE (v_target IS NULL OR p.id=v_target) AND p.id<>actor
   ON CONFLICT(recipient_id,kind,event_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE public.looply_admin_push_messages SET recipient_count=v_count WHERE id=item_id;
  result:=jsonb_build_object('id',item_id,'recipients',v_count,'created',true);
 WHEN 'push_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',m.id,'title',m.title,'recipient_count',m.recipient_count,'created_at',m.created_at)
   ORDER BY m.created_at DESC),'[]'::jsonb) INTO result
   FROM (SELECT * FROM public.looply_admin_push_messages ORDER BY created_at DESC LIMIT 200 OFFSET v_offset) m;
 WHEN 'limits_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'table',tbl.relname,'constraint',co.conname,'rule',pg_get_constraintdef(co.oid))
   ORDER BY tbl.relname,co.conname),'[]'::jsonb) INTO result
  FROM pg_constraint co JOIN pg_class tbl ON tbl.oid=co.conrelid
   JOIN pg_namespace ns ON ns.oid=tbl.relnamespace
  WHERE ns.nspname='public' AND tbl.relname IN
   ('community_letters','chat_messages','chat_media','posts','sticker_catalog','looply_admin_word_filter')
   AND co.contype='c';
 ELSE RAISE EXCEPTION 'unsupported_final_admin_action' USING ERRCODE='22023';
 END CASE;
 INSERT INTO public.looply_admin_audit_events(actor_id,action,resource_type,resource_id,purpose,metadata)
 VALUES(actor,left('final_'||p_action,100),'admin_panel',item_id,
  'Operação verificada no painel administrativo Looply',jsonb_build_object('action',p_action,'target',v_target));
 RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_admin_final_actions(text,jsonb) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.v48_admin_final_actions(text,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
