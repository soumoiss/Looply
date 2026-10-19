-- Allow admin-invited community usernames while keeping signup invitation-only.
-- Existing profiles and admin grants are preserved; the trigger never grants ADM.
alter table public.profiles drop constraint if exists profiles_username_allowlist;

create table if not exists public.looply_user_invites (
  username text primary key check (username = lower(username) and username ~ '^[a-z0-9_]{3,30}$'),
  email text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 80),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.looply_user_invites enable row level security;
revoke all on table public.looply_user_invites from public, anon, authenticated;
grant all on table public.looply_user_invites to service_role;

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
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  if new.invited_at is null
    or new.email is null
    or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+
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

  -- Intentionally do not add this account to private.admin_users.
  return new;
end;
$function$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

    or requested_username !~ '^[a-z0-9_]{3,30}
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

  -- Intentionally do not add this account to private.admin_users.
  return new;
end;
$function$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
 then
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

  -- Intentionally do not add this account to private.admin_users.
  return new;
end;
$function$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
