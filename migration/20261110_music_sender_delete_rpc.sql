-- Looply V7 — excluir dedicatória somente pelo remetente.
-- Nenhum registro é removido durante esta migração; exclusões futuras exigem
-- ação expressa do autor autenticado. Os comentários da dedicatória têm FK
-- ON DELETE CASCADE (verificado no Neon de produção).
BEGIN;

-- Nunca conceder DELETE irrestrito à API REST. Uma política ALL legada é
-- permissiva; somente a RPC abaixo pode executar a operação.
REVOKE DELETE ON TABLE public.music_dedications FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.v7_delete_own_music_dedication(p_dedication_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor uuid := (SELECT public.looply_legacy_uid());
BEGIN
  IF actor IS NULL OR p_dedication_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    DELETE FROM public.music_dedications AS d
      WHERE d.id = p_dedication_id AND d.sender_id = actor
      RETURNING d.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the sender can delete this dedication' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.v7_delete_own_music_dedication(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v7_delete_own_music_dedication(uuid) TO authenticated;
COMMIT;
