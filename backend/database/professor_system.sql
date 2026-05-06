-- PROFESSOR SYSTEM — Attendance, Grades, Warnings
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id    UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  lecture_date  DATE NOT NULL,
  status        VARCHAR(10) NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_by     UUID REFERENCES users(id),
  note          TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (student_id, section_id, lecture_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_section ON attendance(section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date    ON attendance(lecture_date);

CREATE TABLE IF NOT EXISTS grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  midterm     NUMERIC(5,2),
  final       NUMERIC(5,2),
  assignments NUMERIC(5,2),
  practical   NUMERIC(5,2),
  letter_grade VARCHAR(3),
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (student_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_section ON grades(section_id);

CREATE TABLE IF NOT EXISTS attendance_warnings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id     UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  sent_by        UUID REFERENCES users(id),
  message        TEXT,
  attendance_pct NUMERIC(5,2),
  sent_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMIT;
