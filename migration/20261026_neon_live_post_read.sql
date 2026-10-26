-- The read policy must see new posts in public.posts, not frozen migration snapshots.
create or replace function public.v3_can_view_post(p_post_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select public.looply_legacy_uid()) is not null and exists(
   select 1 from public.posts p
    where p.id=p_post_id
      and not exists (select 1 from public.looply_content_moderation m
                      where m.content_type='post' and m.content_id=p.id)
      and (p.visibility='public'
        or p.author_id=(select public.looply_legacy_uid())
        or (p.visibility='selected' and exists (
           select 1 from public.post_recipients r where r.post_id=p.id
             and r.recipient_id=(select public.looply_legacy_uid())
        )))
 );
$$;
