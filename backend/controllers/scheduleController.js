const { query, withTransaction } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

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

      LEFT JOIN semesters sem
        ON sem.semester = s.semester::text AND sem.academic_year = s.academic_year

      WHERE e.student_id = $1
        AND e.status = 'enrolled'
        AND s.is_active = TRUE
        AND sem.status = 'published'
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
        c.code AS course_code, c.name AS course_name, c.name_ar AS course_name_ar,
        c.credit_hours, c.department,
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

    const scheduleChanged =
      req.body.instructor_id  !== undefined ||
      req.body.room_id        !== undefined ||
      req.body.day_of_week    !== undefined ||
      req.body.start_time     !== undefined ||
      req.body.end_time       !== undefined ||
      req.body.semester       !== undefined ||
      req.body.academic_year  !== undefined;

    if (scheduleChanged) {
      const conflictMessage = await checkSectionConflicts({
        room_id:          merged.room_id,
        instructor_id:    merged.instructor_id,
        semester:         merged.semester,
        academic_year:    merged.academic_year,
        day_of_week:      merged.day_of_week,
        start_time:       merged.start_time,
        end_time:         merged.end_time,
        excludeSectionId: id,
      });
      if (conflictMessage) {
        return res.status(409).json({ success: false, message: conflictMessage });
      }
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

// ─── Student schedule conflict helper ───────────────────────
// Returns null if no conflict, or a structured conflict object.
// ─── Prerequisite check ──────────────────────────────────────
// Returns { ok: true, missing: [] } or { ok: false, missing: [...] }
// Passing grade: any letter_grade that is NOT 'D-' or 'E' (and not from a dropped enrollment).
// Concurrent prerequisite: satisfied if already passed OR currently enrolled in same term.
async function checkCoursePrerequisites(studentId, courseId, semester, academicYear) {
  const result = await query(
    `SELECT
       cp.prerequisite_id AS course_id,
       cp.is_concurrent,
       c.code,
       c.name,
       c.name_ar,
       EXISTS (
         SELECT 1
         FROM enrollments e
         JOIN sections s ON s.id = e.section_id
         LEFT JOIN grades g
           ON g.student_id = e.student_id AND g.section_id = e.section_id
         WHERE e.student_id    = $2
           AND s.course_id     = cp.prerequisite_id
           AND e.status       != 'dropped'
           AND g.letter_grade IS NOT NULL
           AND g.letter_grade NOT IN ('D-', 'E')
       ) AS passed,
       EXISTS (
         SELECT 1
         FROM enrollments e2
         JOIN sections s2 ON s2.id = e2.section_id
         WHERE e2.student_id   = $2
           AND s2.course_id    = cp.prerequisite_id
           AND s2.semester::text = $3
           AND s2.academic_year  = $4
           AND e2.status         = 'enrolled'
       ) AS currently_enrolled
     FROM course_prerequisites cp
     JOIN courses c ON c.id = cp.prerequisite_id
     WHERE cp.course_id = $1
     ORDER BY c.code`,
    [courseId, studentId, semester, academicYear]
  );

  if (!result.rows.length) return { ok: true, missing: [] };

  const missing = [];
  for (const row of result.rows) {
    if (row.passed) continue;
    if (row.is_concurrent && row.currently_enrolled) continue;
    missing.push({
      course_id:     row.course_id,
      code:          row.code,
      name:          row.name,
      name_ar:       row.name_ar || null,
      is_concurrent: row.is_concurrent,
      reason:        row.is_concurrent ? 'not_currently_enrolled' : 'not_completed',
    });
  }
  return { ok: missing.length === 0, missing };
}

// Uses section_meetings as the canonical source of truth.
// Both enrollStudent (self-registration) and adminEnrollStudent call this.
async function checkStudentScheduleConflict(student_id, section_id) {
  const result = await query(
    `SELECT DISTINCT
       c2.code         AS course_code,
       c2.name         AS course_name,
       s2.section_number,
       sm2.day_of_week,
       sm2.start_time::text AS start_time,
       sm2.end_time::text   AS end_time
     FROM sections s_new
     JOIN section_meetings sm_new ON sm_new.section_id = s_new.id
     JOIN enrollments e2 ON e2.student_id = $2 AND e2.status = 'enrolled'
     JOIN sections s2
       ON s2.id = e2.section_id
      AND s2.semester::text = s_new.semester::text
      AND s2.academic_year  = s_new.academic_year
      AND s2.is_active      = TRUE
      AND s2.id            != s_new.id
     JOIN section_meetings sm2
       ON sm2.section_id  = s2.id
      AND sm2.day_of_week = sm_new.day_of_week
      AND sm2.start_time  < sm_new.end_time
      AND sm2.end_time    > sm_new.start_time
     JOIN courses c2 ON c2.id = s2.course_id
     WHERE s_new.id = $1
     LIMIT 1`,
    [section_id, student_id]
  );

  if (!result.rows.length) return null;

  const c = result.rows[0];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    course_code:    c.course_code,
    course_name:    c.course_name,
    section_number: c.section_number,
    day_of_week:    c.day_of_week,
    day_label:      DAY_NAMES[c.day_of_week] ?? String(c.day_of_week),
    start_time:     String(c.start_time).slice(0, 5),
    end_time:       String(c.end_time).slice(0, 5),
  };
}

async function checkRegistrationPeriod(semester, academicYear) {
  const result = await query(
    `SELECT status, registration_start, registration_end, drop_deadline
     FROM semesters
     WHERE semester = $1 AND academic_year = $2`,
    [semester, academicYear]
  );

  if (!result.rows.length) {
    return { enrollAllowed: false, dropAllowed: false, reason: 'semester_not_found', period: null };
  }

  const { status, registration_start, registration_end, drop_deadline } = result.rows[0];
  const period = { registration_start, registration_end, drop_deadline };

  if (status !== 'published') {
    return { enrollAllowed: false, dropAllowed: false, reason: 'not_published', period };
  }

  const now = new Date();
  let enrollAllowed = true;
  let enrollReason  = null;

  if (registration_start && now < new Date(registration_start)) {
    enrollAllowed = false;
    enrollReason  = 'not_open_yet';
  } else if (registration_end && now > new Date(registration_end)) {
    enrollAllowed = false;
    enrollReason  = 'registration_closed';
  }

  const dropAllowed = !drop_deadline || now <= new Date(drop_deadline);

  return {
    enrollAllowed,
    dropAllowed,
    reason: enrollReason || (!dropAllowed ? 'drop_deadline_passed' : null),
    period,
  };
}

const PERIOD_MESSAGES = {
  semester_not_found:  'Semester not found.',
  not_published:       'This semester is not currently open for registration.',
  not_open_yet:        'Registration for this semester has not opened yet.',
  registration_closed: 'Registration for this semester is closed.',
  drop_deadline_passed:'The drop deadline for this semester has passed.',
};

async function enrollStudent(req, res, next) {
  try {
    const { section_id } = req.body;
    const student_id = req.user.id;

    const sec = await query(
      'SELECT id, max_capacity, enrolled, course_id, semester, academic_year FROM sections WHERE id = $1 AND is_active = TRUE',
      [section_id]
    );

    if (!sec.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    const { max_capacity, enrolled, course_id, semester, academic_year } = sec.rows[0];

    const periodCheck = await checkRegistrationPeriod(semester, academic_year);
    if (!periodCheck.enrollAllowed) {
      return res.status(403).json({
        success:             false,
        registration_closed: true,
        reason:              periodCheck.reason,
        message:             PERIOD_MESSAGES[periodCheck.reason] || 'Registration is not open.',
      });
    }

    const prereqCheck = await checkCoursePrerequisites(student_id, course_id, semester, academic_year);
    if (!prereqCheck.ok) {
      return res.status(409).json({
        success:             false,
        prerequisite_failed: true,
        message:             'Missing prerequisites for this course.',
        missing:             prereqCheck.missing,
      });
    }

    if (max_capacity && enrolled >= max_capacity) {
      return res.status(409).json({ success: false, message: 'Section is full.' });
    }

    const conflict = await checkStudentScheduleConflict(student_id, section_id);
    if (conflict) {
      return res.status(409).json({
        success:  false,
        conflict: true,
        message: `Schedule conflict: ${conflict.course_code} (section ${conflict.section_number}) on ${conflict.day_label} ${conflict.start_time}–${conflict.end_time}`,
        conflicting_course: conflict,
      });
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

async function getPublishedSemesters(req, res, next) {
  try {
    const result = await query(
      `SELECT semester, academic_year, label,
              registration_start, registration_end, drop_deadline
       FROM semesters
       WHERE status = 'published'
       ORDER BY academic_year DESC,
         CASE semester
           WHEN 'summer' THEN 3
           WHEN 'spring' THEN 2
           WHEN 'fall'   THEN 1
           ELSE 0
         END DESC`
    );
    res.json({ success: true, data: { semesters: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function dropEnrollment(req, res, next) {
  try {
    const { section_id } = req.params;
    const student_id = req.user.id;

    const secRes = await query(
      'SELECT semester, academic_year FROM sections WHERE id = $1',
      [section_id]
    );
    if (!secRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    const { semester, academic_year } = secRes.rows[0];

    const periodCheck = await checkRegistrationPeriod(semester, academic_year);
    if (!periodCheck.dropAllowed) {
      return res.status(403).json({
        success:              false,
        drop_deadline_passed: true,
        reason:               periodCheck.reason,
        message:              PERIOD_MESSAGES[periodCheck.reason] || 'Dropping is not allowed at this time.',
      });
    }

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

// ─── Admin enrollment management ─────────────────────────────

// GET /schedule/admin/sections/:sectionId/enrollments
// Returns section details + paginated list of enrolled students.
// Optional query filters: search, department, year_of_study, page, limit.
async function adminGetEnrollments(req, res, next) {
  try {
    const { sectionId } = req.params;
    const { search, department, year_of_study, page = 1, limit = 20 } = req.query;

    const sectionRes = await query(
      `SELECT
         s.id, s.section_number, s.semester, s.academic_year,
         s.enrolled, s.max_capacity, s.day_of_week, s.start_time, s.end_time,
         c.code AS course_code, c.name AS course_name, c.department,
         TRIM(CONCAT_WS(' ',
           NULLIF(TRIM(COALESCE(i.title,'')), ''), i.first_name, i.last_name
         )) AS instructor_name,
         r.room_number
       FROM sections s
       JOIN courses c ON c.id = s.course_id
       LEFT JOIN instructors i ON i.id = s.instructor_id
       LEFT JOIN rooms r ON r.id = s.room_id
       WHERE s.id = $1 AND s.is_active = TRUE`,
      [sectionId]
    );

    if (!sectionRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    let sql = `
      SELECT
        u.id           AS user_id,
        u.student_id   AS registration_number,
        u.first_name,
        u.last_name,
        u.email,
        u.department,
        u.year_of_study,
        e.updated_at   AS enrolled_at
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      WHERE e.section_id = $1
        AND e.status = 'enrolled'
    `;
    const params = [sectionId];
    let idx = 2;

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx}
                    OR u.email ILIKE $${idx} OR u.student_id ILIKE $${idx})`;
      idx++;
    }
    if (department) {
      params.push(`%${department}%`);
      sql += ` AND u.department ILIKE $${idx++}`;
    }
    if (year_of_study) {
      params.push(parseInt(year_of_study, 10));
      sql += ` AND u.year_of_study = $${idx++}`;
    }

    const countRes = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total    = parseInt(countRes.rows[0].count, 10);

    sql += ` ORDER BY u.last_name, u.first_name LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const studentsRes = await query(sql, params);

    res.json({
      success: true,
      data: {
        section: sectionRes.rows[0],
        students: studentsRes.rows,
        pagination: {
          total,
          page:       parseInt(page, 10),
          limit:      parseInt(limit, 10),
          totalPages: Math.ceil(total / parseInt(limit, 10)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /schedule/admin/students/search
// Searches active students. Requires at least one filter (returns [] otherwise).
// Optional: exclude_section_id marks already-enrolled students.
async function adminSearchStudents(req, res, next) {
  try {
    const { search, department, year_of_study, exclude_section_id } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

    if (!search && !department && !year_of_study) {
      return res.json({ success: true, data: { students: [] } });
    }

    const params = [];
    let idx = 1;

    let exclJoin = '';
    if (exclude_section_id) {
      params.push(exclude_section_id);
      exclJoin = `
        LEFT JOIN enrollments excl_e
          ON excl_e.student_id = u.id
         AND excl_e.section_id = $${idx++}
         AND excl_e.status = 'enrolled'
      `;
    }

    let conditions = `WHERE u.role = 'student' AND u.status = 'active'`;

    if (search) {
      params.push(`%${search}%`);
      conditions += ` AND (u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx}
                          OR u.email ILIKE $${idx} OR u.student_id ILIKE $${idx})`;
      idx++;
    }
    if (department) {
      params.push(`%${department}%`);
      conditions += ` AND u.department ILIKE $${idx++}`;
    }
    if (year_of_study) {
      params.push(parseInt(year_of_study, 10));
      conditions += ` AND u.year_of_study = $${idx++}`;
    }

    params.push(limit);

    const sql = `
      SELECT
        u.id           AS user_id,
        u.student_id   AS registration_number,
        u.first_name,
        u.last_name,
        u.email,
        u.department,
        u.year_of_study
        ${exclude_section_id ? ', (excl_e.student_id IS NOT NULL) AS already_enrolled' : ''}
      FROM users u
      ${exclJoin}
      ${conditions}
      ORDER BY u.last_name, u.first_name
      LIMIT $${idx}
    `;

    const result = await query(sql, params);
    res.json({ success: true, data: { students: result.rows } });
  } catch (error) {
    next(error);
  }
}

// POST /schedule/admin/enroll
// Body: { section_id, student_id }
async function adminEnrollStudent(req, res, next) {
  try {
    const { section_id, student_id, force } = req.body;

    if (!section_id || !student_id) {
      return res.status(400).json({
        success: false,
        message: 'section_id and student_id are required.',
      });
    }

    const [secRes, userRes, existingRes] = await Promise.all([
      query('SELECT id, max_capacity, enrolled, course_id, semester, academic_year FROM sections WHERE id = $1 AND is_active = TRUE', [section_id]),
      query("SELECT id, first_name, last_name, student_id AS sid FROM users WHERE id = $1 AND role = 'student'", [student_id]),
      query('SELECT status FROM enrollments WHERE student_id = $1 AND section_id = $2', [student_id, section_id]),
    ]);

    if (!secRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    if (!userRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // Duplicate check always runs first — force cannot bypass this
    if (existingRes.rows.length && existingRes.rows[0].status === 'enrolled') {
      return res.status(409).json({
        success: false,
        message: 'Student is already enrolled in this section.',
        already_enrolled: true,
      });
    }

    const { max_capacity, enrolled, course_id, semester, academic_year } = secRes.rows[0];

    // Prerequisite check — skipped when force === true
    if (!force) {
      const prereqCheck = await checkCoursePrerequisites(student_id, course_id, semester, academic_year);
      if (!prereqCheck.ok) {
        return res.status(409).json({
          success:            false,
          prerequisite_failed: true,
          can_force:          true,
          message:            'Missing prerequisites for this course.',
          missing:            prereqCheck.missing,
        });
      }
    }

    // Schedule conflict check — force does not bypass this
    const conflict = await checkStudentScheduleConflict(student_id, section_id);
    if (conflict) {
      return res.status(409).json({
        success:  false,
        conflict: true,
        message: `Schedule conflict with ${conflict.course_code} (section ${conflict.section_number}) on ${conflict.day_label} ${conflict.start_time}–${conflict.end_time}`,
        conflicting_course: conflict,
      });
    }

    // Capacity check — only bypassed when force === true
    if (max_capacity !== null && enrolled >= max_capacity && !force) {
      return res.status(409).json({
        success: false,
        message: 'Section is full. Force enrollment required.',
        at_capacity: true,
        can_force: true,
      });
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

    const updatedSec = await query(
      'SELECT enrolled, max_capacity FROM sections WHERE id = $1',
      [section_id]
    );

    const stu = userRes.rows[0];
    await logActivity({
      req,
      action:      'enrollment.add',
      entityType:  'enrollment',
      entityId:    section_id,
      entityLabel: stu ? `${stu.first_name} ${stu.last_name}` : student_id,
      description: `Enrolled student ${stu ? stu.first_name + ' ' + stu.last_name : student_id} in section ${section_id}`,
      metadata: {
        student_id,
        student_sid:  stu?.sid  || null,
        section_id,
        course_id:    secRes.rows[0]?.course_id    || null,
        semester:     secRes.rows[0]?.semester     || null,
        academic_year: secRes.rows[0]?.academic_year || null,
        forced:       !!force,
      },
    });

    res.status(201).json({
      success: true,
      message: force ? 'Student force enrolled successfully.' : 'Student enrolled successfully.',
      forced: !!force,
      data: updatedSec.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

// DELETE /schedule/admin/enroll/:sectionId/:studentId
async function adminRemoveEnrollment(req, res, next) {
  try {
    const { sectionId, studentId } = req.params;

    // Pre-fetch for activity log (non-critical)
    let stuSnap = null;
    try {
      const r = await query(
        'SELECT first_name, last_name, student_id AS sid FROM users WHERE id = $1',
        [studentId]
      );
      stuSnap = r.rows[0] || null;
    } catch (_) {}

    await withTransaction(async client => {
      const result = await client.query(
        `UPDATE enrollments SET status = 'dropped', updated_at = NOW()
         WHERE student_id = $1 AND section_id = $2 AND status = 'enrolled'
         RETURNING id`,
        [studentId, sectionId]
      );

      if (!result.rows.length) {
        throw Object.assign(
          new Error('Enrollment not found or already removed.'),
          { statusCode: 404 }
        );
      }

      await client.query(
        'UPDATE sections SET enrolled = GREATEST(enrolled - 1, 0) WHERE id = $1',
        [sectionId]
      );
    });

    const updatedSec = await query(
      'SELECT enrolled, max_capacity FROM sections WHERE id = $1',
      [sectionId]
    );

    await logActivity({
      req,
      action:      'enrollment.remove',
      entityType:  'enrollment',
      entityId:    sectionId,
      entityLabel: stuSnap ? `${stuSnap.first_name} ${stuSnap.last_name}` : studentId,
      description: `Removed student ${stuSnap ? stuSnap.first_name + ' ' + stuSnap.last_name : studentId} from section ${sectionId}`,
      metadata: {
        student_id:  studentId,
        student_sid: stuSnap?.sid || null,
        section_id:  sectionId,
      },
    });

    res.json({
      success: true,
      message: 'Student removed from section.',
      data: updatedSec.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

// POST /schedule/admin/bulk-enroll
// Body: { section_id, department_contains?, year_of_study? }
// Returns: { inserted, skipped_duplicates, skipped_capacity, enrolled, max_capacity }
async function adminBulkEnroll(req, res, next) {
  try {
    const { section_id, department_contains, year_of_study } = req.body;

    if (!section_id) {
      return res.status(400).json({ success: false, message: 'section_id is required.' });
    }
    if (!department_contains && !year_of_study) {
      return res.status(400).json({
        success: false,
        message: 'At least one of department_contains or year_of_study is required.',
      });
    }

    const secRes = await query(
      'SELECT id, max_capacity, enrolled FROM sections WHERE id = $1 AND is_active = TRUE',
      [section_id]
    );
    if (!secRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    const section = secRes.rows[0];

    // Find all active matching students
    const sParams = [];
    let sidx = 1;
    let cond = "WHERE u.role = 'student' AND u.status = 'active'";

    if (department_contains) {
      sParams.push(`%${department_contains}%`);
      cond += ` AND u.department ILIKE $${sidx++}`;
    }
    if (year_of_study) {
      sParams.push(parseInt(year_of_study, 10));
      cond += ` AND u.year_of_study = $${sidx++}`;
    }

    const allRes = await query(
      `SELECT u.id AS user_id FROM users u ${cond} ORDER BY u.last_name, u.first_name`,
      sParams
    );

    // Already-enrolled set
    const enrolledRes = await query(
      "SELECT student_id FROM enrollments WHERE section_id = $1 AND status = 'enrolled'",
      [section_id]
    );
    const enrolledSet = new Set(enrolledRes.rows.map(r => r.student_id));

    const toEnroll        = allRes.rows.filter(s => !enrolledSet.has(s.user_id));
    const skipped_duplicates = allRes.rows.length - toEnroll.length;

    // Respect capacity
    const remaining    = section.max_capacity !== null
      ? Math.max(0, section.max_capacity - section.enrolled)
      : toEnroll.length;
    const canInsert    = Math.min(toEnroll.length, remaining);
    const skipped_capacity = Math.max(0, toEnroll.length - canInsert);
    const batch        = toEnroll.slice(0, canInsert);

    let inserted = 0;
    if (batch.length > 0) {
      await withTransaction(async client => {
        for (const s of batch) {
          await client.query(
            `INSERT INTO enrollments (student_id, section_id)
             VALUES ($1, $2)
             ON CONFLICT (student_id, section_id)
               DO UPDATE SET status = 'enrolled', updated_at = NOW()`,
            [s.user_id, section_id]
          );
          inserted++;
        }
        if (inserted > 0) {
          await client.query(
            'UPDATE sections SET enrolled = enrolled + $1 WHERE id = $2',
            [inserted, section_id]
          );
        }
      });
    }

    const updatedSec = await query(
      'SELECT enrolled, max_capacity FROM sections WHERE id = $1',
      [section_id]
    );

    res.json({
      success: true,
      data: {
        inserted,
        skipped_duplicates,
        skipped_capacity,
        total_matched: allRes.rows.length,
        enrolled:      updatedSec.rows[0].enrolled,
        max_capacity:  updatedSec.rows[0].max_capacity,
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /schedule/admin/student-departments?department_contains=Engineering
async function adminGetStudentDepartments(req, res, next) {
  try {
    const { department_contains } = req.query;
    const params = [];
    let sql = `SELECT DISTINCT department FROM users
               WHERE role = 'student' AND status = 'active'
                 AND department IS NOT NULL AND department != ''`;
    if (department_contains) {
      params.push(`%${department_contains}%`);
      sql += ` AND department ILIKE $1`;
    }
    sql += ' ORDER BY department';
    const result = await query(sql, params);
    res.json({ success: true, data: { departments: result.rows.map(r => r.department) } });
  } catch (error) {
    next(error);
  }
}

// DELETE /schedule/admin/sections/:sectionId/enrollments
async function adminRemoveAllEnrollments(req, res, next) {
  try {
    const { sectionId } = req.params;
    const secRes = await query(
      'SELECT id, enrolled FROM sections WHERE id = $1 AND is_active = TRUE',
      [sectionId]
    );
    if (!secRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    const countRes = await query(
      "SELECT COUNT(*) AS cnt FROM enrollments WHERE section_id = $1 AND status = 'enrolled'",
      [sectionId]
    );
    const removed = parseInt(countRes.rows[0].cnt, 10);

    if (removed > 0) {
      await withTransaction(async client => {
        await client.query(
          "UPDATE enrollments SET status = 'dropped', updated_at = NOW() WHERE section_id = $1 AND status = 'enrolled'",
          [sectionId]
        );
        await client.query(
          'UPDATE sections SET enrolled = 0 WHERE id = $1',
          [sectionId]
        );
      });
    }

    res.json({ success: true, data: { removed, enrolled: 0 } });
  } catch (error) {
    next(error);
  }
}

// ── Semester publish workflow ─────────────────────────────────

async function runSemesterMigration() {
  await query(`
    CREATE TABLE IF NOT EXISTS semesters (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      semester      VARCHAR(20) NOT NULL
                     CHECK (semester IN ('fall', 'spring', 'summer')),
      academic_year VARCHAR(20) NOT NULL,
      label         VARCHAR(50),
      status        VARCHAR(10) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (semester, academic_year)
    )
  `);

  await query(`
    ALTER TABLE semesters
      ADD COLUMN IF NOT EXISTS registration_start TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS registration_end   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS drop_deadline      TIMESTAMPTZ
  `);

  await query(`
    INSERT INTO semesters (semester, academic_year, label, status)
    SELECT DISTINCT
      semester::text,
      academic_year,
      CASE semester::text
        WHEN 'fall'   THEN 'Fall '
        WHEN 'spring' THEN 'Spring '
        WHEN 'summer' THEN 'Summer '
        ELSE semester || ' '
      END || academic_year,
      'draft'
    FROM sections
    WHERE semester IS NOT NULL AND academic_year IS NOT NULL
    ON CONFLICT (semester, academic_year) DO NOTHING
  `);
}

async function getMyTerms(req, res, next) {
  try {
    const result = await query(
      `SELECT
         sm.semester,
         sm.academic_year,
         sm.label,
         sm.status
       FROM enrollments e
       JOIN sections s ON s.id = e.section_id
       JOIN semesters sm
         ON sm.semester = s.semester::text AND sm.academic_year = s.academic_year
       WHERE e.student_id = $1
         AND e.status = 'enrolled'
         AND COALESCE(s.is_active, true) = true
         AND sm.status = 'published'
       GROUP BY sm.semester, sm.academic_year, sm.label, sm.status
       ORDER BY sm.academic_year DESC,
         CASE sm.semester
           WHEN 'summer' THEN 3
           WHEN 'spring' THEN 2
           WHEN 'fall'   THEN 1
           ELSE 0
         END DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { terms: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function listSemesters(req, res, next) {
  try {
    const result = await query(
      `SELECT id, semester, academic_year, label, status,
              registration_start, registration_end, drop_deadline,
              created_at, updated_at
       FROM semesters
       ORDER BY academic_year DESC,
         CASE semester
           WHEN 'summer' THEN 3
           WHEN 'spring' THEN 2
           WHEN 'fall'   THEN 1
           ELSE 0
         END DESC`
    );
    res.json({ success: true, data: { semesters: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function ensureSemesterRow(req, res, next) {
  try {
    const { semester, academic_year } = req.body;
    if (!semester || !academic_year) {
      return res.status(400).json({ success: false, message: 'semester and academic_year are required' });
    }
    const label = `${semester.charAt(0).toUpperCase() + semester.slice(1)} ${academic_year}`;
    const result = await query(
      `INSERT INTO semesters (semester, academic_year, label, status)
       VALUES ($1, $2, $3, 'draft')
       ON CONFLICT (semester, academic_year) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [semester, academic_year, label]
    );
    res.json({ success: true, data: { semester: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

async function publishSemester(req, res, next) {
  try {
    const { semester, academic_year } = req.body;
    if (!semester || !academic_year) {
      return res.status(400).json({ success: false, message: 'semester and academic_year are required' });
    }
    const label = `${semester.charAt(0).toUpperCase() + semester.slice(1)} ${academic_year}`;
    await query(
      `INSERT INTO semesters (semester, academic_year, label, status)
       VALUES ($1, $2, $3, 'draft')
       ON CONFLICT (semester, academic_year) DO NOTHING`,
      [semester, academic_year, label]
    );
    const result = await query(
      `UPDATE semesters SET status = 'published', updated_at = NOW()
       WHERE semester = $1 AND academic_year = $2
       RETURNING *`,
      [semester, academic_year]
    );
    res.json({ success: true, data: { semester: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

async function unpublishSemester(req, res, next) {
  try {
    const { semester, academic_year } = req.body;
    if (!semester || !academic_year) {
      return res.status(400).json({ success: false, message: 'semester and academic_year are required' });
    }
    const result = await query(
      `UPDATE semesters SET status = 'draft', updated_at = NOW()
       WHERE semester = $1 AND academic_year = $2
       RETURNING *`,
      [semester, academic_year]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Semester not found' });
    }
    res.json({ success: true, data: { semester: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

function deriveRegState(start, end, nowMs) {
  if (!start && !end) return 'unrestricted';
  if (start && nowMs < start) return 'not_open_yet';
  if (end && nowMs > end) return 'closed';
  return 'open';
}

function fmtNotifDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

async function createPeriodNotification(title, body, senderId) {
  const notifRes = await query(
    `INSERT INTO notifications (title, body, type, sender_id, target_role, is_published, published_at)
     VALUES ($1, $2, 'system', $3, 'student', TRUE, NOW())
     RETURNING id`,
    [title, body, senderId]
  );
  const notifId = notifRes.rows[0].id;
  await query(
    `INSERT INTO notification_receipts (notification_id, user_id)
     SELECT $1, id FROM users WHERE role = 'student' AND status = 'active'
     ON CONFLICT DO NOTHING`,
    [notifId]
  );
  return notifId;
}

async function setRegistrationPeriod(req, res, next) {
  try {
    const { semester, academic_year, registration_start, registration_end, drop_deadline } = req.body;

    if (!semester || !academic_year) {
      return res.status(400).json({ success: false, message: 'semester and academic_year are required.' });
    }
    if (registration_start && registration_end) {
      if (new Date(registration_start) >= new Date(registration_end)) {
        return res.status(400).json({ success: false, message: 'registration_start must be before registration_end.' });
      }
    }

    // Fetch old values before update for change detection
    const oldRes = await query(
      `SELECT registration_start, registration_end, drop_deadline, label, status
       FROM semesters WHERE semester = $1 AND academic_year = $2`,
      [semester, academic_year]
    );

    if (!oldRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Semester not found. Use ensure to create it first.' });
    }

    const old = oldRes.rows[0];

    const result = await query(
      `UPDATE semesters
       SET registration_start = $3,
           registration_end   = $4,
           drop_deadline      = $5,
           updated_at         = NOW()
       WHERE semester = $1 AND academic_year = $2
       RETURNING *`,
      [
        semester,
        academic_year,
        registration_start || null,
        registration_end   || null,
        drop_deadline      || null,
      ]
    );

    const updated = result.rows[0];

    // ── Change detection ─────────────────────────────────────────
    const toMs   = v => (v ? new Date(v).getTime() : null);
    const newStart = registration_start || null;
    const newEnd   = registration_end   || null;
    const newDrop  = drop_deadline      || null;

    const oldStartMs = toMs(old.registration_start);
    const oldEndMs   = toMs(old.registration_end);
    const oldDropMs  = toMs(old.drop_deadline);
    const newStartMs = toMs(newStart);
    const newEndMs   = toMs(newEnd);
    const newDropMs  = toMs(newDrop);

    const regChanged  = oldStartMs !== newStartMs || oldEndMs !== newEndMs;
    const dropChanged = oldDropMs  !== newDropMs;

    const label = old.label || `${semester} ${academic_year}`;
    const nowMs = Date.now();
    const notificationEvents = [];

    // ── Registration state notifications ─────────────────────────
    if (regChanged) {
      const oldState = deriveRegState(oldStartMs, oldEndMs, nowMs);
      const newState = deriveRegState(newStartMs, newEndMs, nowMs);
      if (oldState !== newState) {
        if (newState === 'open') {
          notificationEvents.push({
            title: 'Registration Open',
            body: `Registration is now open for ${label}.`,
          });
        } else if (newState === 'not_open_yet') {
          notificationEvents.push({
            title: 'Registration Scheduled',
            body: `Registration for ${label} will open on ${fmtNotifDate(newStart)}.`,
          });
        } else if (newState === 'closed') {
          notificationEvents.push({
            title: 'Registration Closed',
            body: `Registration is closed for ${label}.`,
          });
        } else {
          notificationEvents.push({
            title: 'Registration Period Updated',
            body: `Registration period restrictions were cleared for ${label}. Registration is open while the semester is published.`,
          });
        }
      }
    }

    // ── Drop deadline notifications ───────────────────────────────
    if (dropChanged) {
      if (!newDrop) {
        notificationEvents.push({
          title: 'Drop Deadline Removed',
          body: `The drop deadline for ${label} has been removed.`,
        });
      } else if (nowMs > newDropMs) {
        notificationEvents.push({
          title: 'Drop Deadline Passed',
          body: `The drop deadline for ${label} has passed.`,
        });
      } else {
        notificationEvents.push({
          title: 'Drop Deadline Updated',
          body: `Drop deadline for ${label} is ${fmtNotifDate(newDrop)}.`,
        });
      }
    }

    // ── Create notifications for all active students ──────────────
    for (const evt of notificationEvents) {
      await createPeriodNotification(evt.title, evt.body, req.user.id);
    }

    await logActivity({
      req,
      action:      'registration.period_update',
      entityType:  'semester',
      entityId:    `${semester}_${academic_year}`,
      entityLabel: label,
      description: `Updated registration period for ${label}`,
      metadata: {
        semester,
        academic_year,
        before: {
          registration_start: old.registration_start || null,
          registration_end:   old.registration_end   || null,
          drop_deadline:      old.drop_deadline       || null,
        },
        after: {
          registration_start: newStart,
          registration_end:   newEnd,
          drop_deadline:      newDrop,
        },
      },
    });

    res.json({
      success: true,
      data: { semester: updated },
      notifications_sent: notificationEvents.length,
      notification_events: notificationEvents.map(e => e.title),
    });
  } catch (error) {
    next(error);
  }
}

// ── Semester validation ───────────────────────────────────────

function dedupeConflicts(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const ids = [row.section_a_id, row.section_b_id].sort();
    const times = [
      `${row.a_start}-${row.a_end}`,
      `${row.b_start}-${row.b_end}`,
    ].sort().join('|');
    const key = `${ids[0]}|${ids[1]}|${row.conflict_day}|${times}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function validateSemester(req, res, next) {
  try {
    const { semester, academic_year, department_contains } = req.query;

    if (!semester || !academic_year) {
      return res.status(400).json({
        success: false,
        message: 'semester and academic_year are required',
      });
    }

    const dept = department_contains ? String(department_contains).trim() : null;
    const deptParams   = dept ? [semester, academic_year, `%${dept}%`] : [semester, academic_year];
    const deptClause   = dept ? `AND c.department ILIKE $3`  : '';
    const deptClauseC1 = dept ? `AND c1.department ILIKE $3` : '';

    const [
      totalResult,
      noInstructorResult,
      noRoomResult,
      noMeetingsResult,
      roomConflictResult,
      instructorConflictResult,
      overCapacityResult,
      zeroEnrolledResult,
      countMismatchResult,
    ] = await Promise.all([

      query(`
        SELECT COUNT(*)::int AS total
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.semester::text = $1 AND s.academic_year = $2 AND s.is_active = TRUE
        ${deptClause}
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.semester::text = $1 AND s.academic_year = $2
          AND s.is_active = TRUE AND s.instructor_id IS NULL
        ${deptClause}
        ORDER BY c.code, s.section_number
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.semester::text = $1 AND s.academic_year = $2
          AND s.is_active = TRUE
          AND s.room_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM section_meetings sm
            WHERE sm.section_id = s.id AND sm.room_id IS NOT NULL
          )
        ${deptClause}
        ORDER BY c.code, s.section_number
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN section_meetings sm ON sm.section_id = s.id
        WHERE s.semester::text = $1 AND s.academic_year = $2
          AND s.is_active = TRUE
        ${deptClause}
        GROUP BY s.id, c.code, s.section_number
        HAVING COUNT(sm.id) = 0
        ORDER BY c.code, s.section_number
      `, deptParams),

      query(`
        SELECT DISTINCT
          s1.id AS section_a_id, c1.code AS course_a, s1.section_number AS section_a_number,
          s2.id AS section_b_id, c2.code AS course_b, s2.section_number AS section_b_number,
          r.room_number,
          sm1.day_of_week AS conflict_day,
          sm1.start_time::text AS a_start, sm1.end_time::text AS a_end,
          sm2.start_time::text AS b_start, sm2.end_time::text AS b_end
        FROM sections s1
        JOIN courses c1 ON c1.id = s1.course_id
        JOIN section_meetings sm1 ON sm1.section_id = s1.id
        JOIN sections s2 ON s2.id != s1.id
          AND s2.semester::text = $1 AND s2.academic_year = $2
          AND s2.is_active = TRUE
        JOIN courses c2 ON c2.id = s2.course_id
        JOIN section_meetings sm2 ON sm2.section_id = s2.id
          AND sm2.day_of_week = sm1.day_of_week
          AND COALESCE(sm2.room_id, s2.room_id) = COALESCE(sm1.room_id, s1.room_id)
          AND sm1.start_time < sm2.end_time AND sm1.end_time > sm2.start_time
        JOIN rooms r ON r.id = COALESCE(sm1.room_id, s1.room_id)
        WHERE s1.semester::text = $1 AND s1.academic_year = $2
          AND s1.is_active = TRUE
          AND COALESCE(sm1.room_id, s1.room_id) IS NOT NULL
          AND COALESCE(sm2.room_id, s2.room_id) IS NOT NULL
        ${deptClauseC1}
        ORDER BY r.room_number, conflict_day, a_start
      `, deptParams),

      query(`
        SELECT DISTINCT
          s1.id AS section_a_id, c1.code AS course_a, s1.section_number AS section_a_number,
          s2.id AS section_b_id, c2.code AS course_b, s2.section_number AS section_b_number,
          CONCAT(COALESCE(i.title, ''), ' ', i.first_name, ' ', i.last_name) AS instructor_name,
          sm1.day_of_week AS conflict_day,
          sm1.start_time::text AS a_start, sm1.end_time::text AS a_end,
          sm2.start_time::text AS b_start, sm2.end_time::text AS b_end
        FROM sections s1
        JOIN courses c1 ON c1.id = s1.course_id
        JOIN instructors i ON i.id = s1.instructor_id
        JOIN section_meetings sm1 ON sm1.section_id = s1.id
        JOIN sections s2 ON s2.instructor_id = s1.instructor_id
          AND s2.id != s1.id
          AND s2.semester::text = $1 AND s2.academic_year = $2
          AND s2.is_active = TRUE
        JOIN courses c2 ON c2.id = s2.course_id
        JOIN section_meetings sm2 ON sm2.section_id = s2.id
          AND sm2.day_of_week = sm1.day_of_week
          AND sm1.start_time < sm2.end_time AND sm1.end_time > sm2.start_time
        WHERE s1.semester::text = $1 AND s1.academic_year = $2
          AND s1.is_active = TRUE AND s1.instructor_id IS NOT NULL
        ${deptClauseC1}
        ORDER BY instructor_name, conflict_day, a_start
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number,
               s.enrolled, s.max_capacity
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.semester::text = $1 AND s.academic_year = $2
          AND s.is_active = TRUE
          AND s.max_capacity IS NOT NULL AND s.enrolled > s.max_capacity
        ${deptClause}
        ORDER BY c.code, s.section_number
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        WHERE s.semester::text = $1 AND s.academic_year = $2
          AND s.is_active = TRUE AND s.enrolled = 0
        ${deptClause}
        ORDER BY c.code, s.section_number
      `, deptParams),

      query(`
        SELECT s.id AS section_id, c.code AS course_code, s.section_number,
               s.enrolled AS stored_count, COUNT(e.id)::int AS real_count
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN enrollments e ON e.section_id = s.id AND e.status = 'enrolled'
        WHERE s.semester::text = $1 AND s.academic_year = $2 AND s.is_active = TRUE
        ${deptClause}
        GROUP BY s.id, c.code, s.section_number
        HAVING s.enrolled != COUNT(e.id)
        ORDER BY c.code, s.section_number
      `, deptParams),
    ]);

    const roomConflicts       = dedupeConflicts(roomConflictResult.rows);
    const instructorConflicts = dedupeConflicts(instructorConflictResult.rows);

    const issues = [];

    if (noInstructorResult.rows.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'no_instructor',
        message: `${noInstructorResult.rows.length} section${noInstructorResult.rows.length !== 1 ? 's have' : ' has'} no instructor assigned`,
        sections: noInstructorResult.rows,
      });
    }
    if (noRoomResult.rows.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'no_room',
        message: `${noRoomResult.rows.length} section${noRoomResult.rows.length !== 1 ? 's have' : ' has'} no room assigned`,
        sections: noRoomResult.rows,
      });
    }
    if (noMeetingsResult.rows.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'no_meetings',
        message: `${noMeetingsResult.rows.length} section${noMeetingsResult.rows.length !== 1 ? 's have' : ' has'} no meeting times`,
        sections: noMeetingsResult.rows,
      });
    }
    if (roomConflicts.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'room_conflict',
        message: `${roomConflicts.length} room time conflict${roomConflicts.length !== 1 ? 's' : ''} found`,
        conflicts: roomConflicts,
      });
    }
    if (instructorConflicts.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'instructor_conflict',
        message: `${instructorConflicts.length} instructor time conflict${instructorConflicts.length !== 1 ? 's' : ''} found`,
        conflicts: instructorConflicts,
      });
    }
    if (countMismatchResult.rows.length > 0) {
      issues.push({
        severity: 'critical',
        type: 'count_mismatch',
        message: `${countMismatchResult.rows.length} section${countMismatchResult.rows.length !== 1 ? 's have' : ' has'} mismatched enrollment counts`,
        sections: countMismatchResult.rows,
      });
    }
    if (overCapacityResult.rows.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'over_capacity',
        message: `${overCapacityResult.rows.length} section${overCapacityResult.rows.length !== 1 ? 's are' : ' is'} over maximum capacity`,
        sections: overCapacityResult.rows,
      });
    }
    if (zeroEnrolledResult.rows.length > 0) {
      issues.push({
        severity: 'info',
        type: 'zero_enrolled',
        message: `${zeroEnrolledResult.rows.length} section${zeroEnrolledResult.rows.length !== 1 ? 's have' : ' has'} no enrolled students`,
        sections: zeroEnrolledResult.rows,
      });
    }

    const summary = { critical: 0, warning: 0, info: 0 };
    issues.forEach(issue => { summary[issue.severity] += 1; });

    res.json({
      success: true,
      data: {
        semester,
        academic_year,
        total_sections: totalResult.rows[0]?.total || 0,
        summary,
        issues,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  runSemesterMigration,
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
  adminGetEnrollments,
  adminSearchStudents,
  adminEnrollStudent,
  adminRemoveEnrollment,
  adminBulkEnroll,
  adminGetStudentDepartments,
  adminRemoveAllEnrollments,
  getMyTerms,
  listSemesters,
  getPublishedSemesters,
  ensureSemesterRow,
  publishSemester,
  unpublishSemester,
  setRegistrationPeriod,
  validateSemester,
};