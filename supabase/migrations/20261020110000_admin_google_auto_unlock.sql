-- Administrators already verified in private.admin_users receive a short-lived
-- operation token automatically after their authenticated Supabase/Google login.
-- This removes the redundant second password without granting admin to ordinary users.
create or replace function public.looply_admin_session_auto_unlock(
  p_actor_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_admin boolean;
  v_now timestamptz := now();
  v_expires timestamptz;
begin
  select public.is_looply_admin(p_actor_id) into v_is_admin;
  if coalesce(v_is_admin, false) is not true then
    raise exception 'Administrator membership is required' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid automatic unlock request' using errcode = '22023';
  end if;
  update private.looply_admin_sessions
    set revoked_at = v_now
    where user_id = p_actor_id and revoked_at is null;
  v_expires := v_now + interval '15 minutes';
  insert into private.looply_admin_sessions(user_id, token_hash, expires_at)
  values (p_actor_id, p_token_hash, v_expires);
  return jsonb_build_object('ok', true, 'expires_at', v_expires);
end;
$function$;

revoke all on function public.looply_admin_session_auto_unlock(uuid, text)
  from public, anon, authenticated;
grant execute on function public.looply_admin_session_auto_unlock(uuid, text)
  to service_role;
