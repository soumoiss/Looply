alter table public.profiles
  add column if not exists playlist_url text;

alter table public.profiles
  drop constraint if exists profiles_playlist_url_format;

alter table public.profiles
  add constraint profiles_playlist_url_format
  check (
    playlist_url is null
    or playlist_url ~ E'^https://(www\\.|music\\.)?youtube\\.com/playlist\\?list=[A-Za-z0-9_-]{1,100}(&[A-Za-z0-9_=&%-]*)?$'
  );

grant select (playlist_url) on table public.profiles to anon, authenticated;
grant update (playlist_url) on table public.profiles to authenticated;
