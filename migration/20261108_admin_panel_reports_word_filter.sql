-- Looply · Painel ADM — complementos reais e idempotentes.
-- Aplicar DEPOIS de 20261104_chat_conversation_reports.sql,
-- 20261029_neon_admin_restoration.sql e
-- 20261105_admin_letter_access_log_story_views.sql.
-- Não recria a tabela de logs privados nem altera triggers de notificações.

ALTER TABLE public.chat_conversation_reports
  ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='looply_chat_report_resolution_check') THEN
    ALTER TABLE public.chat_conversation_reports
      ADD CONSTRAINT looply_chat_report_resolution_check
      CHECK (resolution IN ('open','resolved','ignored'));
  END IF;
END
$block$;

DROP POLICY IF EXISTS looply_chat_reports_admin_read ON public.chat_conversation_reports;
CREATE POLICY looply_chat_reports_admin_read ON public.chat_conversation_reports
  FOR SELECT TO authenticated
  USING (public.v3_self_is_admin() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=public.looply_legacy_uid() AND lower(p.username)='peixinho'
  ));

CREATE TABLE IF NOT EXISTS public.looply_admin_word_filter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT looply_admin_word_filter_length CHECK(char_length(term) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS looply_admin_word_filter_term_uq
  ON public.looply_admin_word_filter (lower(term));
ALTER TABLE public.looply_admin_word_filter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_word_filter FROM PUBLIC, authenticated;

-- Verificação integral no servidor, aplicada a INSERT e UPDATE reais.
CREATE OR REPLACE FUNCTION public.v26_filter_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  IF new.body IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.looply_admin_word_filter f
    WHERE f.enabled=true AND position(lower(f.term) IN lower(new.body)) > 0
  ) THEN
    RAISE EXCEPTION 'chat_word_filter_blocked' USING ERRCODE='23514';
  END IF;
  RETURN new;
END
$fn$;
REVOKE ALL ON FUNCTION public.v26_filter_chat_message() FROM PUBLIC, anonymous, authenticated;
DROP TRIGGER IF EXISTS looply_chat_message_word_filter ON public.chat_messages;
CREATE TRIGGER looply_chat_message_word_filter
  BEFORE INSERT OR UPDATE OF body ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.v26_filter_chat_message();

-- Sem SQL arbitrário, sem segredos, sem comandos emulando sucesso.
CREATE OR REPLACE FUNCTION public.v26_admin_panel_action(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_actor uuid;
  v_result jsonb;
  v_target uuid;
  v_term text;
  v_resolution text;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  v_actor := public.looply_legacy_uid();
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=v_actor AND lower(p.username)='peixinho'
  ) THEN RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501'; END IF;

  CASE p_action
    WHEN 'reports_list' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,'conversation_id',r.conversation_id,
        'reporter_id',r.reporter_id,'reason',r.reason,
        'created_at',r.created_at,'resolution',r.resolution,
        'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by
      ) ORDER BY r.created_at DESC),'[]'::jsonb)
      INTO v_result FROM (SELECT * FROM public.chat_conversation_reports ORDER BY created_at DESC LIMIT 200) r;
    WHEN 'reports_resolve','reports_ignore' THEN
      v_target := (p_payload->>'id')::uuid;
      v_resolution := CASE WHEN p_action='reports_resolve' THEN 'resolved' ELSE 'ignored' END;
      UPDATE public.chat_conversation_reports
      SET resolution=v_resolution, reviewed_at=now(), reviewed_by=v_actor
      WHERE id=v_target RETURNING jsonb_build_object('id',id,'resolution',resolution) INTO v_result;
      IF v_result IS NULL THEN RAISE EXCEPTION 'report_not_found' USING ERRCODE='22023'; END IF;
    WHEN 'word_list' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',w.id,'term',w.term,'enabled',w.enabled,'created_at',w.created_at
      ) ORDER BY w.created_at DESC),'[]'::jsonb)
      INTO v_result FROM public.looply_admin_word_filter w;
    WHEN 'word_add' THEN
      v_term:=btrim(coalesce(p_payload->>'term',''));
      IF char_length(v_term)<1 OR char_length(v_term)>200 THEN
        RAISE EXCEPTION 'invalid_word_filter_term' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.looply_admin_word_filter(term,created_by)
      VALUES(v_term,v_actor)
      ON CONFLICT ((lower(term))) DO UPDATE SET enabled=true
      RETURNING jsonb_build_object('id',id,'term',term,'enabled',enabled) INTO v_result;
    WHEN 'word_remove' THEN
      v_target:=(p_payload->>'id')::uuid;
      DELETE FROM public.looply_admin_word_filter WHERE id=v_target
      RETURNING jsonb_build_object('id',id,'removed',true) INTO v_result;
      IF v_result IS NULL THEN RAISE EXCEPTION 'word_not_found' USING ERRCODE='22023'; END IF;
    WHEN 'health' THEN
      SELECT count(*) INTO v_count FROM public.profiles;
      v_result:=jsonb_build_object('profiles',v_count,'checked_at',now());
    ELSE
      RAISE EXCEPTION 'unsupported_admin_panel_action' USING ERRCODE='22023';
  END CASE;

  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES (v_actor,left(p_action,100),'admin_panel',v_target,
    'Operação verificada no painel administrativo',
    jsonb_build_object('created_at',now(), 'target_id',v_target));
  RETURN v_result;
END
$fn$;
REVOKE ALL ON FUNCTION public.v26_admin_panel_action(text,jsonb) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v26_admin_panel_action(text,jsonb) TO authenticated;

-- Consulta administrativa com projeção explícita, sem SQL arbitrário.
-- Nenhuma coluna de segredo, texto privado ou material criptografado chega ao cliente.
CREATE OR REPLACE FUNCTION public.v26_admin_safe_query(
  p_resource text, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_actor uuid;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  v_actor:=public.looply_legacy_uid();
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id=v_actor AND lower(p.username)='peixinho') THEN
    RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid_offset' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.set_config('statement_timeout','3000',true);
  CASE p_resource
    WHEN 'profiles' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO v_rows
      FROM (SELECT id, username, display_name, created_at FROM public.profiles
            ORDER BY created_at DESC LIMIT 100 OFFSET p_offset) q;
    WHEN 'community_letters' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO v_rows
      FROM (SELECT id, sender_id, recipient_id, subject, created_at
            FROM public.community_letters
            ORDER BY created_at DESC LIMIT 100 OFFSET p_offset) q;
    WHEN 'audit' THEN
      SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO v_rows
      FROM (SELECT id, actor_id, action, resource_type, created_at
            FROM public.looply_admin_audit_events
            ORDER BY created_at DESC LIMIT 100 OFFSET p_offset) q;
    ELSE RAISE EXCEPTION 'resource_not_allowlisted' USING ERRCODE='22023';
  END CASE;
  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES (v_actor,'safe_query',p_resource,null,
    'Consulta restrita auditada no Painel Looply',jsonb_build_object('offset',p_offset));
  RETURN jsonb_build_object('data',v_rows,'next_offset',p_offset+jsonb_array_length(v_rows));
END
$fn$;
REVOKE ALL ON FUNCTION public.v26_admin_safe_query(text,integer) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v26_admin_safe_query(text,integer) TO authenticated;
