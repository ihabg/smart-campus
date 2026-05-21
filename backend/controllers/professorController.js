const { query } = require('../config/db');
const https = require('https');

function letterGrade(total) {
  if (total >= 90) return 'A';
  if (total >= 85) return 'A-';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'B-';
  if (total >= 65) return 'C+';
  if (total >= 60) return 'C';
  if (total >= 55) return 'C-';
  if (total >= 50) return 'D+';
  if (total >= 45) return 'D';
  if (total >= 40) return 'D-';
  return 'E';
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

module.exports = {
  getDashboard,
  getSectionStudents,
  getAttendance,
  getAttendanceSummary,
  markAttendance,
  saveGradesBulk,
  sendAttendanceWarning,
  getSchedule,
  getRoomsForChange,
  changeMeeting
};