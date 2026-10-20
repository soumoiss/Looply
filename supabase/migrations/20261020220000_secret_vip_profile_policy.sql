-- The original Secret VIP migration version was already registered remotely.
-- Apply the administrator-only profile visibility policy as a forward-only migration.
drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all on public.profiles
for select to authenticated using (private.is_admin());
