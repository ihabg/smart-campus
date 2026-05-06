const { query } = require('../config/db');

async function getDashboard(req, res, next) {
  try {
    const userId = req.user.id;

    // Get assigned lab room
    const labResult = await query(
      `SELECT u.lab_room_id, r.room_number, r.name, r.type, r.capacity,
              f.floor_label, b.code AS building,
              rs.is_occupied, rs.course_name, rs.instructor_name,
              rs.started_at, rs.ends_at, rs.note
       FROM users u
       LEFT JOIN rooms r ON r.id = u.lab_room_id
       LEFT JOIN floors f ON f.id = r.floor_id
       LEFT JOIN buildings b ON b.id = f.building_id
       LEFT JOIN room_status rs ON rs.room_id = u.lab_room_id
       WHERE u.id = $1`,
      [userId]
    );

    // Today's lab schedule
    const day = new Date().getDay();
    const scheduleResult = await query(
      `SELECT s.start_time, s.end_time, c.code, c.name AS course_name,
              u2.first_name || ' ' || u2.last_name AS instructor,
              COUNT(e.id) FILTER (WHERE e.status = 'enrolled') AS enrolled
       FROM sections s
       JOIN courses c ON c.id = s.course_id
       LEFT JOIN users u2 ON u2.id = s.instructor_id
       LEFT JOIN enrollments e ON e.section_id = s.id
       WHERE s.room_id = (SELECT lab_room_id FROM users WHERE id = $1)
         AND $2 = ANY(s.day_of_week) AND s.is_active = TRUE
       GROUP BY s.id, c.code, c.name, u2.first_name, u2.last_name
       ORDER BY s.start_time`,
      [userId, day]
    );

    res.json({
      success: true,
      data: {
        lab:            labResult.rows[0] || null,
        today_schedule: scheduleResult.rows,
      }
    });
  } catch (error) { next(error); }
}

async function updateLabStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const { is_occupied, course_name, instructor_name, ends_at, note } = req.body;

    // Get lab room id
    const labResult = await query(
      'SELECT lab_room_id FROM users WHERE id = $1', [userId]
    );
    const labRoomId = labResult.rows[0]?.lab_room_id;
    if (!labRoomId)
      return res.status(400).json({ success:false, message:'No lab room assigned to you' });

    await query(
      `INSERT INTO room_status
         (room_id, is_occupied, occupied_by, course_name, instructor_name, started_at, ends_at, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, NOW())
       ON CONFLICT (room_id) DO UPDATE SET
         is_occupied = $2, occupied_by = $3, course_name = $4,
         instructor_name = $5, started_at = CASE WHEN $2 = TRUE THEN NOW() ELSE NULL END,
         ends_at = $6, note = $7, updated_at = NOW()`,
      [labRoomId, is_occupied, userId,
       course_name || null, instructor_name || null,
       ends_at || null, note || null]
    );

    res.json({ success:true, data:{ message:'Lab status updated', is_occupied } });
  } catch (error) { next(error); }
}

module.exports = { getDashboard, updateLabStatus };
