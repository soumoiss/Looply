-- Allow audited administrator track comments to be addressed privately to a playlist owner.
alter table public.music_page_comments
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

alter table public.music_page_comments
  drop constraint if exists music_page_comments_track_identity;

alter table public.music_page_comments
  add constraint music_page_comments_track_identity check (
    (
      comment_type = 'track'
      and playlist_id is not null
      and playlist_id ~ '^[A-Za-z0-9_-]{1,100}$'
      and video_id is not null
      and video_id ~ '^[A-Za-z0-9_-]{11}$'
    )
    or (comment_type = 'general' and playlist_id is null and video_id is null and recipient_id is null)
  );

drop policy if exists music_page_comments_read_general_or_author_or_admin on public.music_page_comments;
drop policy if exists music_page_comments_read_general_author_admin_or_recipient on public.music_page_comments;
create policy music_page_comments_read_general_author_admin_or_recipient
on public.music_page_comments for select to authenticated
using (
  comment_type = 'general'
  or author_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (select private.is_admin())
);

create index if not exists music_page_comments_recipient_track_idx
  on public.music_page_comments(recipient_id, playlist_id, video_id, created_at)
  where recipient_id is not null;

grant select, insert on public.music_page_comments to authenticated;
