-- Global announcements with per-user read receipts, enforced by RLS.
create table if not exists public.global_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  constraint global_announcements_expiry_check check (expires_at is null or expires_at > starts_at)
);
create index if not exists global_announcements_active_window_idx
  on public.global_announcements (starts_at desc, created_at desc)
  where is_active;

alter table public.global_announcements enable row level security;
revoke all on table public.global_announcements from public, anon, authenticated;
grant select on table public.global_announcements to authenticated;
grant all on table public.global_announcements to service_role;
create policy global_announcements_read_active
on public.global_announcements for select to authenticated
using (
  is_active
  and starts_at <= now()
  and (expires_at is null or expires_at > now())
);

create table if not exists public.global_announcement_reads (
  announcement_id uuid not null references public.global_announcements(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index if not exists global_announcement_reads_user_idx
  on public.global_announcement_reads (user_id, read_at desc);

alter table public.global_announcement_reads enable row level security;
revoke all on table public.global_announcement_reads from public, anon, authenticated;
grant select, insert on table public.global_announcement_reads to authenticated;
grant all on table public.global_announcement_reads to service_role;
create policy global_announcement_reads_select_own
on public.global_announcement_reads for select to authenticated
using (user_id = (select auth.uid()));
create policy global_announcement_reads_insert_own
on public.global_announcement_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.global_announcements announcement
    where announcement.id = announcement_id
      and announcement.is_active
      and announcement.starts_at <= now()
      and (announcement.expires_at is null or announcement.expires_at > now())
  )
);

-- Record global announcements as their own resource type in the admin audit trail.
alter table private.admin_audit drop constraint if exists admin_audit_resource_type_check;
alter table private.admin_audit add constraint admin_audit_resource_type_check check (
  resource_type in (
    'posts','music_dedications','music_library','youtube_track_comments','profiles',
    'post_media','music_comments','conversations','letters','chat_messages','chat_media',
    'archive_media','archive_media_comments','archived_cards','audit','announcements'
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
     or p_resource_type not in ('posts','music_dedications','music_library','youtube_track_comments','profiles','post_media','music_comments','conversations','letters','chat_messages','chat_media','archive_media','archive_media_comments','archived_cards','audit','announcements')
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

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='global_announcements') then
    execute 'alter publication supabase_realtime add table public.global_announcements';
  end if;
end;
$publication$;
