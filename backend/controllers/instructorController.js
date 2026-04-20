const { query } = require('../config/db');

async function getAllInstructors(req, res, next) {
  try {
    const { department, search, page = 1, limit = 30 } = req.query;
    let sql = `
      SELECT i.*,
             r.room_number AS office_room_number, r.name AS office_room_name,
             f.floor_label AS office_floor, b.code AS office_building,
             COUNT(s.id) AS section_count
      FROM instructors i
      LEFT JOIN rooms    r ON r.id = i.office_room_id
      LEFT JOIN floors   f ON f.id = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      LEFT JOIN sections s ON s.instructor_id = i.id AND s.is_active = TRUE
      WHERE i.is_active = TRUE
    `;
    const params = [];
    let idx = 1;
    if (department) { params.push(department); sql += ` AND i.department = $${idx++}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (i.first_name ILIKE $${idx} OR i.last_name ILIKE $${idx} OR i.email ILIKE $${idx})`;
      idx++;
    }

    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total = parseInt(countResult.rows[0].count);

    sql += ` GROUP BY i.id, r.room_number, r.name, f.floor_label, b.code ORDER BY i.last_name, i.first_name LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));

    const result = await query(sql, params);
    res.json({ success: true, data: { instructors: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total/parseInt(limit)) } } });
  } catch (error) { next(error); }
}

async function getInstructorById(req, res, next) {
  try {
    const result = await query(
      `SELECT i.*, r.room_number AS office_room_number, f.floor_label, b.code AS building_code
       FROM instructors i
       LEFT JOIN rooms r ON r.id = i.office_room_id
       LEFT JOIN floors f ON f.id = r.floor_id
       LEFT JOIN buildings b ON b.id = f.building_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Instructor not found.' });

    const sections = await query(
      `SELECT s.*, c.code AS course_code, c.name AS course_name
       FROM sections s JOIN courses c ON c.id = s.course_id
       WHERE s.instructor_id = $1 AND s.is_active = TRUE`,
      [req.params.id]
    );
    res.json({ success: true, data: { instructor: result.rows[0], sections: sections.rows } });
  } catch (error) { next(error); }
}

async function createInstructor(req, res, next) {
  try {
    const { title, first_name, last_name, email, department, office_room_id } = req.body;
    const result = await query(
      `INSERT INTO instructors (title, first_name, last_name, email, department, office_room_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title||null, first_name, last_name, email||null, department||null, office_room_id||null]
    );
    res.status(201).json({ success: true, data: { instructor: result.rows[0] } });
  } catch (error) { next(error); }
}

async function updateInstructor(req, res, next) {
  try {
    const { id } = req.params;
    const { title, first_name, last_name, email, department, office_room_id, is_active } = req.body;
    const fields = [], values = [];
    let idx = 1;
    if (title          !== undefined) { fields.push(`title=$${idx++}`);          values.push(title); }
    if (first_name     !== undefined) { fields.push(`first_name=$${idx++}`);     values.push(first_name); }
    if (last_name      !== undefined) { fields.push(`last_name=$${idx++}`);      values.push(last_name); }
    if (email          !== undefined) { fields.push(`email=$${idx++}`);          values.push(email); }
    if (department     !== undefined) { fields.push(`department=$${idx++}`);     values.push(department); }
    if (office_room_id !== undefined) { fields.push(`office_room_id=$${idx++}`); values.push(office_room_id || null); }
    if (is_active      !== undefined) { fields.push(`is_active=$${idx++}`);      values.push(is_active); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update.' });
    values.push(id);
    const result = await query(`UPDATE instructors SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`, values);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Instructor not found.' });
    res.json({ success: true, data: { instructor: result.rows[0] } });
  } catch (error) { next(error); }
}

async function deleteInstructor(req, res, next) {
  try {
    const result = await query('DELETE FROM instructors WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Instructor not found.' });
    res.json({ success: true, message: 'Instructor deleted.' });
  } catch (error) { next(error); }
}

module.exports = { getAllInstructors, getInstructorById, createInstructor, updateInstructor, deleteInstructor };
