-- Looply Home/Reels: compartilhamento autenticado e atômico via Neon.
-- Adição não destrutiva: não altera nem apaga mensagens/publicações existentes.
CREATE OR REPLACE FUNCTION public.v52_share_post(
  p_post_id uuid,p_target_id uuid,p_message text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=public.looply_legacy_uid();
  p record;
  conversation_id uuid;
  message_body text;
BEGIN
  IF actor IS NULL OR p_post_id IS NULL OR p_target_id IS NULL
    OR actor=p_target_id OR length(coalesce(p_message,''))>2000
  THEN RAISE EXCEPTION 'Compartilhamento inválido' USING ERRCODE='22023'; END IF;
  SELECT id,author_id,visibility INTO p FROM public.posts WHERE id=p_post_id;
  IF NOT FOUND OR NOT public.v3_can_view_post(p_post_id) THEN
    RAISE EXCEPTION 'Publicação indisponível' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_target_id) THEN
    RAISE EXCEPTION 'Destinatário indisponível' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.chat_user_blocks b WHERE
    (b.user_id=actor AND b.blocked_user_id=p_target_id)
    OR (b.user_id=p_target_id AND b.blocked_user_id=actor))
  THEN RAISE EXCEPTION 'Destinatário bloqueado' USING ERRCODE='42501'; END IF;
  IF p.visibility='private' AND p.author_id<>p_target_id THEN
    RAISE EXCEPTION 'Publicação privada' USING ERRCODE='42501'; END IF;
  IF p.visibility='selected' AND p.author_id<>p_target_id
    AND NOT EXISTS(SELECT 1 FROM public.post_recipients r
      WHERE r.post_id=p_post_id AND r.recipient_id=p_target_id)
  THEN RAISE EXCEPTION 'Destinatário não autorizado' USING ERRCODE='42501'; END IF;
  conversation_id:=public.v4_create_conversation('direct',ARRAY[p_target_id],NULL,NULL);
  message_body:=CASE WHEN btrim(coalesce(p_message,''))=''
    THEN '' ELSE btrim(p_message)||E'\n\n' END
    ||'Publicação compartilhada no Looply: https://soumoiss.github.io/Looply/home.html#post-'||p_post_id::text;
  INSERT INTO public.chat_messages(conversation_id,sender_id,body)
    VALUES(conversation_id,actor,message_body);
  RETURN conversation_id;
END $$;
REVOKE ALL ON FUNCTION public.v52_share_post(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v52_share_post(uuid,uuid,text) TO authenticated;
