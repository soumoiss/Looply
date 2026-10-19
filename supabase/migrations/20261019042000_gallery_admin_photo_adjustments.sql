-- Shared photo rotation and positioning, restricted to the verified administrator.
create table if not exists public.gallery_media_adjustments (
  source text not null check (source in ('archive', 'community')),
  media_id uuid not null,
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  position_x smallint not null default 0 check (position_x between -20 and 20),
  position_y smallint not null default 0 check (position_y between -20 and 20),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (source, media_id)
);

alter table public.gallery_media_adjustments enable row level security;
revoke all on table public.gallery_media_adjustments from public, anon, authenticated;
grant select on table public.gallery_media_adjustments to authenticated;

drop policy if exists gallery_media_adjustments_read_visible on public.gallery_media_adjustments;
create policy gallery_media_adjustments_read_visible
on public.gallery_media_adjustments
for select to authenticated
using (
  (source = 'archive' and (select private.can_view_archive_media(media_id)))
  or
  (source = 'community' and (select private.can_view_community_gallery_media(media_id)))
);

create or replace function public.set_gallery_media_adjustment(
  p_source text,
  p_media_id uuid,
  p_rotation integer,
  p_position_x integer,
  p_position_y integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  media_exists boolean := false;
begin
  if actor_id is null or not coalesce((select private.is_admin()), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_source not in ('archive', 'community')
     or p_media_id is null
     or p_rotation not in (0, 90, 180, 270)
     or p_position_x not between -20 and 20
     or p_position_y not between -20 and 20 then
    raise exception 'Invalid photo adjustment' using errcode = '22023';
  end if;

  if p_source = 'archive' then
    select exists(select 1 from public.archive_media where id = p_media_id) into media_exists;
  else
    select exists(select 1 from public.community_gallery_media where id = p_media_id) into media_exists;
  end if;
  if not media_exists then
    raise exception 'Gallery media not found' using errcode = 'P0002';
  end if;

  insert into public.gallery_media_adjustments(source, media_id, rotation, position_x, position_y, updated_by, updated_at)
  values (p_source, p_media_id, p_rotation, p_position_x, p_position_y, actor_id, now())
  on conflict (source, media_id) do update
  set rotation = excluded.rotation,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
end;
$function$;

revoke all on function public.set_gallery_media_adjustment(text, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.set_gallery_media_adjustment(text, uuid, integer, integer, integer) to authenticated;

create or replace function private.cleanup_gallery_media_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.gallery_media_adjustments
  where source = case when tg_table_name = 'archive_media' then 'archive' else 'community' end
    and media_id = old.id;
  return old;
end;
$function$;

revoke all on function private.cleanup_gallery_media_adjustment() from public, anon, authenticated;
drop trigger if exists archive_media_cleanup_adjustment on public.archive_media;
create trigger archive_media_cleanup_adjustment
after delete on public.archive_media
for each row execute function private.cleanup_gallery_media_adjustment();
drop trigger if exists community_gallery_media_cleanup_adjustment on public.community_gallery_media;
create trigger community_gallery_media_cleanup_adjustment
after delete on public.community_gallery_media
for each row execute function private.cleanup_gallery_media_adjustment();
