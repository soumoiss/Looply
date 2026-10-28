-- 2026-10-28: Stable references for people mentioned in gallery comments.
-- Preserves existing comment audience/authorization RPCs and all notifications.
CREATE TABLE IF NOT EXISTS public.gallery_comment_mentions (
 source text NOT NULL CHECK(source IN ('archive','community')),
 comment_id uuid NOT NULL,
 person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source,comment_id,person_id)
);
ALTER TABLE public.gallery_comment_mentions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.gallery_comment_mentions TO authenticated;
CREATE POLICY v8_gallery_comment_mention_read ON public.gallery_comment_mentions
 FOR SELECT TO authenticated USING (
 CASE source
 WHEN 'community' THEN EXISTS(SELECT 1 FROM public.community_gallery_comments c WHERE c.id=comment_id)
 WHEN 'archive' THEN EXISTS(SELECT 1 FROM public.archive_media_comments c WHERE c.id=comment_id)
 ELSE false END);
CREATE OR REPLACE FUNCTION public.v8_create_gallery_comment(p_source text,p_media_id uuid,p_body text,p_audience text,p_recipient_ids uuid[],p_mention_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE created_id uuid; total integer;
BEGIN
 IF public.looply_legacy_uid() IS NULL OR p_source IS NULL OR p_source NOT IN('community','archive')
 OR p_mention_ids IS NULL OR cardinality(p_mention_ids)>30 OR EXISTS(SELECT 1 FROM unnest(p_mention_ids) x WHERE x IS NULL)
 THEN RAISE EXCEPTION 'Invalid mention request' USING ERRCODE='22023'; END IF;
 SELECT count(DISTINCT p.id) INTO total FROM public.profiles p WHERE p.id=ANY(p_mention_ids);
 IF total IS DISTINCT FROM (SELECT count(DISTINCT x) FROM unnest(p_mention_ids) x)
 THEN RAISE EXCEPTION 'Unknown mentioned profile' USING ERRCODE='22023'; END IF;
 IF p_source='community' THEN
   created_id := public.create_community_gallery_comment(p_media_id,p_body,p_audience,p_recipient_ids);
 ELSE
   created_id := public.create_archive_media_comment(p_media_id,p_body,p_audience,p_recipient_ids);
 END IF;
 INSERT INTO public.gallery_comment_mentions(source,comment_id,person_id)
 SELECT p_source,created_id,x FROM (SELECT DISTINCT unnest(p_mention_ids) x) s
 ON CONFLICT DO NOTHING;
 RETURN created_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.v8_create_gallery_comment(text,uuid,text,text,uuid[],uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v8_create_gallery_comment(text,uuid,text,text,uuid[],uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.v8_cleanup_comment_mentions() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 DELETE FROM public.gallery_comment_mentions WHERE comment_id=OLD.id
 AND source=CASE TG_TABLE_NAME WHEN 'community_gallery_comments' THEN 'community' ELSE 'archive' END;
 RETURN OLD;
END $$;
CREATE TRIGGER v8_cleanup_community_mentions AFTER DELETE ON public.community_gallery_comments
 FOR EACH ROW EXECUTE FUNCTION public.v8_cleanup_comment_mentions();
CREATE TRIGGER v8_cleanup_archive_mentions AFTER DELETE ON public.archive_media_comments
 FOR EACH ROW EXECUTE FUNCTION public.v8_cleanup_comment_mentions();
