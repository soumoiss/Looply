-- Gallery experience: authenticated members edit visible images; only ADM pins/ACL.
create or replace function public.v6_gallery_visible(p_source text,p_media_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.looply_legacy_uid() is not null and case p_source
 when 'community' then exists(select 1 from public.community_gallery_media m where m.id=p_media_id and (m.owner_id=public.looply_legacy_uid() or public.v3_self_is_admin() or (m.publication_state='published' and m.private_owner_id is null and (m.visibility='members' or exists(select 1 from public.gallery_media_viewers v where v.media_id=m.id and v.user_id=public.looply_legacy_uid())))))
 when 'archive' then exists(select 1 from public.archive_media m where m.id=p_media_id and (m.visibility in ('public','members') or public.v3_self_is_admin())) else false end;
$$;
revoke all on function public.v6_gallery_visible(text,uuid) from public;
grant execute on function public.v6_gallery_visible(text,uuid) to authenticated;
create table if not exists public.gallery_media_pins(source text not null,media_id uuid not null,pinned_at timestamptz not null default now(),primary key(source,media_id));
alter table public.gallery_media_pins enable row level security;
alter table public.gallery_media_adjustments add column if not exists zoom numeric not null default 1 check(zoom between 1 and 3);
alter table public.gallery_media_adjustments add column if not exists filter text not null default 'none' check(filter in ('none','grayscale(1)','sepia(1)','contrast(1.2) saturate(1.3)'));
create or replace function public.set_gallery_media_adjustment(p_source text,p_media_id uuid,p_rotation integer,p_position_x integer,p_position_y integer,p_zoom numeric default 1,p_filter text default 'none')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.v6_gallery_visible(p_source,p_media_id) then raise exception 'Media access required' using errcode='42501'; end if;
 if p_rotation is null or p_rotation not in(0,90,180,270) or p_position_x is null or p_position_x not between -20 and 20 or p_position_y is null or p_position_y not between -20 and 20 or p_zoom is null or p_zoom not between 1 and 3 or p_filter is null or p_filter not in('none','grayscale(1)','sepia(1)','contrast(1.2) saturate(1.3)') then raise exception 'Invalid edit' using errcode='22023'; end if;
 insert into public.gallery_media_adjustments(source,media_id,rotation,position_x,position_y,zoom,filter,updated_by) values(p_source,p_media_id,p_rotation,p_position_x,p_position_y,p_zoom,p_filter,public.looply_legacy_uid()) on conflict(source,media_id) do update set rotation=excluded.rotation,position_x=excluded.position_x,position_y=excluded.position_y,zoom=excluded.zoom,filter=excluded.filter,updated_by=excluded.updated_by,updated_at=now();
end $$;
create or replace function public.set_gallery_media_pinned(p_source text,p_media_id uuid,p_pinned boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.v3_self_is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if not public.v6_gallery_visible(p_source,p_media_id) then raise exception 'Media access required' using errcode='42501'; end if;
 if p_pinned then insert into public.gallery_media_pins(source,media_id) values(p_source,p_media_id) on conflict do nothing; else delete from public.gallery_media_pins where source=p_source and media_id=p_media_id; end if;
end $$;
create or replace function public.set_gallery_media_private(p_source text,p_media_id uuid,p_private boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.v6_gallery_visible(p_source,p_media_id) then raise exception 'Media access required' using errcode='42501'; end if;
 if p_private then insert into public.gallery_private_items(user_id,source,media_id,owner_private) values(public.looply_legacy_uid(),p_source,p_media_id,false) on conflict(user_id,source,media_id) do nothing;
 else delete from public.gallery_private_items where user_id=public.looply_legacy_uid() and source=p_source and media_id=p_media_id; end if;
end $$;
-- ACL editing deliberately limited to ADM, including when caller owns the media.
create or replace function public.set_gallery_media_permissions(p_source text,p_media_id uuid,p_visibility text,p_comment_access text,p_viewer_ids uuid[],p_commenter_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.v3_self_is_admin(),false) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_source <> 'community' or not public.v6_gallery_visible(p_source,p_media_id) then raise exception 'Unsupported or inaccessible media' using errcode='42501'; end if;
 if p_visibility not in('members','exclusive') or p_visibility is null or coalesce(cardinality(p_viewer_ids),0)>100 or (p_visibility='exclusive' and coalesce(cardinality(p_viewer_ids),0)=0) then raise exception 'Invalid audience' using errcode='22023'; end if;
 delete from public.gallery_media_viewers where media_id=p_media_id;
 if p_visibility='exclusive' then insert into public.gallery_media_viewers(media_id,user_id) select p_media_id,unnest(p_viewer_ids) on conflict do nothing; end if;
 update public.community_gallery_media set visibility=p_visibility where id=p_media_id;
end $$;
revoke all on function public.set_gallery_media_adjustment(text,uuid,integer,integer,integer,numeric,text), public.set_gallery_media_pinned(text,uuid,boolean),public.set_gallery_media_private(text,uuid,boolean),public.set_gallery_media_permissions(text,uuid,text,text,uuid[],uuid[]) from public;
grant execute on function public.set_gallery_media_adjustment(text,uuid,integer,integer,integer,numeric,text),public.set_gallery_media_pinned(text,uuid,boolean),public.set_gallery_media_private(text,uuid,boolean),public.set_gallery_media_permissions(text,uuid,text,text,uuid[],uuid[]) to authenticated;
grant select on public.gallery_media_pins to authenticated;
create policy v6_read on public.gallery_media_pins for select to authenticated using(public.v6_gallery_visible(source,media_id));
grant select on public.gallery_media_adjustments to authenticated;
create policy v6_read on public.gallery_media_adjustments for select to authenticated using(public.v6_gallery_visible(source,media_id));
grant select,insert,update,delete on public.gallery_private_items to authenticated;
create policy v6_self on public.gallery_private_items for all to authenticated using(user_id=public.looply_legacy_uid()) with check(user_id=public.looply_legacy_uid());
grant select,insert,update,delete on public.gallery_albums to authenticated;
create policy v6_self on public.gallery_albums for all to authenticated using(owner_id=public.looply_legacy_uid()) with check(owner_id=public.looply_legacy_uid());
grant select,insert,update,delete on public.gallery_album_items to authenticated;
create policy v6_album_items on public.gallery_album_items for all to authenticated using(exists(select 1 from public.gallery_albums a where a.id=album_id and a.owner_id=public.looply_legacy_uid())) with check(public.v6_gallery_visible(source,media_id) and exists(select 1 from public.gallery_albums a where a.id=album_id and a.owner_id=public.looply_legacy_uid()));
grant select,insert,delete on public.community_gallery_media_likes to authenticated;
create policy v6_read on public.community_gallery_media_likes for select to authenticated using(public.v6_gallery_visible('community',media_id));
create policy v6_self on public.community_gallery_media_likes for all to authenticated using(user_id=public.looply_legacy_uid()) with check(user_id=public.looply_legacy_uid() and public.v6_gallery_visible('community',media_id));
grant select,insert,delete on public.archive_media_likes to authenticated;
create policy v6_read on public.archive_media_likes for select to authenticated using(public.v6_gallery_visible('archive',media_id));
create policy v6_self on public.archive_media_likes for all to authenticated using(user_id=public.looply_legacy_uid()) with check(user_id=public.looply_legacy_uid() and public.v6_gallery_visible('archive',media_id));

create or replace function public.create_community_gallery_comment(p_media_id uuid,p_body text,p_audience text default 'media_viewers',p_recipient_ids uuid[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; actor uuid:=public.looply_legacy_uid();
begin
 if not public.v6_gallery_visible('community',p_media_id) then raise exception 'Media access required' using errcode='42501'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 5000 or p_audience is null or p_audience not in('media_viewers','selected','author_only') or cardinality(p_recipient_ids)>100 or (p_audience='selected' and coalesce(cardinality(p_recipient_ids),0)=0) then raise exception 'Invalid comment' using errcode='22023'; end if;
 insert into public.community_gallery_comments(media_id,author_id,body,audience) values(p_media_id,actor,trim(p_body),p_audience) returning id into cid;
 if p_audience='selected' then insert into public.community_gallery_comment_recipients(comment_id,user_id) select cid,unnest(p_recipient_ids) on conflict do nothing; end if;
 return cid;
end $$;
revoke all on function public.create_community_gallery_comment(uuid,text,text,uuid[]) from public;
grant execute on function public.create_community_gallery_comment(uuid,text,text,uuid[]) to authenticated;
grant select on public.community_gallery_comments,public.community_gallery_comment_recipients to authenticated;
create policy v6_self on public.community_gallery_comment_recipients for select to authenticated using(user_id=public.looply_legacy_uid());
create policy v6_read on public.community_gallery_comments for select to authenticated using(public.v6_gallery_visible('community',media_id) and (audience='media_viewers' or author_id=public.looply_legacy_uid() or (audience='selected' and exists(select 1 from public.community_gallery_comment_recipients r where r.comment_id=id and r.user_id=public.looply_legacy_uid())) or (audience='author_only' and exists(select 1 from public.community_gallery_media m where m.id=media_id and m.owner_id=public.looply_legacy_uid()))));

create or replace function public.create_archive_media_comment(p_media_id uuid,p_body text,p_audience text default 'media_viewers',p_recipient_ids uuid[] default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; actor uuid:=public.looply_legacy_uid();
begin
 if not public.v6_gallery_visible('archive',p_media_id) then raise exception 'Media access required' using errcode='42501'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 5000 or p_audience is null or p_audience not in('media_viewers','selected','author_only') or cardinality(p_recipient_ids)>100 or (p_audience='selected' and coalesce(cardinality(p_recipient_ids),0)=0) then raise exception 'Invalid comment' using errcode='22023'; end if;
 insert into public.archive_media_comments(media_id,author_id,body,audience) values(p_media_id,actor,trim(p_body),p_audience) returning id into cid;
 if p_audience='selected' then insert into public.archive_media_comment_recipients(comment_id,user_id) select cid,unnest(p_recipient_ids) on conflict do nothing; end if;
 return cid;
end $$;
revoke all on function public.create_archive_media_comment(uuid,text,text,uuid[]) from public;
grant execute on function public.create_archive_media_comment(uuid,text,text,uuid[]) to authenticated;
grant select on public.archive_media_comments,public.archive_media_comment_recipients to authenticated;
create policy v6_self on public.archive_media_comment_recipients for select to authenticated using(user_id=public.looply_legacy_uid());
create policy v6_read on public.archive_media_comments for select to authenticated using(public.v6_gallery_visible('archive',media_id) and (audience='media_viewers' or author_id=public.looply_legacy_uid() or (audience='selected' and exists(select 1 from public.archive_media_comment_recipients r where r.comment_id=id and r.user_id=public.looply_legacy_uid())) or (audience='author_only' and exists(select 1 from public.community_gallery_media m where m.id=media_id and m.owner_id=public.looply_legacy_uid()))));
