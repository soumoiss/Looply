-- Restore the database RPC and metadata table required by "Responder em particular".
create table if not exists public.story_replies (
  story_id uuid not null references public.stories (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid not null,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id),
  foreign key (message_id, conversation_id)
    references public.chat_messages (id, conversation_id) on delete cascade
);
create index if not exists story_replies_story_created_idx on public.story_replies (story_id, created_at desc);
create index if not exists story_replies_sender_created_idx on public.story_replies (sender_id, created_at desc);

alter table public.story_replies enable row level security;
revoke all on table public.story_replies from public, anon, authenticated;
grant select on public.story_replies to authenticated;

drop policy if exists story_replies_select_sender_or_story_author on public.story_replies;
create policy story_replies_select_sender_or_story_author
on public.story_replies for select to authenticated
using (
  sender_id = (select auth.uid())
  or exists (
    select 1 from public.stories as s
    where s.id = story_id and s.author_id = (select auth.uid())
  )
);

create or replace function public.send_story_reply(p_story_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  story_author_id uuid;
  conversation_id uuid;
  message_id uuid;
  clean_body text := btrim(coalesce(p_body, ''));
  message_body text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(clean_body) not between 1 and 2000 then
    raise exception 'Story reply is invalid' using errcode = '22023';
  end if;

  select s.author_id into story_author_id
  from public.stories as s
  where s.id = p_story_id and s.expires_at > now();
  if story_author_id is null or story_author_id = actor_id
     or not private.can_view_story(p_story_id) then
    raise exception 'Story is unavailable for private reply' using errcode = '42501';
  end if;

  conversation_id := public.create_direct_conversation(actor_id, story_author_id);
  message_body := '↩ Resposta ao seu story' || E'\n\n' || clean_body;
  insert into public.chat_messages (conversation_id, sender_id, body)
  values (conversation_id, actor_id, message_body)
  returning id into message_id;
  insert into public.story_replies (story_id, conversation_id, message_id, sender_id)
  values (p_story_id, conversation_id, message_id, actor_id);

  return jsonb_build_object('conversation_id', conversation_id, 'message_id', message_id);
end;
$function$;

revoke all on function public.send_story_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.send_story_reply(uuid, text) to authenticated;
