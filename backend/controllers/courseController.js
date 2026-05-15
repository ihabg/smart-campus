// ─── courseController.js ─────────────────────────────────────
const { query } = require('../config/db');

function toPositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

async function getAllCourses(req, res, next) {
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
      where.push('c.is_active = TRUE');
    }

    if (department) {
      params.push(department);
      where.push(`c.department = $${idx++}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`
        (
          c.code ILIKE $${idx}
          OR c.name ILIKE $${idx}
          OR c.name_ar ILIKE $${idx}
          OR c.department ILIKE $${idx}
        )
      `);
      idx++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM courses c
      ${whereSql}
      `,
      params
    );

    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `
      SELECT
        c.id,
        c.code,
        c.name,
        c.name_ar,
        c.department,
        c.credit_hours,
        c.description,
        c.is_active,
        c.created_at,
        c.updated_at,
        COUNT(s.id)::int AS section_count
      FROM courses c
      LEFT JOIN sections s
        ON s.course_id = c.id
       AND s.is_active = TRUE
      ${whereSql}
      GROUP BY c.id
      ORDER BY c.code
      LIMIT $${idx++}
      OFFSET $${idx++}
      `,
      [...params, pageLimit, offset]
    );

    res.json({
      success: true,
      data: {
        courses: result.rows,
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

async function getCourseById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        c.*,
        COUNT(s.id)::int AS section_count
      FROM courses c
      LEFT JOIN sections s
        ON s.course_id = c.id
       AND s.is_active = TRUE
      WHERE c.id = $1
      GROUP BY c.id
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    res.json({
      success: true,
      data: {
        course: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createCourse(req, res, next) {
  try {
    const {
      code,
      name,
      name_ar,
      department,
      credit_hours,
      description
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Course code and name are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO courses (
        code,
        name,
        name_ar,
        department,
        credit_hours,
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        code.trim(),
        name.trim(),
        name_ar || null,
        department || null,
        credit_hours !== undefined && credit_hours !== ''
          ? Number(credit_hours)
          : null,
        description || null
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        course: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateCourse(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      'code',
      'name',
      'name_ar',
      'department',
      'credit_hours',
      'description',
      'is_active'
    ];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);

        if (key === 'credit_hours') {
          values.push(
            req.body[key] !== '' && req.body[key] !== null
              ? Number(req.body[key])
              : null
          );
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
      UPDATE courses
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    res.json({
      success: true,
      data: {
        course: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCourse(req, res, next) {
  try {
    const { id } = req.params;

    const used = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM sections
      WHERE course_id = $1
      `,
      [id]
    );

    if (used.rows[0].count > 0) {
      const result = await query(
        `
        UPDATE courses
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
          message: 'Course not found.'
        });
      }

      return res.json({
        success: true,
        message: 'Course is used by sections, so it was deactivated instead of deleted.'
      });
    }

    const result = await query(
      `
      DELETE FROM courses
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found.'
      });
    }

    res.json({
      success: true,
      message: 'Course deleted.'
    });
  } catch (error) {
    next(error);
  }
}

async function getDepartments(req, res, next) {
  try {
    const result = await query(
      `
      SELECT DISTINCT department
      FROM courses
      WHERE is_active = TRUE
        AND department IS NOT NULL
        AND department <> ''
      ORDER BY department
      `
    );

    res.json({
      success: true,
      data: {
        departments: result.rows.map((row) => row.department)
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getDepartments
};