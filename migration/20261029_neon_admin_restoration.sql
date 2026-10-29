-- Neon-only administrative restoration, 2026-10-29. Safe to reapply.
-- Access is independently enforced by Neon Auth JWT and public.v3_self_is_admin().
-- No Supabase dependency; do not run as an untrusted web client.
CREATE TABLE IF NOT EXISTS public.looply_admin_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL,
 resource_type text NOT NULL,
 resource_id uuid NULL,
 purpose text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT looply_admin_audit_action_length CHECK(char_length(action) BETWEEN 2 AND 100),
 CONSTRAINT looply_admin_audit_purpose_length CHECK(char_length(purpose) BETWEEN 20 AND 500)
);
ALTER TABLE public.looply_admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.looply_admin_audit_events FROM PUBLIC,authenticated;

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
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION 'invalid_offset' USING ERRCODE='22023';
  END IF;
  IF length(v_purpose)<20 OR length(v_purpose)>500 THEN
    RAISE EXCEPTION 'purpose_required_20_to_500_characters' USING ERRCODE='22023';
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

CREATE OR REPLACE FUNCTION public.v12_admin_import_card(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_card jsonb := p_payload->'cards'->0;
  v_recipient uuid;
  v_file text;
  v_existing uuid;
  v_created uuid;
  v_text text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload->'cards') <> 'array' OR jsonb_array_length(p_payload->'cards') <> 1 THEN
    RAISE EXCEPTION 'invalid_card_batch' USING ERRCODE='22023';
  END IF;
  v_recipient := (v_card->>'recipient_id')::uuid;
  v_file := coalesce(v_card->>'original_file','');
  IF v_file !~* '^(misol|patati|yara)carta(privada)?[0-9]+[.]txt$' THEN
    RAISE EXCEPTION 'invalid_archive_filename' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_existing FROM public.archived_cards WHERE recipient_id=v_recipient AND original_file=v_file;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('importedCount',0,'alreadyExistingCount',1);
  END IF;
  IF coalesce((v_card->>'is_protected')::boolean,false) THEN
    RAISE EXCEPTION 'new_protected_archive_requires_encrypted_storage' USING ERRCODE='22023';
  END IF;
  v_text:=coalesce(v_card->>'body','');
  IF length(v_text) < 1 OR length(v_text)>100000 THEN
    RAISE EXCEPTION 'invalid_archived_body' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.archived_cards(recipient_id,original_file,card_number,is_private,is_protected,password_hint,body,sent_date)
  VALUES(v_recipient,v_file,(v_card->>'card_number')::integer,
    coalesce((v_card->>'is_private')::boolean,false),
    false,nullif(v_card->>'password_hint',''),v_text,
    nullif(v_card->>'sent_date','')::date)
  ON CONFLICT(recipient_id,original_file) DO NOTHING
  RETURNING id INTO v_created;
  RETURN jsonb_build_object('importedCount',CASE WHEN v_created IS NULL THEN 0 ELSE 1 END,
    'alreadyExistingCount',CASE WHEN v_created IS NULL THEN 1 ELSE 0 END);
END $function$;

CREATE OR REPLACE FUNCTION public.v12_admin_register_archive_media(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 v_media jsonb := p_payload->'media';
 v_source text := coalesce(v_media->>'source_path','');
 v_path text := coalesce(v_media->>'storage_path','');
 v_size bigint := coalesce((v_media->>'byte_size')::bigint,0);
 v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
  RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
 END IF;
 IF v_source !~* '^midia/([^/]+|misol/[^/]+|yara/[^/]+)$'
  OR v_path <> 'legacy-archive/' || v_source
  OR v_size<1 OR v_size>209715200
  OR length(coalesce(v_media->>'file_name','')) NOT BETWEEN 1 AND 255
 THEN RAISE EXCEPTION 'invalid_archive_media_details' USING ERRCODE='22023'; END IF;
 INSERT INTO public.archive_media
  (source_path,file_name,storage_path,kind,mime_type,byte_size,visibility,source_date,description)
 VALUES(v_source,v_media->>'file_name',v_path,v_media->>'kind',
  v_media->>'mime_type',v_size,coalesce(v_media->>'visibility','members'),
  nullif(v_media->>'source_date','')::timestamptz,
  coalesce(v_media->>'description',''))
 ON CONFLICT(source_path) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM public.archive_media WHERE source_path=v_source AND storage_path=v_path AND byte_size=v_size;
 END IF;
 IF v_id IS NULL THEN RAISE EXCEPTION 'archive_media_conflict' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('mediaId',v_id);
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
      patch:=payload->'cards'->0;
      title_text:=coalesce(patch->>'original_file','');
      target_id:=(patch->>'recipient_id')::uuid;
      SELECT id INTO record_id FROM public.archived_cards
       WHERE recipient_id=target_id AND original_file=title_text;
      IF record_id IS NOT NULL THEN
        result:=jsonb_build_object('importedCount',0,'alreadyExistingCount',1);
      ELSE
        RAISE EXCEPTION 'archive_import_requires_confirmed_safe_fallback' USING ERRCODE='22023';
      END IF;
    WHEN 'import_archived_cards' THEN
      result := jsonb_build_object('importedCount',0);
    WHEN 'import_archived_cards' THEN
      result := public.v12_admin_import_card(payload);
    WHEN 'register_archive_media' THEN
      result := public.v12_admin_register_archive_media(payload);
    WHEN 'verify_archive_media_upload' THEN
      result := jsonb_build_object('exists',false);
    ELSE
      RAISE EXCEPTION 'unsupported_admin_action: %',a USING ERRCODE='22023';
  END CASE;
  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES (actor,left(a,100),left(resource_text,80),coalesce(record_id,target_id),
    purpose_text,jsonb_build_object('at',now_time,'requestId',gen_random_uuid()));
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.v12_admin_finish_signup(p_neon_user_id uuid, p_username text, p_email text, p_display_name text, p_playlist_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_legacy uuid := gen_random_uuid();
  v_username text := lower(btrim(coalesce(p_username,'')));
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_display text := btrim(coalesce(p_display_name,''));
  v_user neon_auth."user"%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  v_actor:=public.looply_legacy_uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'admin_identity_unavailable' USING ERRCODE='42501'; END IF;
  IF v_username !~ '^[a-z0-9_]{3,30}$'
    OR length(v_display) NOT BETWEEN 1 AND 80
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (p_playlist_url IS NOT NULL AND p_playlist_url !~ '^https://(www\.|music\.)?youtube\.com/playlist\?list=[A-Za-z0-9_-]{1,100}(&[A-Za-z0-9_=&%-]*)?$')
  THEN RAISE EXCEPTION 'invalid_signup_details' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_user FROM neon_auth."user" WHERE id=p_neon_user_id FOR UPDATE;
  IF NOT FOUND OR lower(v_user.email)<>v_email OR coalesce(v_user.role,'user')='admin'
    OR EXISTS(SELECT 1 FROM looply_migration.verified_identity_links WHERE neon_user_id=p_neon_user_id)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE username=v_username)
  THEN RAISE EXCEPTION 'new_auth_user_unavailable_or_already_linked' USING ERRCODE='22023'; END IF;
  INSERT INTO looply_migration.auth_user_inventory
    (source_user_id,email,email_confirmed,target_user_id,created_at)
  VALUES(v_legacy,v_email,true,p_neon_user_id,now());
  INSERT INTO looply_auth_compat.legacy_principals(id) VALUES(v_legacy);
  INSERT INTO public.profiles
    (id,username,display_name,bio,profile_visibility,playlist_url)
  VALUES(v_legacy,v_username,v_display,'','members',nullif(p_playlist_url,''));
  INSERT INTO looply_migration.verified_identity_links
    (legacy_user_id,neon_user_id,proof)
  VALUES(v_legacy,p_neon_user_id,'verified_email');
  UPDATE neon_auth."user" SET "emailVerified"=true,role='user',
    "updatedAt"=now()
  WHERE id=p_neon_user_id;
  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES(v_actor,'user_create_with_password','profiles',v_legacy,
    'Criação de conta administrativa autorizada no Neon',
    jsonb_build_object('username',v_username,'neonUserId',p_neon_user_id));
  RETURN jsonb_build_object('username',v_username,'userId',v_legacy,'created',true);
END $function$;

CREATE OR REPLACE FUNCTION public.v12_admin_storage_read_allowed(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.v3_self_is_admin() AND p_path IS NOT NULL AND (
  (p_bucket='looply-media' AND (
    EXISTS(SELECT 1 FROM public.post_media WHERE storage_path=p_path) OR
    EXISTS(SELECT 1 FROM public.story_media WHERE storage_path=p_path) OR
    EXISTS(SELECT 1 FROM public.comment_media WHERE storage_path=p_path) OR
    EXISTS(SELECT 1 FROM public.archive_media WHERE storage_path=p_path)
  )) OR
  (p_bucket='looply-gallery' AND EXISTS(
    SELECT 1 FROM public.community_gallery_media WHERE storage_path=p_path
  )) OR
  (p_bucket='looply-chat' AND EXISTS(
    SELECT 1 FROM public.chat_media WHERE storage_path=p_path
  ))
 );
$function$;

-- Current Neon client requires these authenticated, row-restricted reads.
DO $policies$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_settings' AND policyname='looply_v12_settings_read') THEN
  CREATE POLICY looply_v12_settings_read ON public.app_settings FOR SELECT TO authenticated USING (public.looply_legacy_uid() IS NOT NULL);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_announcements' AND policyname='looply_v12_announcements_active_read') THEN
  CREATE POLICY looply_v12_announcements_active_read ON public.global_announcements FOR SELECT TO authenticated USING (public.looply_legacy_uid() IS NOT NULL AND is_active=true AND starts_at<=now() AND (expires_at IS NULL OR expires_at>now()));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_announcements' AND policyname='looply_v12_announcements_admin_read') THEN
  CREATE POLICY looply_v12_announcements_admin_read ON public.global_announcements FOR SELECT TO authenticated USING (public.v3_self_is_admin());
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_announcement_reads' AND policyname='looply_v12_announcement_receipts_read') THEN
  CREATE POLICY looply_v12_announcement_receipts_read ON public.global_announcement_reads FOR SELECT TO authenticated USING (user_id=public.looply_legacy_uid());
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='global_announcement_reads' AND policyname='looply_v12_announcement_receipts_insert') THEN
  CREATE POLICY looply_v12_announcement_receipts_insert ON public.global_announcement_reads FOR INSERT TO authenticated WITH CHECK (user_id=public.looply_legacy_uid() AND EXISTS(SELECT 1 FROM public.global_announcements a WHERE a.id=announcement_id AND a.is_active=true));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secret_messages' AND policyname='looply_v12_secret_recipients_read') THEN
  CREATE POLICY looply_v12_secret_recipients_read ON public.secret_messages FOR SELECT TO authenticated USING (recipient_id=public.looply_legacy_uid());
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secret_messages' AND policyname='looply_v12_secret_recipients_ack') THEN
  CREATE POLICY looply_v12_secret_recipients_ack ON public.secret_messages FOR UPDATE TO authenticated USING (recipient_id=public.looply_legacy_uid() AND is_read=false) WITH CHECK (recipient_id=public.looply_legacy_uid() AND is_read=true AND read_at IS NOT NULL);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secret_messages' AND policyname='looply_v12_secret_admin_read') THEN
  CREATE POLICY looply_v12_secret_admin_read ON public.secret_messages FOR SELECT TO authenticated USING (public.v3_self_is_admin());
 END IF;
END $policies$;

REVOKE ALL ON FUNCTION public.v12_admin_read(text,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v12_admin_read(text,uuid,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.v12_admin_action(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v12_admin_action(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.v12_admin_finish_signup(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v12_admin_finish_signup(uuid,text,text,text,text) TO authenticated;

-- Helper procedures can only be called by the trusted owner executing the audited action RPC.
REVOKE ALL ON FUNCTION public.v12_admin_import_card(jsonb) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.v12_admin_register_archive_media(jsonb) FROM PUBLIC,authenticated;

REVOKE ALL ON FUNCTION public.v12_admin_storage_read_allowed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v12_admin_storage_read_allowed(text,text) TO authenticated;
