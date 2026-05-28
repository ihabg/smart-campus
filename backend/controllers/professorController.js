const { query } = require('../config/db');
const https = require('https');
const ExcelJS = require('exceljs');

function letterGrade(total) {
  if (total >= 90) return 'A';
  if (total >= 88) return 'A-';
  if (total >= 85) return 'B+';
  if (total >= 80) return 'B';
  if (total >= 78) return 'B-';
  if (total >= 73) return 'C+';
  if (total >= 70) return 'C';
  if (total >= 65) return 'C-';
  if (total >= 63) return 'D+';
  if (total >= 60) return 'D';
  if (total >= 45) return 'D-';
  return 'E';
}


function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

function sendCsv(res, filename, rows) {
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\ufeff${body}`);
}

async function getInstructorIdByUserEmail(req) {
  const result = await query(
    `SELECT id FROM instructors
     WHERE LOWER(email) = LOWER($1) OR user_id = $2
     LIMIT 1`,
    [req.user.email, req.user.id]
  );

  return result.rows[0]?.id || null;
}

async function requireInstructor(req, res) {
  const instructorId = await getInstructorIdByUserEmail(req);

  if (!instructorId) {
    res.status(404).json({
      success: false,
      message: 'Instructor profile not found for this professor account.'
    });
    return null;
  }

  return instructorId;
}



async function notifySectionStudents({ sectionId, senderId, title, body, data = {}, type = 'custom', relatedRoomId = null }) {
  const notificationRes = await query(
    `
    INSERT INTO notifications (
      title,
      body,
      type,
      sender_id,
      target_role,
      related_room_id,
      data,
      is_published,
      published_at
    )
    VALUES ($1, $2, $3::notification_type, $4, 'student', $5, $6::jsonb, TRUE, NOW())
    RETURNING id
    `,
    [title, body, type, senderId, relatedRoomId, JSON.stringify(data || {})]
  );

  await query(
    `
    INSERT INTO notification_receipts (notification_id, user_id)
    SELECT $1, e.student_id
    FROM enrollments e
    WHERE e.section_id = $2
      AND e.status = 'enrolled'
    ON CONFLICT (notification_id, user_id) DO NOTHING
    `,
    [notificationRes.rows[0].id, sectionId]
  );

  return notificationRes.rows[0].id;
}

async function notifyAllProfessorStudents({ instructorId, senderId, title, body, data = {}, type = 'custom' }) {
  const notificationRes = await query(
    `
    INSERT INTO notifications (
      title,
      body,
      type,
      sender_id,
      target_role,
      data,
      is_published,
      published_at
    )
    VALUES ($1, $2, $3::notification_type, $4, 'student', $5::jsonb, TRUE, NOW())
    RETURNING id
    `,
    [title, body, type, senderId, JSON.stringify(data || {})]
  );

  await query(
    `
    INSERT INTO notification_receipts (notification_id, user_id)
    SELECT DISTINCT $1, e.student_id
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    WHERE s.instructor_id = $2
      AND s.is_active = TRUE
      AND e.status = 'enrolled'
    ON CONFLICT (notification_id, user_id) DO NOTHING
    `,
    [notificationRes.rows[0].id, instructorId]
  );

  return notificationRes.rows[0].id;
}

async function getDashboard(req, res, next) {
  try {
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const today = new Date().getDay();
    const { semester, academic_year } = req.query;

    // Build semester filter for sections list.
    // When params are missing return empty sections rather than all semesters.
    const sectionsParams = [profId];
    let sectionsFilter = 'AND 1 = 0';
    if (semester && academic_year) {
      sectionsParams.push(semester, academic_year);
      sectionsFilter = 'AND s.semester::text = $2 AND s.academic_year = $3';
    }

    const [sectionsRes, todayRes, statsRes, atRiskRes, termsRes, titleRes] = await Promise.all([
      query(
        `
        SELECT
          s.id,
          s.section_number,
          s.day_of_week,
          s.start_time,
          s.end_time,
          c.id AS course_id,
          c.code,
          c.name AS course_name,
          COALESCE(c.name_ar, c.name) AS course_name_ar,
          r.room_number,
          f.floor_label,
          (
            SELECT COUNT(*)
            FROM enrollments e
            WHERE e.section_id = s.id
              AND e.status = 'enrolled'
          ) AS enrolled
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN rooms r ON r.id = s.room_id
        LEFT JOIN floors f ON f.id = r.floor_id
        WHERE s.instructor_id = $1
          AND s.is_active = TRUE
          ${sectionsFilter}
        ORDER BY c.code
        `,
        sectionsParams
      ),

      query(
        `
        SELECT
          s.id,
          COALESCE(sm.start_time, s.start_time) AS start_time,
          COALESCE(sm.end_time, s.end_time) AS end_time,
          s.section_number,
          c.code,
          c.name AS course_name,
          COALESCE(c.name_ar, c.name) AS course_name_ar,
          r.room_number,
          (
            SELECT COUNT(*)
            FROM enrollments e
            WHERE e.section_id = s.id
              AND e.status = 'enrolled'
          ) AS enrolled
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN section_meetings sm
          ON sm.section_id = s.id
         AND sm.day_of_week = $2
        LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
        LEFT JOIN floors f ON f.id = r.floor_id
        WHERE s.instructor_id = $1
          AND s.is_active = TRUE
          AND (
            sm.day_of_week = $2
            OR $2 = ANY(s.day_of_week)
          )
        ORDER BY COALESCE(sm.start_time, s.start_time)
        `,
        [profId, today]
      ),

      query(
        `
        SELECT
          COUNT(DISTINCT s.id) AS total_sections,
          COUNT(DISTINCT e.student_id) FILTER (WHERE e.status = 'enrolled') AS total_students,
          COUNT(DISTINCT c.id) AS total_courses
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN enrollments e ON e.section_id = s.id
        WHERE s.instructor_id = $1
          AND s.is_active = TRUE
          ${sectionsFilter}
        `,
        sectionsParams
      ),

      query(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.student_id,
          u.email,
          c.code AS course_code,
          s.id AS section_id,
          ROUND(
            COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
            / NULLIF(COUNT(a.id), 0) * 100,
            1
          ) AS attendance_pct
        FROM enrollments e
        JOIN users u ON u.id = e.student_id
        JOIN sections s ON s.id = e.section_id
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN attendance a
          ON a.student_id = u.id
         AND a.section_id = s.id
        WHERE s.instructor_id = $1
          AND e.status = 'enrolled'
          AND s.is_active = TRUE
          ${sectionsFilter}
        GROUP BY
          u.id,
          u.first_name,
          u.last_name,
          u.student_id,
          u.email,
          c.code,
          s.id
        HAVING COUNT(a.id) > 0
          AND COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
              / COUNT(a.id) * 100 < 75
        ORDER BY attendance_pct
        LIMIT 10
        `,
        sectionsParams
      ),

      // Distinct terms this professor has sections in, most recent first.
      // Uses a CTE so the ORDER BY expressions don't need to appear in SELECT.
      query(
        `
        WITH professor_terms AS (
          SELECT
            s.semester::text AS semester,
            s.academic_year,
            split_part(s.academic_year, '/', 1)::int AS year_start,
            CASE s.semester::text
              WHEN 'summer' THEN 3
              WHEN 'spring' THEN 2
              WHEN 'fall'   THEN 1
              ELSE 0
            END AS semester_order
          FROM sections s
          WHERE s.instructor_id = $1
            AND s.is_active = TRUE
          GROUP BY s.semester, s.academic_year
        )
        SELECT semester, academic_year
        FROM professor_terms
        ORDER BY year_start DESC, semester_order DESC
        `,
        [profId]
      ),

      // Instructor's academic title from the instructors table
      query(
        `SELECT title FROM instructors WHERE id = $1`,
        [profId]
      )
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        sections:         sectionsRes.rows,
        today_schedule:   todayRes.rows,
        stats:            statsRes.rows[0] || {},
        at_risk:          atRiskRes.rows,
        terms:            termsRes.rows,
        instructor_title: titleRes.rows[0]?.title || null
      }
    });
  } catch (e) {
    next(e);
  }
}

async function getSectionStudents(req, res, next) {
  try {
    const { sectionId } = req.params;
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [sectionId, profId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    const result = await query(
      `
      SELECT
        u.id,
        u.student_id,
        u.first_name,
        u.last_name,
        u.email,
        u.department,
        u.year_of_study,
        g.midterm,
        g.final,
        g.assignments,
        g.practical,
        g.letter_grade,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
          / NULLIF(COUNT(a.id), 0) * 100,
          1
        ) AS attendance_pct
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN grades g
        ON g.student_id = u.id
       AND g.section_id = $1
      LEFT JOIN attendance a
        ON a.student_id = u.id
       AND a.section_id = $1
      WHERE e.section_id = $1
        AND e.status = 'enrolled'
      GROUP BY
        u.id,
        u.student_id,
        u.first_name,
        u.last_name,
        u.email,
        u.department,
        u.year_of_study,
        g.midterm,
        g.final,
        g.assignments,
        g.practical,
        g.letter_grade
      ORDER BY u.last_name
      `,
      [sectionId]
    );

    res.json({
      success: true,
      data: {
        students: result.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

async function getAttendance(req, res, next) {
  try {
    const { sectionId } = req.params;
    const { date } = req.query;
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [sectionId, profId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    const params = date ? [sectionId, date] : [sectionId];

    const result = await query(
      `
      SELECT
        u.id AS student_id,
        u.first_name,
        u.last_name,
        u.student_id AS student_number,
        a.status,
        a.lecture_date
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN attendance a
        ON a.student_id = u.id
       AND a.section_id = $1
       ${date ? 'AND a.lecture_date = $2' : ''}
      WHERE e.section_id = $1
        AND e.status = 'enrolled'
      ORDER BY u.last_name
      `,
      params
    );

    res.json({
      success: true,
      data: {
        records: result.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

async function getAttendanceSummary(req, res, next) {
  try {
    const { sectionId } = req.params;
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [sectionId, profId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    const result = await query(
      `
      SELECT
        u.id,
        u.student_id AS student_number,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(a.id) FILTER (WHERE a.status = 'present') AS present,
        COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent,
        COUNT(a.id) FILTER (WHERE a.status = 'late') AS late,
        COUNT(a.id) AS total,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
          / NULLIF(COUNT(a.id), 0) * 100,
          1
        ) AS attendance_pct
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN attendance a
        ON a.student_id = u.id
       AND a.section_id = $1
      WHERE e.section_id = $1
        AND e.status = 'enrolled'
      GROUP BY
        u.id,
        u.student_id,
        u.first_name,
        u.last_name,
        u.email
      ORDER BY attendance_pct ASC NULLS LAST
      `,
      [sectionId]
    );

    res.json({
      success: true,
      data: {
        summary: result.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

async function markAttendance(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const markedByUserId = req.user.id;
    const { section_id, lecture_date, records } = req.body;

    if (!section_id || !lecture_date || !records?.length) {
      return res.status(400).json({
        success: false,
        message: 'Missing fields'
      });
    }

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [section_id, instructorId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    for (const rec of records) {
      await query(
        `
        INSERT INTO attendance (
          student_id,
          section_id,
          lecture_date,
          status,
          marked_by
        )
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (student_id, section_id, lecture_date)
        DO UPDATE SET
          status = $4,
          marked_by = $5
        `,
        [
          rec.student_id,
          section_id,
          lecture_date,
          rec.status,
          markedByUserId
        ]
      );
    }

    res.json({
      success: true,
      data: {
        message: `Attendance saved for ${records.length} students`
      }
    });
  } catch (e) {
    next(e);
  }
}

async function saveGradesBulk(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const updatedByUserId = req.user.id;
    const { section_id, grades: list } = req.body;

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [section_id, instructorId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    for (const g of list) {
      const total =
  (Number(g.midterm) || 0) +
  (Number(g.assignments) || 0) +
  (Number(g.final) || 0);

      const lg = letterGrade(total);

      await query(
        `
        INSERT INTO grades (
          student_id,
          section_id,
          midterm,
          final,
          assignments,
          practical,
          letter_grade,
          updated_by,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (student_id, section_id)
        DO UPDATE SET
          midterm = $3,
          final = $4,
          assignments = $5,
          practical = $6,
          letter_grade = $7,
          updated_by = $8,
          updated_at = NOW()
        `,
        [
          g.student_id,
          section_id,
          g.midterm || null,
          g.final || null,
          g.assignments || null,
          g.practical || null,
          lg,
          updatedByUserId
        ]
      );
    }

    res.json({
      success: true,
      data: {
        message: `${list.length} grades saved`
      }
    });
  } catch (e) {
    next(e);
  }
}

async function sendAttendanceWarning(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const sentByUserId = req.user.id;
    const { student_id, section_id } = req.body;

    const own = await query(
      'SELECT id FROM sections WHERE id = $1 AND instructor_id = $2',
      [section_id, instructorId]
    );

    if (!own.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your section'
      });
    }

    const [studentRes, sectionRes, attRes] = await Promise.all([
      query(
        'SELECT first_name, last_name, email FROM users WHERE id = $1',
        [student_id]
      ),

      query(
        `
        SELECT
          c.name AS course_name,
          c.code,
          s.section_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.id = $1
        `,
        [section_id]
      ),

      query(
        `
        SELECT
          ROUND(
            COUNT(*) FILTER (WHERE status IN ('present','late'))::numeric
            / NULLIF(COUNT(*), 0) * 100,
            1
          ) AS pct
        FROM attendance
        WHERE student_id = $1
          AND section_id = $2
        `,
        [student_id, section_id]
      )
    ]);

    if (!studentRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = studentRes.rows[0];
    const section = sectionRes.rows[0];
    const pct = attRes.rows[0]?.pct || 0;

    const key = process.env.BREVO_API_KEY;

    if (key) {
      const body = JSON.stringify({
        sender: {
          name: 'Smart Campus — An-Najah',
          email: 'amrojamhour4@gmail.com'
        },
        to: [
          {
            email: student.email,
            name: `${student.first_name} ${student.last_name}`
          }
        ],
        subject: `Warning: Low Attendance in ${section?.code || 'your course'}`,
        htmlContent: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:20px"><div style="background:#03184a;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px"><div style="background:#c9a84c;display:inline-block;padding:6px 16px;border-radius:8px;font-weight:800;color:#010e2e;font-family:monospace">AN</div><div style="color:#fff;font-size:16px;margin-top:8px;font-weight:700">Smart Campus</div></div><div style="background:#fef2f2;border:2px solid #dc2626;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center"><div style="font-size:28px">⚠️</div><h2 style="color:#dc2626;margin:8px 0">Attendance Warning</h2></div><p>Dear <strong>${student.first_name} ${student.last_name}</strong>,</p><p>Your attendance in <strong>${section?.code} — ${section?.course_name}</strong> is currently:</p><div style="font-size:48px;font-weight:800;text-align:center;color:#dc2626;margin:16px 0">${pct}%</div><div style="background:#fff7ed;border:1px solid #f97316;border-radius:8px;padding:14px"><p style="margin:0;font-size:14px;color:#7c2d12">Students below <strong>75%</strong> attendance risk being <strong>denied from the course</strong>.</p></div><p style="font-size:13px;color:#6b7280;margin-top:16px">Please contact your professor immediately.</p></div>`
      });

      const r = https.request(
        {
          hostname: 'api.brevo.com',
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            'api-key': key,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 15000
        },
        (res2) => {
          let d = '';
          res2.on('data', (c) => (d += c));
          res2.on('end', () =>
            console.log('Warning sent:', res2.statusCode)
          );
        }
      );

      r.write(body);
      r.end();
    }

    await query(
      `
      INSERT INTO attendance_warnings (
        student_id,
        section_id,
        sent_by,
        attendance_pct
      )
      VALUES ($1,$2,$3,$4)
      `,
      [student_id, section_id, sentByUserId, pct]
    );

    res.json({
      success: true,
      data: {
        message: `Warning sent to ${student.first_name}`,
        attendance_pct: pct
      }
    });
  } catch (e) {
    next(e);
  }
}

async function getSchedule(req, res, next) {
  try {
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const { semester, academic_year } = req.query;

    const params = [profId];
    let filter = '';

    if (semester) {
      params.push(semester);
      filter += ` AND s.semester::TEXT = $${params.length}`;
    }

    if (academic_year) {
      params.push(academic_year);
      filter += ` AND s.academic_year = $${params.length}`;
    }

    const result = await query(
      `
      SELECT
        s.id,
        sm.id AS meeting_id,
        s.section_number,
        s.semester::TEXT AS semester,
        s.academic_year,
        COALESCE(sm.day_of_week, d.day_value) AS day_of_week,
        COALESCE(sm.start_time, s.start_time) AS start_time,
        COALESCE(sm.end_time, s.end_time) AS end_time,
        COALESCE(sm.meeting_type, 'lecture') AS meeting_type,
        c.id AS course_id,
        c.code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        COALESCE(c.credit_hours, 3) AS credit_hours,
        c.department AS course_department,
        r.id AS room_id,
        r.room_number,
        r.name AS room_name,
        f.floor_label,
        b.name AS building_name,
        COALESCE(NULLIF(to_jsonb(b)->>'campus', ''), 'الجديد') AS campus,
        (
          SELECT COUNT(*)
          FROM enrollments e
          WHERE e.section_id = s.id
            AND e.status = 'enrolled'
        ) AS enrolled
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN section_meetings sm ON sm.section_id = s.id
      LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value)
        ON sm.id IS NULL
      LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
        ${filter}
      ORDER BY
        COALESCE(sm.day_of_week, d.day_value),
        COALESCE(sm.start_time, s.start_time),
        c.code,
        s.section_number
      `,
      params
    );

    let activeChanges = [];

    try {
      const changeResult = await query(
        `
        SELECT
          cmc.id,
          cmc.section_id,
          cmc.section_meeting_id AS meeting_id,
          cmc.change_scope,
          cmc.change_date,
          cmc.start_date,
          cmc.end_date,
          cmc.old_day_of_week,
          cmc.old_start_time,
          cmc.old_end_time,
          old_room.room_number AS old_room_number,
          cmc.new_day_of_week,
          cmc.new_start_time,
          cmc.new_end_time,
          new_room.room_number AS new_room_number,
          new_room.name AS new_room_name,
          cmc.reason,
          cmc.created_at,
          s.section_number,
          c.code,
          c.name AS course_name,
          COALESCE(c.name_ar, c.name) AS course_name_ar
        FROM section_meeting_changes cmc
        JOIN sections s ON s.id = cmc.section_id
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN rooms old_room ON old_room.id = cmc.old_room_id
        LEFT JOIN rooms new_room ON new_room.id = cmc.new_room_id
        WHERE s.instructor_id = $1
          AND s.is_active = TRUE
          AND cmc.is_active = TRUE
          AND (
            cmc.change_scope = 'permanent'
            OR cmc.change_date >= CURRENT_DATE
            OR cmc.end_date >= CURRENT_DATE
          )
        ORDER BY
          COALESCE(cmc.change_date, cmc.start_date, CURRENT_DATE),
          cmc.new_start_time,
          c.code
        `,
        [profId]
      );

      activeChanges = changeResult.rows;
    } catch (changeError) {
      activeChanges = [];
    }

    let officeHours = [];

    try {
      const ohResult = await query(
        `
        SELECT
          oh.id,
          NULLIF(to_jsonb(oh)->>'day_of_week', '')::INT AS day_of_week,
          NULLIF(to_jsonb(oh)->>'start_time', '')::TIME AS start_time,
          NULLIF(to_jsonb(oh)->>'end_time', '')::TIME AS end_time,
          COALESCE(
            NULLIF(to_jsonb(oh)->>'location', ''),
            NULLIF(to_jsonb(oh)->>'room_number', ''),
            NULLIF(to_jsonb(oh)->>'room', '')
          ) AS location,
          COALESCE(
            NULLIF(to_jsonb(oh)->>'notes', ''),
            NULLIF(to_jsonb(oh)->>'note', '')
          ) AS note
        FROM office_hours oh
        WHERE to_jsonb(oh)->>'instructor_id' = $1::TEXT
           OR to_jsonb(oh)->>'professor_id' = $1::TEXT
        ORDER BY
          NULLIF(to_jsonb(oh)->>'day_of_week', '')::INT,
          NULLIF(to_jsonb(oh)->>'start_time', '')::TIME
        `,
        [profId]
      );

      officeHours = ohResult.rows.filter(
        (row) => row.day_of_week !== null && row.start_time && row.end_time
      );
    } catch (officeError) {
      officeHours = [];
    }

    res.json({
      success: true,
      data: {
        sections: result.rows,
        office_hours: officeHours,
        active_changes: activeChanges
      }
    });
  } catch (e) {
    next(e);
  }
}

async function getRoomsForChange(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const result = await query(
      `
      SELECT
        r.id,
        r.room_number,
        r.name,
        r.type::TEXT AS type,
        r.capacity,
        f.floor_label,
        b.name AS building_name
      FROM rooms r
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      WHERE r.is_active = TRUE
      ORDER BY
        CASE
          WHEN r.room_number IN ('9999', '509999') THEN 0
          WHEN r.type::TEXT IN ('lecture_hall', 'classroom', 'lab') THEN 1
          ELSE 2
        END,
        r.room_number
      `
    );

    res.json({
      success: true,
      data: {
        rooms: result.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

async function changeMeeting(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { sectionId } = req.params;
    const {
      meeting_id,
      change_scope = 'single_day',
      change_date,
      start_date,
      end_date,
      day_of_week,
      start_time,
      end_time,
      room_id,
      reason
    } = req.body;

    const allowedScopes = ['single_day', 'date_range', 'permanent'];

    if (!allowedScopes.includes(change_scope)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid change scope.'
      });
    }

    if (day_of_week === undefined || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Day, start time, and end time are required.'
      });
    }

    if (Number(day_of_week) < 0 || Number(day_of_week) > 6) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day.'
      });
    }

    if (String(start_time).slice(0, 5) >= String(end_time).slice(0, 5)) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time.'
      });
    }

    if (change_scope === 'single_day' && !change_date) {
      return res.status(400).json({
        success: false,
        message: 'Choose the lecture date for a one-day change.'
      });
    }

    if (change_scope === 'date_range') {
      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          message: 'Choose start date and end date for a range change.'
        });
      }

      if (String(start_date) > String(end_date)) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after or equal to start date.'
        });
      }
    }

    const sectionRes = await query(
      `
      SELECT
        s.id,
        s.section_number,
        s.room_id AS current_room_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        c.code,
        c.name AS course_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1
        AND s.instructor_id = $2
        AND s.is_active = TRUE
      `,
      [sectionId, instructorId]
    );

    if (!sectionRes.rows.length) {
      return res.status(403).json({
        success: false,
        message: 'Not your active section.'
      });
    }

    const section = sectionRes.rows[0];

    let oldMeetingRes;

    if (meeting_id) {
      oldMeetingRes = await query(
        `
        SELECT
          sm.id,
          sm.day_of_week,
          sm.start_time,
          sm.end_time,
          sm.room_id,
          r.room_number AS old_room_number
        FROM section_meetings sm
        LEFT JOIN rooms r ON r.id = sm.room_id
        WHERE sm.id = $1
          AND sm.section_id = $2
        `,
        [meeting_id, sectionId]
      );
    } else {
      oldMeetingRes = await query(
        `
        SELECT
          NULL::UUID AS id,
          COALESCE(($2)::INT, s.day_of_week[1]) AS day_of_week,
          s.start_time,
          s.end_time,
          s.room_id,
          r.room_number AS old_room_number
        FROM sections s
        LEFT JOIN rooms r ON r.id = s.room_id
        WHERE s.id = $1
        `,
        [sectionId, Number(day_of_week)]
      );
    }

    if (meeting_id && !oldMeetingRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found for this section.'
      });
    }

    const oldMeeting = oldMeetingRes.rows[0] || {};

    let newRoom = null;
    if (room_id) {
      const roomRes = await query(
        `SELECT id, room_number, name FROM rooms WHERE id = $1 AND is_active = TRUE`,
        [room_id]
      );

      if (!roomRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Selected room was not found.'
        });
      }

      newRoom = roomRes.rows[0];
    }

    let savedChange = null;

    if (change_scope === 'permanent') {
      if (meeting_id) {
        await query(
          `
          UPDATE section_meetings
          SET
            day_of_week = $1,
            start_time = $2,
            end_time = $3,
            room_id = $4,
            note = COALESCE(NULLIF($5, ''), note)
          WHERE id = $6
            AND section_id = $7
          `,
          [Number(day_of_week), start_time, end_time, room_id || null, reason || '', meeting_id, sectionId]
        );
      } else {
        await query(
          `
          UPDATE sections
          SET
            day_of_week = ARRAY[$1]::SMALLINT[],
            start_time = $2,
            end_time = $3,
            room_id = $4,
            updated_at = NOW()
          WHERE id = $5
            AND instructor_id = $6
          `,
          [Number(day_of_week), start_time, end_time, room_id || null, sectionId, instructorId]
        );
      }
    }

    const changeInsert = await query(
      `
      INSERT INTO section_meeting_changes (
        section_id,
        section_meeting_id,
        change_scope,
        change_date,
        start_date,
        end_date,
        old_day_of_week,
        old_start_time,
        old_end_time,
        old_room_id,
        new_day_of_week,
        new_start_time,
        new_end_time,
        new_room_id,
        reason,
        created_by,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE)
      RETURNING id
      `,
      [
        sectionId,
        meeting_id || null,
        change_scope,
        change_scope === 'single_day' ? change_date : null,
        change_scope === 'date_range' ? start_date : null,
        change_scope === 'date_range' ? end_date : null,
        oldMeeting.day_of_week ?? null,
        oldMeeting.start_time || null,
        oldMeeting.end_time || null,
        oldMeeting.room_id || null,
        Number(day_of_week),
        start_time,
        end_time,
        room_id || null,
        reason || null,
        req.user.id
      ]
    );

    savedChange = changeInsert.rows[0];

    const scopeText =
      change_scope === 'single_day'
        ? `for ${change_date} only`
        : change_scope === 'date_range'
          ? `from ${start_date} to ${end_date}`
          : 'for all future lectures';

    const locationText = newRoom?.room_number ? `room ${newRoom.room_number}` : 'online';

    const notificationRes = await query(
      `
      INSERT INTO notifications (
        title,
        body,
        type,
        sender_id,
        target_role,
        related_room_id,
        data,
        is_published,
        published_at
      )
      VALUES ($1, $2, 'schedule_change', $3, 'student', $4, $5::jsonb, TRUE, NOW())
      RETURNING id
      `,
      [
        `Schedule change: ${section.code}`,
        `Your class ${section.code} — ${section.course_name} section ${section.section_number} was changed ${scopeText}. New time: ${start_time} - ${end_time}. New location: ${locationText}.${reason ? ` Note: ${reason}` : ''}`,
        req.user.id,
        room_id || null,
        JSON.stringify({
          change_id: savedChange?.id || null,
          section_id: sectionId,
          meeting_id: meeting_id || null,
          change_scope,
          change_date: change_scope === 'single_day' ? change_date : null,
          start_date: change_scope === 'date_range' ? start_date : null,
          end_date: change_scope === 'date_range' ? end_date : null,
          course_code: section.code,
          course_name: section.course_name,
          section_number: section.section_number,
          old_day_of_week: oldMeeting.day_of_week,
          old_start_time: oldMeeting.start_time,
          old_end_time: oldMeeting.end_time,
          old_room_id: oldMeeting.room_id,
          old_room_number: oldMeeting.old_room_number,
          new_day_of_week: Number(day_of_week),
          new_start_time: start_time,
          new_end_time: end_time,
          new_room_id: room_id || null,
          new_room_number: newRoom?.room_number || null,
          reason: reason || null
        })
      ]
    );

    await query(
      `
      INSERT INTO notification_receipts (notification_id, user_id)
      SELECT $1, e.student_id
      FROM enrollments e
      WHERE e.section_id = $2
        AND e.status = 'enrolled'
      ON CONFLICT (notification_id, user_id) DO NOTHING
      `,
      [notificationRes.rows[0].id, sectionId]
    );

    res.json({
      success: true,
      data: {
        message:
          change_scope === 'permanent'
            ? 'Weekly schedule changed permanently and students were notified.'
            : 'Temporary schedule change saved and students were notified.',
        change_id: savedChange?.id || null,
        notification_id: notificationRes.rows[0].id
      }
    });
  } catch (e) {
    next(e);
  }
}



async function uploadMaterialFile(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No material file was uploaded.'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        file_url: `/uploads/materials/${req.file.filename}`,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size
      }
    });
  } catch (e) {
    next(e);
  }
}


async function getMaterials(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { semester, academic_year, section_id } = req.query;

    if (!semester || !academic_year) {
      return res.status(400).json({
        success: false,
        message: 'semester and academic_year are required.'
      });
    }

    const sectionsRes = await query(
      `
      SELECT
        s.id,
        s.section_number,
        s.semester::TEXT AS semester,
        s.academic_year,
        c.id AS course_id,
        c.code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        COALESCE(c.credit_hours, 3) AS credit_hours,
        r.room_number,
        (
          SELECT COUNT(*)
          FROM enrollments e
          WHERE e.section_id = s.id
            AND e.status = 'enrolled'
        ) AS enrolled,
        (
          SELECT COUNT(*)
          FROM professor_course_materials pcm
          WHERE pcm.section_id = s.id
            AND (
              pcm.file_url IS NULL
              OR pcm.file_url NOT LIKE '/fake-materials/%'
            )
        ) AS materials_count
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
        AND s.semester::text = $2
        AND s.academic_year = $3
      ORDER BY c.code, s.section_number
      `,
      [instructorId, semester, academic_year]
    );

    const materialParams = [instructorId, semester, academic_year];
    let sectionFilter = '';

    if (section_id) {
      materialParams.push(section_id);
      sectionFilter = `AND pcm.section_id = $${materialParams.length}`;
    }

    const materialsRes = await query(
      `
      SELECT
        pcm.id,
        pcm.section_id,
        pcm.course_id,
        pcm.room_id,
        pcm.title,
        pcm.material_type,
        pcm.description,
        pcm.file_url,
        pcm.week_number,
        pcm.day_of_week,
        pcm.start_time,
        pcm.end_time,
        pcm.room_number,
        pcm.room_name,
        pcm.semester,
        pcm.academic_year,
        pcm.is_published,
        pcm.uploaded_at,
        pcm.updated_at,
        COALESCE(pcm.download_count, 0) AS download_count,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        (
          SELECT COUNT(*)
          FROM enrollments e
          WHERE e.section_id = s.id
            AND e.status = 'enrolled'
        ) AS enrolled
      FROM professor_course_materials pcm
      JOIN sections s ON s.id = pcm.section_id
        AND s.semester::text = $2
        AND s.academic_year = $3
      JOIN courses c ON c.id = pcm.course_id
      WHERE pcm.instructor_id = $1
        AND (
          pcm.file_url IS NULL
          OR pcm.file_url NOT LIKE '/fake-materials/%'
        )
        ${sectionFilter}
      ORDER BY c.code, s.section_number, pcm.week_number NULLS LAST, pcm.uploaded_at DESC
      `,
      materialParams
    );

    res.json({
      success: true,
      data: {
        sections: sectionsRes.rows,
        materials: materialsRes.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

async function recordMaterialOpen(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { materialId } = req.params;

    const materialRes = await query(
      `
      SELECT id, file_url
      FROM professor_course_materials
      WHERE id = $1
        AND instructor_id = $2
      `,
      [materialId, instructorId]
    );

    if (!materialRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    await query(
      `
      INSERT INTO professor_material_access_logs (material_id, user_id, accessed_at)
      VALUES ($1, $2, NOW())
      `,
      [materialId, req.user.id]
    );

    const updateRes = await query(
      `
      UPDATE professor_course_materials
      SET download_count = COALESCE(download_count, 0) + 1
      WHERE id = $1
      RETURNING download_count
      `,
      [materialId]
    );

    res.json({
      success: true,
      data: {
        file_url: materialRes.rows[0].file_url,
        download_count: updateRes.rows[0]?.download_count || 0
      }
    });
  } catch (e) {
    next(e);
  }
}

async function createMaterial(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const {
      section_id,
      title,
      material_type = 'lecture_notes',
      description,
      file_url,
      week_number,
      is_published = true,
      notify_students = false
    } = req.body;

    if (!section_id || !title) {
      return res.status(400).json({ success: false, message: 'Section and title are required.' });
    }

    const sectionRes = await query(
      `
      SELECT
        s.id,
        s.course_id,
        s.room_id,
        s.semester::TEXT AS semester,
        s.academic_year,
        COALESCE(sm.day_of_week, s.day_of_week[1]) AS day_of_week,
        COALESCE(sm.start_time, s.start_time) AS start_time,
        COALESCE(sm.end_time, s.end_time) AS end_time,
        c.code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        r.room_number,
        r.name AS room_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN section_meetings sm ON sm.section_id = s.id
      LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
      WHERE s.id = $1
        AND s.instructor_id = $2
        AND s.is_active = TRUE
      ORDER BY COALESCE(sm.day_of_week, s.day_of_week[1]), COALESCE(sm.start_time, s.start_time)
      LIMIT 1
      `,
      [section_id, instructorId]
    );

    if (!sectionRes.rows.length) {
      return res.status(403).json({ success: false, message: 'Not your active section.' });
    }

    const sec = sectionRes.rows[0];

    const insertRes = await query(
      `
      INSERT INTO professor_course_materials (
        instructor_id,
        section_id,
        course_id,
        room_id,
        title,
        material_type,
        description,
        file_url,
        week_number,
        day_of_week,
        start_time,
        end_time,
        room_number,
        room_name,
        semester,
        academic_year,
        is_published
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
      `,
      [
        instructorId,
        section_id,
        sec.course_id,
        sec.room_id,
        title,
        material_type,
        description || null,
        file_url || null,
        week_number ? Number(week_number) : null,
        sec.day_of_week,
        sec.start_time,
        sec.end_time,
        sec.room_number,
        sec.room_name,
        sec.semester,
        sec.academic_year,
        Boolean(is_published)
      ]
    );

    let notificationId = null;

    if (notify_students && Boolean(is_published)) {
      notificationId = await notifySectionStudents({
        sectionId: section_id,
        senderId: req.user.id,
        title: `New course material: ${sec.code}`,
        body: `${title} was added for ${sec.code} — ${sec.course_name}.`,
        type: 'custom',
        data: {
          material_id: insertRes.rows[0].id,
          section_id,
          course_code: sec.code,
          course_name: sec.course_name,
          material_type,
          week_number: week_number || null
        }
      });
    }

    res.status(201).json({
      success: true,
      data: {
        material: insertRes.rows[0],
        notification_id: notificationId
      }
    });
  } catch (e) {
    next(e);
  }
}

async function updateMaterial(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { materialId } = req.params;
    const {
      title,
      material_type,
      description,
      file_url,
      week_number,
      is_published
    } = req.body;

    const ownRes = await query(
      `SELECT id FROM professor_course_materials WHERE id = $1 AND instructor_id = $2`,
      [materialId, instructorId]
    );

    if (!ownRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    const result = await query(
      `
      UPDATE professor_course_materials
      SET
        title = COALESCE($1, title),
        material_type = COALESCE($2, material_type),
        description = $3,
        file_url = $4,
        week_number = $5,
        is_published = COALESCE($6, is_published),
        updated_at = NOW()
      WHERE id = $7
        AND instructor_id = $8
      RETURNING *
      `,
      [
        title || null,
        material_type || null,
        description || null,
        file_url || null,
        week_number ? Number(week_number) : null,
        is_published === undefined ? null : Boolean(is_published),
        materialId,
        instructorId
      ]
    );

    res.json({ success: true, data: { material: result.rows[0] } });
  } catch (e) {
    next(e);
  }
}

async function deleteMaterial(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { materialId } = req.params;

    const result = await query(
      `
      DELETE FROM professor_course_materials
      WHERE id = $1
        AND instructor_id = $2
      RETURNING id
      `,
      [materialId, instructorId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Material not found.' });
    }

    res.json({ success: true, data: { deleted_id: result.rows[0].id } });
  } catch (e) {
    next(e);
  }
}

async function getOfficeHours(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const [hoursResult, instructorResult] = await Promise.all([
      query(
        `
        SELECT
          id,
          instructor_id,
          instructor_email,
          day_of_week,
          start_time,
          end_time,
          office_room,
          note,
          is_active,
          created_at
        FROM office_hours
        WHERE instructor_id = $1
          AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY day_of_week, start_time
        `,
        [instructorId]
      ),
      query(
        `
        SELECT
          i.office_room_id,
          r.room_number,
          r.name AS room_name
        FROM instructors i
        LEFT JOIN rooms r ON r.id = i.office_room_id
        WHERE i.id = $1
        `,
        [instructorId]
      )
    ]);

    const inst = instructorResult.rows[0] || {};
    const assignedOffice = inst.office_room_id
      ? {
          room_id:     inst.office_room_id,
          room_number: inst.room_number || null,
          room_name:   inst.room_name   || null
        }
      : null;

    res.json({
      success: true,
      data: {
        office_hours:    hoursResult.rows,
        assigned_office: assignedOffice
      }
    });
  } catch (e) {
    next(e);
  }
}

async function saveOfficeHour(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    // Look up the instructor's assigned office room — ignore any room submitted by the client.
    const instResult = await query(
      `
      SELECT i.office_room_id, r.room_number
      FROM instructors i
      LEFT JOIN rooms r ON r.id = i.office_room_id
      WHERE i.id = $1
      `,
      [instructorId]
    );

    const assignedRoomNumber = instResult.rows[0]?.room_number || null;
    const assignedRoomId     = instResult.rows[0]?.office_room_id || null;

    if (!assignedRoomId) {
      return res.status(400).json({
        success: false,
        message: 'No office room assigned. Please contact admin.'
      });
    }

    const {
      id,
      day_of_week,
      start_time,
      end_time,
      note,
      notify_students = false
    } = req.body;

    if (day_of_week === undefined || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'Day, start time, and end time are required.' });
    }

    if (Number(day_of_week) < 0 || Number(day_of_week) > 6) {
      return res.status(400).json({ success: false, message: 'Invalid day.' });
    }

    if (String(start_time).slice(0, 5) >= String(end_time).slice(0, 5)) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }

    let saved;

    if (id) {
      const result = await query(
        `
        UPDATE office_hours
        SET
          day_of_week = $1,
          start_time = $2,
          end_time = $3,
          office_room = $4,
          note = $5,
          is_active = TRUE
        WHERE id = $6
          AND instructor_id = $7
        RETURNING *
        `,
        [Number(day_of_week), start_time, end_time, assignedRoomNumber, note || null, id, instructorId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ success: false, message: 'Office hour not found.' });
      }

      saved = result.rows[0];
    } else {
      const result = await query(
        `
        INSERT INTO office_hours (
          instructor_id,
          instructor_email,
          day_of_week,
          start_time,
          end_time,
          office_room,
          note,
          is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
        RETURNING *
        `,
        [instructorId, req.user.email, Number(day_of_week), start_time, end_time, assignedRoomNumber, note || null]
      );

      saved = result.rows[0];
    }

    let notificationId = null;

    if (notify_students) {
      notificationId = await notifyAllProfessorStudents({
        instructorId,
        senderId: req.user.id,
        title: 'Office hours updated',
        body: `Office hours were updated: day ${day_of_week}, ${start_time} - ${end_time}${assignedRoomNumber ? `, location: ${assignedRoomNumber}` : ''}.`,
        type: 'custom',
        data: {
          office_hour_id: saved.id,
          day_of_week:    Number(day_of_week),
          start_time,
          end_time,
          office_room:    assignedRoomNumber
        }
      });
    }

    res.json({ success: true, data: { office_hour: saved, notification_id: notificationId } });
  } catch (e) {
    next(e);
  }
}

async function deleteOfficeHour(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { officeHourId } = req.params;

    const result = await query(
      `
      UPDATE office_hours
      SET is_active = FALSE
      WHERE id = $1
        AND instructor_id = $2
      RETURNING id
      `,
      [officeHourId, instructorId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Office hour not found.' });
    }

    res.json({ success: true, data: { deleted_id: result.rows[0].id } });
  } catch (e) {
    next(e);
  }
}

async function getOfficeHourBookings(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    let bookings = [];
    try {
      const result = await query(
        `
        SELECT
          b.id,
          b.office_hour_id,
          b.student_id,
          b.requested_date,
          b.message,
          b.status,
          b.created_at,
          oh.day_of_week,
          oh.start_time,
          oh.end_time,
          oh.office_room,
          CONCAT_WS(' ', u.first_name, u.last_name) AS student_name,
          u.student_id AS student_number,
          u.email AS student_email
        FROM office_hour_bookings b
        JOIN office_hours oh ON oh.id = b.office_hour_id
        JOIN users u ON u.id = b.student_id
        WHERE oh.instructor_id = $1
        ORDER BY
          CASE b.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END,
          b.created_at DESC
        `,
        [instructorId]
      );
      bookings = result.rows;
    } catch (tableErr) {
      if (tableErr.code === '42P01') {
        // office_hour_bookings table does not exist yet — return empty list
        bookings = [];
      } else {
        throw tableErr;
      }
    }

    res.json({ success: true, data: { bookings } });
  } catch (e) {
    next(e);
  }
}

async function respondOfficeHourBooking(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { bookingId } = req.params;
    const { status } = req.body;

    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid booking status.' });
    }

    const result = await query(
      `
      UPDATE office_hour_bookings b
      SET status = $1,
          responded_at = NOW(),
          responded_by = $2
      FROM office_hours oh
      WHERE b.office_hour_id = oh.id
        AND oh.instructor_id = $3
        AND b.id = $4
      RETURNING b.*, oh.day_of_week, oh.start_time, oh.end_time, oh.office_room
      `,
      [status, req.user.id, instructorId, bookingId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Booking request not found.' });
    }

    const booking = result.rows[0];

    const notificationRes = await query(
      `
      INSERT INTO notifications (title, body, type, sender_id, target_role, data, is_published, published_at)
      VALUES ($1, $2, 'custom'::notification_type, $3, 'student', $4::jsonb, TRUE, NOW())
      RETURNING id
      `,
      [
        status === 'accepted' ? 'Office hour request accepted' : 'Office hour request declined',
        status === 'accepted'
          ? `Your office hour request was accepted. Time: ${booking.start_time} - ${booking.end_time}${booking.office_room ? `, location: ${booking.office_room}` : ''}.`
          : 'Your office hour request was declined. Please choose another office hour.',
        req.user.id,
        JSON.stringify({ booking_id: booking.id, office_hour_id: booking.office_hour_id, status })
      ]
    );

    await query(
      `
      INSERT INTO notification_receipts (notification_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (notification_id, user_id) DO NOTHING
      `,
      [notificationRes.rows[0].id, booking.student_id]
    );

    res.json({ success: true, data: { booking, notification_id: notificationRes.rows[0].id } });
  } catch (e) {
    next(e);
  }
}

async function getCourseMessages(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    // section_messages table is not yet available — return safe empty response
    res.json({
      success: true,
      data: {
        sections: [],
        messages: [],
        feature_available: false
      }
    });
  } catch (e) {
    next(e);
  }
}

async function createCourseMessage(req, res, next) {
  // section_messages table is not yet available
  return res.status(503).json({
    success: false,
    message: 'Course messages feature is not available yet.'
  });
}

async function deleteCourseMessage(req, res, next) {
  // section_messages table is not yet available
  return res.status(503).json({
    success: false,
    message: 'Course messages feature is not available yet.'
  });
}

async function exportGradesCsv(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { sectionId } = req.params;

    const ownRes = await query(
      `SELECT s.id, s.section_number, c.code, c.name AS course_name,
              s.semester::text AS semester, s.academic_year,
              CONCAT_WS(' ', u.first_name, u.last_name) AS professor_name,
              i.title AS professor_title
       FROM sections s
       JOIN courses c ON c.id = s.course_id
       JOIN instructors i ON i.id = s.instructor_id
       LEFT JOIN users u ON u.id = i.user_id
       WHERE s.id = $1
         AND s.instructor_id = $2`,
      [sectionId, instructorId]
    );

    if (!ownRes.rows.length) {
      return res.status(403).json({ success: false, message: 'Not your section.' });
    }

    const section = ownRes.rows[0];

    const result = await query(
      `SELECT
        u.student_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS student_name,
        u.email,
        COALESCE(g.midterm, 0) AS midterm,
        COALESCE(g.assignments, 0) AS assignments,
        COALESCE(g.final, 0) AS final,
        COALESCE(g.practical, 0) AS practical,
        COALESCE(g.letter_grade, '') AS letter_grade,
        (COALESCE(g.midterm,0) + COALESCE(g.assignments,0) + COALESCE(g.final,0) + COALESCE(g.practical,0)) AS total
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       LEFT JOIN grades g ON g.student_id = u.id AND g.section_id = e.section_id
       WHERE e.section_id = $1
         AND e.status = 'enrolled'
       ORDER BY u.last_name, u.first_name`,
      [sectionId]
    );

    const students = result.rows;

    // ---- Workbook setup ----
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart Campus';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Grade Sheet', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9
      }
    });

    ws.columns = [
      { key: 'a', width: 16 },
      { key: 'b', width: 28 },
      { key: 'c', width: 32 },
      { key: 'd', width: 12 },
      { key: 'e', width: 14 },
      { key: 'f', width: 12 },
      { key: 'g', width: 12 },
      { key: 'h', width: 12 },
      { key: 'i', width: 14 }
    ];

    // ---- Row 1: Title ----
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Smart Campus — Grade Sheet';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF1a2744' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // ---- Row 2: Instruction note ----
    ws.mergeCells('A2:I2');
    const noteCell = ws.getCell('A2');
    noteCell.value = 'Edit Midterm / Assignments / Final / Practical — Total and Letter Grade update automatically.';
    noteCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64739a' } };
    noteCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 18;

    ws.getRow(3).height = 6;

    // ---- Rows 4-8: Course info ----
    const semesterLabel = section.semester
      ? section.semester.charAt(0).toUpperCase() + section.semester.slice(1)
      : '';
    const professorDisplay = [section.professor_title, section.professor_name].filter(Boolean).join(' ') || '—';
    const exportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const infoRows = [
      ['Course:', `${section.code} — ${section.course_name}`],
      ['Section:', `Section ${section.section_number}`],
      ['Professor:', professorDisplay],
      ['Semester:', `${semesterLabel} ${section.academic_year || ''}`.trim() || '—'],
      ['Export Date:', exportDate]
    ];

    infoRows.forEach(([label, value], idx) => {
      const rowNum = 4 + idx;
      ws.mergeCells(`A${rowNum}:B${rowNum}`);
      ws.mergeCells(`C${rowNum}:I${rowNum}`);

      const labelCell = ws.getCell(`A${rowNum}`);
      labelCell.value = label;
      labelCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF4a5568' } };
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

      const valueCell = ws.getCell(`C${rowNum}`);
      valueCell.value = value;
      valueCell.font = { name: 'Calibri', size: 11 };
      valueCell.alignment = { horizontal: 'left', vertical: 'middle' };

      ws.getRow(rowNum).height = 18;
    });

    ws.getRow(9).height = 8;

    // ---- Row 10: Table header ----
    const HEADER_ROW = 10;
    const DATA_START = 11;

    const headerLabels = ['Student ID', 'Student Name', 'Email', 'Midterm', 'Assignments', 'Final', 'Practical', 'Total', 'Letter Grade'];
    const headerRow = ws.getRow(HEADER_ROW);
    headerRow.height = 24;

    headerLabels.forEach((label, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a2744' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0f1a2e' } },
        left: { style: 'thin', color: { argb: 'FF0f1a2e' } },
        bottom: { style: 'thin', color: { argb: 'FF0f1a2e' } },
        right: { style: 'thin', color: { argb: 'FF0f1a2e' } }
      };
    });

    ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: 0 }];
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: 9 } };

    // ---- Grade scale nested IF formula (matches backend letterGrade function) ----
    function gradeFormula(hRef) {
      return (
        `IF(${hRef}>=90,"A",` +
        `IF(${hRef}>=88,"A-",` +
        `IF(${hRef}>=85,"B+",` +
        `IF(${hRef}>=80,"B",` +
        `IF(${hRef}>=78,"B-",` +
        `IF(${hRef}>=73,"C+",` +
        `IF(${hRef}>=70,"C",` +
        `IF(${hRef}>=65,"C-",` +
        `IF(${hRef}>=63,"D+",` +
        `IF(${hRef}>=60,"D",` +
        `IF(${hRef}>=45,"D-","E")))))))))))`
      );
    }

    // ---- Data rows ----
    const BORDER = { style: 'thin', color: { argb: 'FFD1D5DB' } };
    const cellBorder = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
    const LIGHT_RED = 'FFFFE5E5';
    const LIGHT_GREEN = 'FFE6F4EA';
    const ROW_ALT = 'FFF0F4FB';
    const ROW_NORMAL = 'FFFFFFFF';

    let passedCount = 0;
    let failedCount = 0;
    let totalSum = 0;
    let highestTotal = null;
    let lowestTotal = null;

    students.forEach((student, idx) => {
      const rowNum = DATA_START + idx;
      const dataRow = ws.getRow(rowNum);
      dataRow.height = 20;

      const total = parseFloat(student.total) || 0;
      const letterGrade = student.letter_grade || 'E';
      const isFailed = letterGrade === 'E';
      const isHigh = letterGrade.startsWith('A');

      totalSum += total;
      if (highestTotal === null || total > highestTotal) highestTotal = total;
      if (lowestTotal === null || total < lowestTotal) lowestTotal = total;
      if (isFailed) failedCount++; else passedCount++;

      const rowBg = isFailed ? LIGHT_RED : isHigh ? LIGHT_GREEN : (idx % 2 === 0 ? ROW_NORMAL : ROW_ALT);

      // Columns A–G: static values
      const staticCols = [
        student.student_id,
        student.student_name,
        student.email,
        parseFloat(student.midterm),
        parseFloat(student.assignments),
        parseFloat(student.final),
        parseFloat(student.practical)
      ];

      staticCols.forEach((val, colIdx) => {
        const cell = dataRow.getCell(colIdx + 1);
        cell.value = val;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = cellBorder;
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { horizontal: colIdx >= 3 ? 'center' : 'left', vertical: 'middle' };
      });

      // Column H: Total = SUM(D:G) formula
      const totalCell = dataRow.getCell(8);
      totalCell.value = { formula: `SUM(D${rowNum}:G${rowNum})`, result: total };
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      totalCell.border = cellBorder;
      totalCell.font = { name: 'Calibri', size: 11, bold: true };
      totalCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Column I: Letter Grade = IFS formula keyed to H
      const gradeCell = dataRow.getCell(9);
      gradeCell.value = { formula: gradeFormula(`H${rowNum}`), result: letterGrade };
      gradeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      gradeCell.border = cellBorder;
      gradeCell.font = { name: 'Calibri', size: 11, bold: true };
      gradeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // ---- Summary section ----
    const SUMMARY_LABEL_ROW = DATA_START + students.length + 2;
    const SUMMARY_DATA_START = SUMMARY_LABEL_ROW + 1;

    ws.mergeCells(`A${SUMMARY_LABEL_ROW}:I${SUMMARY_LABEL_ROW}`);
    const sumHdrCell = ws.getCell(`A${SUMMARY_LABEL_ROW}`);
    sumHdrCell.value = 'Summary';
    sumHdrCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1a2744' } };
    sumHdrCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(SUMMARY_LABEL_ROW).height = 22;

    let summaryItems;
    if (students.length > 0) {
      const DATA_FIRST = DATA_START;
      const DATA_LAST = DATA_START + students.length - 1;
      const HR = `H${DATA_FIRST}:H${DATA_LAST}`;
      const IR = `I${DATA_FIRST}:I${DATA_LAST}`;
      const classAvg = parseFloat((totalSum / students.length).toFixed(1));

      summaryItems = [
        ['Number of Students:', { formula: `COUNTA(A${DATA_FIRST}:A${DATA_LAST})`,          result: students.length }],
        ['Class Average:',       { formula: `IFERROR(ROUND(AVERAGE(${HR}),1),0)`,            result: classAvg }],
        ['Highest Total:',       { formula: `IFERROR(MAX(${HR}),0)`,                         result: highestTotal ?? 0 }],
        ['Lowest Total:',        { formula: `IFERROR(MIN(${HR}),0)`,                         result: lowestTotal ?? 0 }],
        ['Passed:',              { formula: `COUNTA(${IR})-COUNTIF(${IR},"E")`,              result: passedCount }],
        ['Failed:',              { formula: `COUNTIF(${IR},"E")`,                            result: failedCount }]
      ];
    } else {
      summaryItems = [
        ['Number of Students:', 0],
        ['Class Average:', '—'],
        ['Highest Total:', '—'],
        ['Lowest Total:', '—'],
        ['Passed:', 0],
        ['Failed:', 0]
      ];
    }

    summaryItems.forEach(([label, value], idx) => {
      const rowNum = SUMMARY_DATA_START + idx;
      ws.mergeCells(`A${rowNum}:C${rowNum}`);
      ws.mergeCells(`D${rowNum}:E${rowNum}`);

      const lc = ws.getCell(`A${rowNum}`);
      lc.value = label;
      lc.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF4a5568' } };
      lc.alignment = { horizontal: 'right', vertical: 'middle' };

      const vc = ws.getCell(`D${rowNum}`);
      vc.value = value;
      vc.font = { name: 'Calibri', size: 11, bold: true };
      vc.alignment = { horizontal: 'center', vertical: 'middle' };
      vc.border = cellBorder;

      ws.getRow(rowNum).height = 20;
    });

    // ---- Stream response ----
    const sanitize = (s) => String(s || '').replace(/[^A-Za-z0-9-]/g, '_');
    const yearStr = (section.academic_year || 'year').replace('/', '-');
    const filename = `grades_${sanitize(section.code)}_section_${section.section_number}_${sanitize(section.semester || 'semester')}_${sanitize(yearStr)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}

async function exportAttendanceCsv(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { sectionId } = req.params;

    const ownRes = await query(
      `
      SELECT s.id, s.section_number, c.code
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1
        AND s.instructor_id = $2
      `,
      [sectionId, instructorId]
    );

    if (!ownRes.rows.length) {
      return res.status(403).json({ success: false, message: 'Not your section.' });
    }

    const result = await query(
      `
      SELECT
        u.student_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS student_name,
        u.email,
        COUNT(a.id) FILTER (WHERE a.status = 'present') AS present,
        COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent,
        COUNT(a.id) FILTER (WHERE a.status = 'late') AS late,
        COUNT(a.id) FILTER (WHERE a.status = 'excused') AS excused,
        COUNT(a.id) AS total_records,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
          / NULLIF(COUNT(a.id), 0) * 100,
          1
        ) AS attendance_pct
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      LEFT JOIN attendance a ON a.student_id = u.id AND a.section_id = e.section_id
      WHERE e.section_id = $1
        AND e.status = 'enrolled'
      GROUP BY u.id, u.student_id, u.first_name, u.last_name, u.email
      ORDER BY u.last_name, u.first_name
      `,
      [sectionId]
    );

    const rows = [
      ['Student ID', 'Student Name', 'Email', 'Present', 'Absent', 'Late', 'Excused', 'Total Records', 'Attendance %'],
      ...result.rows.map((r) => [r.student_id, r.student_name, r.email, r.present, r.absent, r.late, r.excused, r.total_records, r.attendance_pct || ''])
    ];

    sendCsv(res, `${ownRes.rows[0].code}-section-${ownRes.rows[0].section_number}-attendance.csv`, rows);
  } catch (e) {
    next(e);
  }
}

async function getChangeHistory(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const result = await query(
      `
      SELECT
        cmc.id,
        cmc.section_id,
        cmc.section_meeting_id AS meeting_id,
        cmc.change_scope,
        cmc.change_date,
        cmc.start_date,
        cmc.end_date,
        cmc.old_day_of_week,
        cmc.old_start_time,
        cmc.old_end_time,
        old_room.room_number AS old_room_number,
        old_room.name AS old_room_name,
        cmc.new_day_of_week,
        cmc.new_start_time,
        cmc.new_end_time,
        new_room.room_number AS new_room_number,
        new_room.name AS new_room_name,
        cmc.reason,
        cmc.created_at,
        cmc.is_active,
        s.section_number,
        c.code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar
      FROM section_meeting_changes cmc
      JOIN sections s ON s.id = cmc.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN rooms old_room ON old_room.id = cmc.old_room_id
      LEFT JOIN rooms new_room ON new_room.id = cmc.new_room_id
      WHERE s.instructor_id = $1
      ORDER BY cmc.created_at DESC
      `,
      [instructorId]
    );

    res.json({ success: true, data: { changes: result.rows } });
  } catch (e) {
    next(e);
  }
}

async function cancelMeetingChange(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { changeId } = req.params;

    const ownRes = await query(
      `
      SELECT
        cmc.*,
        s.id AS section_id,
        s.section_number,
        c.code,
        c.name AS course_name
      FROM section_meeting_changes cmc
      JOIN sections s ON s.id = cmc.section_id
      JOIN courses c ON c.id = s.course_id
      WHERE cmc.id = $1
        AND s.instructor_id = $2
      `,
      [changeId, instructorId]
    );

    if (!ownRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Change not found.' });
    }

    const change = ownRes.rows[0];

    if (change.change_scope === 'permanent') {
      return res.status(400).json({
        success: false,
        message: 'Permanent changes already updated the schedule. Create another change to modify it again.'
      });
    }

    await query(
      `UPDATE section_meeting_changes SET is_active = FALSE WHERE id = $1`,
      [changeId]
    );

    const notificationId = await notifySectionStudents({
      sectionId: change.section_id,
      senderId: req.user.id,
      title: `Schedule change canceled: ${change.code}`,
      body: `The temporary schedule change for ${change.code} — ${change.course_name} section ${change.section_number} was canceled. Please follow the original schedule.`,
      type: 'custom',
      data: {
        change_id: changeId,
        section_id: change.section_id,
        course_code: change.code,
        canceled: true
      }
    });

    res.json({ success: true, data: { canceled_id: changeId, notification_id: notificationId } });
  } catch (e) {
    next(e);
  }
}

async function getProfessorTerms(req, res, next) {
  try {
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const result = await query(
      `
      WITH professor_terms AS (
        SELECT
          s.semester::text AS semester,
          s.academic_year,
          split_part(s.academic_year, '/', 1)::int AS year_start,
          CASE s.semester::text
            WHEN 'summer' THEN 3
            WHEN 'spring' THEN 2
            WHEN 'fall'   THEN 1
            ELSE 0
          END AS semester_order
        FROM sections s
        WHERE s.instructor_id = $1
          AND s.is_active = TRUE
        GROUP BY s.semester, s.academic_year
      )
      SELECT semester, academic_year
      FROM professor_terms
      ORDER BY year_start DESC, semester_order DESC
      `,
      [profId]
    );

    res.json({ success: true, data: { terms: result.rows } });
  } catch (e) {
    next(e);
  }
}

async function getAnalytics(req, res, next) {
  try {
    const instructorId = await requireInstructor(req, res);
    if (!instructorId) return;

    const { semester, academic_year, section_id } = req.query;

    if (!semester || !academic_year) {
      return res.status(400).json({
        success: false,
        message: 'semester and academic_year are required.'
      });
    }

    const sectionId = section_id || null;

    const sectionsRes = await query(
      `
      WITH attendance_by_student AS (
        SELECT
          a.section_id,
          a.student_id,
          ROUND(
            COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
            / NULLIF(COUNT(a.id), 0) * 100,
            1
          ) AS attendance_pct
        FROM attendance a
        GROUP BY a.section_id, a.student_id
      ),
      grade_by_student AS (
        SELECT
          g.section_id,
          g.student_id,
          COALESCE(g.midterm, 0) + COALESCE(g.assignments, 0) + COALESCE(g.final, 0) + COALESCE(g.practical, 0) AS total_grade
        FROM grades g
      )
      SELECT
        s.id AS section_id,
        s.course_id,
        s.section_number,
        c.code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        COUNT(DISTINCT e.student_id) FILTER (WHERE e.status = 'enrolled') AS enrolled,
        ROUND(AVG(abs.attendance_pct), 1) AS average_attendance,
        COUNT(DISTINCT abs.student_id) FILTER (WHERE abs.attendance_pct < 75) AS below_75_count,
        ROUND(AVG(gbs.total_grade), 1) AS average_grade,
        MAX(gbs.total_grade) AS highest_grade,
        MIN(gbs.total_grade) AS lowest_grade,
        COUNT(DISTINCT e.student_id) FILTER (
          WHERE e.status = 'enrolled'
            AND gbs.student_id IS NULL
        ) AS missing_grades,
        COUNT(DISTINCT gbs.student_id) FILTER (WHERE gbs.total_grade < 60) AS failing_count,
        COUNT(DISTINCT aw.id) AS warnings_sent
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN enrollments e ON e.section_id = s.id
      LEFT JOIN attendance_by_student abs ON abs.section_id = s.id AND abs.student_id = e.student_id
      LEFT JOIN grade_by_student gbs ON gbs.section_id = s.id AND gbs.student_id = e.student_id
      LEFT JOIN attendance_warnings aw ON aw.section_id = s.id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
        AND s.semester::text = $2
        AND s.academic_year = $3
        AND ($4::uuid IS NULL OR s.id = $4::uuid)
      GROUP BY s.id, s.course_id, s.section_number, c.code, c.name, c.name_ar
      ORDER BY c.code, s.section_number
      `,
      [instructorId, semester, academic_year, sectionId]
    );

    const totalsRes = await query(
      `
      SELECT
        COUNT(DISTINCT s.id) AS total_sections,
        COUNT(DISTINCT e.student_id) FILTER (WHERE e.status = 'enrolled') AS total_students,
        COUNT(DISTINCT c.id) AS total_courses,
        COUNT(DISTINCT aw.id) AS warnings_sent
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN enrollments e ON e.section_id = s.id
      LEFT JOIN attendance_warnings aw ON aw.section_id = s.id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
        AND s.semester::text = $2
        AND s.academic_year = $3
        AND ($4::uuid IS NULL OR s.id = $4::uuid)
      `,
      [instructorId, semester, academic_year, sectionId]
    );

    res.json({
      success: true,
      data: {
        totals: totalsRes.rows[0] || {},
        sections: sectionsRes.rows
      }
    });
  } catch (e) {
    next(e);
  }
}


module.exports = {
  getDashboard,
  getProfessorTerms,
  getSectionStudents,
  getAttendance,
  getAttendanceSummary,
  markAttendance,
  saveGradesBulk,
  sendAttendanceWarning,
  getSchedule,
  getRoomsForChange,
  changeMeeting,
  getMaterials,
  uploadMaterialFile,
  recordMaterialOpen,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getOfficeHours,
  saveOfficeHour,
  deleteOfficeHour,
  getOfficeHourBookings,
  respondOfficeHourBooking,
  getCourseMessages,
  createCourseMessage,
  deleteCourseMessage,
  exportGradesCsv,
  exportAttendanceCsv,
  getChangeHistory,
  cancelMeetingChange,
  getAnalytics
};