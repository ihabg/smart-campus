const { query } = require('../config/db');

function toPositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

async function getAllInstructors(req, res, next) {
  try {
    const {
      department,
      search,
      page = 1,
      limit = 30,
      active_only = 'true'
    } = req.query;

    const currentPage = toPositiveInt(page, 1);
    const pageLimit = toPositiveInt(limit, 30);
    const offset = (currentPage - 1) * pageLimit;

    const where = [];
    const params = [];
    let idx = 1;

    if (active_only === 'true') {
      where.push('i.is_active = TRUE');
    }

    if (department) {
      params.push(department);
      where.push(`i.department = $${idx++}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`
        (
          i.first_name ILIKE $${idx}
          OR i.last_name ILIKE $${idx}
          OR i.email ILIKE $${idx}
          OR i.department ILIKE $${idx}
          OR CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) ILIKE $${idx}
          OR i.doctor_number::text ILIKE $${idx}
        )
      `);
      idx++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM instructors i
      ${whereSql}
      `,
      params
    );

    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `
      SELECT
        i.id,
        i.title,
        i.first_name,
        i.last_name,
        i.email,
        i.department,
        i.doctor_number,
        i.office_room_id,
        i.is_active,
        i.created_at,
        i.updated_at,

        r.room_number AS office_room_number,
        r.name AS office_room_name,

        f.id AS office_floor_id,
        f.floor_label AS office_floor,

        b.code AS office_building,
        b.name AS office_building_name,

        COUNT(s.id)::int AS section_count
      FROM instructors i
      LEFT JOIN rooms r
        ON r.id = i.office_room_id
      LEFT JOIN floors f
        ON f.id = r.floor_id
      LEFT JOIN buildings b
        ON b.id = f.building_id
      LEFT JOIN sections s
        ON s.instructor_id = i.id
       AND s.is_active = TRUE
      ${whereSql}
      GROUP BY
        i.id,
        r.room_number,
        r.name,
        f.id,
        f.floor_label,
        b.code,
        b.name
      ORDER BY i.last_name, i.first_name
      LIMIT $${idx++}
      OFFSET $${idx++}
      `,
      [...params, pageLimit, offset]
    );

    res.json({
      success: true,
      data: {
        instructors: result.rows,
        pagination: {
          total,
          page: currentPage,
          limit: pageLimit,
          totalPages: Math.ceil(total / pageLimit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getInstructorById(req, res, next) {
  try {
    const { id } = req.params;

    const instructorResult = await query(
      `
      SELECT
        i.*,
        r.room_number AS office_room_number,
        r.name AS office_room_name,
        f.floor_label,
        b.code AS building_code,
        b.name AS building_name
      FROM instructors i
      LEFT JOIN rooms r
        ON r.id = i.office_room_id
      LEFT JOIN floors f
        ON f.id = r.floor_id
      LEFT JOIN buildings b
        ON b.id = f.building_id
      WHERE i.id = $1
      `,
      [id]
    );

    if (!instructorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Instructor not found.'
      });
    }

    const sectionsResult = await query(
      `
      SELECT
        s.*,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        r.room_number
      FROM sections s
      JOIN courses c
        ON c.id = s.course_id
      LEFT JOIN rooms r
        ON r.id = s.room_id
      WHERE s.instructor_id = $1
        AND s.is_active = TRUE
      ORDER BY s.academic_year DESC, s.semester, c.code
      `,
      [id]
    );

    res.json({
      success: true,
      data: {
        instructor: instructorResult.rows[0],
        sections: sectionsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createInstructor(req, res, next) {
  try {
    const {
      title,
      first_name,
      last_name,
      email,
      department,
      office_room_id
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO instructors (
        title,
        first_name,
        last_name,
        email,
        department,
        office_room_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        title || null,
        first_name.trim(),
        last_name.trim(),
        email || null,
        department || null,
        office_room_id || null
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        instructor: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateInstructor(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      'title',
      'first_name',
      'last_name',
      'email',
      'department',
      'office_room_id',
      'is_active'
    ];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);

        if (key === 'office_room_id') {
          values.push(req.body[key] || null);
        } else {
          values.push(req.body[key]);
        }
      }
    }

    if (!fields.length) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update.'
      });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `
      UPDATE instructors
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Instructor not found.'
      });
    }

    res.json({
      success: true,
      data: {
        instructor: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

async function deleteInstructor(req, res, next) {
  try {
    const { id } = req.params;

    const used = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM sections
      WHERE instructor_id = $1
      `,
      [id]
    );

    if (used.rows[0].count > 0) {
      const result = await query(
        `
        UPDATE instructors
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
        `,
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Instructor not found.'
        });
      }

      return res.json({
        success: true,
        message: 'Instructor is used by sections, so it was deactivated instead of deleted.'
      });
    }

    const result = await query(
      `
      DELETE FROM instructors
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Instructor not found.'
      });
    }

    res.json({
      success: true,
      message: 'Instructor deleted.'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllInstructors,
  getInstructorById,
  createInstructor,
  updateInstructor,
  deleteInstructor
};