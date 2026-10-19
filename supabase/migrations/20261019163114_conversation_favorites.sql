create table if not exists public.conversation_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_favorites enable row level security;

grant select, insert, delete on public.conversation_favorites to authenticated;

drop policy if exists "Users read their own conversation favorites" on public.conversation_favorites;
create policy "Users read their own conversation favorites"
  on public.conversation_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add favorites for conversations they participate in" on public.conversation_favorites;
create policy "Users add favorites for conversations they participate in"
  on public.conversation_favorites for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = conversation_favorites.conversation_id
        and cp.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users remove their own conversation favorites" on public.conversation_favorites;
create policy "Users remove their own conversation favorites"
  on public.conversation_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);
