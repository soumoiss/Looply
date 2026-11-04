-- Authenticated group members can update their own group's photograph.
-- The image must be an attachment uploaded by that same member to the group.
-- No table/data deletion and no permission to modify non-member groups.
CREATE OR REPLACE FUNCTION public.v10_set_group_cover(p_conversation_id uuid, p_storage_path text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE actor uuid := public.looply_legacy_uid();
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_participants p ON p.conversation_id=c.id
    WHERE c.id=p_conversation_id AND c.kind='group' AND p.user_id=actor
  ) THEN
    RAISE EXCEPTION 'Only a participant may change the group cover' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_media m
    JOIN public.chat_messages msg ON msg.id=m.message_id AND msg.conversation_id=m.conversation_id
    WHERE m.conversation_id=p_conversation_id AND m.created_by=actor
      AND msg.sender_id=actor AND m.storage_path=p_storage_path
      AND m.mime_type IN ('image/jpeg','image/png','image/webp')
  ) THEN
    RAISE EXCEPTION 'Image must be a saved group attachment' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.group_covers (conversation_id,storage_path,updated_by)
  VALUES (p_conversation_id,p_storage_path,actor)
  ON CONFLICT (conversation_id) DO UPDATE SET
    storage_path=EXCLUDED.storage_path,updated_by=EXCLUDED.updated_by,updated_at=now();
  RETURN p_storage_path;
END $fn$;
REVOKE ALL ON FUNCTION public.v10_set_group_cover(uuid,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.v10_set_group_cover(uuid,text) TO authenticated;
