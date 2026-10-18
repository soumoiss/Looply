-- Gallery social experience: private passcodes, owner-managed tags and privacy-aware notifications.
create table if not exists private.gallery_private_passcodes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table private.gallery_private_passcodes enable row level security;
revoke all on table private.gallery_private_passcodes from public, anon, authenticated;

create or replace function public.set_gallery_private_passcode(p_password text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_password is null or char_length(p_password) < 6 or char_length(p_password) > 128 then
    raise exception 'Passcode must contain 6 to 128 characters' using errcode='22023';
  end if;
  insert into private.gallery_private_passcodes(user_id,password_hash,updated_at)
  values(v_user,extensions.crypt(p_password,extensions.gen_salt('bf')),now())
  on conflict(user_id) do update set password_hash=excluded.password_hash,updated_at=now();
end;
$$;
create or replace function public.verify_gallery_private_passcode(p_password text)
returns boolean language sql security definer set search_path = ''
as $$
  select coalesce((
    select password_hash = extensions.crypt(p_password,password_hash)
    from private.gallery_private_passcodes where user_id=(select auth.uid())
  ),false);
$$;
revoke all on function public.set_gallery_private_passcode(text),public.verify_gallery_private_passcode(text) from public,anon;
grant execute on function public.set_gallery_private_passcode(text),public.verify_gallery_private_passcode(text) to authenticated;

drop policy if exists "Only administrator can add people tags" on public.gallery_media_people;
drop policy if exists "Only administrator can remove people tags" on public.gallery_media_people;
create policy gallery_people_manage_insert on public.gallery_media_people for insert to authenticated
with check (
  created_by=(select auth.uid()) and (
    (source='community' and (select private.can_manage_community_gallery_media(media_id)))
    or (source='archive' and (select private.can_manage_archive_media(media_id)))
  )
);
create policy gallery_people_manage_delete on public.gallery_media_people for delete to authenticated
using (
  (source='community' and (select private.can_manage_community_gallery_media(media_id)))
  or (source='archive' and (select private.can_manage_archive_media(media_id)))
);

create or replace function private.guard_gallery_media_people()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_visibility text; v_owner uuid;
begin
  if new.source='community' then
    select visibility,owner_id into v_visibility,v_owner from public.community_gallery_media where id=new.media_id;
    if not (select private.can_manage_community_gallery_media(new.media_id)) then raise exception 'Not permitted to tag this media' using errcode='42501'; end if;
    if v_visibility='exclusive' and new.person_id<>v_owner and not exists (
      select 1 from public.community_gallery_media_recipients r where r.media_id=new.media_id and r.user_id=new.person_id and r.can_view
    ) and not public.is_looply_admin(new.person_id) then raise exception 'Tagged person must be able to view this media' using errcode='42501'; end if;
  elsif new.source='archive' then
    select visibility into v_visibility from public.archive_media where id=new.media_id;
    if not (select private.can_manage_archive_media(new.media_id)) then raise exception 'Not permitted to tag archive media' using errcode='42501'; end if;
    if v_visibility='exclusive' and not exists (
      select 1 from public.archive_media_recipients r where r.media_id=new.media_id and r.user_id=new.person_id
    ) and not public.is_looply_admin(new.person_id) then raise exception 'Tagged person must be able to view this media' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists gallery_people_access_guard on public.gallery_media_people;
create trigger gallery_people_access_guard before insert on public.gallery_media_people
for each row execute function private.guard_gallery_media_people();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check(kind in ('post','comment','reply','music_dedication','gallery_comment','gallery_tag'));

create or replace function private.notify_gallery_tag()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.person_id<>new.created_by then
    insert into public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    values(new.person_id,new.created_by,'gallery_tag',new.media_id,gen_random_uuid(),'Você foi marcado em uma mídia');
  end if;
  return new;
end;
$$;
drop trigger if exists gallery_tag_notification on public.gallery_media_people;
create trigger gallery_tag_notification after insert on public.gallery_media_people
for each row execute function private.notify_gallery_tag();

create or replace function private.notify_community_gallery_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  if new.audience not in ('members','media_viewers') then return new; end if;
  select owner_id into v_owner from public.community_gallery_media where id=new.media_id;
  if v_owner is not null and v_owner<>new.author_id then
    insert into public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    values(v_owner,new.author_id,'gallery_comment',new.media_id,new.id,left('Comentário: '||btrim(new.body),180))
    on conflict(recipient_id,kind,event_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists community_gallery_comment_notification on public.community_gallery_comments;
create trigger community_gallery_comment_notification after insert on public.community_gallery_comments
for each row execute function private.notify_community_gallery_comment();

create or replace function private.notify_selected_gallery_comment_recipient()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_author uuid; v_media uuid; v_body text; v_audience text;
begin
  select author_id,media_id,body,audience into v_author,v_media,v_body,v_audience
  from public.community_gallery_comments where id=new.comment_id;
  if v_audience='selected' and new.user_id<>v_author then
    insert into public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    values(new.user_id,v_author,'gallery_comment',v_media,new.comment_id,left('Comentário exclusivo: '||btrim(v_body),180))
    on conflict(recipient_id,kind,event_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists selected_gallery_comment_notification on public.community_gallery_comment_recipients;
create trigger selected_gallery_comment_notification after insert on public.community_gallery_comment_recipients
for each row execute function private.notify_selected_gallery_comment_recipient();


create or replace function private.notify_archive_gallery_comment()
returns trigger language plpgsql security definer set search_path = ''
as $
begin
  if new.audience in ('members','media_viewers') then
    insert into public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    select distinct tags.person_id,new.author_id,'gallery_comment',new.media_id,new.id,left('Comentário: '||btrim(new.body),180)
    from public.gallery_media_people tags
    where tags.source='archive' and tags.media_id=new.media_id and tags.person_id<>new.author_id
    on conflict(recipient_id,kind,event_id) do nothing;
  end if;
  return new;
end;
$;
drop trigger if exists archive_gallery_comment_notification on public.archive_media_comments;
create trigger archive_gallery_comment_notification after insert on public.archive_media_comments
for each row execute function private.notify_archive_gallery_comment();

create or replace function private.notify_selected_archive_comment_recipient()
returns trigger language plpgsql security definer set search_path = ''
as $
declare v_author uuid; v_media uuid; v_body text; v_audience text;
begin
  select author_id,media_id,body,audience into v_author,v_media,v_body,v_audience
  from public.archive_media_comments where id=new.comment_id;
  if v_audience='selected' and new.user_id<>v_author then
    insert into public.notifications(recipient_id,actor_id,kind,resource_id,event_id,preview)
    values(new.user_id,v_author,'gallery_comment',v_media,new.comment_id,left('Comentário exclusivo: '||btrim(v_body),180))
    on conflict(recipient_id,kind,event_id) do nothing;
  end if;
  return new;
end;
$;
drop trigger if exists selected_archive_comment_notification on public.archive_media_comment_recipients;
create trigger selected_archive_comment_notification after insert on public.archive_media_comment_recipients
for each row execute function private.notify_selected_archive_comment_recipient();

do $
begin
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_gallery_comments') then
    execute 'alter publication supabase_realtime add table public.community_gallery_comments';
  end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gallery_media_people') then
    execute 'alter publication supabase_realtime add table public.gallery_media_people';
  end if;
end $$;
