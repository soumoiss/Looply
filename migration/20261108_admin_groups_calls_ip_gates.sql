-- Looply · controllable features, group archiving and call signaling. No user data deletion.
-- Enforcement at managed Neon Auth session insertion: IP is provider-derived, not browser-supplied.
CREATE OR REPLACE FUNCTION public.v48_block_new_auth_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE source_ip inet;
BEGIN
 IF nullif(new."ipAddress",'') IS NULL THEN RETURN new; END IF;
 BEGIN source_ip:=new."ipAddress"::inet;
 EXCEPTION WHEN invalid_text_representation THEN RETURN new; END;
 IF EXISTS (SELECT 1 FROM public.looply_admin_ip_blocks b
  WHERE source_ip <<= b.network
    AND (b.expires_at IS NULL OR b.expires_at>now())) THEN
  RAISE EXCEPTION 'looply_ip_blocked' USING ERRCODE='42501';
 END IF;
 RETURN new;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_block_new_auth_session() FROM PUBLIC, anonymous, authenticated;

DROP TRIGGER IF EXISTS looply_admin_block_ip_new_session ON neon_auth.session;

CREATE TRIGGER looply_admin_block_ip_new_session BEFORE INSERT OR UPDATE OF "ipAddress"
 ON neon_auth.session FOR EACH ROW EXECUTE FUNCTION public.v48_block_new_auth_session();

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS admin_archived_at timestamptz;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS admin_archived_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.v48_reject_archived_group_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=new.conversation_id
  AND c.kind='group' AND c.admin_archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'conversation_archived' USING ERRCODE='42501';
 END IF;
 RETURN new;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_reject_archived_group_messages() FROM PUBLIC, anonymous, authenticated;

DROP TRIGGER IF EXISTS looply_admin_archived_group_chat_gate ON public.chat_messages;

CREATE TRIGGER looply_admin_archived_group_chat_gate BEFORE INSERT ON public.chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.v48_reject_archived_group_messages();

CREATE OR REPLACE FUNCTION public.v48_games_calls_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF tg_table_name='call_signal_events' THEN
  IF new.kind='signal' AND new.payload->>'type'='offer'
   AND NOT public.v47_feature_enabled('calls') THEN
   RAISE EXCEPTION 'looply_feature_disabled:calls' USING ERRCODE='42501'; END IF;
 ELSIF NOT public.v47_feature_enabled('games') THEN
  RAISE EXCEPTION 'looply_feature_disabled:games' USING ERRCODE='42501';
 END IF;
 RETURN new;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_games_calls_gate() FROM PUBLIC, anonymous, authenticated;

DROP TRIGGER IF EXISTS looply_admin_game_gartic_gate ON public.looply_gartic_games;

CREATE TRIGGER looply_admin_game_gartic_gate BEFORE INSERT ON public.looply_gartic_games
 FOR EACH ROW EXECUTE FUNCTION public.v48_games_calls_gate();

DROP TRIGGER IF EXISTS looply_admin_game_ttt_gate ON public.looply_ttt_games;

CREATE TRIGGER looply_admin_game_ttt_gate BEFORE INSERT ON public.looply_ttt_games
 FOR EACH ROW EXECUTE FUNCTION public.v48_games_calls_gate();

DROP TRIGGER IF EXISTS looply_admin_calls_offer_gate ON looply_migration.call_signal_events;

CREATE TRIGGER looply_admin_calls_offer_gate BEFORE INSERT ON looply_migration.call_signal_events
 FOR EACH ROW EXECUTE FUNCTION public.v48_games_calls_gate();

CREATE OR REPLACE FUNCTION public.v48_admin_groups_calls(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 actor uuid; group_id uuid; v_chat_id uuid; v_callid text; v_offer record;
 p1 uuid; p2 uuid; v_status text; v_count integer;
 result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
  RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501'; END IF;
 actor:=public.looply_legacy_uid();
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor AND lower(username)='peixinho')
 THEN RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501'; END IF;
 CASE p_action
 WHEN 'groups_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'subject',g.subject,'created_at',g.created_at,
   'archived_at',g.admin_archived_at,
   'members',(SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id=g.id))
   ORDER BY g.created_at DESC),'[]'::jsonb) INTO result FROM
   (SELECT * FROM public.conversations WHERE kind='group' ORDER BY created_at DESC LIMIT 200) g;
 WHEN 'group_archive','group_restore' THEN
  group_id:=(p_payload->>'id')::uuid;
  IF p_action='group_archive' THEN
    UPDATE public.conversations c SET admin_archived_at=now(),admin_archived_by=actor,updated_at=now()
    WHERE c.id=group_id AND c.kind='group' AND c.admin_archived_at IS NULL;
  ELSE
    UPDATE public.conversations c SET admin_archived_at=null,admin_archived_by=null,updated_at=now()
    WHERE c.id=group_id AND c.kind='group' AND c.admin_archived_at IS NOT NULL;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found_or_unchanged' USING ERRCODE='22023'; END IF;
  result:=jsonb_build_object('id',group_id,'archived',p_action='group_archive');
 WHEN 'calls_list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
  FROM (SELECT id,conversation_id,sender_id,kind,payload->>'type' AS signal_type,
    payload->>'callId' AS call_id,created_at,expires_at
    FROM looply_migration.call_signal_events
    WHERE kind='signal' AND payload->>'type' IN('offer','answer','hangup','decline','failed')
    ORDER BY created_at DESC LIMIT 200) q;
 WHEN 'call_terminate' THEN
  v_chat_id:=(p_payload->>'conversationId')::uuid;
  SELECT e.sender_id,e.payload->>'callId' AS cid,e.id INTO v_offer
  FROM looply_migration.call_signal_events e
  WHERE e.conversation_id=v_chat_id AND e.kind='signal' AND e.payload->>'type'='offer'
   AND e.created_at > now()-interval '4 hours'
  ORDER BY e.id DESC LIMIT 1;
  IF NOT FOUND OR coalesce(v_offer.cid,'')='' THEN
    RAISE EXCEPTION 'no_recent_call_offer' USING ERRCODE='22023'; END IF;
  -- Reject already terminated offers.
  IF EXISTS (SELECT 1 FROM looply_migration.call_signal_events e
   WHERE e.conversation_id=v_chat_id AND e.id>v_offer.id
   AND e.payload->>'callId'=v_offer.cid
   AND e.payload->>'type' IN ('hangup','decline','failed')) THEN
    RAISE EXCEPTION 'call_already_ended' USING ERRCODE='22023'; END IF;
  SELECT min(cp.user_id::text)::uuid,max(cp.user_id::text)::uuid,count(*) INTO p1,p2,v_count
    FROM public.conversation_participants cp WHERE cp.conversation_id=v_chat_id;
  IF v_count<>2 THEN RAISE EXCEPTION 'direct_call_participants_required' USING ERRCODE='22023'; END IF;
  INSERT INTO looply_migration.call_signal_events(conversation_id,sender_id,kind,payload)
  VALUES
   (v_chat_id,p2,'signal',jsonb_build_object('type','hangup','conversationId',v_chat_id,
     'senderId',p2,'callId',v_offer.cid,'adminEnded',true)),
   (v_chat_id,p1,'signal',jsonb_build_object('type','hangup','conversationId',v_chat_id,
     'senderId',p1,'callId',v_offer.cid,'adminEnded',true));
  result:=jsonb_build_object('conversationId',v_chat_id,'signaled',true,'callId',v_offer.cid);
 ELSE RAISE EXCEPTION 'unsupported_group_call_action' USING ERRCODE='22023';
 END CASE;
 INSERT INTO public.looply_admin_audit_events(actor_id,action,resource_type,resource_id,purpose,metadata)
 VALUES(actor,left('control_'||p_action,100),'admin_panel',coalesce(group_id,v_chat_id),
  'Operação verificada no painel administrativo Looply',
  jsonb_build_object('action',p_action));
 RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.v48_admin_groups_calls(text,jsonb) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.v48_admin_groups_calls(text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
