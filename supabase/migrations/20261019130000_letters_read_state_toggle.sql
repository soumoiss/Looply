-- Stage 5: allow each recipient to undo the read marker without deleting the letter.
-- This migration only removes that user's receipt row; archived_cards are untouched.
grant delete on table public.archived_card_reads to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'archived_card_reads'
      and policyname = 'archived_card_reads_owner_delete'
  ) then
    create policy archived_card_reads_owner_delete
      on public.archived_card_reads for delete to authenticated
      using (
        user_id = (select auth.uid())
        and exists (
          select 1 from public.archived_cards card
          where card.id = archived_card_reads.card_id
            and card.recipient_id = (select auth.uid())
        )
      );
  end if;
end;
$policy$;
