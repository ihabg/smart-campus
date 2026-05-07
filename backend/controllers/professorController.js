const { query } = require('../config/db');
const https = require('https');

function letterGrade(total) {
  if (total >= 90) return 'A+';
  if (total >= 85) return 'A';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'C+';
  if (total >= 65) return 'C';
  if (total >= 60) return 'D+';
  if (total >= 55) return 'D';
  return 'F';
}

async function getInstructorIdByUserEmail(req) {
  const result = await query(
    `SELECT id FROM instructors WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [req.user.email]
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

async function getDashboard(req, res, next) {
  try {
    const profId = await requireInstructor(req, res);
    if (!profId) return;

    const today = new Date().getDay();

    const [sectionsRes, todayRes, statsRes, atRiskRes] = await Promise.all([
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
        ORDER BY c.code
        `,
        [profId]
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
        `,
        [profId]
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
        [profId]
      )
    ]);

    res.json({
      success: true,
      data: {
        sections: sectionsRes.rows,
        today_schedule: todayRes.rows,
        stats: statsRes.rows[0] || {},
        at_risk: atRiskRes.rows
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
        (g.midterm || 0) * 0.3 +
        (g.final || 0) * 0.4 +
        (g.assignments || 0) * 0.2 +
        (g.practical || 0) * 0.1;

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

    const result = await query(
      `
      SELECT
        s.id,
        s.section_number,
        COALESCE(sm.day_of_week, d.day_value) AS day_of_week,
        COALESCE(sm.start_time, s.start_time) AS start_time,
        COALESCE(sm.end_time, s.end_time) AS end_time,
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
      LEFT JOIN section_meetings sm ON sm.section_id = s.id
      LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value)
        ON sm.id IS NULL
      LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
      LEFT JOIN floors f ON f.id = r.floor_id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
      ORDER BY
        COALESCE(sm.day_of_week, d.day_value),
        COALESCE(sm.start_time, s.start_time)
      `,
      [profId]
    );

    res.json({
      success: true,
      data: {
        sections: result.rows
      }
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getDashboard,
  getSectionStudents,
  getAttendance,
  getAttendanceSummary,
  markAttendance,
  saveGradesBulk,
  sendAttendanceWarning,
  getSchedule
};