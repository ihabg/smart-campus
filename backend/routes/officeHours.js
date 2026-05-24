const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');

router.get('/:email', protect, async (req, res, next) => {
  try {
    const email = String(req.params.email || '').trim().toLowerCase();
    const { semester, academic_year } = req.query;

    const instructorRes = await query(
      `
      SELECT
        id,
        title,
        first_name,
        last_name,
        email,
        department
      FROM instructors
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (!instructorRes.rows.length) {
      return res.json({
        success: true,
        data: { instructor: null, schedule: [], office_hours: [] }
      });
    }

    const instructor = instructorRes.rows[0];

    // Teaching schedule — filtered by the requested semester/year.
    // If caller omits semester or academic_year, return no schedule rows
    // (office hours are always returned regardless).
    let scheduleRows = [];
    if (semester && academic_year) {
      const scheduleRes = await query(
        `
        SELECT
          s.id AS section_id,
          s.section_number,
          c.code AS course_code,
          c.name AS course_name,
          COALESCE(c.name_ar, c.name) AS course_name_ar,
          COALESCE(sm.day_of_week, d.day_value) AS day_of_week,
          COALESCE(sm.start_time, s.start_time)  AS start_time,
          COALESCE(sm.end_time,   s.end_time)    AS end_time,
          COALESCE(sm.meeting_type, 'lecture')   AS meeting_type,
          sm.note,
          r.room_number
        FROM sections s
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN section_meetings sm ON sm.section_id = s.id
        LEFT JOIN LATERAL unnest(s.day_of_week) AS d(day_value)
          ON sm.id IS NULL
        LEFT JOIN rooms r ON r.id = COALESCE(sm.room_id, s.room_id)
        WHERE s.instructor_id  = $1
          AND s.is_active      = TRUE
          AND s.semester::text = $2
          AND s.academic_year  = $3
        ORDER BY
          COALESCE(sm.day_of_week, d.day_value),
          COALESCE(sm.start_time, s.start_time),
          c.code
        `,
        [instructor.id, semester, academic_year]
      );
      scheduleRows = scheduleRes.rows;
    }

    // Office hours are not semester-specific — always returned
    const officeRes = await query(
      `
      SELECT
        id,
        day_of_week,
        start_time,
        end_time,
        office_room,
        note
      FROM office_hours
      WHERE instructor_id = $1
        AND is_active = TRUE
      ORDER BY day_of_week, start_time
      `,
      [instructor.id]
    );

    return res.json({
      success: true,
      data: {
        instructor,
        schedule: scheduleRows,
        office_hours: officeRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
