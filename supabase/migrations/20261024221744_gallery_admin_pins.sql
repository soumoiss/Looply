create table if not exists public.gallery_media_pins (
  source text not null check (source in ('archive', 'community')),
  media_id uuid not null,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (source, media_id)
);

alter table public.gallery_media_pins enable row level security;
revoke all on table public.gallery_media_pins from public, anon;
grant select on table public.gallery_media_pins to authenticated;

create policy gallery_media_pins_visible on public.gallery_media_pins
for select to authenticated using (
  (source = 'archive' and (select private.can_view_archive_media(media_id)))
  or (source = 'community' and (select private.can_view_community_gallery_media(media_id)))
);

create or replace function public.set_gallery_media_pinned(
  p_source text,
  p_media_id uuid,
  p_pinned boolean
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_source not in ('archive', 'community') then
    raise exception 'Invalid gallery source' using errcode = '22023';
  end if;
  if p_source = 'archive' and not exists (select 1 from public.archive_media where id = p_media_id) then
    raise exception 'Media not found' using errcode = 'P0002';
  end if;
  if p_source = 'community' and not exists (select 1 from public.community_gallery_media where id = p_media_id) then
    raise exception 'Media not found' using errcode = 'P0002';
  end if;
  if p_pinned then
    insert into public.gallery_media_pins(source, media_id, pinned_by)
    values (p_source, p_media_id, auth.uid())
    on conflict (source, media_id) do update set pinned_by = excluded.pinned_by, pinned_at = now();
  else
    delete from public.gallery_media_pins where source = p_source and media_id = p_media_id;
  end if;
  return p_pinned;
end;
$$;

revoke all on function public.set_gallery_media_pinned(text, uuid, boolean) from public, anon;
grant execute on function public.set_gallery_media_pinned(text, uuid, boolean) to authenticated;

create or replace function private.cleanup_gallery_media_pin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.gallery_media_pins
  where source = tg_argv[0] and media_id = old.id;
  return old;
end;
$$;
revoke all on function private.cleanup_gallery_media_pin() from public, anon, authenticated;

drop trigger if exists archive_media_cleanup_pin on public.archive_media;
create trigger archive_media_cleanup_pin after delete on public.archive_media
for each row execute function private.cleanup_gallery_media_pin('archive');
drop trigger if exists community_gallery_media_cleanup_pin on public.community_gallery_media;
create trigger community_gallery_media_cleanup_pin after delete on public.community_gallery_media
for each row execute function private.cleanup_gallery_media_pin('community');
