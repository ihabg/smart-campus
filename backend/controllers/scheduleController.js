const { query, withTransaction } = require('../config/db');

const DASHBOARD_SEMESTER = 'spring';
const DASHBOARD_ACADEMIC_YEAR = '2025/2026';

function toIntArrayLiteral(days) {
  const cleanDays = Array.isArray(days)
    ? days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];

  return `{${cleanDays.join(',')}}`;
}

function normalizeTime(value) {
  return String(value || '').slice(0, 5);
}

async function checkSectionConflicts({
  room_id,
  instructor_id,
  semester,
  academic_year,
  day_of_week,
  start_time,
  end_time,
  excludeSectionId = null,
}) {
  const dayArray = Array.isArray(day_of_week) ? day_of_week.map(Number) : [];
  const dayLiteral = toIntArrayLiteral(dayArray);
  const start = normalizeTime(start_time);
  const end = normalizeTime(end_time);

  if (!semester || !academic_year || !dayArray.length || !start || !end) {
    return null;
  }

  const excludeSql = excludeSectionId ? 'AND s.id <> $7' : '';

  if (room_id) {
    const params = excludeSectionId
      ? [room_id, semester, academic_year, dayLiteral, start, end, excludeSectionId]
      : [room_id, semester, academic_year, dayLiteral, start, end];

    const roomConflict = await query(
      `
      SELECT s.id, c.code AS course_code, c.name AS course_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      WHERE s.is_active = TRUE
        AND s.room_id = $1
        AND s.semester = $2
        AND s.academic_year = $3
        AND s.day_of_week && $4::smallint[]
        AND NOT (s.end_time <= $5 OR s.start_time >= $6)
        ${excludeSql}
      LIMIT 1
      `,
      params
    );

    if (roomConflict.rows.length) {
      return 'Room is already booked during this time slot.';
    }

    const meetingRoomConflict = await query(
      `
      SELECT s.id, c.code AS course_code, c.name AS course_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      JOIN section_meetings sm ON sm.section_id = s.id
      WHERE s.is_active = TRUE
        AND COALESCE(sm.room_id, s.room_id) = $1
        AND s.semester = $2
        AND s.academic_year = $3
        AND sm.day_of_week = ANY($4::smallint[])
        AND NOT (sm.end_time <= $5 OR sm.start_time >= $6)
        ${excludeSql}
      LIMIT 1
      `,
      params
    );

    if (meetingRoomConflict.rows.length) {
      return 'Room is already booked during this time slot.';
    }
  }

  if (instructor_id) {
    const params = excludeSectionId
      ? [instructor_id, semester, academic_year, dayLiteral, start, end, excludeSectionId]
      : [instructor_id, semester, academic_year, dayLiteral, start, end];

    const instructorConflict = await query(
      `
      SELECT s.id, c.code AS course_code, c.name AS course_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      WHERE s.is_active = TRUE
        AND s.instructor_id = $1
        AND s.semester = $2
        AND s.academic_year = $3
        AND s.day_of_week && $4::smallint[]
        AND NOT (s.end_time <= $5 OR s.start_time >= $6)
        ${excludeSql}
      LIMIT 1
      `,
      params
    );

    if (instructorConflict.rows.length) {
      return 'Doctor already has another schedule during this time slot.';
    }

    const meetingInstructorConflict = await query(
      `
      SELECT s.id, c.code AS course_code, c.name AS course_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      JOIN section_meetings sm ON sm.section_id = s.id
      WHERE s.is_active = TRUE
        AND s.instructor_id = $1
        AND s.semester = $2
        AND s.academic_year = $3
        AND sm.day_of_week = ANY($4::smallint[])
        AND NOT (sm.end_time <= $5 OR sm.start_time >= $6)
        ${excludeSql}
      LIMIT 1
      `,
      params
    );

    if (meetingInstructorConflict.rows.length) {
      return 'Doctor already has another schedule during this time slot.';
    }
  }

  return null;
}

async function insertSectionMeetings(client, section) {
  const days = Array.isArray(section.day_of_week)
    ? section.day_of_week.map(Number).filter(day => Number.isInteger(day))
    : [];

  for (const day of days) {
    await client.query(
      `
      INSERT INTO section_meetings
        (section_id, room_id, day_of_week, start_time, end_time, meeting_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        section.id,
        section.room_id || null,
        day,
        section.start_time,
        section.end_time,
        'lecture',
      ]
    );
  }
}

// ─── Get student's full schedule ─────────────────────────────
async function getMySchedule(req, res, next) {
  try {
    const { semester, academic_year } = req.query;

    let sql = `
      SELECT
        s.id AS section_id,
        s.section_number,
        s.semester,
        s.academic_year,
        s.enrolled,
        s.max_capacity,

        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        c.credit_hours,
        c.department,

        i.title AS instructor_title,
        i.first_name AS instructor_first_name,
        i.last_name AS instructor_last_name,
        i.email AS instructor_email,
        CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name,

        sm.id AS meeting_id,
        COALESCE(ch.new_day_of_week, sm.day_of_week) AS day_of_week,
        COALESCE(ch.new_start_time, sm.start_time) AS start_time,
        COALESCE(ch.new_end_time, sm.end_time) AS end_time,
        sm.day_of_week AS original_day_of_week,
        sm.start_time AS original_start_time,
        sm.end_time AS original_end_time,
        sm.meeting_type,
        sm.note,

        ch.id AS schedule_change_id,
        ch.change_scope,
        ch.change_date,
        ch.start_date AS change_start_date,
        ch.end_date AS change_end_date,
        ch.reason AS schedule_change_reason,
        ch.created_at AS schedule_change_created_at,

        r.id AS room_id,
        r.room_number,
        r.name AS room_name,
        r.type AS room_type,
        r.coord_x,
        r.coord_y,
        r.coord_width,
        r.coord_height,

        base_room.room_number AS original_room_number,
        base_room.name AS original_room_name,

        f.id AS floor_id,
        f.floor_label,
        f.floor_number,
        f.map_image_url,

        b.code AS building_code,
        b.name AS building_name,

        e.status AS enrollment_status,
        e.grade,

        COALESCE(abs.absence_total, 0) AS absence_total,
        COALESCE(abs.excused_absence_total, 0) AS excused_absence_total,
        CASE
          WHEN COALESCE(abs.absence_total, 0) >= 6 THEN 'نعم'
          ELSE 'لا'
        END AS deprivation_status,

        COALESCE(materials.materials_count, 0) AS materials_count,
        upcoming.upcoming_changes

      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      LEFT JOIN section_meetings sm ON sm.section_id = s.id

      LEFT JOIN LATERAL (
        SELECT cmc.*
        FROM section_meeting_changes cmc
        WHERE cmc.section_id = s.id
          AND cmc.is_active = TRUE
          AND (cmc.section_meeting_id IS NULL OR cmc.section_meeting_id = sm.id)
          AND (
            (cmc.change_scope = 'single_day' AND cmc.change_date = CURRENT_DATE)
            OR (cmc.change_scope = 'date_range' AND CURRENT_DATE BETWEEN cmc.start_date AND cmc.end_date)
            OR (cmc.change_scope = 'permanent')
          )
        ORDER BY
          CASE cmc.change_scope
            WHEN 'single_day' THEN 1
            WHEN 'date_range' THEN 2
            WHEN 'permanent' THEN 3
            ELSE 4
          END,
          cmc.created_at DESC
        LIMIT 1
      ) ch ON TRUE

      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', cmc.id,
            'change_scope', cmc.change_scope,
            'change_date', cmc.change_date,
            'start_date', cmc.start_date,
            'end_date', cmc.end_date,
            'new_day_of_week', cmc.new_day_of_week,
            'new_start_time', cmc.new_start_time,
            'new_end_time', cmc.new_end_time,
            'new_room_number', rr.room_number,
            'reason', cmc.reason
          ) ORDER BY COALESCE(cmc.change_date, cmc.start_date, CURRENT_DATE), cmc.created_at DESC
        ) AS upcoming_changes
        FROM section_meeting_changes cmc
        LEFT JOIN rooms rr ON rr.id = cmc.new_room_id
        WHERE cmc.section_id = s.id
          AND cmc.is_active = TRUE
          AND (cmc.section_meeting_id IS NULL OR cmc.section_meeting_id = sm.id)
          AND (
            (cmc.change_scope = 'single_day' AND cmc.change_date >= CURRENT_DATE)
            OR (cmc.change_scope = 'date_range' AND cmc.end_date >= CURRENT_DATE)
          )
      ) upcoming ON TRUE

      LEFT JOIN rooms base_room ON base_room.id = COALESCE(sm.room_id, s.room_id)
      LEFT JOIN rooms r ON r.id = COALESCE(ch.new_room_id, sm.room_id, s.room_id)
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id

      LEFT JOIN (
        SELECT
          student_id,
          section_id,
          COUNT(*) FILTER (WHERE status = 'absent') AS absence_total,
          COUNT(*) FILTER (WHERE status = 'excused') AS excused_absence_total
        FROM attendance
        GROUP BY student_id, section_id
      ) abs ON abs.student_id = e.student_id
           AND abs.section_id = e.section_id

      LEFT JOIN (
        SELECT section_id, COUNT(*)::int AS materials_count
        FROM professor_course_materials
        WHERE is_published = TRUE
        GROUP BY section_id
      ) materials ON materials.section_id = s.id

      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
    `;

    const params = [req.user.id];
    let idx = 2;

    if (semester) {
      params.push(semester);
      sql += ` AND s.semester = $${idx++}`;
    }

    if (academic_year) {
      params.push(academic_year);
      sql += ` AND s.academic_year = $${idx++}`;
    }

    sql += `
      ORDER BY
        COALESCE(ch.new_day_of_week, sm.day_of_week),
        COALESCE(ch.new_start_time, sm.start_time),
        c.code
    `;

    const result = await query(sql, params);

    const sectionsMap = new Map();
    const byDay = {};

    for (const row of result.rows) {
      if (!sectionsMap.has(row.section_id)) {
        sectionsMap.set(row.section_id, {
          section_id: row.section_id,
          section_number: row.section_number,
          semester: row.semester,
          academic_year: row.academic_year,
          enrolled: row.enrolled,
          max_capacity: row.max_capacity,

          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          course_name_ar: row.course_name_ar,
          credit_hours: row.credit_hours,
          department: row.department,

          instructor_title: row.instructor_title,
          instructor_first_name: row.instructor_first_name,
          instructor_last_name: row.instructor_last_name,
          instructor_email: row.instructor_email,
          instructor_name: row.instructor_name,

          enrollment_status: row.enrollment_status,
          grade: row.grade,

          absence_total: row.absence_total,
          excused_absence_total: row.excused_absence_total,
          deprivation_status: row.deprivation_status,
          materials_count: row.materials_count,

          meetings: []
        });
      }

      const meeting = {
        meeting_id: row.meeting_id,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        original_day_of_week: row.original_day_of_week,
        original_start_time: row.original_start_time,
        original_end_time: row.original_end_time,
        meeting_type: row.meeting_type,
        note: row.note,

        schedule_change_id: row.schedule_change_id,
        change_scope: row.change_scope,
        change_date: row.change_date,
        change_start_date: row.change_start_date,
        change_end_date: row.change_end_date,
        schedule_change_reason: row.schedule_change_reason,
        schedule_change_created_at: row.schedule_change_created_at,
        upcoming_changes: row.upcoming_changes || [],

        room_id: row.room_id,
        room_number: row.room_number,
        room_name: row.room_name,
        room_type: row.room_type,
        original_room_number: row.original_room_number,
        original_room_name: row.original_room_name,
        coord_x: row.coord_x,
        coord_y: row.coord_y,
        coord_width: row.coord_width,
        coord_height: row.coord_height,

        floor_id: row.floor_id,
        floor_label: row.floor_label,
        floor_number: row.floor_number,
        map_image_url: row.map_image_url,

        building_code: row.building_code,
        building_name: row.building_name
      };

      if (row.meeting_id) {
        sectionsMap.get(row.section_id).meetings.push(meeting);

        if (!byDay[row.day_of_week]) {
          byDay[row.day_of_week] = [];
        }

        byDay[row.day_of_week].push({
          ...sectionsMap.get(row.section_id),
          ...meeting
        });
      }
    }

    const sections = Array.from(sectionsMap.values());

    res.json({
      success: true,
      data: {
        sections,
        by_day: byDay,
        total: sections.length
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getTodaySchedule(req, res, next) {
  try {
    const today = new Date().getDay();

    const result = await query(
      `
      SELECT
        s.id AS section_id,
        s.section_number,
        s.semester,
        s.academic_year,

        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,

        COALESCE(ch.new_day_of_week, sm.day_of_week) AS day_of_week,
        COALESCE(ch.new_start_time, sm.start_time) AS start_time,
        COALESCE(ch.new_end_time, sm.end_time) AS end_time,
        sm.meeting_type,
        sm.note,

        ch.id AS schedule_change_id,
        ch.change_scope,
        ch.change_date,
        ch.start_date AS change_start_date,
        ch.end_date AS change_end_date,
        ch.reason AS schedule_change_reason,

        CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name,
        i.email AS instructor_email,

        r.id AS room_id,
        r.room_number,
        r.name AS room_name,
        r.coord_x,
        r.coord_y,

        f.id AS floor_id,
        f.floor_label,

        b.code AS building_code,
        b.name AS building_name,

        e.status AS enrollment_status

      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      JOIN section_meetings sm ON sm.section_id = s.id

      LEFT JOIN LATERAL (
        SELECT cmc.*
        FROM section_meeting_changes cmc
        WHERE cmc.section_id = s.id
          AND cmc.is_active = TRUE
          AND (cmc.section_meeting_id IS NULL OR cmc.section_meeting_id = sm.id)
          AND (
            (cmc.change_scope = 'single_day' AND cmc.change_date = CURRENT_DATE)
            OR (cmc.change_scope = 'date_range' AND CURRENT_DATE BETWEEN cmc.start_date AND cmc.end_date)
            OR (cmc.change_scope = 'permanent')
          )
        ORDER BY
          CASE cmc.change_scope
            WHEN 'single_day' THEN 1
            WHEN 'date_range' THEN 2
            WHEN 'permanent' THEN 3
            ELSE 4
          END,
          cmc.created_at DESC
        LIMIT 1
      ) ch ON TRUE

      LEFT JOIN rooms r ON r.id = COALESCE(ch.new_room_id, sm.room_id, s.room_id)
      LEFT JOIN floors f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id

      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
        AND s.semester = $2
        AND s.academic_year = $3
        AND COALESCE(ch.new_day_of_week, sm.day_of_week) = $4

      ORDER BY COALESCE(ch.new_start_time, sm.start_time), c.code
      `,
      [
        req.user.id,
        DASHBOARD_SEMESTER,
        DASHBOARD_ACADEMIC_YEAR,
        today
      ]
    );

    const now = new Date().toTimeString().slice(0, 5);

    const sections = result.rows.map((sec) => ({
      ...sec,
      is_current: sec.start_time <= now && sec.end_time > now,
      is_past: sec.end_time <= now,
      is_upcoming: sec.start_time > now
    }));

    res.json({
      success: true,
      data: {
        sections,
        day: today,
        semester: DASHBOARD_SEMESTER,
        academic_year: DASHBOARD_ACADEMIC_YEAR
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getAllSections(req, res, next) {
  try {
    const {
      room_id, floor_id, course_id, instructor_id,
      semester, academic_year, day,
      department_contains,
      page = 1, limit = 50,
    } = req.query;

    let sql = `
      SELECT
        s.*,
        c.code AS course_code, c.name AS course_name, c.department,
        i.title || ' ' || i.first_name || ' ' || i.last_name AS instructor_name,
        i.email AS instructor_email,
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
    if (department_contains) {
      params.push(`%${department_contains}%`);
      sql += ` AND c.department ILIKE $${idx++}`;
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

async function createSection(req, res, next) {
  try {
    const {
      course_id,
      instructor_id,
      room_id,
      semester,
      academic_year,
      section_number,
      day_of_week,
      start_time,
      end_time,
      max_capacity,
    } = req.body;

    const conflictMessage = await checkSectionConflicts({
      room_id,
      instructor_id,
      semester,
      academic_year,
      day_of_week,
      start_time,
      end_time,
    });

    if (conflictMessage) {
      return res.status(409).json({
        success: false,
        message: conflictMessage,
      });
    }

    const section = await withTransaction(async client => {
      const result = await client.query(
        `INSERT INTO sections
           (course_id, instructor_id, room_id, semester, academic_year,
            section_number, day_of_week, start_time, end_time, max_capacity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          course_id,
          instructor_id || null,
          room_id || null,
          semester,
          academic_year,
          section_number,
          day_of_week,
          start_time,
          end_time,
          max_capacity || null,
        ]
      );

      await insertSectionMeetings(client, result.rows[0]);

      return result.rows[0];
    });

    res.status(201).json({
      success: true,
      message: 'Doctor schedule created successfully.',
      data: { section },
    });
  } catch (error) {
    next(error);
  }
}

async function updateSection(req, res, next) {
  try {
    const { id } = req.params;

    const currentResult = await query(
      'SELECT * FROM sections WHERE id = $1 AND is_active = TRUE',
      [id]
    );

    if (!currentResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    const current = currentResult.rows[0];
    const merged = {
      ...current,
      ...req.body,
      day_of_week: req.body.day_of_week || current.day_of_week,
      start_time: req.body.start_time || current.start_time,
      end_time: req.body.end_time || current.end_time,
      room_id: req.body.room_id !== undefined ? req.body.room_id : current.room_id,
      instructor_id: req.body.instructor_id !== undefined ? req.body.instructor_id : current.instructor_id,
      semester: req.body.semester || current.semester,
      academic_year: req.body.academic_year || current.academic_year,
    };

    const conflictMessage = await checkSectionConflicts({
      room_id: merged.room_id,
      instructor_id: merged.instructor_id,
      semester: merged.semester,
      academic_year: merged.academic_year,
      day_of_week: merged.day_of_week,
      start_time: merged.start_time,
      end_time: merged.end_time,
      excludeSectionId: id,
    });

    if (conflictMessage) {
      return res.status(409).json({
        success: false,
        message: conflictMessage,
      });
    }

    const allowed = [
      'course_id',
      'instructor_id',
      'room_id',
      'semester',
      'academic_year',
      'section_number',
      'day_of_week',
      'start_time',
      'end_time',
      'max_capacity',
      'is_active',
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

    const updated = await withTransaction(async client => {
      values.push(id);

      const result = await client.query(
        `UPDATE sections SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`,
        values
      );

      const changedMeeting =
        req.body.room_id !== undefined ||
        req.body.day_of_week !== undefined ||
        req.body.start_time !== undefined ||
        req.body.end_time !== undefined;

      if (changedMeeting) {
        await client.query('DELETE FROM section_meetings WHERE section_id = $1', [id]);
        await insertSectionMeetings(client, result.rows[0]);
      }

      return result.rows[0];
    });

    res.json({
      success: true,
      message: 'Doctor schedule updated successfully.',
      data: { section: updated },
    });
  } catch (error) {
    next(error);
  }
}

async function deleteSection(req, res, next) {
  try {
    const { id } = req.params;

    await withTransaction(async client => {
      await client.query('DELETE FROM section_meetings WHERE section_id = $1', [id]);
      const result = await client.query('DELETE FROM sections WHERE id = $1 RETURNING id', [id]);

      if (!result.rows.length) {
        throw Object.assign(new Error('Section not found.'), { statusCode: 404 });
      }
    });

    res.json({ success: true, message: 'Section deleted.' });
  } catch (error) {
    next(error);
  }
}

async function enrollStudent(req, res, next) {
  try {
    const { section_id } = req.body;
    const student_id = req.user.id;

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

async function dropEnrollment(req, res, next) {
  try {
    const { section_id } = req.params;
    const student_id = req.user.id;

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

async function getStudentMaterials(req, res, next) {
  try {
    const { semester, academic_year, section_id } = req.query;

    const params = [req.user.id];
    let idx = 2;

    let whereSql = `
      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
        AND pcm.is_published = TRUE
    `;

    if (semester) {
      params.push(semester);
      whereSql += ` AND s.semester = $${idx++}`;
    }

    if (academic_year) {
      params.push(academic_year);
      whereSql += ` AND s.academic_year = $${idx++}`;
    }

    if (section_id) {
      params.push(section_id);
      whereSql += ` AND s.id = $${idx++}`;
    }

    const sectionsRes = await query(
      `
      SELECT
        s.id AS section_id,
        s.section_number,
        s.semester,
        s.academic_year,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        i.id AS instructor_id,
        CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name,
        i.email AS instructor_email,
        COUNT(pcm.id)::int AS materials_count,
        MAX(pcm.uploaded_at) AS last_material_at
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      LEFT JOIN professor_course_materials pcm ON pcm.section_id = s.id AND pcm.is_published = TRUE
      ${whereSql.replace('AND pcm.is_published = TRUE', '')}
      GROUP BY s.id, c.id, i.id
      ORDER BY c.code, s.section_number
      `,
      params
    );

    const materialsRes = await query(
      `
      SELECT
        pcm.id,
        pcm.section_id,
        pcm.course_id,
        pcm.title,
        pcm.material_type,
        pcm.description,
        pcm.file_url,
        pcm.week_number,
        pcm.room_number,
        pcm.room_name,
        pcm.day_of_week,
        pcm.start_time,
        pcm.end_time,
        pcm.semester,
        pcm.academic_year,
        pcm.uploaded_at,
        COALESCE(pcm.download_count, 0) AS download_count,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name,
        i.email AS instructor_email,
        EXISTS (
          SELECT 1
          FROM professor_material_access_logs mal
          WHERE mal.material_id = pcm.id
            AND mal.user_id = $1
        ) AS opened_by_me
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = s.instructor_id
      JOIN professor_course_materials pcm ON pcm.section_id = s.id
      ${whereSql}
      ORDER BY c.code, s.section_number, pcm.week_number NULLS LAST, pcm.uploaded_at DESC
      `,
      params
    );

    res.json({
      success: true,
      data: {
        sections: sectionsRes.rows,
        materials: materialsRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
}

async function recordStudentMaterialOpen(req, res, next) {
  try {
    const { materialId } = req.params;

    const materialRes = await query(
      `
      SELECT pcm.id, pcm.file_url
      FROM professor_course_materials pcm
      JOIN enrollments e ON e.section_id = pcm.section_id
      JOIN sections s ON s.id = pcm.section_id
      WHERE pcm.id = $1
        AND pcm.is_published = TRUE
        AND e.student_id = $2
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
      LIMIT 1
      `,
      [materialId, req.user.id]
    );

    if (!materialRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Material not found for your enrolled courses.'
      });
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
  } catch (error) {
    next(error);
  }
}

// ─── Semester Stats (admin) ──────────────────────────────────
// GET /schedule/stats?semester=spring&academic_year=2025/2026
// Returns summary counts for the Semester Management dashboard cards.
async function getSemesterStats(req, res, next) {
  try {
    const { semester, academic_year, department_contains } = req.query;

    if (!semester || !academic_year) {
      return res.status(400).json({
        success: false,
        message: 'semester and academic_year query parameters are required.',
      });
    }

    const params = [semester, academic_year];
    let deptClause = '';
    if (department_contains) {
      params.push(`%${department_contains}%`);
      deptClause = ` AND c.department ILIKE $3`;
    }

    // Run the section-level aggregates and the meetings count in parallel.
    const [sectionsRes, meetingsRes] = await Promise.all([

      query(
        `SELECT
           COUNT(*)::int                                                         AS total_sections,
           COUNT(DISTINCT s.course_id)::int                                      AS total_courses,
           COUNT(DISTINCT s.instructor_id)
             FILTER (WHERE s.instructor_id IS NOT NULL)::int                     AS instructors_assigned,
           COUNT(*) FILTER (WHERE s.instructor_id IS NULL)::int                  AS sections_without_instructor,
           COUNT(DISTINCT s.room_id)
             FILTER (WHERE s.room_id IS NOT NULL)::int                           AS rooms_assigned,
           COUNT(*) FILTER (WHERE s.room_id IS NULL)::int                        AS sections_without_room,
           COALESCE(SUM(s.enrolled), 0)::int                                     AS total_enrolled,
           COALESCE(SUM(s.max_capacity), 0)::int                                 AS total_capacity
         FROM sections s
         JOIN courses c ON c.id = s.course_id
         WHERE s.is_active = TRUE
           AND s.semester     = $1
           AND s.academic_year = $2${deptClause}`,
        params
      ),

      query(
        `SELECT COUNT(*)::int AS total_meetings
         FROM section_meetings sm
         JOIN sections s ON s.id = sm.section_id
         JOIN courses  c ON c.id = s.course_id
         WHERE s.is_active    = TRUE
           AND s.semester     = $1
           AND s.academic_year = $2${deptClause}`,
        params
      ),

    ]);

    const s = sectionsRes.rows[0];

    res.json({
      success: true,
      data: {
        semester,
        academic_year,
        // Sections & courses
        total_sections:               s.total_sections,
        total_courses:                s.total_courses,
        // Enrollment
        total_enrolled:               s.total_enrolled,
        total_capacity:               s.total_capacity,
        // Assignment gaps
        instructors_assigned:         s.instructors_assigned,
        sections_without_instructor:  s.sections_without_instructor,
        rooms_assigned:               s.rooms_assigned,
        sections_without_room:        s.sections_without_room,
        // Meetings
        total_meetings:               meetingsRes.rows[0].total_meetings,
        // Conflict count is placeholder until /schedule/validate is implemented
        conflicts_found:              0,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentCourseMessages(req, res, next) {
  try {
    const result = await query(
      `
      SELECT
        sm.id,
        sm.section_id,
        sm.title,
        sm.body,
        sm.is_pinned,
        sm.created_at,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name
      FROM section_messages sm
      JOIN sections s ON s.id = sm.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN instructors i ON i.id = sm.instructor_id
      JOIN enrollments e ON e.section_id = s.id
      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND sm.is_active = TRUE
      ORDER BY sm.is_pinned DESC, sm.created_at DESC
      `,
      [req.user.id]
    );

    res.json({ success: true, data: { messages: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Room availability for map-based assignment ───────────────
//
// GET /api/schedule/room-availability
// Returns every active room annotated with an availability status
// for the requested semester / day / time window.
//
// Status priority (high → low):
//   booked            — a section_meetings row conflicts with the slot
//   too_small         — capacity < expected_capacity (only for teaching rooms)
//   available         — teaching room, no conflict, capacity ok
//   not_teaching_room — room_types.is_teaching is false / null
//
async function getRoomAvailability(req, res, next) {
  try {
    const {
      semester,
      academic_year,
      day_of_week,
      start_time,
      end_time,
      expected_capacity,
    } = req.query;

    // ── Validate required params ─────────────────────────────
    const missing = [];
    if (!semester)                                       missing.push('semester');
    if (!academic_year)                                  missing.push('academic_year');
    if (day_of_week === undefined || day_of_week === '') missing.push('day_of_week');
    if (!start_time)                                     missing.push('start_time');
    if (!end_time)                                       missing.push('end_time');

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required parameters: ${missing.join(', ')}`,
      });
    }

    if (!['fall', 'spring', 'summer'].includes(semester)) {
      return res.status(400).json({
        success: false,
        message: 'semester must be fall, spring, or summer.',
      });
    }

    if (!/^\d{4}\/\d{4}$/.test(academic_year)) {
      return res.status(400).json({
        success: false,
        message: 'academic_year must be in YYYY/YYYY format.',
      });
    }

    const dayInt = parseInt(day_of_week, 10);
    if (!Number.isInteger(dayInt) || dayInt < 0 || dayInt > 6) {
      return res.status(400).json({
        success: false,
        message: 'day_of_week must be an integer 0 (Sun) to 6 (Sat).',
      });
    }

    const timeRe = /^\d{2}:\d{2}$/;
    const start  = String(start_time).slice(0, 5);
    const end    = String(end_time).slice(0, 5);

    if (!timeRe.test(start) || !timeRe.test(end)) {
      return res.status(400).json({
        success: false,
        message: 'start_time and end_time must be in HH:MM format.',
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'start_time must be before end_time.',
      });
    }

    let capacityFilter = null;
    if (expected_capacity !== undefined && expected_capacity !== '') {
      capacityFilter = parseInt(expected_capacity, 10);
      if (!Number.isInteger(capacityFilter) || capacityFilter < 1) {
        return res.status(400).json({
          success: false,
          message: 'expected_capacity must be a positive integer.',
        });
      }
    }

    // ── Main query ───────────────────────────────────────────
    //
    // For every active room:
    //   1. LEFT JOIN room_types (by r.type::text = rt.value) to get
    //      label, icon, color, and is_teaching flag.
    //   2. LEFT JOIN LATERAL finds the first conflicting booking —
    //      a section_meetings row where:
    //        • the room matches (COALESCE sm.room_id, s.room_id)
    //        • same semester / academic_year
    //        • same day_of_week
    //        • time ranges overlap: sm.start < req_end AND sm.end > req_start
    //
    // Status is computed in JS after the query because it depends on
    // the optional capacityFilter which is not a DB column.
    //
    const result = await query(
      `
      SELECT
        r.id              AS room_id,
        r.room_number,
        r.name            AS room_name,
        r.type            AS room_type,
        r.capacity,
        r.floor_id,
        f.building_id,

        rt.label_en       AS room_type_label,
        rt.icon           AS room_type_icon,
        rt.color          AS room_type_color,
        rt.is_teaching,

        conflict.section_id      AS booked_section_id,
        conflict.course_code,
        conflict.course_name,
        conflict.section_number,
        conflict.instructor_name,
        conflict.meeting_start   AS booked_start_time,
        conflict.meeting_end     AS booked_end_time,
        conflict.enrolled,
        conflict.max_capacity    AS booked_max_capacity

      FROM rooms r
      LEFT JOIN floors     f  ON f.id    = r.floor_id
      LEFT JOIN room_types rt ON rt.value = r.type::text

      -- Find the first conflicting booking for this room on the
      -- requested day/time. LATERAL lets us reference r.id in the
      -- subquery. ON TRUE keeps all rooms (LEFT JOIN behaviour).
      LEFT JOIN LATERAL (
        SELECT
          s.id              AS section_id,
          c.code            AS course_code,
          c.name            AS course_name,
          s.section_number,
          TRIM(CONCAT_WS(' ',
            NULLIF(TRIM(COALESCE(i.title, '')), ''),
            i.first_name,
            i.last_name
          ))                AS instructor_name,
          sm.start_time     AS meeting_start,
          sm.end_time       AS meeting_end,
          sm.day_of_week    AS conflicting_day,
          s.enrolled,
          s.max_capacity
        FROM   section_meetings sm
        JOIN   sections     s  ON s.id  = sm.section_id
        JOIN   courses      c  ON c.id  = s.course_id
        LEFT JOIN instructors i ON i.id = s.instructor_id
        WHERE  COALESCE(sm.room_id, s.room_id) = r.id
          AND  s.is_active     = TRUE
          AND  s.semester      = $1
          AND  s.academic_year = $2
          AND  sm.day_of_week  = $3
          AND  sm.start_time   < $5::time
          AND  sm.end_time     > $4::time
        ORDER BY sm.start_time
        LIMIT 1
      ) conflict ON TRUE

      WHERE r.is_active = TRUE
      ORDER BY
        -- Teaching rooms first, then by type sort_order, then room_number
        CASE WHEN rt.is_teaching IS TRUE THEN 0 ELSE 1 END,
        rt.sort_order NULLS LAST,
        r.room_number
      `,
      [semester, academic_year, dayInt, start, end]
    );

    // ── Assign status for each room ──────────────────────────
    const rooms = result.rows.map(row => {
      let status;
      let booking = null;

      if (!row.is_teaching) {
        // Not a teaching space — no point showing availability.
        status = 'not_teaching_room';
      } else if (row.booked_section_id) {
        // A conflicting booking exists — booked takes priority over too_small.
        status = 'booked';
        booking = {
          course_code:     row.course_code,
          course_name:     row.course_name,
          section_number:  row.section_number,
          instructor_name: row.instructor_name,
          start_time:      normalizeTime(row.booked_start_time),
          end_time:        normalizeTime(row.booked_end_time),
          meeting_day:     row.conflicting_day,
          enrolled:        row.enrolled,
          max_capacity:    row.booked_max_capacity,
        };
      } else if (
        capacityFilter !== null &&
        row.capacity !== null &&
        Number(row.capacity) < capacityFilter
      ) {
        status = 'too_small';
      } else {
        status = 'available';
      }

      const room = {
        room_id:         row.room_id,
        room_number:     row.room_number,
        room_name:       row.room_name,
        room_type:       row.room_type,
        room_type_label: row.room_type_label || String(row.room_type),
        room_type_icon:  row.room_type_icon  || null,
        room_type_color: row.room_type_color || null,
        capacity:        row.capacity,
        floor_id:        row.floor_id,
        building_id:     row.building_id,
        status,
      };

      if (booking) room.booking = booking;

      return room;
    });

    // ── Summary counts ────────────────────────────────────────
    const summary = {
      total_rooms:        rooms.length,
      available_count:    rooms.filter(r => r.status === 'available').length,
      booked_count:       rooms.filter(r => r.status === 'booked').length,
      too_small_count:    rooms.filter(r => r.status === 'too_small').length,
      not_teaching_count: rooms.filter(r => r.status === 'not_teaching_room').length,
    };

    res.json({
      success: true,
      data: {
        rooms,
        summary,
        query: {
          semester,
          academic_year,
          day_of_week:       dayInt,
          start_time:        start,
          end_time:          end,
          expected_capacity: capacityFilter,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentAttendanceSummary(req, res, next) {
  try {
    const result = await query(
      `
      SELECT
        s.id AS section_id,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present,
        COUNT(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
        COUNT(a.id) FILTER (WHERE a.status = 'late')::int AS late,
        COUNT(a.id) FILTER (WHERE a.status = 'excused')::int AS excused,
        COUNT(a.id)::int AS total,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))::numeric
          / NULLIF(COUNT(a.id), 0) * 100,
          1
        ) AS attendance_pct
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN attendance a ON a.section_id = s.id AND a.student_id = e.student_id
      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
      GROUP BY s.id, c.id
      ORDER BY c.code, s.section_number
      `,
      [req.user.id]
    );

    res.json({ success: true, data: { summary: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function getStudentGrades(req, res, next) {
  try {
    const result = await query(
      `
      SELECT
        s.id AS section_id,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(c.name_ar, c.name) AS course_name_ar,
        s.section_number,
        g.midterm,
        g.final,
        g.assignments,
        g.practical,
        g.letter_grade,
        COALESCE(g.midterm, 0) + COALESCE(g.final, 0) + COALESCE(g.assignments, 0) + COALESCE(g.practical, 0) AS total_grade
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN grades g ON g.section_id = s.id AND g.student_id = e.student_id
      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
      ORDER BY c.code, s.section_number
      `,
      [req.user.id]
    );

    res.json({ success: true, data: { grades: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Semester Meetings (admin) ───────────────────────────────
// GET /schedule/meetings?semester=spring&academic_year=2025/2026
// Returns every section_meetings row for the semester, joined with
// section, course, instructor, and room data for the Timetable tab.
async function getSemesterMeetings(req, res, next) {
  try {
    const { semester, academic_year, department_contains } = req.query;

    if (!semester || !academic_year) {
      return res.status(400).json({
        success: false,
        message: 'semester and academic_year query parameters are required.',
      });
    }

    const params = [semester, academic_year];
    let deptClause = '';
    if (department_contains) {
      params.push(`%${department_contains}%`);
      deptClause = ` AND c.department ILIKE $3`;
    }

    const result = await query(
      `SELECT
         sm.id             AS meeting_id,
         sm.day_of_week,
         sm.start_time,
         sm.end_time,
         sm.meeting_type,
         sm.note,

         s.id              AS section_id,
         s.section_number,
         s.semester,
         s.academic_year,
         s.enrolled,
         s.max_capacity,

         c.id              AS course_id,
         c.code            AS course_code,
         c.name            AS course_name,
         c.department,

         CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) AS instructor_name,
         i.email           AS instructor_email,

         r.id              AS room_id,
         r.room_number,
         r.name            AS room_name,
         r.capacity        AS room_capacity,

         f.floor_label,
         b.code            AS building_code,
         b.name            AS building_name

       FROM section_meetings sm
       JOIN sections    s  ON s.id  = sm.section_id
       JOIN courses     c  ON c.id  = s.course_id
       LEFT JOIN instructors i ON i.id = s.instructor_id
       LEFT JOIN rooms   r  ON r.id  = COALESCE(sm.room_id, s.room_id)
       LEFT JOIN floors  f  ON f.id  = r.floor_id
       LEFT JOIN buildings b ON b.id = f.building_id
       WHERE s.is_active    = TRUE
         AND s.semester     = $1
         AND s.academic_year = $2${deptClause}
       ORDER BY sm.day_of_week, sm.start_time, c.code`,
      params
    );

    res.json({
      success: true,
      data: {
        meetings: result.rows,
        total:    result.rows.length,
        semester,
        academic_year,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMySchedule,
  getTodaySchedule,
  getStudentMaterials,
  recordStudentMaterialOpen,
  getStudentCourseMessages,
  getStudentAttendanceSummary,
  getStudentGrades,
  getAllSections,
  createSection,
  updateSection,
  deleteSection,
  enrollStudent,
  dropEnrollment,
  getSemesterStats,
  getSemesterMeetings,
  getRoomAvailability,
};
