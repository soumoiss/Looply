-- Repair gallery comments and mentions without widening access to other users' content.
-- A later feed migration replaced the notifications check and accidentally removed gallery kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('post', 'comment', 'reply', 'music_dedication', 'post_like', 'story_like', 'gallery_comment', 'gallery_tag'));

-- The comment RPC uses INSERT ... RETURNING. Allow the author to read their own new row
-- directly so the SELECT policy does not depend on re-querying that row by id.
drop policy if exists community_gallery_comments_audience_read on public.community_gallery_comments;
create policy community_gallery_comments_audience_read
on public.community_gallery_comments
for select to authenticated
using (
  author_id = (select auth.uid())
  or (select private.can_view_community_gallery_comment(community_gallery_comments.id))
);

-- "Somente eu e o autor da mídia" must be visible to the commenter and media owner.
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
        or comment_row.audience = 'members'
        or (
          comment_row.audience = 'media_viewers'
          and private.can_view_community_gallery_media(comment_row.media_id)
        )
        or (
          comment_row.audience = 'selected'
          and private.can_view_community_gallery_media(comment_row.media_id)
          and exists (
            select 1
            from public.community_gallery_comment_recipients recipient
            where recipient.comment_id = comment_row.id
              and recipient.user_id = (select auth.uid())
          )
        )
        or (
          comment_row.audience = 'author_only'
          and exists (
            select 1
            from public.community_gallery_media media
            where media.id = comment_row.media_id
              and media.owner_id = (select auth.uid())
          )
        )
      )
  );
$function$;

-- Send a notification to the media owner for ordinary and author-only comments.
create or replace function private.notify_community_gallery_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid;
  v_preview text;
begin
  if new.audience not in ('members', 'media_viewers', 'author_only') then
    return new;
  end if;

  select owner_id into v_owner
  from public.community_gallery_media
  where id = new.media_id;

  if v_owner is not null and v_owner <> new.author_id then
    v_preview := left(
      case when new.audience = 'author_only' then 'Comentário privado: ' else 'Comentário: ' end
      || btrim(new.body),
      180
    );
    insert into public.notifications(recipient_id, actor_id, kind, resource_id, event_id, preview)
    values (v_owner, new.author_id, 'gallery_comment', new.media_id, new.id, v_preview)
    on conflict (recipient_id, kind, event_id) do nothing;
  end if;

  return new;
end;
$function$;
