-- Audience is assigned per archive item by an audited administrator action.
-- Existing recipients remain unchanged until the administrator reviews them.
alter table public.archive_media_comments
  add column visibility text not null default 'participants'
  check (visibility in ('private', 'participants'));

drop policy if exists archive_media_comments_audience_read on public.archive_media_comments;
create policy archive_media_comments_audience_read
on public.archive_media_comments
for select
to authenticated
using (
  (select private.can_view_archive_media(media_id))
  and (
    visibility = 'participants'
    or author_id = (select auth.uid())
  )
);

create or replace function public.set_looply_archive_media_audience(
  p_actor_id uuid,
  p_media_id uuid,
  p_recipient_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  next_visibility text;
begin
  if p_actor_id is null or p_media_id is null then
    raise exception 'Administrator, media, and audience are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.admin_users administrator
    where administrator.user_id = p_actor_id
  ) then
    raise exception 'Administrator membership required' using errcode = '42501';
  end if;

  if p_recipient_id is not null and not exists (
    select 1 from public.profiles profile where profile.id = p_recipient_id
  ) then
    raise exception 'Recipient profile does not exist' using errcode = '22023';
  end if;

  next_visibility := case when p_recipient_id is null then 'members' else 'exclusive' end;

  update public.archive_media
  set visibility = next_visibility, updated_at = now()
  where id = p_media_id;

  if not found then
    raise exception 'Archive media does not exist' using errcode = 'P0002';
  end if;

  delete from public.archive_media_recipients
  where media_id = p_media_id;

  if p_recipient_id is not null then
    insert into public.archive_media_recipients (media_id, user_id)
    values (p_media_id, p_recipient_id);
  end if;

  return next_visibility;
end;
$function$;

revoke all on function public.set_looply_archive_media_audience(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_looply_archive_media_audience(uuid, uuid, uuid)
  to service_role;
