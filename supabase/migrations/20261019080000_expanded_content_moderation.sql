-- Extend reversible moderation to legacy archive media/comments and music-track comments.
alter table public.looply_content_moderation
  drop constraint if exists looply_content_moderation_content_type_check;
alter table public.looply_content_moderation
  add constraint looply_content_moderation_content_type_check
  check (content_type in ('post','comment','archive_media','archive_media_comment','music_page_comment'));

create or replace function private.can_view_archive_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.archive_media media
    where media.id = p_media_id
      and not private.looply_content_is_hidden('archive_media', media.id)
      and (
        (select private.is_admin())
        or media.visibility = 'members'
        or exists (
          select 1 from public.archive_media_recipients recipient
          where recipient.media_id = media.id and recipient.user_id = (select auth.uid())
        )
      )
  );
$function$;
revoke all on function private.can_view_archive_media(uuid) from public, anon, authenticated;
grant execute on function private.can_view_archive_media(uuid) to authenticated, service_role;

create or replace function private.can_view_archive_media_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.archive_media_comments comment_row
    where comment_row.id = p_comment_id
      and not private.looply_content_is_hidden('archive_media_comment', comment_row.id)
      and not private.looply_content_is_hidden('archive_media', comment_row.media_id)
      and (
        comment_row.author_id = (select auth.uid())
        or (select private.is_admin())
        or comment_row.audience = 'members'
        or (comment_row.audience = 'media_viewers' and private.can_view_archive_media(comment_row.media_id))
        or (comment_row.audience = 'selected' and exists (
          select 1 from public.archive_media_comment_recipients recipient
          where recipient.comment_id = comment_row.id and recipient.user_id = (select auth.uid())
        ))
      )
  );
$function$;
revoke all on function private.can_view_archive_media_comment(uuid) from public, anon, authenticated;
grant execute on function private.can_view_archive_media_comment(uuid) to authenticated, service_role;

drop policy if exists music_page_comments_read_general_or_author_or_admin on public.music_page_comments;
create policy music_page_comments_read_general_or_author_or_admin
on public.music_page_comments for select to authenticated
using (
  not (select private.looply_content_is_hidden('music_page_comment', id))
  and (
    comment_type = 'general'
    or author_id = (select auth.uid())
    or (select private.is_admin())
  )
);
