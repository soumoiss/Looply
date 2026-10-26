-- Persist each member's saved feed posts under their own Neon identity.
-- No existing post or interaction rows are modified.
create table public.saved_posts (
  user_id uuid not null default public.looply_legacy_uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.saved_posts enable row level security;
revoke all on table public.saved_posts from public, authenticated;
grant select, insert, delete on public.saved_posts to authenticated;

create policy saved_posts_read_own_visible
  on public.saved_posts for select to authenticated
  using (user_id = (select public.looply_legacy_uid()) and (select public.v3_can_view_post(post_id)));

create policy saved_posts_insert_own_visible
  on public.saved_posts for insert to authenticated
  with check (user_id = (select public.looply_legacy_uid()) and (select public.v3_can_view_post(post_id)));

-- Deleting one's own saved reference remains possible if access to the post later changes.
create policy saved_posts_delete_own
  on public.saved_posts for delete to authenticated
  using (user_id = (select public.looply_legacy_uid()));
