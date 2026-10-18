-- Stage 6: persistent playlist-track and general music-page comments.
-- Track comments are visible only to their author and audited administrators.
create table public.music_page_comments (
  id uuid primary key default gen_random_uuid(),
  comment_type text not null check (comment_type in ('track','general')),
  playlist_id text,
  video_id text,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint music_page_comments_body_length check (char_length(btrim(body)) between 1 and 2000),
  constraint music_page_comments_track_identity check (
    (
      comment_type = 'track'
      and playlist_id is not null
      and video_id is not null
      and playlist_id in ('PLUZFdmgmipvI','PLCn4CAsA_tiM','PLE0tcB0gaSzM','PLD5PXwJcU-Sg','PLMeQ_QyqhY7s')
      and video_id ~ '^[A-Za-z0-9_-]{11}$'
    )
    or (comment_type = 'general' and playlist_id is null and video_id is null)
  )
);
create index music_page_comments_track_idx on public.music_page_comments(playlist_id, video_id, created_at);
create index music_page_comments_author_idx on public.music_page_comments(author_id, created_at desc);
alter table public.music_page_comments enable row level security;
revoke all on public.music_page_comments from public, anon, authenticated;
grant select, insert on public.music_page_comments to authenticated;
create policy music_page_comments_read_general_or_author_or_admin
on public.music_page_comments for select to authenticated
using (
  comment_type = 'general'
  or author_id = (select auth.uid())
  or (select private.is_admin())
);
create policy music_page_comments_insert_author
on public.music_page_comments for insert to authenticated
with check (author_id = (select auth.uid()));
alter publication supabase_realtime add table public.music_page_comments;

-- Extend the existing audited admin-read allowlist without changing existing records.
alter table private.admin_audit drop constraint if exists admin_audit_resource_type_check;
alter table private.admin_audit add constraint admin_audit_resource_type_check check (
  resource_type in (
    'posts','music_dedications','music_library','youtube_track_comments','profiles','post_media',
    'music_comments','conversations','letters','chat_messages','chat_media','archive_media',
    'archive_media_comments','archived_cards','audit'
  )
);
create or replace function public.record_looply_admin_access(
  p_actor_id uuid,
  p_event text,
  p_resource_type text,
  p_resource_id uuid,
  p_purpose text,
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare audit_id uuid;
begin
  if p_actor_id is null
     or p_event not in ('access_denied','read_requested','read_completed','read_failed','write_requested','write_completed','write_failed')
     or p_resource_type not in ('posts','music_dedications','music_library','youtube_track_comments','profiles','post_media','music_comments','conversations','letters','chat_messages','chat_media','archive_media','archive_media_comments','archived_cards','audit')
     or p_purpose is null or char_length(btrim(p_purpose)) not between 20 and 500
     or p_request_id is null then
    raise exception 'Invalid administrative audit event' using errcode = '22023';
  end if;
  if p_event <> 'access_denied' and not exists (
    select 1 from private.admin_users administrator where administrator.user_id = p_actor_id
  ) then
    raise exception 'Administrator membership required' using errcode = '42501';
  end if;
  insert into private.admin_audit (actor_id,event,resource_type,resource_id,purpose,request_id,metadata)
  values (p_actor_id,p_event,p_resource_type,p_resource_id,btrim(p_purpose),p_request_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into audit_id;
  return audit_id;
end;
$function$;
revoke all on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb) to service_role;
