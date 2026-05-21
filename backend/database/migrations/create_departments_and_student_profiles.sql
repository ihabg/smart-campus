-- =============================================================
-- Migration: create_departments_and_student_profiles
-- Project:   Smart Campus Navigation System
-- Updated:   2026-05-21
--
-- WHAT THIS SCRIPT DOES:
--   1. Patches the existing `departments` table — adds any
--      missing columns and unique indexes without touching data.
--   2. Creates `student_profiles` as a new table linked to
--      `users` (1-to-1) and to `departments`.
--
-- WHAT THIS SCRIPT DOES NOT DO:
--   - Does NOT drop or recreate `departments`.
--   - Does NOT modify `engineering_departments`.
--   - Does NOT touch users.department, users.student_id,
--     users.year_of_study, or any other existing column.
--   - Does NOT insert any data.
--
-- IDEMPOTENT:
--   Every statement is safe to run more than once.
--   ADD COLUMN IF NOT EXISTS silently skips if column exists.
--   CREATE UNIQUE INDEX IF NOT EXISTS skips if name already exists
--   (it will still error if duplicate values exist in the column —
--   see the note below each index).
--
-- HOW TO RUN:
--   pgAdmin → Query Tool → open / paste this file → F5 (Execute)
--   or: psql -U postgres -d smart_campus -f this_file.sql
-- =============================================================


-- ── Prerequisite extension ───────────────────────────────────
-- gen_random_uuid() is provided by pgcrypto (PostgreSQL < 13)
-- or by the built-in functions (PostgreSQL ≥ 13).
-- Safe to run on any version.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================
-- PART 1 — Patch the existing `departments` table
--
-- The table already exists with at least:
--   id, code, name_en, name_ar, faculty, is_active, created_at
--
-- We only add columns or indexes that may be missing.
-- Nothing is dropped or changed.
-- =============================================================

-- ── 1a. Add `updated_at` if not already present ──────────────
-- The rest of the project uses updated_at = NOW() on every
-- UPDATE, so we keep the pattern consistent.
-- DEFAULT NOW() back-fills all existing rows automatically.
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ── 1b. Unique index on `code` ───────────────────────────────
-- Skipped silently if an index named departments_code_uq already
-- exists.  Will ERROR if duplicate code values are present —
-- that would need to be resolved in the data before running.
CREATE UNIQUE INDEX IF NOT EXISTS departments_code_uq
  ON departments (code);


-- ── 1c. Unique index on `name_en` ────────────────────────────
-- Same rule: safe if already indexed; errors only on duplicate
-- English names in the data.
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_en_uq
  ON departments (name_en);


-- ── 1d. Unique index on `name_ar` ────────────────────────────
-- Safe if already indexed; errors only on duplicate Arabic names.
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_ar_uq
  ON departments (name_ar);


-- =============================================================
-- PART 2 — Create `student_profiles` (new table)
--
-- Stores student-specific information that does not belong in
-- the generic `users` table.
--
-- Each row corresponds to exactly one row in `users` (1-to-1).
-- Deleting a user automatically deletes the matching profile
-- (ON DELETE CASCADE).
--
-- Relationship to existing columns:
--   users.student_id   → still the text registration number
--   users.department   → still a free-text column
--   users.year_of_study → still an integer column
-- None of those are touched; all existing code keeps working.
-- student_profiles is additive only.
-- =============================================================

CREATE TABLE IF NOT EXISTS student_profiles (

  -- Surrogate primary key (UUID, consistent with the rest of the project)
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),

  -- The user this profile belongs to.
  -- UNIQUE enforces the 1-to-1 relationship.
  -- CASCADE means deleting the user also deletes this profile.
  user_id             UUID        NOT NULL,

  -- Official university registration number (e.g. "1261001").
  -- Unique across the entire university.
  registration_number VARCHAR(20) NOT NULL,

  -- Which department the student belongs to.
  -- References departments.id — the existing departments table.
  -- NOTE: departments.id is assumed to be UUID.
  -- If your departments.id is a different type (e.g. SERIAL/INT),
  -- change this column type to match before running.
  department_id       UUID        NOT NULL,

  -- Academic year the student is currently in (1 through 6).
  year_of_study       SMALLINT    NOT NULL
                        CONSTRAINT sp_year_of_study_range
                        CHECK (year_of_study BETWEEN 1 AND 6),

  -- Calendar year the student first registered (e.g. 2024).
  registration_year   SMALLINT    NOT NULL
                        CONSTRAINT sp_registration_year_range
                        CHECK (registration_year BETWEEN 1990 AND 2100),

  -- Audit timestamps — consistent with the rest of the project.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Constraints ──────────────────────────────────────────

  CONSTRAINT student_profiles_pkey
    PRIMARY KEY (id),

  -- Enforces 1-to-1: one profile per user.
  CONSTRAINT student_profiles_user_id_uq
    UNIQUE (user_id),

  -- Registration numbers must be unique university-wide.
  CONSTRAINT student_profiles_reg_number_uq
    UNIQUE (registration_number),

  -- Cascade-delete profile when the user account is removed.
  CONSTRAINT student_profiles_user_id_fk
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE,

  -- Link to the existing departments table.
  CONSTRAINT student_profiles_department_id_fk
    FOREIGN KEY (department_id)
    REFERENCES departments (id)
);

-- Table and column comments (visible in pgAdmin)
COMMENT ON TABLE  student_profiles
  IS 'Extended student information linked 1-to-1 with the users table. Additive — does not replace users.student_id or users.department.';
COMMENT ON COLUMN student_profiles.user_id
  IS 'FK → users.id. Cascade-deleted when the user account is removed.';
COMMENT ON COLUMN student_profiles.registration_number
  IS 'University-issued registration number (e.g. 1261001). Unique across the university.';
COMMENT ON COLUMN student_profiles.department_id
  IS 'FK → departments.id. The department this student belongs to.';
COMMENT ON COLUMN student_profiles.year_of_study
  IS 'Current academic year of study (1–6).';
COMMENT ON COLUMN student_profiles.registration_year
  IS 'Calendar year the student first registered at the university.';


-- =============================================================
-- Verification queries — run these after the migration to confirm
-- everything was created correctly.
--
-- 1. Confirm departments now has updated_at:
--    SELECT column_name, data_type
--    FROM information_schema.columns
--    WHERE table_name = 'departments'
--    ORDER BY ordinal_position;
--
-- 2. Confirm student_profiles was created:
--    SELECT column_name, data_type
--    FROM information_schema.columns
--    WHERE table_name = 'student_profiles'
--    ORDER BY ordinal_position;
--
-- 3. Confirm foreign keys:
--    SELECT tc.table_name, kcu.column_name,
--           ccu.table_name AS foreign_table,
--           ccu.column_name AS foreign_column
--    FROM information_schema.table_constraints tc
--    JOIN information_schema.key_column_usage kcu
--      ON tc.constraint_name = kcu.constraint_name
--    JOIN information_schema.referential_constraints rc
--      ON tc.constraint_name = rc.constraint_name
--    JOIN information_schema.key_column_usage ccu
--      ON rc.unique_constraint_name = ccu.constraint_name
--    WHERE tc.constraint_type = 'FOREIGN KEY'
--      AND tc.table_name = 'student_profiles';
--
-- 4. Confirm unique indexes on departments:
--    SELECT indexname, indexdef
--    FROM pg_indexes
--    WHERE tablename = 'departments';
-- =============================================================
