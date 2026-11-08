-- Looply ADM — consolidação não destrutiva 2026-11-08.
-- Preserva contagem/revisualização dos stories, conteúdo protegido e regras de RLS.
-- Mantém justificativa opcional (auditoria de leitura sempre registrada), impede
-- que outro perfil administrador use as ações v12 e aceita senhas não vazias.
-- Não exclui nem altera dados pessoais existentes.

DO $do$
DECLARE v_expr text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO v_expr
 FROM pg_constraint
 WHERE conrelid='public.notifications'::regclass AND conname='notifications_kind_check';
 IF v_expr IS NOT NULL AND position('story_view' in v_expr)=0 THEN
   ALTER TABLE public.notifications DROP CONSTRAINT notifications_kind_check;
   EXECUTE format(
     'ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK ((%s) OR kind=%L)',
     v_expr,'story_view'
   );
 END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor uuid := public.looply_legacy_uid();
  author uuid;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT s.author_id INTO author FROM public.stories s
    WHERE s.id=p_story_id AND (s.expires_at>pg_catalog.now()
      OR EXISTS (SELECT 1 FROM public.story_highlights h WHERE h.story_id=s.id));
  IF author IS NULL OR actor=author OR NOT public.v3_can_view_story(p_story_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.story_views(story_id,viewer_id)
    VALUES(p_story_id,actor)
    ON CONFLICT (story_id,viewer_id) DO UPDATE
      SET last_viewed_at=clock_timestamp(), view_count=public.story_views.view_count+1;
  -- Preserve view count/highlights, notify author without duplicate notifications.
  BEGIN
    INSERT INTO public.notifications
      (recipient_id,actor_id,kind,resource_id,event_id,preview)
    VALUES (author,actor,'story_view',p_story_id,
      md5('sv:'||p_story_id::text||':'||actor::text)::uuid,
      'visualizou sua publicação.')
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Looply story-view notification unavailable';
  END;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.v13_admin_change_archived_card_password(p_card_id uuid, p_current_password text, p_new_password text, p_new_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_encrypted bytea;
  v_body text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_card_id IS NULL
     OR coalesce(p_current_password,'') = ''
     OR coalesce(p_new_password,'') = '' THEN
    RAISE EXCEPTION 'invalid_password_change_request' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.archived_cards WHERE id=p_card_id AND is_protected=true) THEN
    RETURN jsonb_build_object('error','card_unavailable');
  END IF;
  SELECT encrypted_body INTO v_encrypted FROM looply_private.archived_card_secrets WHERE card_id=p_card_id FOR UPDATE;
  IF v_encrypted IS NULL THEN RETURN jsonb_build_object('error','protected_archive_not_restored'); END IF;
  BEGIN
    v_body := public.pgp_sym_decrypt(v_encrypted,p_current_password);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'incorrect_current_password' USING ERRCODE='22023';
  END;
  IF p_new_body IS NOT NULL THEN
    IF length(p_new_body) NOT BETWEEN 1 AND 100000 THEN
      RAISE EXCEPTION 'invalid_archive_body' USING ERRCODE='22023';
    END IF;
    v_body := p_new_body;
  END IF;
  UPDATE looply_private.archived_card_secrets
  SET encrypted_body=public.pgp_sym_encrypt(v_body,p_new_password,'cipher-algo=aes256, compress-algo=1'),
      restored_at=clock_timestamp()
  WHERE card_id=p_card_id;
  DELETE FROM looply_private.archived_card_unlock_attempts WHERE card_id=p_card_id;
  RETURN jsonb_build_object('updated',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.v12_admin_read(p_resource text, p_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_purpose text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_table text;
  v_doc_expression text := 'to_jsonb(t)';
  v_order text := 'created_at';
  v_result jsonb;
  v_request_id uuid := gen_random_uuid();
  v_purpose text := btrim(coalesce(p_purpose, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  v_actor := public.looply_legacy_uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'admin_identity_unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
     WHERE p.id=v_actor AND lower(p.username)='peixinho') THEN
    RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION 'invalid_offset' USING ERRCODE='22023';
  END IF;
  IF length(v_purpose)<20 THEN
    v_purpose := 'Consulta administrativa: ' || v_purpose;
  END IF;
  IF length(v_purpose)>500 THEN
    RAISE EXCEPTION 'purpose_too_long' USING ERRCODE='22023';
  END IF;
  CASE p_resource
    WHEN 'posts' THEN v_table:='posts';
    WHEN 'music_dedications' THEN v_table:='music_dedications';
    WHEN 'music_library' THEN v_table:='music_library';
    WHEN 'youtube_track_comments' THEN v_table:='music_page_comments';
    WHEN 'letters' THEN v_table:='letters';
    WHEN 'community_letters' THEN v_table:='community_letters';
    WHEN 'conversations' THEN v_table:='conversations'; v_order:='updated_at';
    WHEN 'chat_messages' THEN v_table:='chat_messages';
    WHEN 'profiles' THEN v_table:='profiles';
    WHEN 'post_media' THEN v_table:='post_media';
    WHEN 'archived_cards' THEN v_table:='archived_cards'; v_order:='imported_at';
    WHEN 'archive_media' THEN v_table:='archive_media';
    WHEN 'archive_media_comments' THEN v_table:='archive_media_comments';
    WHEN 'stories' THEN v_table:='stories';
    WHEN 'community_gallery_media' THEN v_table:='community_gallery_media';
    WHEN 'audit' THEN v_table:='looply_admin_audit_events';
    ELSE RAISE EXCEPTION 'unsupported_admin_resource' USING ERRCODE='22023';
  END CASE;
  CASE p_resource
    WHEN 'posts' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.author_id),
 ''media'',(SELECT coalesce(jsonb_agg(to_jsonb(m)), ''[]''::jsonb) FROM public.post_media m WHERE m.post_id=t.id),
 ''comments'',(SELECT coalesce(jsonb_agg(to_jsonb(cm) || jsonb_build_object(
  ''author'',(SELECT to_jsonb(cp) FROM public.profiles cp WHERE cp.id=cm.author_id),
  ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''comment'' AND mod.content_id=cm.id)
  )),''[]''::jsonb) FROM public.comments cm WHERE cm.post_id=t.id),
 ''moderated'', EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''post'' AND mod.content_id=t.id))';
    WHEN 'stories' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.author_id),
 ''media'',(SELECT coalesce(jsonb_agg(to_jsonb(m)),''[]''::jsonb) FROM public.story_media m WHERE m.story_id=t.id),
 ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''story'' AND mod.content_id=t.id))';
    WHEN 'community_gallery_media' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''owner'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.owner_id),
 ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''community_gallery_media'' AND mod.content_id=t.id))';
    WHEN 'music_dedications' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''sender'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.sender_id),
 ''recipient'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.recipient_id),
 ''comments'',(SELECT coalesce(jsonb_agg(to_jsonb(cm) || jsonb_build_object(
   ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=cm.author_id)
 )),''[]''::jsonb) FROM public.music_comments cm WHERE cm.dedication_id=t.id))';
    WHEN 'music_library' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''owner'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.owner_id))';
    WHEN 'youtube_track_comments' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.author_id),
 ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''music_page_comment'' AND mod.content_id=t.id))';
    WHEN 'post_media' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''post'',(SELECT to_jsonb(p) FROM public.posts p WHERE p.id=t.post_id))';
    WHEN 'archive_media' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''recipients'',(SELECT coalesce(jsonb_agg(jsonb_build_object(''profile'',to_jsonb(p))),''[]''::jsonb)
    FROM public.archive_media_recipients r JOIN public.profiles p ON p.id=r.user_id WHERE r.media_id=t.id),
 ''comments'',(SELECT coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
    ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=c.author_id))),''[]''::jsonb)
    FROM public.archive_media_comments c WHERE c.media_id=t.id),
 ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''archive_media'' AND mod.content_id=t.id))';
    WHEN 'archive_media_comments' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.author_id),
 ''media'',(SELECT to_jsonb(m) FROM public.archive_media m WHERE m.id=t.media_id),
 ''moderated'',EXISTS(SELECT 1 FROM public.looply_content_moderation mod WHERE mod.content_type=''archive_media_comment'' AND mod.content_id=t.id))';
    WHEN 'archived_cards' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''recipient'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.recipient_id))';
    WHEN 'community_letters' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''sender'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.sender_id),
 ''recipient'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.recipient_id))';
    WHEN 'letters' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''sender'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.sender_id),
 ''recipient'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.recipient_id),
 ''initial_message'',(SELECT to_jsonb(m) FROM public.chat_messages m WHERE m.id=t.initial_message_id))';
    WHEN 'conversations' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''participants'',(SELECT coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object(
 ''profile'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=r.user_id))),''[]''::jsonb)
 FROM public.conversation_participants r WHERE r.conversation_id=t.id))';
    WHEN 'chat_messages' THEN v_doc_expression := 'to_jsonb(t) || jsonb_build_object(
 ''author'',(SELECT to_jsonb(p) FROM public.profiles p WHERE p.id=t.sender_id),
 ''media'',(SELECT coalesce(jsonb_agg(to_jsonb(m)),''[]''::jsonb) FROM public.chat_media m WHERE m.message_id=t.id))';
  END CASE;
  IF p_resource = 'audit' THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(result.doc),''[]''::jsonb) FROM
      (SELECT to_jsonb(a) AS doc FROM public.looply_admin_audit_events a
       ORDER BY a.created_at DESC LIMIT 100 OFFSET $1) result'
    INTO v_result USING p_offset;
  ELSE
    EXECUTE format(
      'SELECT coalesce(jsonb_agg(result.doc),''[]''::jsonb) FROM
       (SELECT %s AS doc FROM public.%I t
        WHERE ($1::uuid IS NULL OR t.id = $1::uuid)
        ORDER BY t.%I DESC LIMIT 100 OFFSET $2) result',v_doc_expression,v_table,v_order
    ) INTO v_result USING p_id,p_offset;
  END IF;
  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES (v_actor,'read',p_resource,p_id,v_purpose,
    jsonb_build_object('requestId',v_request_id,'offset',p_offset,'rowCount',jsonb_array_length(v_result)));
  RETURN jsonb_build_object('data',v_result,'requestId',v_request_id);
END $function$;

CREATE OR REPLACE FUNCTION public.v12_admin_action(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  actor uuid;
  target_id uuid;
  record_id uuid;
  result jsonb := '{}'::jsonb;
  a text := coalesce(p_action,'');
  payload jsonb := coalesce(p_payload,'{}'::jsonb);
  patch jsonb;
  body_text text;
  title_text text;
  reason_text text;
  email_text text;
  username_text text;
  purpose_text text;
  id_text text;
  resource_text text := coalesce(p_payload->>'resourceType','admin');
  now_time timestamptz := now();
  expires_time timestamptz;
  match_count integer := 0;
  v_read_count integer := 0;
  v_user uuid;
  old_status boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  actor := public.looply_legacy_uid();
  IF actor IS NULL THEN RAISE EXCEPTION 'admin_identity_unavailable' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
     WHERE p.id=actor AND lower(p.username)='peixinho') THEN
    RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501';
  END IF;
  purpose_text := btrim(coalesce(payload->>'purpose',''));
  IF length(purpose_text)<20 THEN purpose_text := 'Operação administrativa: ' || a; END IF;
  IF length(purpose_text)>500 THEN purpose_text := left(purpose_text,500); END IF;
  CASE a
    WHEN 'status' THEN
      result := jsonb_build_object('isAdmin',true);
    WHEN 'users_list' THEN
      SELECT jsonb_build_object('users',coalesce(jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'email',u.email,'emailConfirmed',coalesce(u."emailVerified",false),
          'suspended',coalesce(u.banned,false),'lastSignInAt',null)
        ORDER BY p.username),'[]'::jsonb))
      INTO result
      FROM public.profiles p
      LEFT JOIN looply_migration.verified_identity_links link ON link.legacy_user_id=p.id
      LEFT JOIN neon_auth."user" u ON u.id=link.neon_user_id;
    WHEN 'user_check_availability' THEN
      username_text:=lower(btrim(coalesce(payload->>'username','')));
      email_text:=lower(btrim(coalesce(payload->>'email','')));
      result:=jsonb_build_object(
        'usernameAvailable', username_text<>'' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE username=username_text),
        'emailAvailable', email_text<>'' AND NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE lower(email)=email_text));
    WHEN 'user_update_profile' THEN
      target_id := (payload->>'userId')::uuid;
      title_text := btrim(coalesce(payload->>'displayName',''));
      body_text := coalesce(payload->>'bio','');
      IF length(title_text) NOT BETWEEN 1 AND 80 OR length(body_text)>280 THEN
        RAISE EXCEPTION 'invalid_profile_fields' USING ERRCODE='22023';
      END IF;
      IF length(coalesce(payload->>'playlistUrl',''))>260 THEN
        RAISE EXCEPTION 'invalid_playlist_url' USING ERRCODE='22023';
      END IF;
      UPDATE public.profiles
      SET display_name=title_text,bio=body_text,
        playlist_url=nullif(btrim(coalesce(payload->>'playlistUrl','')),''),
        updated_at=now_time
      WHERE id=target_id;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('updated',true);
    WHEN 'user_set_suspended','user_restore_access' THEN
      target_id := (payload->>'userId')::uuid;
      IF target_id=actor THEN RAISE EXCEPTION 'admin_cannot_suspend_self' USING ERRCODE='42501'; END IF;
      SELECT u.id INTO v_user
      FROM neon_auth."user" u
      JOIN looply_migration.verified_identity_links link ON link.neon_user_id=u.id
      WHERE link.legacy_user_id=target_id AND coalesce(u.role,'user')<>'admin';
      IF v_user IS NULL THEN RAISE EXCEPTION 'target_user_not_found_or_admin' USING ERRCODE='22023'; END IF;
      UPDATE neon_auth."user"
      SET banned=(a='user_set_suspended'),
          "banReason"=CASE WHEN a='user_set_suspended' THEN 'Suspensão administrativa Looply' ELSE NULL END,
          "updatedAt"=now_time
      WHERE id=v_user;
      result:=jsonb_build_object('updated',true,'suspended',(a='user_set_suspended'));
    WHEN 'app_settings_update' THEN
      patch:=coalesce(payload->'settings','{}'::jsonb);
      IF jsonb_typeof(patch)<>'object' OR EXISTS(
        SELECT 1 FROM jsonb_object_keys(patch) k
        WHERE k NOT IN ('maintenance_mode','maintenance_message','music_of_the_day_title','music_of_the_day_url','welcome_banner_text')
      ) THEN RAISE EXCEPTION 'invalid_settings_keys' USING ERRCODE='22023'; END IF;
      IF length(coalesce(patch->>'maintenance_message',''))>500
         OR length(coalesce(patch->>'music_of_the_day_title',''))>180
         OR length(coalesce(patch->>'music_of_the_day_url',''))>1000
         OR length(coalesce(patch->>'welcome_banner_text',''))>500
      THEN RAISE EXCEPTION 'invalid_settings_length' USING ERRCODE='22023'; END IF;
      IF patch ? 'music_of_the_day_url'
        AND nullif(patch->>'music_of_the_day_url','') IS NOT NULL
        AND (patch->>'music_of_the_day_url' !~ '^https://(www\.)?(youtube\.com|youtu\.be)/')
      THEN RAISE EXCEPTION 'invalid_youtube_url' USING ERRCODE='22023'; END IF;
      UPDATE public.app_settings s SET
        maintenance_mode=CASE WHEN patch ? 'maintenance_mode' THEN (patch->>'maintenance_mode')::boolean ELSE s.maintenance_mode END,
        maintenance_message=CASE WHEN patch ? 'maintenance_message' THEN patch->>'maintenance_message' ELSE s.maintenance_message END,
        music_of_the_day_title=CASE WHEN patch ? 'music_of_the_day_title' THEN patch->>'music_of_the_day_title' ELSE s.music_of_the_day_title END,
        music_of_the_day_url=CASE WHEN patch ? 'music_of_the_day_url' THEN patch->>'music_of_the_day_url' ELSE s.music_of_the_day_url END,
        welcome_banner_text=CASE WHEN patch ? 'welcome_banner_text' THEN patch->>'welcome_banner_text' ELSE s.welcome_banner_text END,
        updated_at=now_time WHERE id=1 RETURNING to_jsonb(s) INTO result;
      IF result IS NULL THEN RAISE EXCEPTION 'app_settings_missing' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('settings',result);
    WHEN 'broadcast_list' THEN
      SELECT jsonb_build_object('announcements',coalesce(jsonb_agg(
        to_jsonb(a1) || jsonb_build_object(
         'read_count',(SELECT count(*) FROM public.global_announcement_reads ar WHERE ar.announcement_id=a1.id),
         'recipient_count',(SELECT count(*) FROM public.profiles),
         'readers',(SELECT coalesce(jsonb_agg(
           jsonb_build_object('username',p.username,'display_name',p.display_name,'read_at',reads.read_at)
           ORDER BY p.username),'[]'::jsonb)
           FROM public.profiles p LEFT JOIN public.global_announcement_reads reads
             ON reads.announcement_id=a1.id AND reads.user_id=p.id)
        ) ORDER BY a1.created_at DESC),'[]'::jsonb))
      INTO result FROM (SELECT * FROM public.global_announcements ORDER BY created_at DESC LIMIT 50) a1;
    WHEN 'broadcast_create' THEN
      title_text:=btrim(coalesce(payload->>'title',''));
      body_text:=btrim(coalesce(payload->>'body',''));
      IF length(title_text) NOT BETWEEN 1 AND 120 OR length(body_text) NOT BETWEEN 1 AND 4000
      THEN RAISE EXCEPTION 'invalid_announcement_content' USING ERRCODE='22023'; END IF;
      IF nullif(payload->>'expiresAt','') IS NOT NULL THEN
        expires_time:=(payload->>'expiresAt')::timestamptz;
        IF expires_time<=now_time THEN RAISE EXCEPTION 'invalid_announcement_expiry' USING ERRCODE='22023'; END IF;
      END IF;
      IF nullif(payload->>'mediaUrl','') IS NOT NULL AND
         (payload->>'mediaUrl' !~ '^announcements/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm)$')
      THEN RAISE EXCEPTION 'invalid_announcement_media_path' USING ERRCODE='22023'; END IF;
      INSERT INTO public.global_announcements(title,body,created_by,expires_at,media_url)
      VALUES(title_text,body_text,actor,expires_time,nullif(payload->>'mediaUrl',''))
      RETURNING to_jsonb(global_announcements) INTO result;
      result:=jsonb_build_object('announcement',result);
    WHEN 'broadcast_deactivate' THEN
      record_id:=(payload->>'announcementId')::uuid;
      UPDATE public.global_announcements SET is_active=false WHERE id=record_id;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'announcement_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('deactivated',true);
    WHEN 'secret_list' THEN
      SELECT jsonb_build_object('messages',coalesce(jsonb_agg(
        to_jsonb(s) || jsonb_build_object('recipient',jsonb_build_object('username',p.username,'display_name',p.display_name))
        ORDER BY s.created_at DESC),'[]'::jsonb))
      INTO result FROM (SELECT * FROM public.secret_messages ORDER BY created_at DESC LIMIT 100) s
        LEFT JOIN public.profiles p ON p.id=s.recipient_id;
    WHEN 'secret_create' THEN
      target_id:=(payload->>'recipientId')::uuid;
      title_text:=btrim(coalesce(payload->>'title',''));
      body_text:=btrim(coalesce(payload->>'content',''));
      IF length(title_text)>160 OR length(body_text) NOT BETWEEN 1 AND 5000
        OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target_id)
      THEN RAISE EXCEPTION 'invalid_secret_message' USING ERRCODE='22023'; END IF;
      IF nullif(payload->>'mediaPath','') IS NOT NULL AND
        payload->>'mediaPath' !~ '^secret-messages/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$'
      THEN RAISE EXCEPTION 'invalid_secret_media_path' USING ERRCODE='22023'; END IF;
      INSERT INTO public.secret_messages(sender_id,recipient_id,title,content,media_url)
      VALUES(actor,target_id,nullif(title_text,''),body_text,nullif(payload->>'mediaPath',''))
      RETURNING id INTO record_id;
      result:=jsonb_build_object('created',true,'id',record_id);
    WHEN 'secret_cancel' THEN
      record_id:=(payload->>'secretId')::uuid;
      DELETE FROM public.secret_messages WHERE id=record_id AND is_read=false AND sender_id=actor;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'secret_not_pending_or_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('cancelled',true);
    WHEN 'moderate_content' THEN
      resource_text:=coalesce(payload->>'contentType','');
      record_id:=(payload->>'contentId')::uuid;
      IF resource_text NOT IN ('post','comment','archive_media','archive_media_comment','music_page_comment','story','community_gallery_media','community_letter','music_dedication','music_library','conversation','chat_message','chat_media','profile') THEN
        RAISE EXCEPTION 'invalid_moderation_type' USING ERRCODE='22023';
      END IF;
      IF (payload->>'hidden')::boolean THEN
        INSERT INTO public.looply_content_moderation(content_type,content_id,reason,moderated_by,moderated_at)
        VALUES(resource_text,record_id,purpose_text,actor,now_time)
        ON CONFLICT(content_type,content_id) DO UPDATE
        SET reason=excluded.reason,moderated_by=excluded.moderated_by,moderated_at=excluded.moderated_at;
      ELSE
        DELETE FROM public.looply_content_moderation WHERE content_type=resource_text AND content_id=record_id;
      END IF;
      result:=jsonb_build_object('hidden',(payload->>'hidden')::boolean);
    WHEN 'comment' THEN
      target_id:=(payload->>'postId')::uuid;
      body_text:=btrim(coalesce(payload->>'body',''));
      IF length(body_text) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_comment' USING ERRCODE='22023'; END IF;
      INSERT INTO public.comments(post_id,author_id,body)
      VALUES(target_id,actor,body_text) RETURNING id INTO record_id;
      result:=jsonb_build_object('comment',jsonb_build_object('id',record_id,'body',body_text));
    WHEN 'comment_archive_media' THEN
      target_id:=(payload->>'mediaId')::uuid;
      body_text:=btrim(coalesce(payload->>'body',''));
      IF length(body_text) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_comment' USING ERRCODE='22023'; END IF;
      INSERT INTO public.archive_media_comments(media_id,author_id,body)
      VALUES(target_id,actor,body_text) RETURNING id INTO record_id;
      result:=jsonb_build_object('comment',jsonb_build_object('id',record_id,'body',body_text));
    WHEN 'update_community_letter' THEN
      target_id:=(payload->>'letterId')::uuid;
      title_text:=btrim(coalesce(payload->>'subject',''));
      body_text:=coalesce(payload->>'body','');
      IF length(title_text) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'invalid_letter_subject' USING ERRCODE='22023';
      END IF;
      IF (payload->>'is_protected')::boolean THEN
        IF nullif(payload->>'password_ciphertext','') IS NULL
          OR nullif(payload->>'password_salt','') IS NULL
          OR nullif(payload->>'password_iv','') IS NULL
        THEN RAISE EXCEPTION 'encrypted_letter_required' USING ERRCODE='22023'; END IF;
        UPDATE public.community_letters SET subject=title_text,body=NULL,is_protected=true,
          password_salt=payload->>'password_salt', password_iv=payload->>'password_iv',
          password_ciphertext=payload->>'password_ciphertext' WHERE id=target_id;
      ELSE
        IF length(body_text) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid_letter_body' USING ERRCODE='22023'; END IF;
        UPDATE public.community_letters SET subject=title_text,body=body_text,is_protected=false,
          password_salt=NULL,password_iv=NULL,password_ciphertext=NULL WHERE id=target_id AND is_protected=false;
      END IF;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'letter_not_found_or_protected' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('updated',true);
    WHEN 'update_archived_card' THEN
      target_id:=(payload->>'cardId')::uuid;
      patch:=coalesce(payload->'card','{}'::jsonb);
      IF coalesce((patch->>'is_protected')::boolean,false) OR coalesce((SELECT is_protected FROM public.archived_cards WHERE id=target_id),false)
      THEN RAISE EXCEPTION 'protected_archive_edit_requires_encrypted_migration' USING ERRCODE='22023'; END IF;
      IF length(coalesce(patch->>'body',''))<1 OR length(coalesce(patch->>'body',''))>100000
      THEN RAISE EXCEPTION 'invalid_archive_body' USING ERRCODE='22023'; END IF;
      UPDATE public.archived_cards SET body=patch->>'body',
        password_hint=nullif(patch->>'password_hint',''),
        sent_date=nullif(patch->>'sent_date','')::date WHERE id=target_id AND is_protected=false;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'archive_card_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('updated',true);
    WHEN 'delete_archived_card' THEN
      target_id:=(payload->>'cardId')::uuid;
      DELETE FROM public.archived_cards WHERE id=target_id;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'archive_card_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('deleted',true);
    WHEN 'delete_content' THEN
      IF coalesce((payload->>'confirmDelete')::boolean,false)<>true THEN
        RAISE EXCEPTION 'deletion_confirmation_required' USING ERRCODE='42501'; END IF;
      resource_text:=coalesce(payload->>'contentType','');
      target_id:=(payload->>'contentId')::uuid;
      CASE resource_text
        WHEN 'post' THEN DELETE FROM public.posts WHERE id=target_id;
        WHEN 'comment' THEN DELETE FROM public.comments WHERE id=target_id;
        WHEN 'story' THEN DELETE FROM public.stories WHERE id=target_id;
        WHEN 'community_letter' THEN DELETE FROM public.community_letters WHERE id=target_id;
        WHEN 'community_gallery_media' THEN DELETE FROM public.community_gallery_media WHERE id=target_id;
        WHEN 'archive_media_comment' THEN DELETE FROM public.archive_media_comments WHERE id=target_id;
        WHEN 'music_page_comment' THEN DELETE FROM public.music_page_comments WHERE id=target_id;
        ELSE RAISE EXCEPTION 'unsupported_delete_type' USING ERRCODE='22023';
      END CASE;
      GET DIAGNOSTICS match_count=ROW_COUNT;
      IF match_count<>1 THEN RAISE EXCEPTION 'content_not_found' USING ERRCODE='22023'; END IF;
      result:=jsonb_build_object('deleted',true);
    WHEN 'noop_internal_test' THEN
      result := '{}'::jsonb;
    WHEN 'import_archived_cards' THEN
      -- Delegates to the idempotent and authorization-checked importer.
      result := public.v12_admin_import_card(payload);
    WHEN 'register_archive_media' THEN
      result := public.v12_admin_register_archive_media(payload);
    WHEN 'verify_archive_media_upload' THEN
      -- Object existence lives in private Neon Object Storage, not in SQL.
      -- Never return a fabricated boolean: the client must use the
      -- authenticated /storage/verify endpoint before registration.
      RAISE EXCEPTION 'storage_object_verification_requires_authenticated_storage_endpoint'
        USING ERRCODE='0A000';
    ELSE
      RAISE EXCEPTION 'unsupported_admin_action: %',a USING ERRCODE='22023';
  END CASE;
  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES (actor,left(a,100),left(resource_text,80),coalesce(record_id,target_id),
    purpose_text,jsonb_build_object('at',now_time,'requestId',gen_random_uuid()));
  RETURN result;
END $function$;

NOTIFY pgrst, 'reload schema';
