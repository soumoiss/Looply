-- Media-only publication contracts; comments remain text-only.
alter table public.posts alter column body drop not null;
alter table public.stories alter column body set default '';
alter table public.stories alter column body drop not null;
alter table public.posts drop constraint if exists posts_body_length;
alter table public.posts add constraint posts_body_length check (body is null or char_length(btrim(body)) <= 5000);
alter table public.posts drop constraint if exists posts_media_or_body;
alter table public.stories drop constraint if exists stories_body_length;
alter table public.stories add constraint stories_body_length check (body is null or char_length(body) <= 1000);

create index if not exists posts_created_id_idx on public.posts (created_at desc, id desc);
create index if not exists posts_author_created_id_idx on public.posts (author_id, created_at desc, id desc);
create index if not exists post_media_post_created_id_idx on public.post_media (post_id, created_at desc, id desc);
create index if not exists conversations_updated_id_idx on public.conversations (updated_at desc, id desc);
create index if not exists chat_messages_conversation_created_id_idx on public.chat_messages (conversation_id, created_at desc, id desc);
create index if not exists notifications_recipient_unread_created_idx on public.notifications (recipient_id, created_at desc) where read_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.push_subscriptions;

create or replace function public.create_selected_post(p_body text, p_recipient_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare new_post_id uuid; actor_id uuid := auth.uid(); recipient_count integer;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_body is not null and char_length(btrim(p_body)) > 5000 then raise exception 'Post text is too long' using errcode = '22023'; end if;
  if p_recipient_ids is null or cardinality(p_recipient_ids) < 1 or cardinality(p_recipient_ids) > 20 then raise exception 'Choose 1 to 20 recipients' using errcode = '22023'; end if;
  select count(*) into recipient_count from (select distinct unnest(p_recipient_ids) as id) selected join public.profiles on profiles.id = selected.id and profiles.profile_visibility <> 'private';
  if recipient_count <> (select count(distinct id) from unnest(p_recipient_ids) as ids(id)) then raise exception 'Invalid recipients' using errcode = '42501'; end if;
  insert into public.posts(author_id, body, visibility) values (actor_id, nullif(btrim(p_body), ''), 'selected') returning id into new_post_id;
  insert into public.post_recipients(post_id, recipient_id) select new_post_id, id from (select distinct unnest(p_recipient_ids) as id) selected;
  return new_post_id;
end;
$function$;
