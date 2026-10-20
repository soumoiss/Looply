-- Availability checks are audited by the current looply-admin Edge Function.
-- Permit that event in both the table contract and the service-only RPC.
alter table private.admin_audit drop constraint if exists admin_audit_event_check;
alter table private.admin_audit add constraint admin_audit_event_check check (
  event in (
    'access_denied','read_requested','read_completed','read_failed',
    'write_requested','write_completed','write_failed',
    'admin_session_credential_created','admin_session_setup_rejected',
    'admin_session_rate_limited','admin_session_unlock_failed',
    'admin_session_unlocked','admin_session_revoked','admin_session_required',
    'moderation_requested','moderation_completed','moderation_failed',
    'availability_checked'
  )
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
     or p_event not in (
       'access_denied','read_requested','read_completed','read_failed',
       'write_requested','write_completed','write_failed',
       'moderation_requested','moderation_completed','moderation_failed',
       'availability_checked'
     )
     or p_resource_type not in (
       'posts','music_dedications','music_library','youtube_track_comments',
       'profiles','post_media','music_comments','conversations','letters',
       'chat_messages','chat_media','archive_media','archive_media_comments',
       'archived_cards','audit','announcements','stories',
       'community_gallery_media','community_letters'
     )
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

