-- Global application settings, one canonical row.
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'Sistema em atualização rápida por Peixinho',
  music_of_the_day_title text,
  music_of_the_day_url text,
  welcome_banner_text text
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists app_settings_authenticated_read on public.app_settings;
create policy app_settings_authenticated_read on public.app_settings
  for select to authenticated using (true);
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant select on public.app_settings to authenticated;
grant update on public.app_settings to authenticated;
