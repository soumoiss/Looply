-- Automatic username-only recovery when Supabase Edge Functions are unavailable.
-- The existing Supabase Auth account remains the source of truth, including future users.
-- An email is returned only when the existing password matches; no hashes leave the database.

create schema if not exists private;
create schema if not exists login_internal;

create table if not exists private.looply_fallback_login_limits (
  username text primary key,
  attempts integer not null default 0,
  started_at timestamptz not null default now()
);
alter table private.looply_fallback_login_limits enable row level security;
revoke all on private.looply_fallback_login_limits from public, anon, authenticated;

-- Isolate the exposed login entry point from all other internal admin functions.
revoke all on schema login_internal from public, authenticated;
revoke usage on schema private from anon;
grant usage on schema login_internal to anon;

create or replace function login_internal.looply_verified_login_email(p_username text, p_password text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_email text;
  v_password_hash text;
  v_attempts integer;
  v_started_at timestamptz;
begin
  if v_username !~ '^[a-z0-9_]{3,30}$'
    or p_password is null or length(p_password) < 1
    or octet_length(p_password) > 256 then
    return null;
  end if;

  -- Serialize attempts and allow at most 10 checks per account in 15 minutes.
  insert into private.looply_fallback_login_limits(username, attempts, started_at)
  values (v_username, 0, now())
  on conflict(username) do nothing;
  select attempts, started_at into v_attempts, v_started_at
    from private.looply_fallback_login_limits
   where username = v_username for update;
  if v_started_at < now() - interval '15 minutes' then
    update private.looply_fallback_login_limits
       set attempts = 0, started_at = now() where username = v_username;
    v_attempts := 0;
  end if;
  if v_attempts >= 10 then return null; end if;
  update private.looply_fallback_login_limits
     set attempts = attempts + 1 where username = v_username;

  select u.email, u.encrypted_password into v_email, v_password_hash
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.username = v_username
     and u.deleted_at is null
   limit 1;

  if v_email is not null and v_password_hash like '$2%'
     and extensions.crypt(p_password, v_password_hash) = v_password_hash then
    delete from private.looply_fallback_login_limits where username = v_username;
    return v_email;
  end if;
  return null;
end;
$function$;

revoke all on function login_internal.looply_verified_login_email(text,text)
  from public, authenticated;
grant execute on function login_internal.looply_verified_login_email(text,text) to anon;

create or replace function public.looply_login_fallback(p_username text, p_password text)
returns text
language sql volatile security invoker set search_path = ''
as $function$
  select login_internal.looply_verified_login_email(p_username, p_password);
$function$;
revoke all on function public.looply_login_fallback(text,text) from public, authenticated;
grant execute on function public.looply_login_fallback(text,text) to anon;
