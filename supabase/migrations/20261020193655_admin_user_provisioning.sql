-- Authorize one protected Auth user creation by an opaque, short-lived UUID.
-- This is the server-side fallback when Auth does not persist app_metadata
-- before running the auth.users profile trigger.
create table private.looply_admin_user_provisions (
  user_id uuid primary key,
  email text not null,
  username text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check (email = lower(email)),
  check (username = lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
  check (char_length(display_name) between 1 and 80)
);

alter table private.looply_admin_user_provisions enable row level security;
revoke all on table private.looply_admin_user_provisions from public, anon, authenticated;
grant all on table private.looply_admin_user_provisions to service_role;

create or replace function public.prepare_looply_admin_user_provision(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null
    or p_email is null
    or p_email <> lower(p_email)
    or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_username is null
    or p_username !~ '^[a-z0-9_]{3,30}$'
    or p_display_name is null
    or char_length(p_display_name) not between 1 and 80 then
    raise exception 'Invalid administrative user provisioning request';
  end if;

  delete from private.looply_admin_user_provisions where expires_at <= now();
  insert into private.looply_admin_user_provisions(user_id, email, username, display_name)
  values (p_user_id, p_email, p_username, p_display_name);
end;
$function$;

revoke all on function public.prepare_looply_admin_user_provision(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_looply_admin_user_provision(uuid, text, text, text) to service_role;

create or replace function public.discard_looply_admin_user_provision(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  delete from private.looply_admin_user_provisions where user_id = p_user_id;
$function$;

revoke all on function public.discard_looply_admin_user_provision(uuid) from public, anon, authenticated;
grant execute on function public.discard_looply_admin_user_provision(uuid) to service_role;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_username text;
  requested_display_name text;
  invite_row public.looply_user_invites%rowtype;
  provision_row private.looply_admin_user_provisions%rowtype;
  admin_provisioned boolean;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  select provision.* into provision_row
  from private.looply_admin_user_provisions as provision
  where provision.user_id = new.id
    and provision.email = lower(coalesce(new.email, ''))
    and provision.username = requested_username
    and provision.display_name = left(requested_display_name, 80)
    and provision.expires_at > now()
  for update;

  if found then
    insert into public.profiles (id, username, display_name)
    values (new.id, provision_row.username, provision_row.display_name);
    delete from private.looply_admin_user_provisions where user_id = new.id;
    return new;
  end if;

  admin_provisioned := coalesce(new.raw_app_meta_data ->> 'looply_admin_provisioned', '') = 'true';
  if admin_provisioned then
    if new.email is null
      or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or requested_username !~ '^[a-z0-9_]{3,30}$' then
      raise exception 'Administrative provisioning requires a valid Looply identity';
    end if;

    if char_length(requested_display_name) = 0 then
      requested_display_name := requested_username;
    end if;

    insert into public.profiles (id, username, display_name)
    values (new.id, requested_username, left(requested_display_name, 80));
    return new;
  end if;

  if new.invited_at is null
    or new.email is null
    or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'A valid Looply invitation is required';
  end if;

  select invitation.* into invite_row
  from public.looply_user_invites as invitation
  where invitation.username = requested_username
    and lower(invitation.email) = lower(new.email)
    and invitation.expires_at > now()
  for update;

  if not found then
    raise exception 'A valid Looply invitation is required';
  end if;

  if char_length(requested_display_name) = 0 then
    requested_display_name := invite_row.display_name;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, left(requested_display_name, 80));

  delete from public.looply_user_invites where username = invite_row.username;
  return new;
end;
$function$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

