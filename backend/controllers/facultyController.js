const { query } = require('../config/db');

// ── GET /api/faculty?department=Computer+Engineering ─────────
async function getFaculty(req, res, next) {
  try {
    const { department, search } = req.query;

    let sql = `
      SELECT
        fm.id, fm.full_name, fm.full_name_ar, fm.academic_title,
        fm.email, fm.department, fm.specialization,
        fm.office, fm.image_url, fm.is_active,
        r.room_number AS office_room,
        f.floor_label AS office_floor
      FROM faculty_members fm
      LEFT JOIN rooms r ON r.id = fm.office_room_id
      LEFT JOIN floors f ON f.id = r.floor_id
      WHERE fm.is_active = TRUE
    `;
    const params = [];

    if (department) {
      params.push(department);
      sql += ` AND fm.department ILIKE $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (
        fm.full_name    ILIKE $${params.length} OR
        fm.full_name_ar ILIKE $${params.length} OR
        fm.email        ILIKE $${params.length} OR
        fm.specialization ILIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY fm.full_name';

    const result = await query(sql, params);
    res.json({ success: true, data: { faculty: result.rows, total: result.rows.length } });
  } catch (error) { next(error); }
}

// ── GET /api/faculty/:id ──────────────────────────────────────
async function getFacultyById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT fm.*, r.room_number AS office_room, f.floor_label AS office_floor
       FROM faculty_members fm
       LEFT JOIN rooms r ON r.id = fm.office_room_id
       LEFT JOIN floors f ON f.id = r.floor_id
       WHERE fm.id = $1`,
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: 'Faculty member not found' });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
}

// ── GET /api/faculty/departments ─────────────────────────────
async function getDepartments(req, res, next) {
  try {
    const result = await query(
      `SELECT department, COUNT(*) AS faculty_count
       FROM faculty_members WHERE is_active = TRUE
       GROUP BY department ORDER BY department`
    );
    res.json({ success: true, data: { departments: result.rows } });
  } catch (error) { next(error); }
}

module.exports = { getFaculty, getFacultyById, getDepartments };
