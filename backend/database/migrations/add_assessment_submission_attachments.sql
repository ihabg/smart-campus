CREATE TABLE IF NOT EXISTS assessment_submission_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID        NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  original_name TEXT        NOT NULL,
  stored_name   TEXT        NOT NULL,
  file_url      TEXT        NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  uploaded_by   UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_attachments_submission_id
  ON assessment_submission_attachments(submission_id);
