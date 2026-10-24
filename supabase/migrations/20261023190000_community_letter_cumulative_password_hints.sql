alter table public.community_letters
  add column if not exists password_hint text,
  add column if not exists password_hints jsonb not null default '[]'::jsonb;

create or replace function public.guard_community_letter_sender_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare old_hints jsonb;
begin
  if (select private.is_admin()) then return new; end if;
  if old.sender_id is distinct from (select auth.uid())
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.subject is distinct from old.subject
     or new.body is distinct from old.body
     or new.is_protected is distinct from old.is_protected
     or new.password_salt is distinct from old.password_salt
     or new.password_iv is distinct from old.password_iv
     or new.password_ciphertext is distinct from old.password_ciphertext
     or new.created_at is distinct from old.created_at
     or new.attachments is distinct from old.attachments then
    raise exception 'Senders may only append password hints to protected letters';
  end if;
  if old.is_protected is not true then
    raise exception 'Hints are only available for password-protected letters';
  end if;
  if jsonb_typeof(old.password_hints) = 'array' and jsonb_array_length(old.password_hints) > 0 then
    old_hints := old.password_hints;
  elsif coalesce(trim(old.password_hint), '') <> '' then
    old_hints := jsonb_build_array(old.password_hint);
  else
    old_hints := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.password_hints) = 'array'
     and jsonb_array_length(new.password_hints) = jsonb_array_length(old_hints) + 1
     and new.password_hints = old_hints || jsonb_build_array(trim(new.password_hint))
     and new.password_hint = new.password_hints ->> -1
     and char_length(trim(new.password_hint)) between 1 and 240 then
    return new;
  end if;
  raise exception 'Only appending one password hint is allowed';
end;
$$;
