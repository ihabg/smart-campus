// ─── courseController.js ─────────────────────────────────────
const { query } = require('../config/db');

async function getAllCourses(req, res, next) {
  try {
    const { department, search, page = 1, limit = 30 } = req.query;
    let sql = `SELECT c.*,
                 COUNT(s.id) AS section_count
               FROM courses c
               LEFT JOIN sections s ON s.course_id = c.id AND s.is_active = TRUE
               WHERE c.is_active = TRUE`;
    const params = [];
    let idx = 1;
    if (department) { params.push(department); sql += ` AND c.department = $${idx++}`; }
    if (search)     { params.push(`%${search}%`); sql += ` AND (c.name ILIKE $${idx} OR c.code ILIKE $${idx})`; idx++; }

    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    sql += ` GROUP BY c.id ORDER BY c.code LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);
    res.json({ success: true, data: { courses: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } } });
  } catch (error) { next(error); }
}

async function getCourseById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM courses WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: { course: result.rows[0] } });
  } catch (error) { next(error); }
}

async function createCourse(req, res, next) {
  try {
    const { code, name, name_ar, department, credit_hours, description } = req.body;
    const result = await query(
      `INSERT INTO courses (code, name, name_ar, department, credit_hours, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, name, name_ar || null, department, credit_hours || null, description || null]
    );
    res.status(201).json({ success: true, data: { course: result.rows[0] } });
  } catch (error) { next(error); }
}

async function updateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const { name, name_ar, department, credit_hours, description, is_active } = req.body;
    const fields = [], values = [];
    let idx = 1;
    if (name         !== undefined) { fields.push(`name=$${idx++}`);         values.push(name); }
    if (name_ar      !== undefined) { fields.push(`name_ar=$${idx++}`);      values.push(name_ar); }
    if (department   !== undefined) { fields.push(`department=$${idx++}`);   values.push(department); }
    if (credit_hours !== undefined) { fields.push(`credit_hours=$${idx++}`); values.push(credit_hours); }
    if (description  !== undefined) { fields.push(`description=$${idx++}`);  values.push(description); }
    if (is_active    !== undefined) { fields.push(`is_active=$${idx++}`);    values.push(is_active); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update.' });
    values.push(id);
    const result = await query(`UPDATE courses SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`, values);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: { course: result.rows[0] } });
  } catch (error) { next(error); }
}

async function deleteCourse(req, res, next) {
  try {
    const result = await query('DELETE FROM courses WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, message: 'Course deleted.' });
  } catch (error) { next(error); }
}

async function getDepartments(req, res, next) {
  try {
    const result = await query('SELECT DISTINCT department FROM courses WHERE is_active = TRUE ORDER BY department');
    res.json({ success: true, data: { departments: result.rows.map(r => r.department) } });
  } catch (error) { next(error); }
}

module.exports = { getAllCourses, getCourseById, createCourse, updateCourse, deleteCourse, getDepartments };
