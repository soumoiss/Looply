-- Ensure comment RPCs perform validated inserts under their owner privileges.
-- The RPCs enforce authentication, media visibility, comment_access, body limits,
-- and recipient validation before inserting. SECURITY DEFINER avoids a second,
-- conflicting RLS check on the INSERT while preserving those explicit checks.
create or replace function public.create_community_gallery_comment(
  p_media_id uuid,
  p_body text,
  p_audience text default 'media_viewers'::text,
  p_recipient_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_comment_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_invalid_count integer;
  v_duplicate_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can_comment_community_gallery_media(p_media_id) then
    raise exception 'Not permitted to comment on this media' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'Comment must contain between 1 and 2000 characters' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('media_viewers', 'members', 'selected', 'author_only') then
    raise exception 'Invalid comment audience' using errcode = '22023';
  end if;

  select count(*) - count(distinct selected.user_id)
  into v_duplicate_count
  from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id);
  if v_duplicate_count > 0 or exists (
    select 1 from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id)
    where selected.user_id is null
  ) then
    raise exception 'Comment audience contains duplicate or null identities' using errcode = '22023';
  end if;

  select count(*) into v_invalid_count
  from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id)
  left join public.profiles profile on profile.id = selected.user_id
  where profile.id is null;
  if v_invalid_count > 0 then
    raise exception 'Comment audience contains an unknown identity' using errcode = '22023';
  end if;

  if p_audience = 'selected' and cardinality(coalesce(p_recipient_ids, '{}'::uuid[])) = 0 then
    raise exception 'Select at least one comment recipient' using errcode = '22023';
  end if;
  if p_audience <> 'selected' and cardinality(coalesce(p_recipient_ids, '{}'::uuid[])) > 0 then
    raise exception 'Recipient identities require selected comment audience' using errcode = '22023';
  end if;

  insert into public.community_gallery_comments(media_id, author_id, body, audience)
  values (p_media_id, v_user_id, v_body, p_audience)
  returning id into v_comment_id;

  if p_audience = 'selected' then
    insert into public.community_gallery_comment_recipients(comment_id, user_id)
    select v_comment_id, recipient.user_id
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as recipient(user_id);
  end if;
  return v_comment_id;
end;
$function$;

create or replace function public.create_archive_media_comment(
  p_media_id uuid,
  p_body text,
  p_audience text default 'media_viewers'::text,
  p_recipient_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_comment_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_duplicate_count integer;
  v_invalid_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can_comment_archive_media(p_media_id) then
    raise exception 'Not permitted to comment on this media' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'Comment must contain between 1 and 2000 characters' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('media_viewers', 'members', 'selected', 'author_only') then
    raise exception 'Invalid comment audience' using errcode = '22023';
  end if;

  select count(*) - count(distinct selected.user_id)
  into v_duplicate_count
  from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id);
  if v_duplicate_count > 0 or exists (
    select 1 from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id)
    where selected.user_id is null
  ) then
    raise exception 'Comment audience contains duplicate or null identities' using errcode = '22023';
  end if;

  select count(*) into v_invalid_count
  from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as selected(user_id)
  left join public.profiles profile on profile.id = selected.user_id
  where profile.id is null;
  if v_invalid_count > 0 then
    raise exception 'Comment audience contains an unknown identity' using errcode = '22023';
  end if;

  if p_audience = 'selected' and cardinality(coalesce(p_recipient_ids, '{}'::uuid[])) = 0 then
    raise exception 'Select at least one comment recipient' using errcode = '22023';
  end if;
  if p_audience <> 'selected' and cardinality(coalesce(p_recipient_ids, '{}'::uuid[])) > 0 then
    raise exception 'Recipient identities require selected comment audience' using errcode = '22023';
  end if;

  insert into public.archive_media_comments(media_id, author_id, body, audience)
  values (p_media_id, v_user_id, v_body, p_audience)
  returning id into v_comment_id;

  if p_audience = 'selected' then
    insert into public.archive_media_comment_recipients(comment_id, user_id)
    select v_comment_id, recipient.user_id
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) as recipient(user_id);
  end if;
  return v_comment_id;
end;
$function$;

revoke all on function public.create_community_gallery_comment(uuid, text, text, uuid[]) from public, anon;
revoke all on function public.create_archive_media_comment(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.create_community_gallery_comment(uuid, text, text, uuid[]) to authenticated, service_role;
grant execute on function public.create_archive_media_comment(uuid, text, text, uuid[]) to authenticated, service_role;
