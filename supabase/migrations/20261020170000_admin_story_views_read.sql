-- Allow administrators to inspect story views in moderation, without exposing view records to regular members.
drop policy if exists story_views_select_admin on public.story_views;
create policy story_views_select_admin
on public.story_views
for select
to authenticated
using ((select private.is_admin()));
