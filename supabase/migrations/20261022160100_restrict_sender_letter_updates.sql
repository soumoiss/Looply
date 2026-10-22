-- Ordinary senders may update attachment metadata only; admins may edit full letter records.
drop policy if exists community_letters_sender_update on public.community_letters;
create policy community_letters_sender_update on public.community_letters
  for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

create or replace function public.guard_community_letter_sender_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    return new;
  end if;
  if old.sender_id is distinct from (select auth.uid())
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.subject is distinct from old.subject
     or new.body is distinct from old.body
     or new.is_protected is distinct from old.is_protected
     or new.password_salt is distinct from old.password_salt
     or new.password_iv is distinct from old.password_iv
     or new.password_ciphertext is distinct from old.password_ciphertext
     or new.created_at is distinct from old.created_at then
    raise exception 'Senders may only update letter attachment metadata';
  end if;
  return new;
end;
$$;

drop trigger if exists community_letters_guard_sender_update on public.community_letters;
create trigger community_letters_guard_sender_update
before update on public.community_letters
for each row execute function public.guard_community_letter_sender_update();
