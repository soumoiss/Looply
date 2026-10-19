-- Secure personal private-folder semantics and restrict registered gallery deletion to administrators.
alter table public.community_gallery_media
  add column if not exists private_owner_id uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_gallery_private_owner_matches_owner'
      and conrelid = 'public.community_gallery_media'::regclass
  ) then
    alter table public.community_gallery_media
      add constraint community_gallery_private_owner_matches_owner
      check (private_owner_id is null or private_owner_id = owner_id);
  end if;
end $$;

create or replace function private.can_view_community_gallery_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.community_gallery_media media
    where media.id = p_media_id
      and (
        (select private.is_admin())
        or media.owner_id = (select auth.uid())
        or (
          media.private_owner_id is null
          and (
            media.visibility = 'members'
            or exists (
              select 1
              from public.community_gallery_media_recipients recipient
              where recipient.media_id = media.id
                and recipient.user_id = (select auth.uid())
                and recipient.can_view
            )
          )
        )
      )
  );
$function$;

create table if not exists public.gallery_private_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('archive','community')),
  media_id uuid not null,
  owner_private boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, source, media_id)
);
create index if not exists gallery_private_items_user_created_idx
  on public.gallery_private_items(user_id, created_at desc);
alter table public.gallery_private_items enable row level security;
revoke all on public.gallery_private_items from public, anon, authenticated;
grant select on public.gallery_private_items to authenticated;
drop policy if exists gallery_private_items_owner_read on public.gallery_private_items;
create policy gallery_private_items_owner_read
on public.gallery_private_items for select to authenticated
using (
  user_id = (select auth.uid())
  and (
    (source = 'community' and (select private.can_view_community_gallery_media(media_id)))
    or (source = 'archive' and (select private.can_view_archive_media(media_id)))
  )
);

create or replace function public.set_gallery_media_private(
  p_source text,
  p_media_id uuid,
  p_private boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_source not in ('archive','community') or p_media_id is null or p_private is null then
    raise exception 'Invalid private-gallery request' using errcode = '22023';
  end if;

  if p_source = 'community' then
    select owner_id into v_owner
    from public.community_gallery_media
    where id = p_media_id
      and (select private.can_view_community_gallery_media(id))
    for update;
    if not found then
      raise exception 'Gallery media unavailable' using errcode = '42501';
    end if;

    if v_owner = v_actor then
      update public.community_gallery_media
      set private_owner_id = case when p_private then v_actor else null end
      where id = p_media_id;
      if p_private then
        insert into public.gallery_private_items(user_id, source, media_id, owner_private)
        values (v_actor, 'community', p_media_id, true)
        on conflict (user_id, source, media_id)
        do update set owner_private = true;
      else
        delete from public.gallery_private_items
        where user_id = v_actor and source = 'community' and media_id = p_media_id;
      end if;
      return;
    end if;
  else
    if not (select private.can_view_archive_media(p_media_id)) then
      raise exception 'Gallery media unavailable' using errcode = '42501';
    end if;
  end if;

  if p_private then
    insert into public.gallery_private_items(user_id, source, media_id, owner_private)
    values (v_actor, p_source, p_media_id, false)
    on conflict (user_id, source, media_id) do nothing;
  else
    delete from public.gallery_private_items
    where user_id = v_actor and source = p_source and media_id = p_media_id;
  end if;
end;
$function$;
revoke all on function public.set_gallery_media_private(text, uuid, boolean) from public, anon;
grant execute on function public.set_gallery_media_private(text, uuid, boolean) to authenticated;

-- Registered media can only be deleted by an administrator.
drop policy if exists community_gallery_owner_delete on public.community_gallery_media;
drop policy if exists community_gallery_admin_delete on public.community_gallery_media;
create policy community_gallery_admin_delete
on public.community_gallery_media for delete to authenticated
using ((select private.is_admin()));

drop policy if exists archive_media_admin_delete on public.archive_media;
create policy archive_media_admin_delete
on public.archive_media for delete to authenticated
using ((select private.is_admin()));

-- An owner may clean up an unregistered failed upload, but cannot delete a registered object.
drop policy if exists looply_gallery_delete_owner on storage.objects;
drop policy if exists looply_gallery_admin_delete on storage.objects;
create policy looply_gallery_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'looply-gallery'
  and (storage.foldername(name))[1] = 'gallery'
  and (
    (select private.is_admin())
    or (
      private.try_uuid((storage.foldername(name))[2]) = (select auth.uid())
      and not exists (
        select 1 from public.community_gallery_media media
        where media.storage_path = objects.name
      )
    )
  )
);
