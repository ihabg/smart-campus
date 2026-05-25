-- =============================================================
-- Migration: create_study_plans
-- Project:   Smart Campus Navigation System
-- Created:   2026-05-25
--
-- Creates three tables for the Admin Study Plan (Phase 2) feature:
--   1. study_plans          — one plan per (department, batch year)
--   2. study_plan_courses   — courses belonging to a plan
--   3. course_prerequisites — prerequisite edges between courses
--
-- IDEMPOTENT: all statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → open/paste this file → F5 (Execute)
--   or: psql -U postgres -d smart_campus -f create_study_plans.sql
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. study_plans ───────────────────────────────────────────
-- One official study plan per department + batch-year combination.
CREATE TABLE IF NOT EXISTS study_plans (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id  UUID        NOT NULL,
  plan_year      SMALLINT    NOT NULL,
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT study_plans_dept_year_uq
    UNIQUE (department_id, plan_year),

  CONSTRAINT study_plans_dept_id_fk
    FOREIGN KEY (department_id)
    REFERENCES departments (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_plans_dept_year
  ON study_plans (department_id, plan_year);

COMMENT ON TABLE study_plans
  IS 'One official study plan per department+batch-year combination.';


-- ── 2. study_plan_courses ────────────────────────────────────
-- Courses belonging to an official study plan with recommended placement.
CREATE TABLE IF NOT EXISTS study_plan_courses (
  id                   UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id              UUID      NOT NULL,
  course_id            UUID      NOT NULL,
  category             TEXT      NOT NULL DEFAULT 'required'
                         CONSTRAINT spc_category_check
                         CHECK (category IN ('required', 'elective', 'general')),
  recommended_year     SMALLINT  CHECK (recommended_year BETWEEN 1 AND 6),
  recommended_semester TEXT      CHECK (recommended_semester IN ('fall', 'spring', 'summer')),
  is_required          BOOLEAN   NOT NULL DEFAULT TRUE,
  sort_order           INTEGER   NOT NULL DEFAULT 0,

  CONSTRAINT study_plan_courses_plan_course_uq
    UNIQUE (plan_id, course_id),

  CONSTRAINT study_plan_courses_plan_id_fk
    FOREIGN KEY (plan_id)
    REFERENCES study_plans (id)
    ON DELETE CASCADE,

  CONSTRAINT study_plan_courses_course_id_fk
    FOREIGN KEY (course_id)
    REFERENCES courses (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_study_plan_courses_plan
  ON study_plan_courses (plan_id);

COMMENT ON TABLE study_plan_courses
  IS 'Courses belonging to an official study plan with recommended placement.';


-- ── 3. course_prerequisites ──────────────────────────────────
-- Prerequisite edges between courses (directed: course_id requires prerequisite_id).
CREATE TABLE IF NOT EXISTS course_prerequisites (
  course_id        UUID    NOT NULL,
  prerequisite_id  UUID    NOT NULL,
  is_concurrent    BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT course_prerequisites_pk
    PRIMARY KEY (course_id, prerequisite_id),

  CONSTRAINT course_prerequisites_no_self
    CHECK (course_id <> prerequisite_id),

  CONSTRAINT course_prerequisites_course_fk
    FOREIGN KEY (course_id)
    REFERENCES courses (id)
    ON DELETE CASCADE,

  CONSTRAINT course_prerequisites_prereq_fk
    FOREIGN KEY (prerequisite_id)
    REFERENCES courses (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_prerequisites_course
  ON course_prerequisites (course_id);

COMMENT ON TABLE course_prerequisites
  IS 'Prerequisite edges between courses (directed acyclic graph). course_id requires prerequisite_id.';


-- =============================================================
-- Verification queries
--
-- 1. Confirm tables were created:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_name IN ('study_plans','study_plan_courses','course_prerequisites');
--
-- 2. Confirm foreign keys on study_plan_courses:
--    SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS ref_table
--    FROM information_schema.table_constraints tc
--    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
--    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
--    JOIN information_schema.key_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
--    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'study_plan_courses';
-- =============================================================
