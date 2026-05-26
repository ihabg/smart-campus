-- Add registration period columns to the semesters table.
-- Run in pgAdmin (or any Postgres client) against the smart-campus database.
-- All columns are nullable for backward compatibility:
--   NULL registration_start/end = open whenever the semester is published.
--   NULL drop_deadline           = dropping allowed whenever the semester is published.

ALTER TABLE semesters
  ADD COLUMN IF NOT EXISTS registration_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_end   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drop_deadline      TIMESTAMPTZ;
