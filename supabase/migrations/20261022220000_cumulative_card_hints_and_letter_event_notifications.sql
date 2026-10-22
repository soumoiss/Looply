create table if not exists public.letter_event_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users(id) on delete cascade,
 sender_id uuid references auth.users(id) on delete cascade,
 letter_type text not null check (letter_type in ('archived_card','community_letter')),
 letter_id uuid not null, event_type text not null check (event_type in ('new_received','recipient_unlocked')),
 created_at timestamptz not null default now(), read_at timestamptz, notified_at timestamptz,
 unique (recipient_id, letter_type, letter_id, event_type));
alter table public.letter_event_notifications enable row level security;
drop policy if exists letter_event_notifications_read_own on public.letter_event_notifications;
create policy letter_event_notifications_read_own on public.letter_event_notifications for select to authenticated using (recipient_id = (select auth.uid()) or sender_id = (select auth.uid()));
drop policy if exists letter_event_notifications_update_own on public.letter_event_notifications;
create policy letter_event_notifications_update_own on public.letter_event_notifications for update to authenticated using (recipient_id = (select auth.uid()) or sender_id = (select auth.uid())) with check (recipient_id = (select auth.uid()) or sender_id = (select auth.uid()));
revoke all on public.letter_event_notifications from anon; grant select, update on public.letter_event_notifications to authenticated;
alter table public.archived_cards add column if not exists password_hints jsonb not null default '[]'::jsonb;
update public.archived_cards set password_hints = jsonb_build_array(password_hint) where coalesce(trim(password_hint),'') <> '' and password_hints = '[]'::jsonb;
create or replace function public.looply_notify_new_community_letter() returns trigger language plpgsql security definer set search_path = '' as $$
begin if new.recipient_id is not null and new.recipient_id <> new.sender_id then
insert into public.letter_event_notifications(recipient_id,sender_id,letter_type,letter_id,event_type) values(new.recipient_id,new.sender_id,'community_letter',new.id,'new_received') on conflict do nothing; end if; return new; end $$;
drop trigger if exists looply_notify_new_community_letter on public.community_letters;
create trigger looply_notify_new_community_letter after insert on public.community_letters for each row execute function public.looply_notify_new_community_letter();
create or replace function public.looply_notify_new_archived_card() returns trigger language plpgsql security definer set search_path = '' as $$
begin if new.recipient_id is not null then insert into public.letter_event_notifications(recipient_id,sender_id,letter_type,letter_id,event_type) values(new.recipient_id,null,'archived_card',new.id,'new_received') on conflict do nothing; end if; return new; end $$;
drop trigger if exists looply_notify_new_archived_card on public.archived_cards;
create trigger looply_notify_new_archived_card after insert on public.archived_cards for each row execute function public.looply_notify_new_archived_card();
create or replace function public.looply_register_recipient_unlock(p_letter_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_sender uuid; v_recipient uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select sender_id,recipient_id into v_sender,v_recipient from public.community_letters where id=p_letter_id and is_protected=true;
 if not found or v_recipient<>auth.uid() or v_sender=auth.uid() then raise exception 'not_allowed'; end if;
 insert into public.letter_event_notifications(recipient_id,sender_id,letter_type,letter_id,event_type) values(v_recipient,v_sender,'community_letter',p_letter_id,'recipient_unlocked') on conflict do nothing;
 return true;
end $$;
revoke all on function public.looply_register_recipient_unlock(uuid) from public,anon;
grant execute on function public.looply_register_recipient_unlock(uuid) to authenticated;
