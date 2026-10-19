-- Index the editor reference used by gallery media adjustment rows.
-- This supports FK checks and joins when a profile is removed or inspected.
create index if not exists gallery_media_adjustments_updated_by_idx
  on public.gallery_media_adjustments (updated_by);
