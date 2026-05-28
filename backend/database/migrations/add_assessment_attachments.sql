-- Multiple attachments per assessment (replaces single attachment_url column for new uploads).
-- Old rows with attachment_url still work via backward-compat logic in getAttachments().
CREATE TABLE IF NOT EXISTS assessment_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID        NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
  file_url      TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  position      INT         NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_attachments_assessment_id
  ON assessment_attachments(assessment_id);
