-- Super-ADM global moderation contract. The private admin membership remains the
-- authority; this table only records reversible moderation state.
alter table public.looply_content_moderation
  drop constraint if exists looply_content_moderation_content_type_check;
alter table public.looply_content_moderation
  add constraint looply_content_moderation_content_type_check
  check (content_type in (
    'post','comment','archive_media','archive_media_comment','music_page_comment',
    'story','community_gallery_media','community_letter','music_dedication',
    'music_library','conversation','chat_message','chat_media','profile'
  ));

create index if not exists looply_content_moderation_type_time_idx
  on public.looply_content_moderation(content_type, moderated_at desc);

alter table private.admin_audit drop constraint if exists admin_audit_resource_type_check;
alter table private.admin_audit add constraint admin_audit_resource_type_check check (
  resource_type in (
    'posts','music_dedications','music_library','youtube_track_comments','profiles',
    'post_media','music_comments','conversations','letters','chat_messages','chat_media',
    'archive_media','archive_media_comments','archived_cards','audit','announcements',
    'stories','community_gallery_media','community_letters'
  )
  not valid
);

create or replace function public.record_looply_admin_access(
  p_actor_id uuid, p_event text, p_resource_type text, p_resource_id uuid,
  p_purpose text, p_request_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare audit_id uuid;
begin
  if p_actor_id is null
     or p_event not in ('access_denied','read_requested','read_completed','read_failed','write_requested','write_completed','write_failed','moderation_requested','moderation_completed','moderation_failed')
     or p_resource_type not in ('posts','music_dedications','music_library','youtube_track_comments','profiles','post_media','music_comments','conversations','letters','chat_messages','chat_media','archive_media','archive_media_comments','archived_cards','audit','announcements','stories','community_gallery_media','community_letters')
     or p_purpose is null or char_length(btrim(p_purpose)) not between 20 and 500
     or p_request_id is null then
    raise exception 'Invalid administrative audit event' using errcode = '22023';
  end if;
  if p_event <> 'access_denied' and not exists (
    select 1 from private.admin_users administrator where administrator.user_id = p_actor_id
  ) then
    raise exception 'Administrator membership required' using errcode = '42501';
  end if;
  insert into private.admin_audit(actor_id,event,resource_type,resource_id,purpose,request_id,metadata)
  values (p_actor_id,p_event,p_resource_type,p_resource_id,btrim(p_purpose),p_request_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into audit_id;
  return audit_id;
end;
$function$;
revoke all on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_looply_admin_access(uuid,text,text,uuid,text,uuid,jsonb) to service_role;

-- Story visibility must consult the same moderation state as feed visibility.
create or replace function private.can_view_story(p_story_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.stories s
    where s.id = p_story_id
      and not private.looply_content_is_hidden('story', s.id)
      and (
        s.author_id = (select auth.uid())
        or (s.expires_at > now() and s.visibility = 'public')
        or (
          s.expires_at > now() and s.visibility = 'selected'
          and exists (select 1 from public.story_recipients r
            where r.story_id = s.id and r.recipient_id = (select auth.uid()))
        )
      )
  );
$function$;
revoke all on function private.can_view_story(uuid) from public, anon, authenticated;
grant execute on function private.can_view_story(uuid) to authenticated;

-- Gallery access already centralizes visibility in this helper; include the ADM
-- flag so hidden media cannot be reached through a direct signed-url request.
create or replace function private.can_view_community_gallery_media(p_media_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.community_gallery_media media
    where media.id = p_media_id
      and not private.looply_content_is_hidden('community_gallery_media', media.id)
      and (
        (select private.is_admin())
        or media.owner_id = (select auth.uid())
        or (
          media.publication_state = 'published'
          and media.private_owner_id is null
          and (
            media.visibility = 'members'
            or exists (select 1 from public.community_gallery_media_recipients r
              where r.media_id = media.id and r.user_id = (select auth.uid()) and r.can_view)
          )
        )
      )
  );
$function$;
revoke all on function private.can_view_community_gallery_media(uuid) from public, anon, authenticated;
grant execute on function private.can_view_community_gallery_media(uuid) to authenticated, service_role;
