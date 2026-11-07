-- Looply Chat Ultra: protect sealed letters and structured media from notification previews.
-- No tables, messages, attachments or users are deleted.
CREATE OR REPLACE FUNCTION public.v19_queue_chat_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_preview text;
  v_kind text := 'message';
BEGIN
  IF left(NEW.body, char_length('💌 Carta Looply/1')) = '💌 Carta Looply/1' THEN
    v_kind := 'letter';
    v_preview := '💌 Você recebeu uma carta selada';
  ELSIF left(NEW.body, char_length('💌 Bilhete')) = '💌 Bilhete' THEN
    v_preview := '💌 Você recebeu um bilhete';
  ELSIF left(NEW.body, char_length('📊 Enquete Looply/1')) = '📊 Enquete Looply/1' THEN
    v_preview := '📊 Nova enquete na conversa';
  ELSIF left(NEW.body, char_length('👤 Contato Looply/1')) = '👤 Contato Looply/1' THEN
    v_preview := '👤 Contato compartilhado';
  ELSIF left(NEW.body, char_length('📍 Local Looply/1')) = '📍 Local Looply/1' THEN
    v_preview := '📍 Local compartilhado';
  ELSIF left(NEW.body, char_length('🎵 Música: ')) = '🎵 Música: ' THEN
    v_preview := '🎵 Música compartilhada';
  ELSIF left(NEW.body, char_length('🎮 Convite para jogar')) = '🎮 Convite para jogar' THEN
    v_preview := '🎮 Convite para jogar no Looply';
  ELSE
    v_preview := LEFT(regexp_replace(btrim(COALESCE(NEW.body,'')),'[[:cntrl:]]+',' ','g'),180);
  END IF;
  IF v_preview = '' THEN v_preview := 'Enviou um anexo'; END IF;
  INSERT INTO public.chat_notifications
    (user_id,conversation_id,message_id,kind,preview,created_at)
  SELECT cp.user_id,NEW.conversation_id,NEW.id,v_kind,
    v_preview,NEW.created_at
  FROM public.conversation_participants cp
  WHERE cp.conversation_id=NEW.conversation_id
    AND cp.user_id<>NEW.sender_id
  ON CONFLICT (user_id,message_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
