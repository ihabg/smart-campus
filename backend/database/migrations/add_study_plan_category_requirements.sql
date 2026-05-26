BEGIN;

CREATE TABLE IF NOT EXISTS study_plan_category_requirements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID        NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  category       TEXT        NOT NULL,
  required_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  label_en       TEXT,
  label_ar       TEXT,
  sort_order     INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT spcr_category_check
    CHECK (category IN ('major_required','university_required','major_elective','free_elective')),
  CONSTRAINT spcr_plan_category_unique
    UNIQUE (plan_id, category)
);

CREATE INDEX IF NOT EXISTS idx_spcr_plan_id ON study_plan_category_requirements(plan_id);

-- Backfill: insert 4 default rows (required_hours = 0) for every existing study plan
INSERT INTO study_plan_category_requirements (plan_id, category, required_hours, label_en, label_ar, sort_order)
SELECT
  sp.id,
  cat.category,
  0,
  cat.label_en,
  cat.label_ar,
  cat.sort_order
FROM study_plans sp
CROSS JOIN (
  VALUES
    ('major_required',      'Major Required',      'إجباري تخصص',  1),
    ('university_required', 'University Required', 'إجباري جامعة', 2),
    ('major_elective',      'Major Elective',      'اختياري تخصص', 3),
    ('free_elective',       'Free Elective',       'مساق حر',       4)
) AS cat(category, label_en, label_ar, sort_order)
ON CONFLICT (plan_id, category) DO NOTHING;

COMMIT;
