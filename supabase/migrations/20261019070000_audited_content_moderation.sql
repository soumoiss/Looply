-- Reversible, audited moderation flags for posts and comments. Content remains stored.
create table if not exists public.looply_content_moderation (
  content_type text not null check (content_type in ('post', 'comment')),
  content_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 20 and 500),
  moderated_by uuid not null references public.profiles(id) on delete restrict,
  moderated_at timestamptz not null default now(),
  primary key (content_type, content_id)
);
alter table public.looply_content_moderation enable row level security;
revoke all on table public.looply_content_moderation from public, anon, authenticated;

create or replace function private.looply_content_is_hidden(p_content_type text, p_content_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.looply_content_moderation m
    where m.content_type = p_content_type and m.content_id = p_content_id
  );
$function$;
revoke all on function private.looply_content_is_hidden(text, uuid) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.looply_content_is_hidden(text, uuid) to anon, authenticated;

create or replace function private.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and not private.looply_content_is_hidden('post', p.id)
      and (
        p.visibility = 'public'
        or p.author_id = (select auth.uid())
        or (
          p.visibility = 'selected'
          and exists (
            select 1 from public.post_recipients pr
            where pr.post_id = p.id and pr.recipient_id = (select auth.uid())
          )
        )
      )
  );
$function$;
revoke all on function private.can_view_post(uuid) from public, anon, authenticated;
grant execute on function private.can_view_post(uuid) to anon, authenticated;

drop policy if exists comments_read_with_post on public.comments;
create policy comments_read_with_post
on public.comments
for select
to anon, authenticated
using (
  (select private.can_view_post(post_id))
  and not (select private.looply_content_is_hidden('comment', id))
);
