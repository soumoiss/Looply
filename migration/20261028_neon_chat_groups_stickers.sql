-- Neon chat group covers and paginated first-party sticker library.
-- Only verified catalog assets are accepted. External source import intentionally awaits user links.
-- @statement
CREATE TABLE IF NOT EXISTS public.group_covers (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  storage_path text NOT NULL REFERENCES public.chat_media(storage_path),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- @statement
ALTER TABLE public.group_covers ENABLE ROW LEVEL SECURITY;

-- @statement
CREATE POLICY looply_v10_group_cover_read ON public.group_covers FOR SELECT TO authenticated USING (public.v3_is_conversation_participant(conversation_id));

-- @statement
GRANT SELECT ON public.group_covers TO authenticated;

-- @statement
CREATE OR REPLACE FUNCTION public.v10_set_group_cover(p_conversation_id uuid,p_storage_path text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
 AS $fn$
 DECLARE actor uuid := public.looply_legacy_uid();
 BEGIN
   IF actor IS NULL OR NOT EXISTS(
     SELECT 1 FROM public.conversations c
     WHERE c.id=p_conversation_id AND c.kind='group' AND c.created_by=actor
   ) THEN RAISE EXCEPTION 'Only the group creator may change the cover' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(
     SELECT 1 FROM public.chat_media m
     JOIN public.chat_messages msg ON msg.id=m.message_id AND msg.conversation_id=m.conversation_id
     WHERE m.conversation_id=p_conversation_id AND m.created_by=actor
       AND msg.sender_id=actor AND m.storage_path=p_storage_path
       AND m.mime_type IN ('image/jpeg','image/png','image/webp')
   ) THEN RAISE EXCEPTION 'Image must be a saved group attachment' USING ERRCODE='42501'; END IF;
   INSERT INTO public.group_covers(conversation_id,storage_path,updated_by)
   VALUES (p_conversation_id,p_storage_path,actor)
   ON CONFLICT (conversation_id) DO UPDATE SET
     storage_path=EXCLUDED.storage_path,updated_by=EXCLUDED.updated_by,updated_at=now();
   RETURN p_storage_path;
 END $fn$;

-- @statement
REVOKE ALL ON FUNCTION public.v10_set_group_cover(uuid,text) FROM public,anonymous;

-- @statement
GRANT EXECUTE ON FUNCTION public.v10_set_group_cover(uuid,text) TO authenticated;

-- @statement
CREATE TABLE IF NOT EXISTS public.sticker_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9_-]{3,80}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  asset_path text NOT NULL CHECK (asset_path ~ '^assets/stickers/[a-z0-9_-]{3,80}[.]svg$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- @statement
CREATE INDEX IF NOT EXISTS sticker_catalog_page_idx ON public.sticker_catalog (is_active,slug,id);

-- @statement
ALTER TABLE public.sticker_catalog ENABLE ROW LEVEL SECURITY;

-- @statement
CREATE POLICY looply_v10_sticker_catalog_read ON public.sticker_catalog FOR SELECT TO authenticated USING (is_active);

-- @statement
GRANT SELECT ON public.sticker_catalog TO authenticated;

-- @statement
INSERT INTO public.sticker_catalog(slug,title,asset_path) VALUES
 ('amostra-coracao','Coração — amostra','assets/stickers/amostra-coracao.svg')
 ON CONFLICT (slug) DO NOTHING;

-- @statement
CREATE TABLE IF NOT EXISTS public.sticker_favorites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES public.sticker_catalog(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,sticker_id)
);

-- @statement
CREATE INDEX IF NOT EXISTS sticker_favorites_by_sticker_idx ON public.sticker_favorites (sticker_id);

-- @statement
ALTER TABLE public.sticker_favorites ENABLE ROW LEVEL SECURITY;

-- @statement
CREATE POLICY looply_v10_sticker_favorite_select ON public.sticker_favorites FOR SELECT TO authenticated USING (user_id=public.looply_legacy_uid());

-- @statement
CREATE POLICY looply_v10_sticker_favorite_insert ON public.sticker_favorites FOR INSERT TO authenticated WITH CHECK (user_id=public.looply_legacy_uid() AND EXISTS(SELECT 1 FROM public.sticker_catalog s WHERE s.id=sticker_id AND s.is_active));

-- @statement
CREATE POLICY looply_v10_sticker_favorite_delete ON public.sticker_favorites FOR DELETE TO authenticated USING (user_id=public.looply_legacy_uid());

-- @statement
GRANT SELECT,INSERT,DELETE ON public.sticker_favorites TO authenticated;

-- @statement
CREATE TABLE IF NOT EXISTS public.chat_sticker_messages (
  message_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  sticker_id uuid NOT NULL REFERENCES public.sticker_catalog(id),
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_sticker_messages_chat_fk FOREIGN KEY (message_id,conversation_id)
    REFERENCES public.chat_messages(id,conversation_id) ON DELETE CASCADE
);

-- @statement
CREATE INDEX IF NOT EXISTS chat_sticker_messages_conversation_idx ON public.chat_sticker_messages (conversation_id,message_id);

-- @statement
ALTER TABLE public.chat_sticker_messages ENABLE ROW LEVEL SECURITY;

-- @statement
CREATE POLICY looply_v10_chat_sticker_read ON public.chat_sticker_messages FOR SELECT TO authenticated USING (public.v3_is_conversation_participant(conversation_id));

-- @statement
CREATE POLICY looply_v10_chat_sticker_insert ON public.chat_sticker_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id=public.looply_legacy_uid()
  AND public.v3_is_conversation_participant(conversation_id)
  AND EXISTS(SELECT 1 FROM public.chat_messages m WHERE m.id=message_id AND m.conversation_id=conversation_id AND m.sender_id=sender_id)
  AND EXISTS(SELECT 1 FROM public.sticker_catalog s WHERE s.id=sticker_id AND s.is_active)
);

-- @statement
GRANT SELECT,INSERT ON public.chat_sticker_messages TO authenticated;
