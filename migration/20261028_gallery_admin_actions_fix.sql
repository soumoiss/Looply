-- Complete the admin actions across both legacy and community gallery media.
create or replace function public.v7_gallery_storage_delete_allowed(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.v3_self_is_admin(),false) and (
 (p_bucket='looply-gallery' and exists(select 1 from public.community_gallery_media where storage_path=p_path)) or
 (p_bucket='looply-media' and exists(select 1 from public.archive_media where storage_path=p_path)));
$$;
revoke all on function public.v7_gallery_storage_delete_allowed(text,text) from public;
grant execute on function public.v7_gallery_storage_delete_allowed(text,text) to authenticated;
grant delete on public.community_gallery_media,public.archive_media to authenticated;
create policy v7_admin_delete on public.community_gallery_media for delete to authenticated using ((select public.v3_self_is_admin()));
create policy v7_admin_delete on public.archive_media for delete to authenticated using ((select public.v3_self_is_admin()));
create policy v7_admin_read on public.community_gallery_media for select to authenticated using ((select public.v3_self_is_admin()));
create policy v7_admin_read on public.archive_media for select to authenticated using ((select public.v3_self_is_admin()));
grant select on public.gallery_media_viewers,public.archive_media_recipients to authenticated;
create policy v7_admin_read on public.gallery_media_viewers for select to authenticated using ((select public.v3_self_is_admin()));
create policy v7_recipient_read on public.archive_media_recipients for select to authenticated using (user_id=(select public.looply_legacy_uid()) or (select public.v3_self_is_admin()));
create policy v7_exclusive_read on public.archive_media for select to authenticated using (visibility='exclusive' and exists(select 1 from public.archive_media_recipients r where r.media_id=archive_media.id and r.user_id=(select public.looply_legacy_uid())));
create or replace function public.v6_gallery_visible(p_source text,p_media_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.looply_legacy_uid() is not null and case p_source
 when 'community' then exists(select 1 from public.community_gallery_media m where m.id=p_media_id and (m.owner_id=public.looply_legacy_uid() or public.v3_self_is_admin() or (m.publication_state='published' and m.private_owner_id is null and (m.visibility='members' or exists(select 1 from public.gallery_media_viewers v where v.media_id=m.id and v.user_id=public.looply_legacy_uid())))))
 when 'archive' then exists(select 1 from public.archive_media m where m.id=p_media_id and (m.visibility='members' or public.v3_self_is_admin() or exists(select 1 from public.archive_media_recipients r where r.media_id=m.id and r.user_id=public.looply_legacy_uid()))) else false end;
$$;
create or replace function public.set_gallery_media_permissions(p_source text,p_media_id uuid,p_visibility text,p_comment_access text,p_viewer_ids uuid[],p_commenter_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.v3_self_is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_source is null or p_source not in('community','archive') or p_media_id is null then raise exception 'Invalid media' using errcode='22023'; end if;
 if p_visibility is null or p_visibility not in('members','exclusive') or p_comment_access is distinct from 'viewers' or coalesce(cardinality(p_viewer_ids),0)>100 or (p_visibility='exclusive' and coalesce(cardinality(p_viewer_ids),0)=0) or exists(select 1 from unnest(p_viewer_ids) v(id) where id is null or not exists(select 1 from public.profiles p where p.id=v.id)) then raise exception 'Invalid audience' using errcode='22023'; end if;
 if p_source='community' then
   perform 1 from public.community_gallery_media where id=p_media_id for update;
   if not found then raise exception 'Gallery media not found' using errcode='P0002'; end if;
   delete from public.gallery_media_viewers where media_id=p_media_id;
   if p_visibility='exclusive' then insert into public.gallery_media_viewers(media_id,user_id) select p_media_id,unnest(p_viewer_ids) on conflict do nothing; end if;
   update public.community_gallery_media set visibility=p_visibility,comment_access=p_comment_access where id=p_media_id;
 else
   perform 1 from public.archive_media where id=p_media_id for update;
   if not found then raise exception 'Gallery media not found' using errcode='P0002'; end if;
   delete from public.archive_media_recipients where media_id=p_media_id;
   if p_visibility='exclusive' then insert into public.archive_media_recipients(media_id,user_id) select p_media_id,unnest(p_viewer_ids) on conflict do nothing; end if;
   update public.archive_media set visibility=p_visibility,comment_access=p_comment_access where id=p_media_id;
 end if;
end $$;
revoke all on function public.set_gallery_media_permissions(text,uuid,text,text,uuid[],uuid[]) from public;
grant execute on function public.set_gallery_media_permissions(text,uuid,text,text,uuid[],uuid[]) to authenticated;
