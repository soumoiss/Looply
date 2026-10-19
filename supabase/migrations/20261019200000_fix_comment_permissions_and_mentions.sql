-- Restore media-level comment permissions and notify explicit @username mentions.
-- Comment creation must respect the media owner's viewer/selected/disabled setting.
create or replace function private.can_comment_community_gallery_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_view_community_gallery_media(p_media_id)
    and exists (
      select 1
      from public.community_gallery_media media
      where media.id = p_media_id
        and (
          media.comment_access = 'viewers'
          or (
            media.comment_access = 'selected'
            and exists (
              select 1
              from public.community_gallery_media_commenters commenter
              where commenter.media_id = media.id
                and commenter.user_id = (select auth.uid())
            )
          )
        )
    );
$function$;

create or replace function private.can_comment_archive_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.can_view_archive_media(p_media_id)
    and exists (
      select 1
      from public.archive_media media
      where media.id = p_media_id
        and (
          media.comment_access = 'viewers'
          or (
            media.comment_access = 'selected'
            and exists (
              select 1
              from public.archive_media_commenters commenter
              where commenter.media_id = media.id
                and commenter.user_id = (select auth.uid())
            )
          )
        )
    );
$function$;

-- Keep comment visibility within the same media access boundary.
create or replace function private.can_view_community_gallery_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.community_gallery_comments comment_row
    where comment_row.id = p_comment_id
      and (
        comment_row.author_id = (select auth.uid())
        or (select private.is_admin())
        or (
          comment_row.audience in ('members', 'media_viewers')
          and private.can_view_community_gallery_media(comment_row.media_id)
        )
        or (
          comment_row.audience = 'selected'
          and private.can_view_community_gallery_media(comment_row.media_id)
          and exists (
            select 1 from public.community_gallery_comment_recipients recipient
            where recipient.comment_id = comment_row.id
              and recipient.user_id = (select auth.uid())
          )
        )
        or (
          comment_row.audience = 'author_only'
          and exists (
            select 1 from public.community_gallery_media media
            where media.id = comment_row.media_id
              and media.owner_id = (select auth.uid())
          )
        )
      )
  );
$function$;

create or replace function private.can_view_archive_media_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.archive_media_comments comment_row
    where comment_row.id = p_comment_id
      and not private.looply_content_is_hidden('archive_media_comment', comment_row.id)
      and not private.looply_content_is_hidden('archive_media', comment_row.media_id)
      and (
        comment_row.author_id = (select auth.uid())
        or (select private.is_admin())
        or (
          comment_row.audience in ('members', 'media_viewers')
          and private.can_view_archive_media(comment_row.media_id)
        )
        or (
          comment_row.audience = 'selected'
          and private.can_view_archive_media(comment_row.media_id)
          and exists (
            select 1 from public.archive_media_comment_recipients recipient
            where recipient.comment_id = comment_row.id
              and recipient.user_id = (select auth.uid())
          )
        )
      )
  );
$function$;

revoke all on function private.can_view_community_gallery_comment(uuid) from public, anon;
revoke all on function private.can_view_archive_media_comment(uuid) from public, anon;
grant execute on function private.can_view_community_gallery_comment(uuid) to authenticated, service_role;
grant execute on function private.can_view_archive_media_comment(uuid) to authenticated, service_role;

revoke all on function private.can_comment_community_gallery_media(uuid) from public, anon;
revoke all on function private.can_comment_archive_media(uuid) from public, anon;
grant execute on function private.can_comment_community_gallery_media(uuid) to authenticated, service_role;
grant execute on function private.can_comment_archive_media(uuid) to authenticated, service_role;

-- Public/member and media-viewer comments notify only people who can actually see the comment.
create or replace function private.notify_community_gallery_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_media public.community_gallery_media%rowtype;
  v_mentioned record;
begin
  if new.audience not in ('members', 'media_viewers', 'author_only') then
    return new;
  end if;

  select * into v_media
  from public.community_gallery_media
  where id = new.media_id;

  if not found then
    return new;
  end if;

  for v_mentioned in
    select profile.id, profile.username
    from public.profiles profile
    where profile.id <> new.author_id
      and coalesce(profile.username, '') <> ''
      and position('@' || lower(profile.username) in lower(new.body)) > 0
  loop
    if (
      (
        new.audience in ('members', 'media_viewers')
        and (
          v_media.owner_id = v_mentioned.id
          or (
            v_media.publication_state = 'published'
            and v_media.private_owner_id is null
            and v_media.visibility = 'members'
          )
          or exists (
            select 1
            from public.community_gallery_media_recipients media_recipient
            where media_recipient.media_id = v_media.id
              and media_recipient.user_id = v_mentioned.id
              and media_recipient.can_view
          )
        )
      )
      or (new.audience = 'author_only' and v_media.owner_id = v_mentioned.id)
    )
    then
      insert into public.notifications(recipient_id, actor_id, kind, resource_id, event_id, preview)
      values (
        v_mentioned.id,
        new.author_id,
        'gallery_tag',
        new.media_id,
        new.id,
        left('Você foi mencionado em um comentário: ' || btrim(new.body), 180)
      )
      on conflict (recipient_id, kind, event_id) do nothing;
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists community_gallery_comment_mentions_notification on public.community_gallery_comments;
create trigger community_gallery_comment_mentions_notification
after insert on public.community_gallery_comments
for each row execute function private.notify_community_gallery_comment_mentions();

-- Selected-audience mentions are delivered only after the recipient row exists.
create or replace function private.notify_selected_gallery_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_author uuid;
  v_media uuid;
  v_body text;
  v_username text;
  v_audience text;
begin
  select comment_row.author_id, comment_row.media_id, comment_row.body, comment_row.audience
    into v_author, v_media, v_body, v_audience
  from public.community_gallery_comments comment_row
  where comment_row.id = new.comment_id;

  if v_audience = 'selected' and new.user_id <> v_author then
    select lower(profile.username) into v_username
    from public.profiles profile
    where profile.id = new.user_id;

    if coalesce(v_username, '') <> ''
      and position('@' || v_username in lower(v_body)) > 0
    then
      insert into public.notifications(recipient_id, actor_id, kind, resource_id, event_id, preview)
      values (
        new.user_id,
        v_author,
        'gallery_tag',
        v_media,
        new.comment_id,
        left('Você foi mencionado em um comentário: ' || btrim(v_body), 180)
      )
      on conflict (recipient_id, kind, event_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists selected_gallery_comment_mention_notification on public.community_gallery_comment_recipients;
create trigger selected_gallery_comment_mention_notification
after insert on public.community_gallery_comment_recipients
for each row execute function private.notify_selected_gallery_comment_mention();
