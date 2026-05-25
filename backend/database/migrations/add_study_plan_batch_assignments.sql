-- =============================================================
-- Migration: add_study_plan_batch_assignments
-- Project:   Smart Campus Navigation System
-- Created:   2026-05-25
--
-- Decouples "which curriculum version" from "which student batches use it".
-- Multiple registration-year batches can now share one study plan.
--
-- PREREQUISITE: create_study_plans.sql must already be applied.
--
-- IDEMPOTENT: uses CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → open/paste this file → F5 (Execute)
--   or: psql -U postgres -d smart_campus -f add_study_plan_batch_assignments.sql
-- =============================================================

-- ── 1. Create the table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plan_batch_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID        NOT NULL,
  department_id     UUID        NOT NULL,
  registration_year SMALLINT    NOT NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active assignment per department+batch-year
  CONSTRAINT spba_dept_year_uq
    UNIQUE (department_id, registration_year),

  -- Cascade when plan is deleted: no orphan assignments
  CONSTRAINT spba_plan_id_fk
    FOREIGN KEY (plan_id)
    REFERENCES study_plans (id)
    ON DELETE CASCADE,

  -- Restrict when department is deleted: explicit protection
  CONSTRAINT spba_department_id_fk
    FOREIGN KEY (department_id)
    REFERENCES departments (id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_spba_dept_year
  ON study_plan_batch_assignments (department_id, registration_year);

CREATE INDEX IF NOT EXISTS idx_spba_plan_id
  ON study_plan_batch_assignments (plan_id);

COMMENT ON TABLE study_plan_batch_assignments
  IS 'Maps registration-year batches to a study plan. Multiple batches can share one plan. Explicit assignment takes priority over latest-plan fallback in student lookup.';

-- ── 2. Backfill existing plans ────────────────────────────────
-- Every existing plan gets an explicit assignment for its own plan_year.
-- This preserves the current exact-match behavior for all existing students.
-- ON CONFLICT DO NOTHING makes this re-runnable.
INSERT INTO study_plan_batch_assignments (plan_id, department_id, registration_year)
SELECT id, department_id, plan_year
FROM   study_plans
ON CONFLICT (department_id, registration_year) DO NOTHING;

-- =============================================================
-- Verification queries
--
-- 1. Confirm table exists and rows were backfilled:
--    SELECT spba.registration_year, sp.label, d.name_en
--    FROM   study_plan_batch_assignments spba
--    JOIN   study_plans  sp ON sp.id = spba.plan_id
--    JOIN   departments  d  ON d.id  = spba.department_id
--    ORDER  BY d.name_en, spba.registration_year;
--
-- 2. Confirm unique constraint:
--    SELECT department_id, registration_year, COUNT(*)
--    FROM   study_plan_batch_assignments
--    GROUP  BY department_id, registration_year
--    HAVING COUNT(*) > 1;   -- should return 0 rows
-- =============================================================
