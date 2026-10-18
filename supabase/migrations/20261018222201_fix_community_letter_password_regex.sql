-- Fix protected-letter ciphertext validation: PostgreSQL regex repetition bounds are limited.
alter table public.community_letters drop constraint if exists community_letters_content_shape;
alter table public.community_letters add constraint community_letters_content_shape check (
  (is_protected = false and body is not null and char_length(btrim(body)) between 1 and 5000
    and password_salt is null and password_iv is null and password_ciphertext is null)
  or (is_protected = true and body is null
    and password_salt ~ '^[A-Za-z0-9_-]{22}$'
    and password_iv ~ '^[A-Za-z0-9_-]{16}$'
    and char_length(password_ciphertext) between 22 and 7000
    and password_ciphertext ~ '^[A-Za-z0-9_-]+$')
);
