-- Persistencia do placar do jogo da velha entre dispositivos.
create table if not exists public.chat_ttt_results (
  game_id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  x_player uuid not null references public.profiles(id) on delete cascade,
  o_player uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid references public.profiles(id) on delete set null,
  is_draw boolean not null default false,
  created_at timestamptz not null default now(),
  constraint chat_ttt_distinct_players check (x_player <> o_player),
  constraint chat_ttt_valid_result check (
    (is_draw and winner_id is null) or
    (not is_draw and winner_id in (x_player, o_player))
  )
);

alter table public.chat_ttt_results enable row level security;
revoke all on table public.chat_ttt_results from public, anon, authenticated;
grant select, insert on table public.chat_ttt_results to authenticated;

drop policy if exists chat_ttt_participants_read on public.chat_ttt_results;
create policy chat_ttt_participants_read on public.chat_ttt_results
  for select to authenticated
  using (exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = chat_ttt_results.conversation_id
      and participant.user_id = (select auth.uid())
  ));

drop policy if exists chat_ttt_participants_insert on public.chat_ttt_results;
create policy chat_ttt_participants_insert on public.chat_ttt_results
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversation_participants participant
      where participant.conversation_id = chat_ttt_results.conversation_id
        and participant.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.conversation_participants participant
      where participant.conversation_id = chat_ttt_results.conversation_id
        and participant.user_id = chat_ttt_results.x_player
    )
    and exists (
      select 1 from public.conversation_participants participant
      where participant.conversation_id = chat_ttt_results.conversation_id
        and participant.user_id = chat_ttt_results.o_player
    )
  );

create or replace function public.record_chat_ttt_result(
  p_game_id uuid,
  p_conversation_id uuid,
  p_x_player uuid,
  p_o_player uuid,
  p_winner_id uuid,
  p_is_draw boolean
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  inserted_count integer;
begin
  if actor_id is null or p_game_id is null or p_conversation_id is null
     or p_x_player is null or p_o_player is null or p_x_player = p_o_player then
    raise exception 'invalid game result';
  end if;
  if not exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = actor_id
  ) or not exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = p_x_player
  ) or not exists (
    select 1 from public.conversation_participants participant
    where participant.conversation_id = p_conversation_id
      and participant.user_id = p_o_player
  ) then
    raise exception 'game players must belong to the conversation';
  end if;
  if p_is_draw then
    if p_winner_id is not null then raise exception 'draw cannot have a winner'; end if;
  elsif p_winner_id is null or p_winner_id not in (p_x_player, p_o_player) then
    raise exception 'winner must be a game player';
  end if;

  insert into public.chat_ttt_results(game_id, conversation_id, x_player, o_player, winner_id, is_draw)
  values (p_game_id, p_conversation_id, p_x_player, p_o_player, p_winner_id, p_is_draw)
  on conflict (game_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke all on function public.record_chat_ttt_result(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.record_chat_ttt_result(uuid, uuid, uuid, uuid, uuid, boolean) to authenticated;
