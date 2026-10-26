-- Restore existing 97 archived letters and the historic music/dedication records.
-- All policies map Neon Auth to a verified original Looply profile UUID.
CREATE POLICY looply_v5_cards_read_recipient_or_admin ON public.archived_cards FOR SELECT TO authenticated
 USING (recipient_id=(select public.looply_legacy_uid()) OR (select public.v3_self_is_admin()));
CREATE POLICY looply_v5_card_reads_select ON public.archived_card_reads FOR SELECT TO authenticated
 USING (user_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_card_reads_insert ON public.archived_card_reads FOR INSERT TO authenticated
 WITH CHECK (user_id=(select public.looply_legacy_uid()) AND EXISTS(SELECT 1 FROM public.archived_cards c WHERE c.id=card_id));
CREATE POLICY looply_v5_card_reads_update ON public.archived_card_reads FOR UPDATE TO authenticated
 USING (user_id=(select public.looply_legacy_uid())) WITH CHECK (user_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_card_reads_delete ON public.archived_card_reads FOR DELETE TO authenticated
 USING (user_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_letters_read ON public.letters FOR SELECT TO authenticated
 USING (sender_id=(select public.looply_legacy_uid()) OR recipient_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_dedications_select ON public.music_dedications FOR SELECT TO authenticated
 USING (sender_id=(select public.looply_legacy_uid()) OR recipient_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_dedications_insert ON public.music_dedications FOR INSERT TO authenticated
 WITH CHECK (sender_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_comments_select ON public.music_comments FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.music_dedications d WHERE d.id=dedication_id));
CREATE POLICY looply_v5_music_comments_insert ON public.music_comments FOR INSERT TO authenticated
 WITH CHECK (author_id=(select public.looply_legacy_uid()) AND EXISTS(SELECT 1 FROM public.music_dedications d WHERE d.id=dedication_id));
CREATE POLICY looply_v5_music_library_select ON public.music_library FOR SELECT TO authenticated
 USING (owner_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_library_insert ON public.music_library FOR INSERT TO authenticated
 WITH CHECK (owner_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_library_delete ON public.music_library FOR DELETE TO authenticated
 USING (owner_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_page_comments_select ON public.music_page_comments FOR SELECT TO authenticated
 USING ((select public.looply_legacy_uid()) IS NOT NULL
 AND (comment_type='general' OR author_id=(select public.looply_legacy_uid()) OR recipient_id=(select public.looply_legacy_uid())));
CREATE POLICY looply_v5_music_page_comments_insert ON public.music_page_comments FOR INSERT TO authenticated
 WITH CHECK (author_id=(select public.looply_legacy_uid()) AND recipient_id IS NULL);
CREATE POLICY looply_v5_music_track_comments_select ON public.music_track_comments FOR SELECT TO authenticated
 USING (author_id=(select public.looply_legacy_uid()));
CREATE POLICY looply_v5_music_track_comments_insert ON public.music_track_comments FOR INSERT TO authenticated
 WITH CHECK (author_id=(select public.looply_legacy_uid()));
GRANT SELECT ON public.archived_cards,public.archived_card_reads,public.letters,public.music_dedications,public.music_comments,public.music_library,public.music_page_comments,public.music_track_comments TO authenticated;
GRANT INSERT ON public.archived_card_reads,public.music_dedications,public.music_comments,public.music_library,public.music_page_comments,public.music_track_comments TO authenticated;
GRANT UPDATE,DELETE ON public.archived_card_reads TO authenticated;
GRANT DELETE ON public.music_library TO authenticated;
