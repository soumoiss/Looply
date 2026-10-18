-- Allow authenticated members to publish an external URL on their own post.
-- The original table grants insert privileges only on author_id/body/visibility,
-- so inserting external_url was rejected with SQLSTATE 42501 despite a valid session.
grant insert (author_id, body, visibility, external_url) on public.posts to authenticated;

-- Like events use the same persistent notification inbox as posts/comments.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('post', 'comment', 'reply', 'music_dedication', 'post_like', 'story_like'));

create or replace function private.notify_looply_content_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id uuid;
  content_id uuid;
  actor_id uuid;
  content_kind text;
  preview_text text;
begin
  actor_id := new.user_id;
  if tg_table_name = 'post_likes' then
    select post.author_id into target_id
    from public.posts as post
    where post.id = new.post_id;
    content_id := new.post_id;
    content_kind := 'post_like';
    preview_text := 'Curtiu sua publicação';
  elsif tg_table_name = 'story_likes' then
    select story.author_id into target_id
    from public.stories as story
    where story.id = new.story_id;
    content_id := new.story_id;
    content_kind := 'story_like';
    preview_text := 'Curtiu seu story';
  else
    return new;
  end if;

  if target_id is not null and target_id <> actor_id then
    insert into public.notifications (recipient_id, actor_id, kind, resource_id, event_id, preview)
    values (target_id, actor_id, content_kind, content_id, gen_random_uuid(), preview_text);
  end if;
  return new;
end;
$function$;

revoke all on function private.notify_looply_content_like() from public, anon, authenticated;

drop trigger if exists post_likes_notify_owner on public.post_likes;
create trigger post_likes_notify_owner
after insert on public.post_likes
for each row execute function private.notify_looply_content_like();

drop trigger if exists story_likes_notify_owner on public.story_likes;
create trigger story_likes_notify_owner
after insert on public.story_likes
for each row execute function private.notify_looply_content_like();
