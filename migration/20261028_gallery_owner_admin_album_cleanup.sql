-- 2026-10-28. Sender ownership, administrator verification and cleanup use Neon Auth.
-- This migration makes no changes to user content; all writes are gated by RLS/RPC.
CREATE OR REPLACE FUNCTION public.v7_gallery_storage_delete_allowed(p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT CASE
 WHEN p_bucket='looply-gallery' THEN EXISTS(
   SELECT 1 FROM public.community_gallery_media m WHERE m.storage_path=p_path
     AND (m.owner_id=public.looply_legacy_uid() OR COALESCE(public.v3_self_is_admin(),false)))
 WHEN p_bucket='looply-media' THEN COALESCE(public.v3_self_is_admin(),false)
   AND EXISTS(SELECT 1 FROM public.archive_media a WHERE a.storage_path=p_path)
 ELSE false END;
$$;
-- Only authorized owners or ADM can delete; clean up polymorphic associations
-- within the SAME transaction as deletion of the media database row.
CREATE OR REPLACE FUNCTION public.v8_delete_gallery_media(p_source text,p_media_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE actor uuid:=public.looply_legacy_uid(); administrator boolean:=COALESCE(public.v3_self_is_admin(),false);
BEGIN
 IF actor IS NULL OR p_media_id IS NULL OR p_source NOT IN ('community','archive') THEN
   RAISE EXCEPTION 'Invalid authenticated request' USING ERRCODE='42501'; END IF;
 IF p_source='archive' THEN
   IF NOT administrator THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
   PERFORM 1 FROM public.archive_media WHERE id=p_media_id FOR UPDATE;
 ELSE
   PERFORM 1 FROM public.community_gallery_media WHERE id=p_media_id AND (owner_id=actor OR administrator) FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media not found or denied' USING ERRCODE='42501'; END IF;
 DELETE FROM public.gallery_album_items WHERE source=p_source AND media_id=p_media_id;
 DELETE FROM public.gallery_media_people WHERE source=p_source AND media_id=p_media_id;
 DELETE FROM public.gallery_media_descriptions WHERE source=p_source AND media_id=p_media_id;
 DELETE FROM public.gallery_media_adjustments WHERE source=p_source AND media_id=p_media_id;
 DELETE FROM public.gallery_media_pins WHERE source=p_source AND media_id=p_media_id;
 DELETE FROM public.gallery_private_items WHERE source=p_source AND media_id=p_media_id;
 IF p_source='archive' THEN DELETE FROM public.archive_media WHERE id=p_media_id;
 ELSE DELETE FROM public.community_gallery_media WHERE id=p_media_id; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media deletion not confirmed' USING ERRCODE='P0002'; END IF;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.v8_delete_gallery_media(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v8_delete_gallery_media(text,uuid) TO authenticated;
-- Media mentions are editable by the owner or validated admin, not any viewer.
CREATE POLICY v8_gallery_people_admin_insert ON public.gallery_media_people FOR INSERT TO authenticated
 WITH CHECK(created_by=public.looply_legacy_uid() AND COALESCE(public.v3_self_is_admin(),false) AND public.v6_gallery_visible(source,media_id));
CREATE POLICY v8_gallery_people_manage_delete ON public.gallery_media_people FOR DELETE TO authenticated
 USING(COALESCE(public.v3_self_is_admin(),false) OR (source='community' AND EXISTS(
 SELECT 1 FROM public.community_gallery_media m WHERE m.id=media_id AND m.owner_id=public.looply_legacy_uid())));
CREATE POLICY v8_gallery_people_admin_read ON public.gallery_media_people FOR SELECT TO authenticated
 USING(COALESCE(public.v3_self_is_admin(),false) AND public.v6_gallery_visible(source,media_id));
CREATE POLICY v8_gallery_descriptions_admin_insert ON public.gallery_media_descriptions FOR INSERT TO authenticated
 WITH CHECK(user_id=public.looply_legacy_uid() AND COALESCE(public.v3_self_is_admin(),false) AND public.v6_gallery_visible(source,media_id));
