-- Allow a card's assigned recipient to update only its password hint.
-- All other archived-card fields remain administrator-only.
drop policy if exists archived_cards_recipient_hint_update on public.archived_cards;
create policy archived_cards_recipient_hint_update on public.archived_cards
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create or replace function public.guard_archived_card_hint_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.is_admin()) then
    return new;
  end if;

  if old.recipient_id = (select auth.uid())
     and new.recipient_id = old.recipient_id
     and (to_jsonb(new) - 'password_hint') = (to_jsonb(old) - 'password_hint') then
    return new;
  end if;

  raise exception 'Only the assigned recipient may update a password hint.';
end;
$$;

drop trigger if exists guard_archived_card_hint_update on public.archived_cards;
create trigger guard_archived_card_hint_update
before update on public.archived_cards
for each row execute function public.guard_archived_card_hint_update();
