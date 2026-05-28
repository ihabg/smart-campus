ALTER TABLE quiz_answers
  ADD COLUMN IF NOT EXISTS answer_json JSONB;
