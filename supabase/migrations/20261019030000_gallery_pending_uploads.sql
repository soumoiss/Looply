alter table public.community_gallery_media
  add column if not exists publication_state text not null default 'published';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='community_gallery_publication_state_check'
      and conrelid='public.community_gallery_media'::regclass
  ) then
    alter table public.community_gallery_media
      add constraint community_gallery_publication_state_check
      check (publication_state in ('pending','published'));
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
          media.publication_state = 'published'
          and media.private_owner_id is null
          and (
            media.visibility = 'members'
            or exists (
              select 1 from public.community_gallery_media_recipients recipient
              where recipient.media_id=media.id
                and recipient.user_id=(select auth.uid())
                and recipient.can_view
            )
          )
        )
      )
  );
$function$;

create or replace function public.cleanup_pending_gallery_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  delete from public.community_gallery_media
  where id=p_media_id and owner_id=v_actor and publication_state='pending';
  if not found then
    raise exception 'Pending gallery media not found or not owned by caller' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public.cleanup_pending_gallery_media(uuid) from public,anon;
grant execute on function public.cleanup_pending_gallery_media(uuid) to authenticated;

drop policy if exists looply_gallery_admin_delete on storage.objects;
create policy looply_gallery_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id='looply-gallery'
  and (storage.foldername(name))[1]='gallery'
  and (
    (select private.is_admin())
    or (
      private.try_uuid((storage.foldername(name))[2])=(select auth.uid())
      and (
        not exists (select 1 from public.community_gallery_media media where media.storage_path=objects.name)
        or exists (
          select 1 from public.community_gallery_media media
          where media.storage_path=objects.name
            and media.owner_id=(select auth.uid())
            and media.publication_state='pending'
        )
      )
    )
  )
);