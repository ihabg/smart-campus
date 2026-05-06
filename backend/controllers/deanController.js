const { query } = require('../config/db');

async function getDashboard(req, res, next) {
  try {
    const [deptResult, staffResult, studentResult, roomResult, courseResult] = await Promise.all([
      query(`SELECT ed.*, u.first_name || ' ' || u.last_name AS head_name
             FROM engineering_departments ed
             LEFT JOIN users u ON u.id = ed.head_id
             ORDER BY ed.name`),
      query(`SELECT role, COUNT(*) AS count FROM users
             WHERE role IN ('professor','lab_assistant','department_head','secretary','dean') AND status = 'active'
             GROUP BY role`),
      query(`SELECT COUNT(*) AS total FROM users WHERE role = 'student' AND status = 'active'`),
      query(`SELECT r.room_number, r.name, r.type, rs.is_occupied, rs.course_name, rs.instructor_name
             FROM rooms r
             LEFT JOIN room_status rs ON rs.room_id = r.id
             WHERE r.is_active = TRUE
             ORDER BY r.room_number LIMIT 20`),
      query(`SELECT COUNT(*) AS total FROM courses WHERE is_active = TRUE`),
    ]);

    const staffByRole = {};
    staffResult.rows.forEach(r => { staffByRole[r.role] = parseInt(r.count); });

    res.json({
      success: true,
      data: {
        departments:    deptResult.rows,
        staff_by_role:  staffByRole,
        total_students: parseInt(studentResult.rows[0]?.total || 0),
        total_courses:  parseInt(courseResult.rows[0]?.total || 0),
        room_statuses:  roomResult.rows,
      }
    });
  } catch (error) { next(error); }
}

async function getDepartments(req, res, next) {
  try {
    const result = await query(
      `SELECT ed.*,
              u.first_name || ' ' || u.last_name AS head_name, u.email AS head_email,
              (SELECT COUNT(*) FROM users p
               JOIN professor_departments pd ON pd.professor_id = p.id
               WHERE pd.department_id = ed.id AND p.role IN ('professor','lab_assistant')) AS staff_count,
              (SELECT COUNT(*) FROM courses c WHERE c.department = ed.code AND c.is_active = TRUE) AS course_count
       FROM engineering_departments ed
       LEFT JOIN users u ON u.id = ed.head_id
       ORDER BY ed.name`
    );
    res.json({ success:true, data:{ departments: result.rows } });
  } catch (error) { next(error); }
}

async function getFacultyStats(req, res, next) {
  try {
    const result = await query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'active') AS students,
         (SELECT COUNT(*) FROM users WHERE role = 'professor' AND status = 'active') AS professors,
         (SELECT COUNT(*) FROM users WHERE role = 'lab_assistant' AND status = 'active') AS lab_assistants,
         (SELECT COUNT(*) FROM users WHERE role = 'department_head' AND status = 'active') AS dept_heads,
         (SELECT COUNT(*) FROM rooms WHERE is_active = TRUE) AS total_rooms,
         (SELECT COUNT(*) FROM rooms r JOIN room_status rs ON rs.room_id = r.id WHERE rs.is_occupied = TRUE) AS occupied_rooms,
         (SELECT COUNT(*) FROM courses WHERE is_active = TRUE) AS courses,
         (SELECT COUNT(*) FROM sections WHERE is_active = TRUE) AS sections`
    );
    res.json({ success:true, data: result.rows[0] });
  } catch (error) { next(error); }
}

module.exports = { getDashboard, getDepartments, getFacultyStats };
