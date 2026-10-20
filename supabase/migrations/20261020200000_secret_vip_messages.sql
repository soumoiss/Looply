create table if not exists public.secret_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  media_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  constraint secret_messages_read_state check ((is_read and read_at is not null) or (not is_read and read_at is null))
);

create index if not exists secret_messages_recipient_unread_idx
  on public.secret_messages (recipient_id, created_at desc) where is_read = false;
create index if not exists secret_messages_sender_created_idx
  on public.secret_messages (sender_id, created_at desc);

alter table public.secret_messages enable row level security;

drop policy if exists "secret_messages_recipient_or_admin_select" on public.secret_messages;
create policy "secret_messages_recipient_or_admin_select"
  on public.secret_messages for select to authenticated
  using (recipient_id = auth.uid() or public.is_looply_admin(auth.uid()));

drop policy if exists "secret_messages_admin_insert" on public.secret_messages;
create policy "secret_messages_admin_insert"
  on public.secret_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_looply_admin(auth.uid()));

drop policy if exists "secret_messages_admin_delete_unread" on public.secret_messages;
create policy "secret_messages_admin_delete_unread"
  on public.secret_messages for delete to authenticated
  using (sender_id = auth.uid() and public.is_looply_admin(auth.uid()) and is_read = false);

drop policy if exists "secret_messages_recipient_mark_read" on public.secret_messages;
create policy "secret_messages_recipient_mark_read"
  on public.secret_messages for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

revoke all on public.secret_messages from anon;
grant select on public.secret_messages to authenticated;
grant insert, delete on public.secret_messages to authenticated;
revoke update on public.secret_messages from authenticated;
grant update (is_read, read_at) on public.secret_messages to authenticated;
