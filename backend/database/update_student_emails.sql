-- ════════════════════════════════════════════════════
-- UPDATE STUDENT EMAILS
-- Format: s{student_id}@stu.najah.edu
-- Staff format: name@najah.edu (unchanged)
-- ════════════════════════════════════════════════════

-- Update students who have a student_id
UPDATE users
SET email = 's' || student_id || '@stu.najah.edu'
WHERE role = 'student'
  AND student_id IS NOT NULL
  AND student_id != '';

-- Update our main test student (Amr)
UPDATE users
SET email = 's12143698@stu.najah.edu'
WHERE student_id = '12143698';

-- Verify
SELECT role, email, student_id FROM users
WHERE role = 'student'
ORDER BY email
LIMIT 10;

COMMIT;
