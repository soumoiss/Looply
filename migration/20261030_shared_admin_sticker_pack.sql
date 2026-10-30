-- V18: the 534 stickers deliberately imported by the administrator as
-- Sticker.zip belong to the shared Looply library, not a private personal pack.
-- New personal uploads remain private unless later explicitly shared.
ALTER TABLE public.sticker_catalog
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

UPDATE public.sticker_catalog
   SET is_shared=true
 WHERE owner_id=(SELECT id FROM public.profiles WHERE username='peixinho')
   AND source_name='Sticker.zip'
   AND is_active
   AND is_shared=false;

ALTER POLICY looply_v11_sticker_catalog_read
ON public.sticker_catalog
USING (
  is_active AND (
    is_shared
    OR owner_id IS NULL
    OR owner_id=public.looply_legacy_uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_sticker_messages sm
      WHERE sm.sticker_id=sticker_catalog.id
        AND public.v3_is_conversation_participant(sm.conversation_id)
    )
  )
);

-- Prevent a normal user from escalating a new private upload to shared.
ALTER POLICY looply_v11_sticker_catalog_upload
ON public.sticker_catalog
WITH CHECK (
  owner_id=public.looply_legacy_uid()
  AND asset_path IS NULL AND is_active AND NOT is_shared
  AND slug LIKE 'u-%'
  AND storage_path ~ ('^stickers/' || owner_id::text || '/[a-f0-9-]{36}[.]webp$')
  AND byte_size BETWEEN 1 AND 1048576
);
