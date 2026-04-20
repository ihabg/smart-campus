const { query, withTransaction } = require('../config/db');

// ─── Get student's full schedule ─────────────────────────────

async function getMySchedule(req, res, next) {
  try {
    const { semester, academic_year } = req.query;

    let sql = `
      SELECT
        s.id AS section_id,
        s.section_number,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.semester,
        s.academic_year,
        s.enrolled,
        s.max_capacity,
        c.id   AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.credit_hours,
        c.department,
        i.title          AS instructor_title,
        i.first_name     AS instructor_first_name,
        i.last_name      AS instructor_last_name,
        r.id             AS room_id,
        r.room_number,
        r.name           AS room_name,
        r.type           AS room_type,
        r.coord_x,
        r.coord_y,
        r.coord_width,
        r.coord_height,
        f.id             AS floor_id,
        f.floor_label,
        f.floor_number,
        f.map_image_url,
        b.code           AS building_code,
        b.name           AS building_name,
        e.status         AS enrollment_status,
        e.grade
      FROM enrollments e
      JOIN sections    s ON s.id = e.section_id
      JOIN courses     c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      LEFT JOIN rooms   r ON r.id = s.room_id
      LEFT JOIN floors  f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
    `;

    const params = [req.user.id];
    let   idx    = 2;

    if (semester) {
      params.push(semester);
      sql += ` AND s.semester = $${idx++}`;
    }
    if (academic_year) {
      params.push(academic_year);
      sql += ` AND s.academic_year = $${idx++}`;
    }

    sql += ' ORDER BY s.day_of_week[1], s.start_time';

    const result = await query(sql, params);

    // Group by day of week for convenience
    const byDay = {};
    for (const row of result.rows) {
      for (const day of row.day_of_week) {
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(row);
      }
    }

    res.json({
      success: true,
      data: {
        sections: result.rows,
        by_day:   byDay,
        total:    result.rows.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get today's schedule ────────────────────────────────────

async function getTodaySchedule(req, res, next) {
  try {
    const today = new Date().getDay(); // 0=Sun … 6=Sat

    const result = await query(
      `SELECT
         s.id AS section_id,
         s.start_time,
         s.end_time,
         c.code AS course_code,
         c.name AS course_name,
         i.title || ' ' || i.first_name || ' ' || i.last_name AS instructor_name,
         r.room_number,
         r.name AS room_name,
         r.coord_x, r.coord_y,
         f.floor_label,
         b.code AS building_code,
         e.status AS enrollment_status
       FROM enrollments e
       JOIN sections s    ON s.id = e.section_id
       JOIN courses  c    ON c.id = s.course_id
       LEFT JOIN instructors i ON i.id = s.instructor_id
       LEFT JOIN rooms   r ON r.id = s.room_id
       LEFT JOIN floors  f ON f.id = r.floor_id
       LEFT JOIN buildings b ON b.id = f.building_id
       WHERE e.student_id = $1
         AND e.status = 'enrolled'
         AND s.is_active = TRUE
         AND $2 = ANY(s.day_of_week)
       ORDER BY s.start_time`,
      [req.user.id, today]
    );

    const now = new Date().toTimeString().slice(0, 5);

    const sections = result.rows.map(sec => ({
      ...sec,
      is_current: sec.start_time <= now && sec.end_time > now,
      is_past:    sec.end_time <= now,
      is_upcoming: sec.start_time > now,
    }));

    res.json({ success: true, data: { sections, day: today } });
  } catch (error) {
    next(error);
  }
}

// ─── Get all sections (admin / public) ───────────────────────

async function getAllSections(req, res, next) {
  try {
    const {
      room_id, floor_id, course_id, instructor_id,
      semester, academic_year, day,
      page = 1, limit = 50,
    } = req.query;

    let sql = `
      SELECT
        s.*,
        c.code AS course_code, c.name AS course_name, c.department,
        i.title || ' ' || i.first_name || ' ' || i.last_name AS instructor_name,
        r.room_number, r.name AS room_name,
        f.floor_label, b.code AS building_code
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      WHERE s.is_active = TRUE
    `;
    const params = [];
    let idx = 1;

    if (room_id)        { params.push(room_id);        sql += ` AND s.room_id = $${idx++}`; }
    if (course_id)      { params.push(course_id);      sql += ` AND s.course_id = $${idx++}`; }
    if (instructor_id)  { params.push(instructor_id);  sql += ` AND s.instructor_id = $${idx++}`; }
    if (semester)       { params.push(semester);       sql += ` AND s.semester = $${idx++}`; }
    if (academic_year)  { params.push(academic_year);  sql += ` AND s.academic_year = $${idx++}`; }
    if (day !== undefined) { params.push(parseInt(day)); sql += ` AND $${idx++} = ANY(s.day_of_week)`; }
    if (floor_id) {
      sql += ` AND s.room_id IN (SELECT id FROM rooms WHERE floor_id = $${idx++})`;
      params.push(floor_id);
    }

    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    sql += ` ORDER BY s.day_of_week[1], s.start_time LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        sections: result.rows,
        pagination: {
          total,
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Create section (admin) ───────────────────────────────────

async function createSection(req, res, next) {
  try {
    const {
      course_id, instructor_id, room_id, semester,
      academic_year, section_number, day_of_week,
      start_time, end_time, max_capacity,
    } = req.body;

    // Conflict check — same room, overlapping time, same day
    if (room_id) {
      const conflict = await query(
        `SELECT s.id FROM sections s
         WHERE s.room_id = $1
           AND s.is_active = TRUE
           AND s.semester = $2
           AND s.academic_year = $3
           AND s.day_of_week && $4::int[]
           AND NOT (s.end_time <= $5 OR s.start_time >= $6)`,
        [room_id, semester, academic_year, `{${day_of_week.join(',')}}`, start_time, end_time]
      );
      if (conflict.rows.length) {
        return res.status(409).json({
          success: false,
          message: 'Room is already booked during this time slot.',
        });
      }
    }

    const result = await query(
      `INSERT INTO sections
         (course_id, instructor_id, room_id, semester, academic_year,
          section_number, day_of_week, start_time, end_time, max_capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        course_id, instructor_id || null, room_id || null, semester,
        academic_year, section_number, day_of_week,
        start_time, end_time, max_capacity || null,
      ]
    );

    res.status(201).json({ success: true, data: { section: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Update section (admin) ───────────────────────────────────

async function updateSection(req, res, next) {
  try {
    const { id } = req.params;
    const allowed = [
      'instructor_id','room_id','section_number','day_of_week',
      'start_time','end_time','max_capacity','is_active',
    ];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key}=$${idx++}`);
        values.push(req.body[key]);
      }
    }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(id);
    const result = await query(
      `UPDATE sections SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    res.json({ success: true, data: { section: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Delete section (admin) ───────────────────────────────────

async function deleteSection(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM sections WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    res.json({ success: true, message: 'Section deleted.' });
  } catch (error) {
    next(error);
  }
}

// ─── Enroll student ───────────────────────────────────────────

async function enrollStudent(req, res, next) {
  try {
    const { section_id } = req.body;
    const student_id     = req.user.id;

    // Check section exists and has capacity
    const sec = await query(
      'SELECT id, max_capacity, enrolled FROM sections WHERE id = $1 AND is_active = TRUE',
      [section_id]
    );
    if (!sec.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    const { max_capacity, enrolled } = sec.rows[0];
    if (max_capacity && enrolled >= max_capacity) {
      return res.status(409).json({ success: false, message: 'Section is full.' });
    }

    await withTransaction(async client => {
      await client.query(
        `INSERT INTO enrollments (student_id, section_id)
         VALUES ($1, $2)
         ON CONFLICT (student_id, section_id)
           DO UPDATE SET status = 'enrolled', updated_at = NOW()`,
        [student_id, section_id]
      );
      await client.query(
        'UPDATE sections SET enrolled = enrolled + 1 WHERE id = $1',
        [section_id]
      );
    });

    res.status(201).json({ success: true, message: 'Enrolled successfully.' });
  } catch (error) {
    next(error);
  }
}

// ─── Drop enrollment ──────────────────────────────────────────

async function dropEnrollment(req, res, next) {
  try {
    const { section_id } = req.params;
    const student_id     = req.user.id;

    await withTransaction(async client => {
      const result = await client.query(
        `UPDATE enrollments SET status = 'dropped', updated_at = NOW()
         WHERE student_id = $1 AND section_id = $2 AND status = 'enrolled'
         RETURNING id`,
        [student_id, section_id]
      );
      if (!result.rows.length) {
        throw Object.assign(new Error('Enrollment not found.'), { statusCode: 404 });
      }
      await client.query(
        'UPDATE sections SET enrolled = GREATEST(enrolled - 1, 0) WHERE id = $1',
        [section_id]
      );
    });

    res.json({ success: true, message: 'Dropped successfully.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMySchedule, getTodaySchedule, getAllSections,
  createSection, updateSection, deleteSection,
  enrollStudent, dropEnrollment,
};
