-- ─── Link section_meeting_changes back to event_bookings ─────────────────────
-- Adds a nullable FK so single-day room relocations caused by an event booking
-- can be traced back to the originating event_booking row.
-- ON DELETE SET NULL: cancelling an event nulls the link but keeps the change
-- record for audit purposes (Step 2 will set is_active = FALSE on cancel instead).

ALTER TABLE section_meeting_changes
  ADD COLUMN IF NOT EXISTS event_booking_id UUID
    REFERENCES event_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_smc_event_booking_id
  ON section_meeting_changes (event_booking_id)
  WHERE event_booking_id IS NOT NULL;
