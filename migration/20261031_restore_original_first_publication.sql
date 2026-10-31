-- Recover the authentic FIRST Peixinho/Moisés publication (2026-10-16).
-- Source: Neon backup branch br-little-smoke-b7l6y60r, original posts row.
-- Media was explicitly cleared on 2026-10-25 (media_reset_events #1).
-- Original lost photo: alt_text "Olhem que cachinho perfeito",
-- posts/5eb79af6-152d-4a08-971f-1a5796491c9b/28e1108d-7d1b-4e6b-a585-4392020d7d45.jpg.
-- The old object MUST NOT be reinserted into post_media unless its bytes
-- are independently recovered and verified: broken-image references are not restorations.
-- Patati's two historical rows and all comments ALREADY exist in main:
-- "AMOR DO MOISÉS KKK" 981fe68f-fa14-42ff-ba85-26a448ca8d34
-- "✌️" 3f2a80bd-dcaf-4f24-b9eb-423b28dddc57
-- Peixinho's historical comment "Ôh bixim bonito" remains attached to the latter.
INSERT INTO public.posts (id,author_id,body,visibility,created_at,updated_at,external_url)
SELECT
  '5eb79af6-152d-4a08-971f-1a5796491c9b'::uuid,
  'd218a499-e3ad-45c5-b115-26272a6f3e79'::uuid,
  'Capturando...',
  'public',
  '2026-10-16T08:21:13.308812+00:00'::timestamptz,
  '2026-10-16T08:21:13.308812+00:00'::timestamptz,
  NULL::text
WHERE EXISTS(SELECT 1 FROM public.profiles WHERE id='d218a499-e3ad-45c5-b115-26272a6f3e79')
ON CONFLICT (id) DO NOTHING;
