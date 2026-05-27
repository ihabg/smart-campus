-- =============================================================
-- Migration: add_bookable_flag_to_room_types
-- Project:   Smart Campus Navigation System
-- Date:      2026-05-27
--
-- WHAT THIS SCRIPT DOES:
--   1. Adds is_bookable_for_events column to room_types.
--   2. Backfills true for the types that match the hardcoded
--      EVENT_BOOKABLE_TYPES list used by eventController.js.
--
-- WHAT THIS SCRIPT DOES NOT DO:
--   - Does NOT change eventController.js (Step 2).
--   - Does NOT alter rooms table or enum.
--   - Does NOT touch classroom/auditorium (not in room_types table).
--
-- IDEMPOTENT:
--   ADD COLUMN IF NOT EXISTS skips if column already exists.
--   UPDATE with WHERE is safe to re-run.
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → paste → F5
--   or: psql -U postgres -d smart_campus -f this_file.sql
--
-- HOW TO VERIFY:
--   SELECT value, label_en, is_bookable_for_events
--   FROM   room_types
--   WHERE  is_bookable_for_events = true
--   ORDER  BY sort_order;
--   Expected: 6 rows.
-- =============================================================

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS is_bookable_for_events BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN room_types.is_bookable_for_events IS
  'When true, this room type can be selected when creating/booking an event. '
  'Step 2 will replace the hardcoded EVENT_BOOKABLE_TYPES with this flag.';

-- Backfill: match the 6 types that overlap with eventController.js allowlist
-- Note: classroom and auditorium are in that hardcoded list but not in this
-- table (they are not valid enum values). They remain handled by the hardcoded
-- array and will be reconciled in Step 2.
UPDATE room_types
SET    is_bookable_for_events = true
WHERE  value IN (
  'lecture_hall',
  'lab',
  'amphitheater',
  'meeting_room',
  'engineering_drawing_room',
  'engineering_drawing_studio'
);

-- Verify
SELECT
  value,
  label_en,
  is_bookable_for_events,
  is_teaching
FROM   room_types
ORDER  BY sort_order, value;
