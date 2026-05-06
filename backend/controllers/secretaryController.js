const { query } = require('../config/db');

async function getDashboard(req, res, next) {
  try {
    const dept = req.user.department;

    const [studentsResult, pendingResult, sectionsResult] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM users WHERE role = 'student' AND status = 'active'`),
      query(`SELECT e.*, u.first_name, u.last_name, u.student_id, u.email,
                    c.code AS course_code, c.name AS course_name, s.section_number
             FROM enrollments e
             JOIN users u ON u.id = e.student_id
             JOIN sections s ON s.id = e.section_id
             JOIN courses c ON c.id = s.course_id
             WHERE e.status = 'pending'
             ORDER BY e.created_at DESC LIMIT 20`),
      query(`SELECT s.id, s.section_number, s.start_time, s.end_time, s.day_of_week, s.capacity,
                    c.code, c.name AS course_name,
                    u.first_name || ' ' || u.last_name AS instructor,
                    r.room_number,
                    COUNT(e.id) FILTER (WHERE e.status = 'enrolled') AS enrolled
             FROM sections s
             JOIN courses c ON c.id = s.course_id
             LEFT JOIN users u ON u.id = s.instructor_id
             LEFT JOIN rooms r ON r.id = s.room_id
             LEFT JOIN enrollments e ON e.section_id = s.id
             WHERE s.is_active = TRUE
             GROUP BY s.id, c.code, c.name, u.first_name, u.last_name, r.room_number
             ORDER BY c.code, s.section_number LIMIT 30`),
    ]);

    res.json({
      success: true,
      data: {
        total_students:   parseInt(studentsResult.rows[0]?.total || 0),
        pending_requests: pendingResult.rows,
        sections:         sectionsResult.rows,
      }
    });
  } catch (error) { next(error); }
}

async function enrollStudent(req, res, next) {
  try {
    const { student_id, section_id } = req.body;
    if (!student_id || !section_id)
      return res.status(400).json({ success:false, message:'student_id and section_id required' });

    const existing = await query(
      'SELECT id FROM enrollments WHERE student_id=$1 AND section_id=$2', [student_id, section_id]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ success:false, message:'Student already enrolled in this section' });

    await query(
      `INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
       VALUES ($1, $2, 'enrolled', NOW())`,
      [student_id, section_id]
    );
    res.json({ success:true, data:{ message:'Student enrolled successfully' } });
  } catch (error) { next(error); }
}

async function approveEnrollment(req, res, next) {
  try {
    const { enrollment_id } = req.params;
    await query(
      `UPDATE enrollments SET status = 'enrolled' WHERE id = $1`, [enrollment_id]
    );
    res.json({ success:true, data:{ message:'Enrollment approved' } });
  } catch (error) { next(error); }
}

async function getStudents(req, res, next) {
  try {
    const { q } = req.query;
    let sql = `SELECT u.id, u.student_id, u.first_name, u.last_name, u.email,
                      u.department, u.year_of_study, u.status
               FROM users u WHERE u.role = 'student'`;
    const params = [];
    if (q) {
      sql += ` AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1
                    OR u.student_id ILIKE $1 OR u.email ILIKE $1)`;
      params.push(`%${q}%`);
    }
    sql += ' ORDER BY u.last_name LIMIT 50';
    const result = await query(sql, params);
    res.json({ success:true, data:{ students: result.rows } });
  } catch (error) { next(error); }
}

module.exports = { getDashboard, enrollStudent, approveEnrollment, getStudents };
