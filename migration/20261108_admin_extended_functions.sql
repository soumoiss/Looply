-- Looply 20261108: extensões reais do painel, aditivas, sem dados de demonstração.
CREATE TABLE IF NOT EXISTS public.looply_admin_vip_members (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 enabled boolean NOT NULL DEFAULT true,
 updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.looply_admin_vip_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_vip_members FROM PUBLIC, anonymous, authenticated;

CREATE TABLE IF NOT EXISTS public.looply_admin_feature_flags (
 feature text PRIMARY KEY CHECK (feature IN ('chat','cartas','feed','reels','music','gallery','stories','games','calls')),
 enabled boolean NOT NULL DEFAULT true,
 updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.looply_admin_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_feature_flags FROM PUBLIC, anonymous;
GRANT SELECT ON public.looply_admin_feature_flags TO authenticated;
DROP POLICY IF EXISTS looply_admin_feature_flags_read ON public.looply_admin_feature_flags;
CREATE POLICY looply_admin_feature_flags_read ON public.looply_admin_feature_flags
 FOR SELECT TO authenticated USING (true);
INSERT INTO public.looply_admin_feature_flags(feature,enabled)
SELECT unnest(ARRAY['chat','cartas','feed','reels','music','gallery','stories','games','calls']),true
ON CONFLICT(feature) DO NOTHING;

CREATE OR REPLACE FUNCTION public.v47_feature_enabled(p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT coalesce((SELECT enabled FROM public.looply_admin_feature_flags WHERE feature=p_feature),true);
$fn$;
REVOKE ALL ON FUNCTION public.v47_feature_enabled(text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v47_feature_enabled(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v47_feature_insert_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE chosen text := tg_argv[0];
BEGIN
 IF chosen='feed' THEN
   IF new.external_url IS NOT NULL THEN chosen:='reels'; END IF;
 END IF;
 IF NOT public.v47_feature_enabled(chosen) THEN
   RAISE EXCEPTION 'looply_feature_disabled:%',chosen USING ERRCODE='42501';
 END IF;
 RETURN new;
END
$fn$;
REVOKE ALL ON FUNCTION public.v47_feature_insert_gate() FROM PUBLIC, anonymous, authenticated;
DROP TRIGGER IF EXISTS looply_feature_chat_gate ON public.chat_messages;
CREATE TRIGGER looply_feature_chat_gate BEFORE INSERT ON public.chat_messages
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('chat');
DROP TRIGGER IF EXISTS looply_feature_letters_gate ON public.community_letters;
CREATE TRIGGER looply_feature_letters_gate BEFORE INSERT ON public.community_letters
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('cartas');
DROP TRIGGER IF EXISTS looply_feature_posts_gate ON public.posts;
CREATE TRIGGER looply_feature_posts_gate BEFORE INSERT ON public.posts
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('feed');
DROP TRIGGER IF EXISTS looply_feature_music_gate ON public.music_dedications;
CREATE TRIGGER looply_feature_music_gate BEFORE INSERT ON public.music_dedications
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('music');
DROP TRIGGER IF EXISTS looply_feature_gallery_gate ON public.community_gallery_media;
CREATE TRIGGER looply_feature_gallery_gate BEFORE INSERT ON public.community_gallery_media
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('gallery');
DROP TRIGGER IF EXISTS looply_feature_stories_gate ON public.stories;
CREATE TRIGGER looply_feature_stories_gate BEFORE INSERT ON public.stories
 FOR EACH ROW EXECUTE FUNCTION public.v47_feature_insert_gate('stories');

CREATE OR REPLACE FUNCTION public.v47_admin_extended_action(
 p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
 actor uuid;
 target uuid;
 item_id uuid;
 accepted boolean;
 result jsonb;
 page_start integer;
 count_rows integer;
 feature_name text;
 username_text text;
 display_text text;
 requested_id text;
 BEGIN
 IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
  RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
 END IF;
 actor := public.looply_legacy_uid();
 IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=actor AND lower(username)='peixinho') THEN
  RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501';
 END IF;
 page_start := greatest(0,coalesce((p_payload->>'offset')::integer,0));
 CASE p_action
 WHEN 'vip_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'username',p.username,'display_name',p.display_name,
   'enabled',coalesce(v.enabled,false)) ORDER BY p.username),'[]'::jsonb)
   INTO result FROM (SELECT * FROM public.profiles ORDER BY username LIMIT 200 OFFSET page_start) p
   LEFT JOIN public.looply_admin_vip_members v ON v.user_id=p.id;
 WHEN 'vip_set' THEN
  target:=(p_payload->>'userId')::uuid;
  accepted:=coalesce((p_payload->>'enabled')::boolean,false);
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.looply_admin_vip_members(user_id,enabled,updated_by)
  VALUES(target,accepted,actor)
  ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  result:=jsonb_build_object('userId',target,'enabled',accepted);
 WHEN 'features_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'feature',f.feature,'enabled',f.enabled,'updated_at',f.updated_at)
   ORDER BY f.feature),'[]'::jsonb) INTO result
  FROM public.looply_admin_feature_flags f;
 WHEN 'features_set' THEN
  feature_name := p_payload->>'feature';
  accepted := (p_payload->>'enabled')::boolean;
  IF feature_name NOT IN('chat','cartas','feed','reels','music','gallery','stories','games','calls')
    OR accepted IS NULL THEN RAISE EXCEPTION 'feature_invalid' USING ERRCODE='22023'; END IF;
  INSERT INTO public.looply_admin_feature_flags(feature,enabled,updated_by)
  VALUES(feature_name,accepted,actor)
  ON CONFLICT(feature) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
  result:=jsonb_build_object('feature',feature_name,'enabled',accepted);
 WHEN 'sessions_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',s.id,'user_id',p.id,'username',p.username,
   'created_at',s."createdAt",'expires_at',s."expiresAt",
   'active',s."expiresAt">now()) ORDER BY s."createdAt" DESC),'[]'::jsonb)
   INTO result FROM (SELECT * FROM neon_auth.session ORDER BY "createdAt" DESC LIMIT 200 OFFSET page_start) s
   LEFT JOIN looply_migration.verified_identity_links l ON l.neon_user_id=s."userId"
   LEFT JOIN public.profiles p ON p.id=l.legacy_user_id;
 WHEN 'sessions_revoke' THEN
  item_id:=(p_payload->>'id')::uuid;
  UPDATE neon_auth.session s SET "expiresAt"=now()
  WHERE s.id=item_id AND s."userId"<>auth.uid() AND s."expiresAt">now()
  RETURNING s.id INTO item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_unavailable' USING ERRCODE='22023'; END IF;
  result:=jsonb_build_object('revoked',true,'id',item_id);
 WHEN 'invites_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'username',i.username,'display_name',i.display_name,
   'created_at',i.created_at,'expires_at',i.expires_at)
   ORDER BY i.created_at DESC),'[]'::jsonb)
  INTO result FROM (SELECT * FROM public.looply_user_invites ORDER BY created_at DESC LIMIT 200 OFFSET page_start) i;
 WHEN 'invites_create' THEN
  username_text:=lower(btrim(coalesce(p_payload->>'username','')));
  display_text:=btrim(coalesce(p_payload->>'displayName',''));
  IF username_text !~ '^[a-z0-9_]{3,30}$'
   OR length(display_text) NOT BETWEEN 1 AND 80
   OR EXISTS(SELECT 1 FROM public.profiles WHERE username=username_text)
  THEN RAISE EXCEPTION 'invalid_or_taken_username' USING ERRCODE='22023'; END IF;
  INSERT INTO public.looply_user_invites(username,email,display_name,invited_by,expires_at)
  VALUES(username_text,username_text||'@loooply.app',display_text,actor,now()+interval '30 days');
  result:=jsonb_build_object('created',true,'username',username_text);
 WHEN 'stickers_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',st.id,'title',st.title,'slug',st.slug,'is_active',st.is_active,
   'is_shared',st.is_shared,'created_at',st.created_at)
   ORDER BY st.created_at DESC),'[]'::jsonb)
  INTO result FROM (SELECT * FROM public.sticker_catalog ORDER BY created_at DESC LIMIT 200 OFFSET page_start) st;
 WHEN 'stickers_set' THEN
  item_id:=(p_payload->>'id')::uuid;
  accepted:=(p_payload->>'enabled')::boolean;
  IF accepted IS NULL THEN RAISE EXCEPTION 'missing_flag'; END IF;
  UPDATE public.sticker_catalog SET is_active=accepted WHERE id=item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sticker_not_found'; END IF;
  result:=jsonb_build_object('id',item_id,'is_active',accepted);
 WHEN 'groups_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',g.id,'subject',g.subject,'created_at',g.created_at,
   'members',(SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id=g.id))
   ORDER BY g.created_at DESC),'[]'::jsonb) INTO result
  FROM (SELECT * FROM public.conversations WHERE kind='group' ORDER BY created_at DESC LIMIT 200 OFFSET page_start) g;
 WHEN 'groups_rename' THEN
  item_id:=(p_payload->>'id')::uuid;
  display_text:=btrim(coalesce(p_payload->>'subject',''));
  IF length(display_text) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'invalid_group_subject'; END IF;
  UPDATE public.conversations SET subject=display_text,updated_at=now()
  WHERE id=item_id AND kind='group';
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;
  result:=jsonb_build_object('id',item_id,'subject',display_text);
 WHEN 'games_list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result FROM (
    SELECT id,'gartic'::text AS game_type,conversation_id,status,created_at FROM public.looply_gartic_games
    UNION ALL
    SELECT id,'velha'::text,conversation_id,status,created_at FROM public.looply_ttt_games
    ORDER BY created_at DESC LIMIT 200 OFFSET page_start
  ) q;
 WHEN 'games_finish' THEN
  item_id:=(p_payload->>'id')::uuid;
  requested_id:=p_payload->>'gameType';
  IF requested_id='gartic' THEN
    UPDATE public.looply_gartic_games SET status='finished',ends_at=now(),updated_at=now()
    WHERE id=item_id AND status IN('waiting','active');
  ELSIF requested_id='velha' THEN
    UPDATE public.looply_ttt_games SET status='finished',updated_at=now()
    WHERE id=item_id AND status IN('invited','active');
  ELSE RAISE EXCEPTION 'invalid_game_type'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'game_not_active'; END IF;
  result:=jsonb_build_object('id',item_id,'status','finished');
 WHEN 'calls_list' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
  FROM (SELECT id,conversation_id,sender_id,kind,created_at
        FROM looply_migration.call_signal_events ORDER BY created_at DESC LIMIT 200 OFFSET page_start) q;
 WHEN 'roles_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'username',p.username,'role',u.role,'banned',u.banned)
   ORDER BY p.username),'[]'::jsonb) INTO result
  FROM (SELECT * FROM public.profiles ORDER BY username LIMIT 200 OFFSET page_start) p
  LEFT JOIN looply_migration.verified_identity_links l ON l.legacy_user_id=p.id
  LEFT JOIN neon_auth."user" u ON u.id=l.neon_user_id;
 WHEN 'stats' THEN
  result:=jsonb_build_object(
   'users',(SELECT count(*) FROM public.profiles),
   'posts',(SELECT count(*) FROM public.posts),
   'letters',(SELECT count(*) FROM public.community_letters),
   'messages',(SELECT count(*) FROM public.chat_messages),
   'reports',(SELECT count(*) FROM public.chat_conversation_reports),
   'stickers',(SELECT count(*) FROM public.sticker_catalog),
   'sessions',(SELECT count(*) FROM neon_auth.session WHERE "expiresAt">now()),
   'checked_at',now());
 WHEN 'heatmap' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('weekday',q.weekday,'total',q.total) ORDER BY q.weekday),'[]'::jsonb)
   INTO result FROM (
     SELECT EXTRACT(dow FROM created_at)::integer weekday,count(*) total
     FROM public.looply_admin_audit_events
     WHERE created_at >= now()-interval '30 days'
     GROUP BY EXTRACT(dow FROM created_at)
   ) q;
 ELSE
  RAISE EXCEPTION 'unsupported_admin_extension:%',p_action USING ERRCODE='22023';
 END CASE;
 INSERT INTO public.looply_admin_audit_events(actor_id,action,resource_type,resource_id,purpose,metadata)
 VALUES(actor,left('ext_'||p_action,100),'admin_extension',
   coalesce(item_id,target),'Operação verificada no painel administrativo Looply',
   jsonb_build_object('offset',page_start,'feature',feature_name));
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.v47_admin_extended_action(text,jsonb) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v47_admin_extended_action(text,jsonb) TO authenticated;

-- Exportação JSON/CSV produzida no banco, exclusivamente com colunas permitidas.
CREATE OR REPLACE FUNCTION public.v47_admin_export(
 p_resource text, p_format text DEFAULT 'json', p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE actor uuid; entries jsonb; keys text[]; content text; page_start integer:=greatest(0,coalesce(p_offset,0));
BEGIN
 IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501'; END IF;
 actor:=public.looply_legacy_uid();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND lower(username)='peixinho') THEN
  RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.set_config('statement_timeout','5000',true);
 CASE p_resource
 WHEN 'profiles' THEN
  keys:=ARRAY['id','username','display_name','created_at'];
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO entries FROM (
   SELECT id,username,display_name,created_at FROM public.profiles ORDER BY created_at DESC LIMIT 200 OFFSET page_start
  ) t;
 WHEN 'audit' THEN
  keys:=ARRAY['id','actor_id','action','resource_type','created_at'];
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO entries FROM (
   SELECT id,actor_id,action,resource_type,created_at FROM public.looply_admin_audit_events ORDER BY created_at DESC LIMIT 200 OFFSET page_start
  ) t;
 WHEN 'reports' THEN
  keys:=ARRAY['id','conversation_id','reporter_id','resolution','created_at'];
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO entries FROM (
   SELECT id,conversation_id,reporter_id,resolution,created_at FROM public.chat_conversation_reports ORDER BY created_at DESC LIMIT 200 OFFSET page_start
  ) t;
 ELSE RAISE EXCEPTION 'export_resource_not_allowed' USING ERRCODE='42501';
 END CASE;
 IF p_format='json' THEN content:=pg_catalog.jsonb_pretty(entries);
 ELSIF p_format='csv' THEN
  SELECT array_to_string(keys,',') || E'\n' ||
    coalesce(string_agg((
      SELECT string_agg('"'||replace(coalesce(e.value->>col.k,''),'"','""')||'"', ',' ORDER BY col.ordinal)
      FROM unnest(keys) WITH ORDINALITY AS col(k,ordinal)
    ),E'\n' ORDER BY e.ordinality),'')
  INTO content FROM jsonb_array_elements(entries) WITH ORDINALITY e(value,ordinality);
 ELSE RAISE EXCEPTION 'invalid_export_format'; END IF;
 INSERT INTO public.looply_admin_audit_events(actor_id,action,resource_type,purpose,metadata)
 VALUES(actor,'admin_export',p_resource,'Exportação administrativa segura do Looply',
   jsonb_build_object('offset',page_start,'format',p_format,'rows',jsonb_array_length(entries)));
 RETURN jsonb_build_object('content',content,'format',p_format,'resource',p_resource,
   'count',jsonb_array_length(entries),'next_offset',page_start+jsonb_array_length(entries));
END $fn$;
REVOKE ALL ON FUNCTION public.v47_admin_export(text,text,integer) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v47_admin_export(text,text,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';