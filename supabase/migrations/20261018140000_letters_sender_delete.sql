-- Stage 5: optional deletion is restricted to the sender's own community letters.
-- This does not delete or migrate any existing letter.
grant delete on table public.community_letters to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_letters'
      and policyname = 'community_letters_sender_delete'
  ) then
    create policy community_letters_sender_delete
      on public.community_letters for delete to authenticated
      using (sender_id = (select auth.uid()));
  end if;
end;
$policy$;
