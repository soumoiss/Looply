-- Looply administrative repair: preserves existing data, permissions and audit.
-- Snapshot of the installed v12_admin_action with one import branch and fail-closed storage verification.
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
