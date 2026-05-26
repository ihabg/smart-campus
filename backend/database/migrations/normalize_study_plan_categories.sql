-- =============================================================
-- Migration: normalize_study_plan_categories
-- Project:   Smart Campus Navigation System
-- Created:   2026-05-26
--
-- Renames the three legacy study_plan_courses category values to
-- the four official university category keys, then tightens the
-- CHECK constraint to allow only the new values.
--
-- Old values → new values:
--   required  → major_required
--   elective  → major_elective
--   general   → university_required
--
-- No rows are deleted. No study plans, grades, or enrollments
-- are touched. Migration is fully non-destructive.
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → open/paste this file → F5 (Execute)
--   or: psql -U postgres -d smart_campus -f normalize_study_plan_categories.sql
-- =============================================================

BEGIN;

-- ── Step 1: Drop the old CHECK constraint ────────────────────
-- Constraint name from create_study_plans.sql: spc_category_check
ALTER TABLE study_plan_courses
  DROP CONSTRAINT IF EXISTS spc_category_check;

-- ── Step 2: Remap existing rows ──────────────────────────────
-- Order matters: rename all old values before adding the new constraint.
UPDATE study_plan_courses SET category = 'major_required'      WHERE category = 'required';
UPDATE study_plan_courses SET category = 'university_required'  WHERE category = 'general';
UPDATE study_plan_courses SET category = 'major_elective'       WHERE category = 'elective';
-- Note: 'free_elective' has no legacy data — rows with this value
-- can only be created via the admin UI after this migration runs.

-- ── Step 3: Update the column DEFAULT ────────────────────────
ALTER TABLE study_plan_courses
  ALTER COLUMN category SET DEFAULT 'major_required';

-- ── Step 4: Add the new CHECK constraint ─────────────────────
ALTER TABLE study_plan_courses
  ADD CONSTRAINT spc_category_check
  CHECK (category IN (
    'major_required',
    'university_required',
    'major_elective',
    'free_elective'
  ));

COMMIT;

-- =============================================================
-- Verification queries (run after migration to confirm):
--
-- 1. No rows with old category values remain:
--    SELECT category, COUNT(*) FROM study_plan_courses
--    GROUP BY category;
--
-- 2. Constraint is in place:
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid = 'study_plan_courses'::regclass
--      AND conname = 'spc_category_check';
-- =============================================================
