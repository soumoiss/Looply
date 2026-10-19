-- Expand synchronized profile styling options with curated open-source Google Fonts
-- and additional accessible palettes that share the Looply visual tokens.
alter table public.profiles
  drop constraint if exists profiles_theme_check,
  drop constraint if exists profiles_font_family_check;

alter table public.profiles
  add constraint profiles_theme_check check (
    theme in ('lilas', 'noite', 'oceano', 'rosa', 'floresta', 'aurora', 'coral', 'menta', 'sunset', 'grafite', 'system')
  ),
  add constraint profiles_font_family_check check (
    font_family in (
      'system', 'sans', 'serif', 'rounded',
      'manrope', 'dm_sans', 'jakarta', 'space_grotesk', 'nunito', 'quicksand',
      'montserrat', 'cormorant', 'playfair', 'fraunces', 'caveat', 'syne'
    )
  );
