-- Prevent selected-audience comments from being visible to users who cannot view the parent media.
-- This also protects older recipient rows created before the guard was added.
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

create or replace function private.can_view_community_gallery_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.community_gallery_comments comment_row
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
            select 1 from public.community_gallery_comment_recipients recipient
            where recipient.comment_id = comment_row.id
              and recipient.user_id = (select auth.uid())
          )
        )
      )
  );
$function$;

revoke all on function private.can_view_archive_media_comment(uuid) from public, anon, authenticated;
revoke all on function private.can_view_community_gallery_comment(uuid) from public, anon, authenticated;
grant execute on function private.can_view_archive_media_comment(uuid) to authenticated, service_role;
grant execute on function private.can_view_community_gallery_comment(uuid) to authenticated, service_role;
