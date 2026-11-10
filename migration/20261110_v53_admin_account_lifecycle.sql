-- Looply ADM: server-verified account lifecycle, not a browser-only ban.
-- Account deletion removes login/credential/session records and anonymizes the
-- legacy profile to preserve shared correspondence, messages and audit trails.
-- NO account is changed by installing these functions.
CREATE OR REPLACE FUNCTION public.v53_admin_account_action(
  p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  actor uuid;
  target_id uuid;
  neon_user_id uuid;
  target_username text;
  target_role text;
  target_banned boolean;
  raw_target text := btrim(coalesce(p_payload->>'userId',''));
  session_count integer := 0;
  token_count integer := 0;
  now_time timestamptz := now();
  tombstone text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.v3_self_is_admin() THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE='42501';
  END IF;
  actor := public.looply_legacy_uid();
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id=actor AND username='peixinho'
  ) THEN
    RAISE EXCEPTION 'peixinho_required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN (
    'user_set_suspended','user_restore_access','user_delete_preview',
    'user_delete_permanently'
  ) THEN
    RAISE EXCEPTION 'unsupported_admin_account_action' USING ERRCODE='22023';
  END IF;
  IF raw_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'invalid_user_id' USING ERRCODE='22023';
  END IF;
  target_id:=raw_target::uuid;
  IF target_id=actor THEN
    RAISE EXCEPTION 'cannot_change_own_access' USING ERRCODE='42501';
  END IF;
  SELECT p.username, l.neon_user_id, coalesce(u.role,'user'),coalesce(u.banned,false)
  INTO target_username,neon_user_id,target_role,target_banned
  FROM public.profiles p
  JOIN looply_migration.verified_identity_links l ON l.legacy_user_id=p.id
  JOIN neon_auth."user" u ON u.id=l.neon_user_id
  WHERE p.id=target_id
  FOR UPDATE OF p,u;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_auth_identity_not_found' USING ERRCODE='22023';
  END IF;
  IF target_role='admin' OR target_username='peixinho' THEN
    RAISE EXCEPTION 'cannot_change_administrator' USING ERRCODE='42501';
  END IF;

  IF p_action='user_delete_preview' THEN
    SELECT count(*) INTO session_count
    FROM neon_auth.session WHERE "userId"=neon_user_id AND "expiresAt">now_time;
    RETURN jsonb_build_object('userId',target_id,'username',target_username,
      'suspended',target_banned,'activeSessions',session_count,
      'deletionMode','remove_auth_and_anonymize_history',
      'sharedContentPreserved',true);
  END IF;

  IF p_action='user_delete_permanently' THEN
    IF p_payload->>'confirmUsername' IS DISTINCT FROM target_username
      OR coalesce((p_payload->>'confirmDelete')::boolean,false) IS DISTINCT FROM true
      OR coalesce((p_payload->>'preserveSharedContent')::boolean,false) IS DISTINCT FROM true
    THEN
      RAISE EXCEPTION 'explicit_delete_confirmation_required' USING ERRCODE='42501';
    END IF;
  END IF;

  -- The flag and session revocation happen in the same database transaction.
  IF p_action IN ('user_set_suspended','user_delete_permanently') THEN
    UPDATE neon_auth."user" SET banned=true,
      "banReason"='Suspensão administrativa Looply',
      "banExpires"=NULL,"updatedAt"=now_time
    WHERE id=neon_user_id;
    DELETE FROM neon_auth.session WHERE "userId"=neon_user_id;
    GET DIAGNOSTICS session_count=ROW_COUNT;
    DELETE FROM public.android_fcm_tokens WHERE user_id=target_id;
    GET DIAGNOSTICS token_count=ROW_COUNT;
    DELETE FROM public.chat_presence_sessions WHERE user_id=target_id;
  ELSIF p_action='user_restore_access' THEN
    UPDATE neon_auth."user" SET banned=false,
      "banReason"=NULL,"banExpires"=NULL,"updatedAt"=now_time
    WHERE id=neon_user_id;
  END IF;

  IF p_action='user_delete_permanently' THEN
    -- Erase credentials, access and personal profile data, but do not cascade
    -- delete letters, chats, posts and media belonging to other recipients.
    -- The legacy UUID remains only as an anonymous historical reference.
    tombstone:='deleted_'||substring(replace(target_id::text,'-','') from 1 for 20);
    UPDATE public.profiles SET
      username=tombstone,display_name='Conta excluída',bio='',
      avatar_path=NULL,playlist_url=NULL,profile_visibility='private',
      theme='lilas',font_family='system',font_size='normal',updated_at=now_time
    WHERE id=target_id;
    DELETE FROM looply_migration.verified_identity_links
      WHERE legacy_user_id=target_id AND neon_user_id=neon_user_id;
    UPDATE looply_migration.auth_user_inventory
      SET email=NULL,email_confirmed=false,target_user_id=NULL
      WHERE source_user_id=target_id;
    DELETE FROM neon_auth."user" WHERE id=neon_user_id;
    IF EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=neon_user_id)
      OR EXISTS(SELECT 1 FROM looply_migration.verified_identity_links WHERE legacy_user_id=target_id)
    THEN RAISE EXCEPTION 'account_deletion_not_confirmed' USING ERRCODE='P0001'; END IF;
    INSERT INTO public.looply_admin_audit_events
      (actor_id,action,resource_type,resource_id,purpose,metadata)
    VALUES(actor,'user_delete_permanently','profiles',target_id,
      'Exclusão permanente da autenticação e anonimização do perfil',
      jsonb_build_object('sharedContentPreserved',true,'sessionsRevoked',session_count));
    RETURN jsonb_build_object('deleted',true,'userId',target_id,
      'authDeleted',true,'profileAnonymized',true,'sharedContentPreserved',true,
      'sessionsRevoked',session_count,'pushTokensRemoved',token_count);
  END IF;

  INSERT INTO public.looply_admin_audit_events
    (actor_id,action,resource_type,resource_id,purpose,metadata)
  VALUES(actor,p_action,'profiles',target_id,'Controle de acesso integral pelo ADM Peixinho',
    jsonb_build_object('suspended',p_action='user_set_suspended',
      'sessionsRevoked',session_count,'pushTokensRemoved',token_count));
  RETURN jsonb_build_object('updated',true,'userId',target_id,
    'suspended',p_action='user_set_suspended',
    'sessionsRevoked',session_count,'pushTokensRemoved',token_count);
END $function$;

-- The central principal resolver is used by virtually every RLS policy.
-- Existing JWTs must lose their legacy identity as soon as banned = true.
CREATE OR REPLACE FUNCTION public.looply_legacy_uid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
  SELECT l.legacy_user_id
  FROM looply_migration.verified_identity_links l
  JOIN neon_auth."user" u ON u.id=l.neon_user_id
  WHERE l.neon_user_id=auth.uid()
    AND coalesce(u.banned,false)=false
    AND (u."banExpires" IS NULL OR u."banExpires" > now())
  LIMIT 1
$function$;

-- Better Auth creates sessions in neon_auth.session; refuse suspended users
-- before a new authenticated session is available, preserving the IP gate.
CREATE OR REPLACE FUNCTION public.v48_block_new_auth_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
DECLARE source_ip inet;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM neon_auth."user" u
   WHERE u.id=new."userId"
     AND coalesce(u.banned,false)=false
     AND (u."banExpires" IS NULL OR u."banExpires">now())
 ) THEN
   RAISE EXCEPTION 'looply_user_suspended' USING ERRCODE='42501';
 END IF;
 IF nullif(new."ipAddress",'') IS NULL THEN RETURN new; END IF;
 BEGIN source_ip:=new."ipAddress"::inet;
 EXCEPTION WHEN invalid_text_representation THEN RETURN new; END;
 IF EXISTS(SELECT 1 FROM public.looply_admin_ip_blocks b
    WHERE source_ip <<= b.network
      AND (b.expires_at IS NULL OR b.expires_at>now())) THEN
   RAISE EXCEPTION 'looply_ip_blocked' USING ERRCODE='42501';
 END IF;
 RETURN new;
END $function$;

REVOKE ALL ON FUNCTION public.v53_admin_account_action(text,jsonb)
  FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v53_admin_account_action(text,jsonb)
  TO authenticated;


-- Lightweight account-level gate. Called before every page controller and
-- polled while the app is open, so previously rendered tabs cannot keep
-- working after an ADM suspension.
CREATE OR REPLACE FUNCTION public.v54_self_account_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
 SELECT jsonb_build_object(
   'allowed', EXISTS (
     SELECT 1 FROM neon_auth."user" u
     JOIN looply_migration.verified_identity_links l ON l.neon_user_id=u.id
     JOIN public.profiles p ON p.id=l.legacy_user_id
     WHERE u.id=auth.uid()
       AND coalesce(u.banned,false)=false
       AND p.username !~ '^deleted_[0-9a-f]{20}
   ),
   'suspended', EXISTS (
     SELECT 1 FROM neon_auth."user" u
     WHERE u.id=auth.uid() AND coalesce(u.banned,false)=true
   )
 )
$function$;

REVOKE ALL ON FUNCTION public.v54_self_account_access()
  FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v54_self_account_access()
  TO authenticated;

   ),
   'suspended', EXISTS (
     SELECT 1 FROM neon_auth."user" u
     WHERE u.id=auth.uid() AND coalesce(u.banned,false)=true
   )
 )
$function$;

REVOKE ALL ON FUNCTION public.v54_self_account_access()
  FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.v54_self_account_access()
  TO authenticated;
