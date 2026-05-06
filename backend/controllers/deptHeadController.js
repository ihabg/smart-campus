const { query } = require('../config/db');

async function getDashboard(req, res, next) {
  try {
    const userId = req.user.id;
    const dept = req.user.department;

    const [profResult, courseResult, sectionResult, enrollResult] = await Promise.all([
      query(`SELECT u.id, u.first_name, u.last_name, u.email, u.academic_title,
                    u.specialization, u.is_available, u.availability_note,
                    r.room_number AS office
             FROM users u
             LEFT JOIN rooms r ON r.id = u.office_room_id
             WHERE u.department = $1 AND u.role IN ('professor','lab_assistant') AND u.status = 'active'
             ORDER BY u.last_name`, [dept]),
      query(`SELECT c.*, COUNT(s.id) AS section_count
             FROM courses c LEFT JOIN sections s ON s.course_id = c.id AND s.is_active = TRUE
             WHERE c.department = $1 AND c.is_active = TRUE
             GROUP BY c.id ORDER BY c.code`, [dept]),
      query(`SELECT s.id, s.section_number, s.start_time, s.end_time, s.day_of_week,
                    c.code, c.name AS course_name,
                    u.first_name || ' ' || u.last_name AS instructor_name,
                    r.room_number,
                    COUNT(e.id) FILTER (WHERE e.status = 'enrolled') AS enrolled
             FROM sections s
             JOIN courses c ON c.id = s.course_id
             LEFT JOIN users u ON u.id = s.instructor_id
             LEFT JOIN rooms r ON r.id = s.room_id
             LEFT JOIN enrollments e ON e.section_id = s.id
             WHERE c.department = $1 AND s.is_active = TRUE
             GROUP BY s.id, c.code, c.name, u.first_name, u.last_name, r.room_number
             ORDER BY s.start_time`, [dept]),
      query(`SELECT COUNT(DISTINCT e.student_id) AS total_students
             FROM enrollments e JOIN sections s ON s.id = e.section_id
             JOIN courses c ON c.id = s.course_id
             WHERE c.department = $1 AND e.status = 'enrolled'`, [dept]),
    ]);

    res.json({
      success: true,
      data: {
        department: dept,
        professors: profResult.rows,
        courses:    courseResult.rows,
        sections:   sectionResult.rows,
        stats: {
          total_professors: profResult.rows.filter(p=>p.role!=='lab_assistant').length,
          total_courses:    courseResult.rows.length,
          total_sections:   sectionResult.rows.length,
          total_students:   parseInt(enrollResult.rows[0]?.total_students || 0),
        }
      }
    });
  } catch (error) { next(error); }
}

async function assignProfessor(req, res, next) {
  try {
    const { section_id, professor_id } = req.body;
    if (!section_id || !professor_id)
      return res.status(400).json({ success:false, message:'section_id and professor_id required' });

    await query(
      'UPDATE sections SET instructor_id = $1 WHERE id = $2',
      [professor_id, section_id]
    );
    res.json({ success:true, data:{ message:'Professor assigned to section' } });
  } catch (error) { next(error); }
}

async function getProfessors(req, res, next) {
  try {
    const dept = req.user.department;
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.academic_title,
              u.specialization, u.role, u.is_available,
              r.room_number AS office, f.floor_label
       FROM users u
       LEFT JOIN rooms r ON r.id = u.office_room_id
       LEFT JOIN floors f ON f.id = r.floor_id
       WHERE u.department = $1 AND u.role IN ('professor','lab_assistant') AND u.status = 'active'
       ORDER BY u.last_name`,
      [dept]
    );
    res.json({ success:true, data:{ professors: result.rows } });
  } catch (error) { next(error); }
}

module.exports = { getDashboard, assignProfessor, getProfessors };
