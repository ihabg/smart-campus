const { query, withTransaction } = require('../config/db');

function asBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function asNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseQuestions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeUuidArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function nowMs() {
  return Date.now();
}

function isOpen(assessment) {
  const open = new Date(assessment.opens_at).getTime();
  const close = new Date(assessment.closes_at).getTime();
  const current = nowMs();
  return current >= open && current <= close;
}

function studentFileUrl(req) {
  return req.file ? `/uploads/submissions/${req.file.filename}` : null;
}

function assessmentAttachment(req) {
  if (!req.file) {
    return {
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      attachment_size: null
    };
  }

  return {
    attachment_url: `/uploads/assessments/${req.file.filename}`,
    attachment_name: req.file.originalname,
    attachment_type: req.file.mimetype,
    attachment_size: req.file.size
  };
}

async function getInstructorId(req) {
  const result = await query(
    `SELECT id FROM instructors WHERE LOWER(email) = LOWER($1) OR user_id = $2 LIMIT 1`,
    [req.user.email, req.user.id]
  );
  return result.rows[0]?.id || null;
}

async function requireInstructor(req, res) {
  const instructorId = await getInstructorId(req);
  if (!instructorId) {
    res.status(404).json({ success: false, message: 'Instructor profile not found for this professor account.' });
    return null;
  }
  return instructorId;
}

async function assertProfessorSection(instructorId, sectionId) {
  const result = await query(
    `
    SELECT s.id, s.course_id, s.section_number, s.semester::text AS semester, s.academic_year,
           c.code AS course_code, c.name AS course_name
    FROM sections s
    JOIN courses c ON c.id = s.course_id
    WHERE s.id = $1 AND s.instructor_id = $2 AND s.is_active = TRUE
    LIMIT 1
    `,
    [sectionId, instructorId]
  );
  return result.rows[0] || null;
}

async function assertAssessmentOwner(instructorId, assessmentId) {
  const result = await query(
    `
    SELECT a.*, c.code AS course_code, c.name AS course_name, s.section_number
    FROM course_assessments a
    JOIN courses c ON c.id = a.course_id
    JOIN sections s ON s.id = a.section_id
    WHERE a.id = $1 AND a.instructor_id = $2
    LIMIT 1
    `,
    [assessmentId, instructorId]
  );
  return result.rows[0] || null;
}

async function assertEnrolledAssessment(studentId, assessmentId) {
  const result = await query(
    `
    SELECT a.*, c.code AS course_code, c.name AS course_name, s.section_number,
           i.first_name || ' ' || i.last_name AS instructor_name
    FROM course_assessments a
    JOIN sections s ON s.id = a.section_id
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN instructors i ON i.id = a.instructor_id
    JOIN enrollments e ON e.section_id = a.section_id
    WHERE a.id = $1
      AND e.student_id = $2
      AND e.status = 'enrolled'
      AND a.is_published = TRUE
    LIMIT 1
    `,
    [assessmentId, studentId]
  );
  return result.rows[0] || null;
}

async function notifyStudents(sectionId, senderId, title, body, data = {}) {
  try {
    const notification = await query(
      `
      INSERT INTO notifications (title, body, type, sender_id, target_role, data, is_published, published_at)
      VALUES ($1, $2, 'custom', $3, 'student', $4::jsonb, TRUE, NOW())
      RETURNING id
      `,
      [title, body, senderId, JSON.stringify(data)]
    );

    await query(
      `
      INSERT INTO notification_receipts (notification_id, user_id)
      SELECT $1, e.student_id
      FROM enrollments e
      WHERE e.section_id = $2 AND e.status = 'enrolled'
      ON CONFLICT (notification_id, user_id) DO NOTHING
      `,
      [notification.rows[0].id, sectionId]
    );
  } catch (error) {
    console.warn('Assessment notification failed:', error.message);
  }
}

async function insertQuestions(client, assessmentId, questions) {
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i] || {};
    const questionText = String(q.question_text || q.text || '').trim();
    if (!questionText) continue;

    const questionType = ['single_choice', 'multiple_choice', 'text'].includes(q.question_type || q.type)
      ? (q.question_type || q.type)
      : 'single_choice';
    const points = asNumber(q.points, 1) || 1;

    const qRes = await client.query(
      `
      INSERT INTO quiz_questions (assessment_id, question_text, question_type, points, position)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [assessmentId, questionText, questionType, points, i + 1]
    );

    if (questionType !== 'text') {
      const options = Array.isArray(q.options) ? q.options : [];
      for (let j = 0; j < options.length; j += 1) {
        const option = options[j] || {};
        const optionText = String(option.option_text || option.text || '').trim();
        if (!optionText) continue;

        await client.query(
          `
          INSERT INTO quiz_options (question_id, option_text, is_correct, position)
          VALUES ($1, $2, $3, $4)
          `,
          [qRes.rows[0].id, optionText, !!option.is_correct, j + 1]
        );
      }
    }
  }
}

async function listProfessorSections(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const result = await query(
      `
      SELECT s.id, s.section_number, s.semester::text AS semester, s.academic_year,
             c.id AS course_id, c.code, c.name AS course_name,
             COALESCE(c.name_ar, c.name) AS course_name_ar,
             COUNT(DISTINCT e.student_id) FILTER (WHERE e.status = 'enrolled') AS enrolled,
             COUNT(DISTINCT a.id) AS assessments_count
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN enrollments e ON e.section_id = s.id
      LEFT JOIN course_assessments a ON a.section_id = s.id
      WHERE s.instructor_id = $1 AND s.is_active = TRUE
      GROUP BY s.id, c.id
      ORDER BY c.code, s.section_number
      `,
      [instructorId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

async function listProfessorAssessments(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const params = [instructorId];
    let sectionWhere = '';
    if (req.query.section_id) {
      params.push(req.query.section_id);
      sectionWhere = `AND a.section_id = $${params.length}`;
    }

    const result = await query(
      `
      SELECT a.*, c.code AS course_code, c.name AS course_name, s.section_number,
             COUNT(DISTINCT sub.id) AS submissions_count,
             COUNT(DISTINCT qa.id) FILTER (WHERE qa.status = 'submitted') AS quiz_attempts_count,
             COUNT(DISTINCT e.student_id) FILTER (WHERE e.status = 'enrolled') AS enrolled_count
      FROM course_assessments a
      JOIN courses c ON c.id = a.course_id
      JOIN sections s ON s.id = a.section_id
      LEFT JOIN enrollments e ON e.section_id = a.section_id
      LEFT JOIN assignment_submissions sub ON sub.assessment_id = a.id
      LEFT JOIN quiz_attempts qa ON qa.assessment_id = a.id
      WHERE a.instructor_id = $1 ${sectionWhere}
      GROUP BY a.id, c.code, c.name, s.section_number
      ORDER BY a.opens_at DESC, a.created_at DESC
      `,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
}

async function createProfessorAssessment(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const section = await assertProfessorSection(instructorId, req.body.section_id);
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found for this professor.' });
    }

    const title = String(req.body.title || '').trim();
    const assessmentType = req.body.assessment_type;
    const opensAt = req.body.opens_at;
    const closesAt = req.body.closes_at;

    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });
    if (!['assignment', 'quiz'].includes(assessmentType)) {
      return res.status(400).json({ success: false, message: 'Assessment type must be assignment or quiz.' });
    }
    if (!opensAt || !closesAt || new Date(closesAt).getTime() <= new Date(opensAt).getTime()) {
      return res.status(400).json({ success: false, message: 'Close time must be after open time.' });
    }

    const duration = assessmentType === 'quiz' ? asNumber(req.body.duration_minutes, null) : null;
    if (assessmentType === 'quiz' && (!duration || duration <= 0)) {
      return res.status(400).json({ success: false, message: 'Quiz duration is required.' });
    }

    const questions = parseQuestions(req.body.questions);
    if (assessmentType === 'quiz' && questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one quiz question.' });
    }

    const attachment = assessmentAttachment(req);

    const created = await withTransaction(async (client) => {
      const assessmentRes = await client.query(
        `
        INSERT INTO course_assessments (
          instructor_id, section_id, course_id, title, description, assessment_type,
          week_number, opens_at, closes_at, duration_minutes, points, allow_late, is_published,
          attachment_url, attachment_name, attachment_type, attachment_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
        `,
        [
          instructorId,
          section.id,
          section.course_id,
          title,
          req.body.description || null,
          assessmentType,
          asNumber(req.body.week_number, null),
          opensAt,
          closesAt,
          duration,
          asNumber(req.body.points, 100) || 100,
          asBool(req.body.allow_late, false),
          asBool(req.body.is_published, true),
          attachment.attachment_url,
          attachment.attachment_name,
          attachment.attachment_type,
          attachment.attachment_size
        ]
      );

      if (assessmentType === 'quiz') {
        await insertQuestions(client, assessmentRes.rows[0].id, questions);
      }

      return assessmentRes.rows[0];
    });

    if (created.is_published) {
      await notifyStudents(
        created.section_id,
        req.user.id,
        `${created.assessment_type === 'quiz' ? 'New quiz' : 'New assignment'}: ${created.title}`,
        `${section.course_code} §${section.section_number} has a new ${created.assessment_type}. Opens ${new Date(created.opens_at).toLocaleString()} and closes ${new Date(created.closes_at).toLocaleString()}.`,
        { assessment_id: created.id, section_id: created.section_id, type: created.assessment_type }
      );
    }

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
}

async function updateProfessorAssessment(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const existing = await assertAssessmentOwner(instructorId, req.params.assessmentId);
    if (!existing) return res.status(404).json({ success: false, message: 'Assessment not found.' });

    const title = req.body.title !== undefined ? String(req.body.title || '').trim() : existing.title;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    const opensAt = req.body.opens_at || existing.opens_at;
    const closesAt = req.body.closes_at || existing.closes_at;
    const attachment = assessmentAttachment(req);
    if (new Date(closesAt).getTime() <= new Date(opensAt).getTime()) {
      return res.status(400).json({ success: false, message: 'Close time must be after open time.' });
    }

    const updated = await withTransaction(async (client) => {
      const updateRes = await client.query(
        `
        UPDATE course_assessments
        SET title = $1,
            description = $2,
            week_number = $3,
            opens_at = $4::timestamptz,
            closes_at = $5::timestamptz,
            duration_minutes = $6,
            points = $7,
            allow_late = $8,
            is_published = $9,
            attachment_url = COALESCE($10, attachment_url),
            attachment_name = COALESCE($11, attachment_name),
            attachment_type = COALESCE($12, attachment_type),
            attachment_size = COALESCE($13, attachment_size)
        WHERE id = $14 AND instructor_id = $15
        RETURNING *
        `,
        [
          title,
          req.body.description !== undefined ? req.body.description : existing.description,
          asNumber(req.body.week_number, existing.week_number),
          opensAt,
          closesAt,
          existing.assessment_type === 'quiz' ? asNumber(req.body.duration_minutes, existing.duration_minutes) : null,
          asNumber(req.body.points, existing.points) || existing.points,
          asBool(req.body.allow_late, existing.allow_late),
          asBool(req.body.is_published, existing.is_published),
          attachment.attachment_url,
          attachment.attachment_name,
          attachment.attachment_type,
          attachment.attachment_size,
          existing.id,
          instructorId
        ]
      );

      if (existing.assessment_type === 'quiz' && req.body.questions !== undefined) {
        await client.query(`DELETE FROM quiz_questions WHERE assessment_id = $1`, [existing.id]);
        await insertQuestions(client, existing.id, parseQuestions(req.body.questions));
      }

      return updateRes.rows[0];
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

async function deleteProfessorAssessment(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const result = await query(
      `DELETE FROM course_assessments WHERE id = $1 AND instructor_id = $2 RETURNING id`,
      [req.params.assessmentId, instructorId]
    );

    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Assessment not found.' });
    res.json({ success: true, message: 'Assessment deleted.' });
  } catch (error) {
    next(error);
  }
}

async function getProfessorAssessmentDetail(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const assessment = await assertAssessmentOwner(instructorId, req.params.assessmentId);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });

    const questions = await query(
      `
      SELECT q.*, COALESCE(json_agg(o ORDER BY o.position) FILTER (WHERE o.id IS NOT NULL), '[]') AS options
      FROM quiz_questions q
      LEFT JOIN quiz_options o ON o.question_id = q.id
      WHERE q.assessment_id = $1
      GROUP BY q.id
      ORDER BY q.position
      `,
      [assessment.id]
    );

    res.json({ success: true, data: { ...assessment, questions: questions.rows } });
  } catch (error) {
    next(error);
  }
}

async function listProfessorResults(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const assessment = await assertAssessmentOwner(instructorId, req.params.assessmentId);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });

    if (assessment.assessment_type === 'assignment') {
      const rows = await query(
        `
        SELECT u.id AS student_id, u.student_id AS university_id,
               u.first_name || ' ' || u.last_name AS student_name, u.email,
               sub.id AS submission_id, sub.submission_text, sub.file_url, sub.submitted_at,
               sub.status, sub.grade, sub.feedback
        FROM enrollments e
        JOIN users u ON u.id = e.student_id
        LEFT JOIN assignment_submissions sub
          ON sub.assessment_id = $1 AND sub.student_id = u.id
        WHERE e.section_id = $2 AND e.status = 'enrolled'
        ORDER BY u.first_name, u.last_name
        `,
        [assessment.id, assessment.section_id]
      );
      return res.json({ success: true, data: { assessment, rows: rows.rows } });
    }

    const rows = await query(
      `
      SELECT u.id AS student_id, u.student_id AS university_id,
             u.first_name || ' ' || u.last_name AS student_name, u.email,
             att.id AS attempt_id, att.started_at, att.submitted_at, att.due_at,
             att.status, att.score
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN quiz_attempts att
        ON att.assessment_id = $1 AND att.student_id = u.id
      WHERE e.section_id = $2 AND e.status = 'enrolled'
      ORDER BY u.first_name, u.last_name
      `,
      [assessment.id, assessment.section_id]
    );

    res.json({ success: true, data: { assessment, rows: rows.rows } });
  } catch (error) {
    next(error);
  }
}

async function gradeAssignmentSubmission(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const assessment = await assertAssessmentOwner(instructorId, req.params.assessmentId);
    if (!assessment || assessment.assessment_type !== 'assignment') {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const grade = asNumber(req.body.grade, null);
    if (grade === null || grade < 0 || grade > Number(assessment.points)) {
      return res.status(400).json({ success: false, message: `Grade must be between 0 and ${assessment.points}.` });
    }

    const result = await query(
      `
      UPDATE assignment_submissions
      SET grade = $1, feedback = $2, status = 'graded', graded_at = NOW(), graded_by = $3
      WHERE id = $4 AND assessment_id = $5
      RETURNING *
      `,
      [grade, req.body.feedback || null, req.user.id, req.params.submissionId, assessment.id]
    );

    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Submission not found.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function listStudentAssessments(req, res, next) {
  try {
    const params = [req.user.id];
    const where = [`e.student_id = $1`, `e.status = 'enrolled'`, `a.is_published = TRUE`];

    if (req.query.semester) {
      params.push(req.query.semester);
      where.push(`s.semester::text = $${params.length}`);
    }
    if (req.query.academic_year) {
      params.push(req.query.academic_year);
      where.push(`s.academic_year = $${params.length}`);
    }
    if (req.query.section_id) {
      params.push(req.query.section_id);
      where.push(`s.id = $${params.length}`);
    }

    const sectionsRes = await query(
      `
      SELECT s.id AS section_id, s.section_number, s.semester::text AS semester, s.academic_year,
             c.code AS course_code, c.name AS course_name
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      WHERE e.student_id = $1 AND e.status = 'enrolled'
      ORDER BY c.code, s.section_number
      `,
      [req.user.id]
    );

    const result = await query(
      `
      SELECT a.*, c.code AS course_code, c.name AS course_name, s.section_number,
             i.first_name || ' ' || i.last_name AS instructor_name,
             sub.id AS submission_id, sub.submitted_at, sub.status AS submission_status, sub.grade,
             att.id AS attempt_id, att.started_at, att.submitted_at AS quiz_submitted_at,
             att.status AS attempt_status, att.score
      FROM course_assessments a
      JOIN sections s ON s.id = a.section_id
      JOIN courses c ON c.id = a.course_id
      JOIN enrollments e ON e.section_id = s.id
      LEFT JOIN instructors i ON i.id = a.instructor_id
      LEFT JOIN assignment_submissions sub ON sub.assessment_id = a.id AND sub.student_id = e.student_id
      LEFT JOIN quiz_attempts att ON att.assessment_id = a.id AND att.student_id = e.student_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.closes_at ASC, c.code
      `,
      params
    );

    res.json({ success: true, data: { sections: sectionsRes.rows, assessments: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function getStudentAssessment(req, res, next) {
  try {
    const assessment = await assertEnrolledAssessment(req.user.id, req.params.assessmentId);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found for your enrolled courses.' });

    let extra = {};

    if (assessment.assessment_type === 'assignment') {
      const sub = await query(
        `SELECT * FROM assignment_submissions WHERE assessment_id = $1 AND student_id = $2 LIMIT 1`,
        [assessment.id, req.user.id]
      );
      extra.submission = sub.rows[0] || null;
    } else {
      const questions = await query(
        `
        SELECT q.id, q.assessment_id, q.question_text, q.question_type, q.points, q.position,
               COALESCE(json_agg(json_build_object('id', o.id, 'option_text', o.option_text, 'position', o.position) ORDER BY o.position)
                        FILTER (WHERE o.id IS NOT NULL), '[]') AS options
        FROM quiz_questions q
        LEFT JOIN quiz_options o ON o.question_id = q.id
        WHERE q.assessment_id = $1
        GROUP BY q.id
        ORDER BY q.position
        `,
        [assessment.id]
      );
      const attempt = await query(
        `SELECT * FROM quiz_attempts WHERE assessment_id = $1 AND student_id = $2 LIMIT 1`,
        [assessment.id, req.user.id]
      );
      extra.questions = questions.rows;
      extra.attempt = attempt.rows[0] || null;
    }

    res.json({ success: true, data: { ...assessment, ...extra } });
  } catch (error) {
    next(error);
  }
}

async function submitAssignment(req, res, next) {
  try {
    const assessment = await assertEnrolledAssessment(req.user.id, req.params.assessmentId);
    if (!assessment || assessment.assessment_type !== 'assignment') {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const current = nowMs();
    const opens = new Date(assessment.opens_at).getTime();
    const closes = new Date(assessment.closes_at).getTime();

    if (current < opens) return res.status(400).json({ success: false, message: 'This assignment is not open yet.' });
    if (current > closes && !assessment.allow_late) {
      return res.status(400).json({ success: false, message: 'The assignment deadline has passed.' });
    }

    const fileUrl = studentFileUrl(req);
    const status = current > closes ? 'late' : 'submitted';

    const result = await query(
      `
      INSERT INTO assignment_submissions (assessment_id, student_id, submission_text, file_url, status, submitted_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (assessment_id, student_id)
      DO UPDATE SET submission_text = EXCLUDED.submission_text,
                    file_url = COALESCE(EXCLUDED.file_url, assignment_submissions.file_url),
                    status = EXCLUDED.status,
                    submitted_at = NOW(),
                    grade = NULL,
                    feedback = NULL,
                    graded_at = NULL
      RETURNING *
      `,
      [assessment.id, req.user.id, req.body.submission_text || null, fileUrl, status]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function startQuiz(req, res, next) {
  try {
    const assessment = await assertEnrolledAssessment(req.user.id, req.params.assessmentId);
    if (!assessment || assessment.assessment_type !== 'quiz') {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    if (!isOpen(assessment)) {
      return res.status(400).json({ success: false, message: 'Quiz is not open now.' });
    }

    const existing = await query(
      `SELECT * FROM quiz_attempts WHERE assessment_id = $1 AND student_id = $2 LIMIT 1`,
      [assessment.id, req.user.id]
    );

    if (existing.rows[0]?.status === 'submitted') {
      return res.status(400).json({ success: false, message: 'You already submitted this quiz.' });
    }

    if (existing.rows[0]?.status === 'in_progress') {
      return res.json({ success: true, data: existing.rows[0] });
    }

    const result = await query(
      `
      INSERT INTO quiz_attempts (assessment_id, student_id, due_at)
      VALUES (
        $1,
        $2,
        LEAST(NOW() + ($3::text || ' minutes')::interval, $4::timestamptz)
      )
      RETURNING *
      `,
      [assessment.id, req.user.id, assessment.duration_minutes, assessment.closes_at]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function submitQuiz(req, res, next) {
  try {
    const assessment = await assertEnrolledAssessment(req.user.id, req.params.assessmentId);
    if (!assessment || assessment.assessment_type !== 'quiz') {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const attemptRes = await query(
      `SELECT * FROM quiz_attempts WHERE assessment_id = $1 AND student_id = $2 LIMIT 1`,
      [assessment.id, req.user.id]
    );
    const attempt = attemptRes.rows[0];
    if (!attempt) return res.status(400).json({ success: false, message: 'Start the quiz before submitting.' });
    if (attempt.status === 'submitted') return res.status(400).json({ success: false, message: 'Quiz already submitted.' });

    if (nowMs() > new Date(attempt.due_at).getTime() || nowMs() > new Date(assessment.closes_at).getTime()) {
      await query(`UPDATE quiz_attempts SET status = 'expired' WHERE id = $1`, [attempt.id]);
      return res.status(400).json({ success: false, message: 'Quiz time is over.' });
    }

    const questionsRes = await query(
      `SELECT * FROM quiz_questions WHERE assessment_id = $1 ORDER BY position`,
      [assessment.id]
    );
    const optionsRes = await query(
      `SELECT * FROM quiz_options WHERE question_id = ANY($1::uuid[]) ORDER BY position`,
      [questionsRes.rows.map((q) => q.id)]
    );

    const optionsByQuestion = new Map();
    optionsRes.rows.forEach((option) => {
      if (!optionsByQuestion.has(option.question_id)) optionsByQuestion.set(option.question_id, []);
      optionsByQuestion.get(option.question_id).push(option);
    });

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

    let score = 0;

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM quiz_answers WHERE attempt_id = $1`, [attempt.id]);

      for (const question of questionsRes.rows) {
        const studentAnswer = answerByQuestion.get(question.id) || {};
        const selectedOptionIds = normalizeUuidArray(studentAnswer.selected_option_ids);
        const answerText = studentAnswer.answer_text || null;
        const options = optionsByQuestion.get(question.id) || [];
        let isCorrect = null;
        let awarded = 0;

        if (question.question_type !== 'text') {
          const correctIds = options.filter((o) => o.is_correct).map((o) => o.id).sort();
          const selected = selectedOptionIds.slice().sort();
          isCorrect = correctIds.length === selected.length && correctIds.every((id, idx) => id === selected[idx]);
          awarded = isCorrect ? Number(question.points) : 0;
          score += awarded;
        }

        await client.query(
          `
          INSERT INTO quiz_answers (attempt_id, question_id, selected_option_ids, answer_text, is_correct, points_awarded)
          VALUES ($1, $2, $3::uuid[], $4, $5, $6)
          `,
          [attempt.id, question.id, selectedOptionIds, answerText, isCorrect, awarded]
        );
      }

      await client.query(
        `UPDATE quiz_attempts SET status = 'submitted', submitted_at = NOW(), score = $1 WHERE id = $2`,
        [score, attempt.id]
      );
    });

    res.json({ success: true, data: { attempt_id: attempt.id, score, max_score: questionsRes.rows.reduce((sum, q) => sum + Number(q.points), 0) } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProfessorSections,
  listProfessorAssessments,
  createProfessorAssessment,
  updateProfessorAssessment,
  deleteProfessorAssessment,
  getProfessorAssessmentDetail,
  listProfessorResults,
  gradeAssignmentSubmission,
  listStudentAssessments,
  getStudentAssessment,
  submitAssignment,
  startQuiz,
  submitQuiz
};
