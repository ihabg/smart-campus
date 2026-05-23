-- =============================================================
-- Migration: create_room_types_metadata
-- Project:   Smart Campus Navigation System
-- Phase:     1 (metadata table only — rooms.type enum unchanged)
-- Date:      2026-05-22
--
-- WHAT THIS SCRIPT DOES:
--   1. Creates the room_types metadata table if it does not exist.
--   2. Seeds one row per active room type (labels, icons, colors,
--      teaching flag, accessibility flag).
--   3. Uses ON CONFLICT (value) DO UPDATE so re-running corrects
--      any metadata without duplicating rows.
--
-- WHAT THIS SCRIPT DOES NOT DO:
--   - Does NOT alter the rooms table or any column.
--   - Does NOT change room shapes, coordinates, floor IDs,
--     or room numbers.
--   - Does NOT remove enum values from room_type (Phase 2).
--   - Does NOT insert classroom or bathroom (deprecated, 0 rows).
--   - Does NOT insert any rooms.
--
-- IDEMPOTENT:
--   Safe to run more than once.
--   CREATE TABLE IF NOT EXISTS skips if table already exists.
--   ON CONFLICT (value) DO UPDATE corrects metadata on re-run.
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → paste this file → F5 (Execute All)
--   or: psql -U postgres -d smart_campus -f this_file.sql
--
-- HOW TO VERIFY:
--   SELECT value, label_en, icon, is_teaching, is_accessible,
--          is_public, sort_order
--   FROM   room_types
--   ORDER  BY sort_order, value;
--
--   Expected: 20 rows, no classroom, no bathroom.
--   Teaching rows: lecture_hall, lab,
--                  engineering_drawing_room, engineering_drawing_studio.
--   Accessible rows: accessible_restroom, elevator.
-- =============================================================


-- ── Step 1: Create the table ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS room_types (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matches the value stored in rooms.type (room_type enum).
  -- Must stay in sync with the enum in Phase 1.
  value         VARCHAR(100) NOT NULL UNIQUE,

  label_en      VARCHAR(200) NOT NULL,
  label_ar      VARCHAR(200),             -- Arabic label, nullable for now

  -- Emoji or symbol shown in map filters and legends.
  icon          VARCHAR(20),

  -- Hex colour used as the primary accent / stroke for this type
  -- in the map editor and student map.
  color         VARCHAR(20),

  -- True = this room type is valid for section / teaching assignment.
  is_teaching   BOOLEAN      NOT NULL DEFAULT false,

  -- True = this is an accessible/disability-friendly facility.
  is_accessible BOOLEAN      NOT NULL DEFAULT false,

  -- False = internal/staff space, hidden from student map filters.
  is_public     BOOLEAN      NOT NULL DEFAULT true,

  -- False = soft-deleted; excluded from API responses.
  is_active     BOOLEAN      NOT NULL DEFAULT true,

  -- Lower numbers appear first in dropdowns and filter chips.
  sort_order    INTEGER      NOT NULL DEFAULT 999,

  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE room_types IS
  'Metadata for room types. value must match the room_type enum used in rooms.type.';

COMMENT ON COLUMN room_types.value IS
  'Exact string stored in rooms.type. Do not rename without also running ALTER TYPE room_type RENAME VALUE.';

COMMENT ON COLUMN room_types.is_teaching IS
  'When true, this room type appears in the Semester Management room assignment dropdown.';

COMMENT ON COLUMN room_types.is_public IS
  'When false, this type is hidden from student-facing map filter chips.';


-- ── Step 2: Seed metadata rows ────────────────────────────────
--
-- Column order in VALUES:
--   value, label_en, label_ar, icon, color,
--   is_teaching, is_accessible, is_public, sort_order
--
-- ON CONFLICT DO UPDATE refreshes every metadata field so that
-- re-running this script after editing a label or icon applies
-- the correction immediately. created_at is intentionally excluded
-- from the UPDATE so the original insertion timestamp is preserved.

INSERT INTO room_types
  (value, label_en, label_ar, icon, color,
   is_teaching, is_accessible, is_public, sort_order)
VALUES

  -- ── Teaching / learning spaces (is_teaching = true) ─────────
  (
    'lecture_hall',
    'Lecture Hall',
    'قاعة محاضرات',
    '🎓', '#1d4ed8',
    true,  false, true,  10
  ),
  (
    'lab',
    'Lab',
    'مختبر',
    '🧪', '#22a060',
    true,  false, true,  20
  ),
  (
    'engineering_drawing_room',
    'Engineering Drawing Room',
    'قاعة رسم هندسي',
    '📐', '#1d4ed8',
    true,  false, true,  30
  ),
  (
    'engineering_drawing_studio',
    'Engineering Drawing Studio',
    'استوديو رسم هندسي',
    '✏️', '#1d4ed8',
    true,  false, true,  40
  ),

  -- ── Academic / public spaces (is_teaching = false) ──────────
  (
    'amphitheater',
    'Amphitheater',
    'مدرج',
    '🏛️', '#c8a010',
    false, false, true,  50
  ),
  (
    'office',
    'Office',
    'مكتب',
    '👨‍🏫', '#b45309',
    false, false, true,  60
  ),
  (
    'meeting_room',
    'Meeting Room',
    'قاعة اجتماعات',
    '🤝', '#2563eb',
    false, false, true,  70
  ),
  (
    'library',
    'Library',
    'مكتبة',
    '📖', '#b45309',
    false, false, true,  80
  ),
  (
    'cafeteria',
    'Cafeteria',
    'كافيتيريا',
    '🍽️', '#b45309',
    false, false, true,  90
  ),
  (
    'bookstore',
    'Bookstore',
    'مكتبة / متجر',
    '📚', '#b45309',
    false, false, true,  100
  ),
  (
    'professor_lounge',
    'Professor Lounge',
    'استراحة الأساتذة',
    '☕', '#8860b0',
    false, false, false, 110
  ),

  -- ── Sanitary facilities ──────────────────────────────────────
  (
    'restroom',
    'Restroom',
    'دورة مياه',
    '🚻', '#2563eb',
    false, false, true,  200
  ),
  (
    'accessible_restroom',
    'Accessible Restroom',
    'دورة مياه ذوي الإعاقة',
    '♿', '#7c3aed',
    false, true,  true,  210
  ),

  -- ── Navigation / accessibility ───────────────────────────────
  (
    'elevator',
    'Elevator',
    'مصعد',
    '🛗', '#8b5cf6',
    false, true,  true,  220
  ),
  (
    'stairs',
    'Stairs',
    'سلالم',
    '🪜', '#ef4444',
    false, false, true,  230
  ),
  (
    'emergency_exit',
    'Emergency Exit',
    'مخرج طوارئ',
    '🚨', '#ef4444',
    false, false, true,  240
  ),

  -- ── Infrastructure (is_public = false — hidden from students) ─
  (
    'corridor',
    'Corridor',
    'ممر',
    NULL, '#b0bcd0',
    false, false, false, 300
  ),
  (
    'atrium',
    'Atrium',
    'ردهة',
    NULL, '#b0bcd0',
    false, false, true,  310
  ),
  (
    'storage',
    'Storage',
    'مستودع',
    '📦', '#64748b',
    false, false, false, 400
  ),
  (
    'other',
    'Other',
    'أخرى',
    '📍', '#9a9490',
    false, false, false, 500
  )

ON CONFLICT (value) DO UPDATE SET
  label_en      = EXCLUDED.label_en,
  label_ar      = EXCLUDED.label_ar,
  icon          = EXCLUDED.icon,
  color         = EXCLUDED.color,
  is_teaching   = EXCLUDED.is_teaching,
  is_accessible = EXCLUDED.is_accessible,
  is_public     = EXCLUDED.is_public,
  is_active     = EXCLUDED.is_active,
  sort_order    = EXCLUDED.sort_order,
  updated_at    = NOW();


-- ── Step 3: Verify ────────────────────────────────────────────
--
-- Run these SELECT statements after the INSERT to confirm.

-- Full list ordered by sort_order:
SELECT
  sort_order,
  value,
  label_en,
  icon,
  is_teaching,
  is_accessible,
  is_public,
  is_active
FROM   room_types
ORDER  BY sort_order, value;

-- Quick sanity counts:
SELECT
  COUNT(*)                                           AS total_types,
  COUNT(*) FILTER (WHERE is_teaching   = true)       AS teaching_types,
  COUNT(*) FILTER (WHERE is_accessible = true)       AS accessible_types,
  COUNT(*) FILTER (WHERE is_public     = false)      AS hidden_from_students,
  COUNT(*) FILTER (WHERE value = 'classroom')        AS classroom_count,   -- must be 0
  COUNT(*) FILTER (WHERE value = 'bathroom')         AS bathroom_count     -- must be 0
FROM room_types;

-- Teaching types specifically (must be exactly 4):
SELECT value, label_en, icon
FROM   room_types
WHERE  is_teaching = true
ORDER  BY sort_order;

-- Accessible types specifically (must be exactly 2):
SELECT value, label_en, icon
FROM   room_types
WHERE  is_accessible = true
ORDER  BY sort_order;
