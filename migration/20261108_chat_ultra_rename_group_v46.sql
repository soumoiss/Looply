CREATE OR REPLACE FUNCTION public.v46_chat_rename_group(p_conversation_id uuid,p_subject text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE actor uuid;
BEGIN
 actor:=public.looply_legacy_uid();
 IF actor IS NULL OR p_conversation_id IS NULL OR p_subject IS NULL OR
    char_length(pg_catalog.btrim(p_subject)) NOT BETWEEN 1 AND 120 THEN
   RETURN false;
 END IF;
 UPDATE public.conversations c
 SET subject=pg_catalog.btrim(p_subject),updated_at=pg_catalog.now()
 WHERE c.id=p_conversation_id AND c.kind='group' AND c.created_by=actor
   AND EXISTS(SELECT 1 FROM public.conversation_participants m
              WHERE m.conversation_id=c.id AND m.user_id=actor);
 RETURN FOUND;
END;$$;
REVOKE ALL ON FUNCTION public.v46_chat_rename_group(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v46_chat_rename_group(uuid,text) TO authenticated;