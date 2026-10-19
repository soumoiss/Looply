-- Protected, temporary elevation sessions for Looply administrators.
-- The Edge Function is the only caller; raw passwords and session tokens are never stored.
create schema if not exists private;

create table if not exists private.looply_admin_session_credentials (
  user_id uuid primary key,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.looply_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index if not exists looply_admin_sessions_user_active_idx
  on private.looply_admin_sessions(user_id, expires_at desc)
  where revoked_at is null;

create table if not exists private.looply_admin_session_attempts (
  user_id uuid primary key,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.looply_admin_session_credentials enable row level security;
alter table private.looply_admin_sessions enable row level security;
alter table private.looply_admin_session_attempts enable row level security;
revoke all on table private.looply_admin_session_credentials from public, anon, authenticated;
revoke all on table private.looply_admin_sessions from public, anon, authenticated;
revoke all on table private.looply_admin_session_attempts from public, anon, authenticated;

create or replace function public.looply_admin_session_status(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
  v_expires_at timestamptz;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'Administrator membership is required' using errcode = '42501';
  end if;
  select max(s.expires_at) into v_expires_at
  from private.looply_admin_sessions s
  where s.user_id = p_actor_id and s.revoked_at is null and s.expires_at > now();
  return jsonb_build_object(
    'configured', exists(select 1 from private.looply_admin_session_credentials c where c.user_id = p_actor_id),
    'active', v_expires_at is not null,
    'expires_at', v_expires_at
  );
end;
$function$;

create or replace function public.looply_admin_session_setup(p_actor_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'Administrator membership is required' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 12 or length(p_password) > 256 then
    raise exception 'Admin password must contain 12 to 256 characters' using errcode = '22023';
  end if;
  insert into private.looply_admin_session_credentials(user_id, password_hash)
  values (p_actor_id, extensions.crypt(p_password, extensions.gen_salt('bf', 12)))
  on conflict (user_id) do nothing;
  return found;
end;
$function$;

create or replace function public.looply_admin_session_unlock(p_actor_id uuid, p_password text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
  v_hash text;
  v_attempts private.looply_admin_session_attempts%rowtype;
  v_now timestamptz := now();
  v_expires timestamptz;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'Administrator membership is required' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) > 256 or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid unlock request' using errcode = '22023';
  end if;

  insert into private.looply_admin_session_attempts(user_id, failed_attempts, window_started_at, locked_until)
  values (p_actor_id, 0, v_now, null)
  on conflict (user_id) do nothing;
  select * into v_attempts from private.looply_admin_session_attempts where user_id = p_actor_id for update;
  if v_attempts.locked_until is not null and v_attempts.locked_until > v_now then
    return jsonb_build_object('ok', false, 'limited', true, 'retry_at', v_attempts.locked_until);
  end if;
  if v_attempts.window_started_at < v_now - interval '15 minutes' then
    update private.looply_admin_session_attempts set failed_attempts = 0, window_started_at = v_now, locked_until = null
    where user_id = p_actor_id;
  end if;

  select c.password_hash into v_hash from private.looply_admin_session_credentials c where c.user_id = p_actor_id;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'configured', false);
  end if;
  if extensions.crypt(p_password, v_hash) <> v_hash then
    update private.looply_admin_session_attempts
      set failed_attempts = case when window_started_at < v_now - interval '15 minutes' then 1 else failed_attempts + 1 end,
          window_started_at = case when window_started_at < v_now - interval '15 minutes' then v_now else window_started_at end,
          locked_until = case when (case when window_started_at < v_now - interval '15 minutes' then 1 else failed_attempts + 1 end) >= 5
            then v_now + interval '15 minutes' else null end,
          updated_at = v_now
    where user_id = p_actor_id;
    return jsonb_build_object('ok', false, 'limited', false);
  end if;

  update private.looply_admin_session_attempts
    set failed_attempts = 0, window_started_at = v_now, locked_until = null, updated_at = v_now
    where user_id = p_actor_id;
  update private.looply_admin_sessions set revoked_at = v_now
    where user_id = p_actor_id and revoked_at is null;
  v_expires := v_now + interval '15 minutes';
  insert into private.looply_admin_sessions(user_id, token_hash, expires_at)
  values (p_actor_id, p_token_hash, v_expires);
  return jsonb_build_object('ok', true, 'expires_at', v_expires);
end;
$function$;

create or replace function public.looply_admin_session_validate(p_actor_id uuid, p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
  v_session_id uuid;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then return false; end if;
  select s.id into v_session_id
  from private.looply_admin_sessions s
  where s.user_id = p_actor_id and s.token_hash = p_token_hash
    and s.revoked_at is null and s.expires_at > now()
  limit 1;
  if v_session_id is null then return false; end if;
  update private.looply_admin_sessions set last_used_at = now() where id = v_session_id;
  return true;
end;
$function$;

create or replace function public.looply_admin_session_revoke(p_actor_id uuid, p_token_hash text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
  v_count integer;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'Administrator membership is required' using errcode = '42501';
  end if;
  update private.looply_admin_sessions
    set revoked_at = now()
    where user_id = p_actor_id and revoked_at is null
      and (p_token_hash is null or token_hash = p_token_hash);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.looply_admin_session_status(uuid) from public, anon, authenticated;
revoke all on function public.looply_admin_session_setup(uuid, text) from public, anon, authenticated;
revoke all on function public.looply_admin_session_unlock(uuid, text, text) from public, anon, authenticated;
revoke all on function public.looply_admin_session_validate(uuid, text) from public, anon, authenticated;
revoke all on function public.looply_admin_session_revoke(uuid, text) from public, anon, authenticated;
grant execute on function public.looply_admin_session_status(uuid) to service_role;
grant execute on function public.looply_admin_session_setup(uuid, text) to service_role;
grant execute on function public.looply_admin_session_unlock(uuid, text, text) to service_role;
grant execute on function public.looply_admin_session_validate(uuid, text) to service_role;
grant execute on function public.looply_admin_session_revoke(uuid, text) to service_role;

-- Extend the existing audit contract so session lifecycle events are recorded atomically.
alter table private.admin_audit drop constraint if exists admin_audit_event_check;
alter table private.admin_audit add constraint admin_audit_event_check check (
  event in (
    'access_denied','read_requested','read_completed','read_failed',
    'write_requested','write_completed','write_failed',
    'admin_session_credential_created','admin_session_setup_rejected',
    'admin_session_rate_limited','admin_session_unlock_failed',
    'admin_session_unlocked','admin_session_revoked','admin_session_required'
  )
);
alter table private.admin_audit drop constraint if exists admin_audit_resource_type_check;
alter table private.admin_audit add constraint admin_audit_resource_type_check check (
  resource_type in (
    'posts','music_dedications','music_library','youtube_track_comments','profiles',
    'post_media','music_comments','conversations','letters','chat_messages','chat_media',
    'archive_media','archive_media_comments','archived_cards','audit','announcements','admin_session'
  )
);

create or replace function public.record_looply_admin_access(
  p_actor_id uuid,
  p_event text,
  p_resource_type text,
  p_resource_id uuid,
  p_purpose text,
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare audit_id uuid;
begin
  if p_actor_id is null
     or p_event not in (
       'access_denied','read_requested','read_completed','read_failed',
       'write_requested','write_completed','write_failed',
       'admin_session_credential_created','admin_session_setup_rejected',
       'admin_session_rate_limited','admin_session_unlock_failed',
       'admin_session_unlocked','admin_session_revoked','admin_session_required'
     )
     or p_resource_type not in (
       'posts','music_dedications','music_library','youtube_track_comments','profiles',
       'post_media','music_comments','conversations','letters','chat_messages','chat_media',
       'archive_media','archive_media_comments','archived_cards','audit','announcements','admin_session'
     )
     or p_purpose is null or char_length(btrim(p_purpose)) not between 20 and 500
     or p_request_id is null then
    raise exception 'Invalid administrative audit event' using errcode = '22023';
  end if;
  if p_event not in ('access_denied','admin_session_required','admin_session_rate_limited','admin_session_unlock_failed','admin_session_setup_rejected')
     and not exists (
       select 1 from private.admin_users administrator where administrator.user_id = p_actor_id
     ) then
    raise exception 'Administrator membership required' using errcode = '42501';
  end if;
  insert into private.admin_audit(actor_id,event,resource_type,resource_id,purpose,request_id,metadata)
  values (p_actor_id,p_event,p_resource_type,p_resource_id,btrim(p_purpose),p_request_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into audit_id;
  return audit_id;
end;
$function$;
revoke all on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb)
  to service_role;
