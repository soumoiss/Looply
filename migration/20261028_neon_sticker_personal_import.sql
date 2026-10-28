-- V11: personal/imported stickers, uploaded to a private Neon Object Storage
-- bucket by authenticated owners. Never fetch third-party pages or CDN assets.
-- Source links are navigation aids, not republishing licenses.
-- @statement
ALTER TABLE public.sticker_catalog ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- @statement
ALTER TABLE public.sticker_catalog ADD COLUMN IF NOT EXISTS storage_path text;

-- @statement
ALTER TABLE public.sticker_catalog ADD COLUMN IF NOT EXISTS byte_size integer;

-- @statement
ALTER TABLE public.sticker_catalog ADD COLUMN IF NOT EXISTS source_name text;

-- @statement
ALTER TABLE public.sticker_catalog ALTER COLUMN asset_path DROP NOT NULL;

-- @statement
ALTER TABLE public.sticker_catalog ADD CONSTRAINT sticker_catalog_exactly_one_asset_v11 CHECK (
  (asset_path IS NOT NULL AND storage_path IS NULL AND owner_id IS NULL)
  OR (asset_path IS NULL AND storage_path IS NOT NULL AND owner_id IS NOT NULL AND
      byte_size BETWEEN 1 AND 1048576 AND
      storage_path ~ ('^stickers/' || owner_id::text || '/[a-f0-9-]{36}[.]webp$'))
);

-- @statement
ALTER TABLE public.sticker_catalog ADD CONSTRAINT sticker_catalog_source_name_v11 CHECK (source_name IS NULL OR length(source_name) BETWEEN 1 AND 80);

-- @statement
DROP POLICY IF EXISTS looply_v10_sticker_catalog_read ON public.sticker_catalog;

-- @statement
CREATE POLICY looply_v11_sticker_catalog_read ON public.sticker_catalog FOR SELECT TO authenticated USING (
  is_active AND (
    owner_id IS NULL OR owner_id=public.looply_legacy_uid()
    OR EXISTS (SELECT 1 FROM public.chat_sticker_messages sm
      WHERE sm.sticker_id=sticker_catalog.id AND public.v3_is_conversation_participant(sm.conversation_id))
  )
);

-- @statement
CREATE POLICY looply_v11_sticker_catalog_upload ON public.sticker_catalog FOR INSERT TO authenticated WITH CHECK (
  owner_id=public.looply_legacy_uid() AND asset_path IS NULL AND is_active
  AND slug LIKE 'u-%' AND storage_path ~ ('^stickers/' || owner_id::text || '/[a-f0-9-]{36}[.]webp$')
  AND byte_size BETWEEN 1 AND 1048576
);

-- @statement
GRANT INSERT ON public.sticker_catalog TO authenticated;

-- @statement
CREATE INDEX IF NOT EXISTS sticker_catalog_owner_created_v11 ON public.sticker_catalog (owner_id,created_at DESC,id) WHERE owner_id IS NOT NULL;
