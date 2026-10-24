-- Restore cumulative password-hint updates for protected archived cards.
-- Recipients may append one hint at a time; administrators/creators retain full access.
-- All other fields stay immutable for non-admin users.
create or replace function public.guard_archived_card_hint_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_hints jsonb;
begin
  if (select private.is_admin()) then
    return new;
  end if;

  if jsonb_typeof(old.password_hints) = 'array'
     and jsonb_array_length(old.password_hints) > 0 then
    old_hints := old.password_hints;
  elsif coalesce(trim(old.password_hint), '') <> '' then
    old_hints := jsonb_build_array(old.password_hint);
  else
    old_hints := '[]'::jsonb;
  end if;

  if old.recipient_id = (select auth.uid())
     and new.recipient_id = old.recipient_id
     and (to_jsonb(new) - 'password_hint' - 'password_hints')
         = (to_jsonb(old) - 'password_hint' - 'password_hints')
     and jsonb_typeof(new.password_hints) = 'array'
     and jsonb_array_length(new.password_hints) = jsonb_array_length(old_hints) + 1
     and new.password_hints = old_hints || jsonb_build_array(trim(new.password_hint))
     and new.password_hint = new.password_hints ->> -1
     and char_length(trim(new.password_hint)) between 1 and 240 then
    return new;
  end if;

  raise exception 'Only the assigned recipient may append a password hint.';
end;
$$;
