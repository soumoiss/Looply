-- Allow the protected administrative flow to provision a common account with an
-- initial password. The marker is written only through auth.admin.createUser
-- from the server-side Edge Function; public signup cannot set app_metadata.
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
  admin_provisioned boolean;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
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
