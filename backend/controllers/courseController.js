// ─── courseController.js ─────────────────────────────────────
const { query } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

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
    } else if (active_only === 'false') {
      where.push('c.is_active = FALSE');
    }
    // 'all' or any other value: no filter (show all)

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
      SELECT (
        (SELECT COUNT(*)::int FROM sections           WHERE course_id = $1) +
        (SELECT COUNT(*)::int FROM study_plan_courses WHERE course_id = $1)
      ) AS count
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
        message: 'Course is used by sections or study plans and was deactivated instead of deleted.'
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

// ─── Prerequisite management ─────────────────────────────────

async function getCoursePrerequisites(req, res, next) {
  try {
    const { id } = req.params;

    const courseCheck = await query('SELECT id FROM courses WHERE id = $1', [id]);
    if (!courseCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const result = await query(
      `SELECT cp.is_concurrent,
              c.id   AS prerequisite_id,
              c.code, c.name, c.name_ar, c.credit_hours
       FROM course_prerequisites cp
       JOIN courses c ON c.id = cp.prerequisite_id
       WHERE cp.course_id = $1
       ORDER BY c.code`,
      [id]
    );

    res.json({ success: true, data: { prerequisites: result.rows } });
  } catch (error) {
    next(error);
  }
}

async function addCoursePrerequisite(req, res, next) {
  try {
    const { id } = req.params;
    const { prerequisite_id, is_concurrent = false } = req.body;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!prerequisite_id || !UUID_RE.test(String(prerequisite_id))) {
      return res.status(400).json({ success: false, message: 'prerequisite_id must be a valid UUID.' });
    }

    if (id === prerequisite_id) {
      return res.status(400).json({ success: false, message: 'A course cannot be its own prerequisite.' });
    }

    const [courseRes, prereqRes] = await Promise.all([
      query('SELECT id, code FROM courses WHERE id = $1', [id]),
      query('SELECT id, code, name FROM courses WHERE id = $1', [prerequisite_id]),
    ]);

    if (!courseRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }
    if (!prereqRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Prerequisite course not found.' });
    }

    const existing = await query(
      'SELECT 1 FROM course_prerequisites WHERE course_id = $1 AND prerequisite_id = $2',
      [id, prerequisite_id]
    );
    if (existing.rows.length) {
      return res.status(409).json({
        success: false,
        message: `${prereqRes.rows[0].code} is already a prerequisite of this course.`,
      });
    }

    // Cycle detection: check if prerequisite_id already (transitively) requires id
    const cycleRes = await query(
      `WITH RECURSIVE chain AS (
         SELECT prerequisite_id AS node
         FROM course_prerequisites WHERE course_id = $1
         UNION
         SELECT cp.prerequisite_id
         FROM course_prerequisites cp
         JOIN chain c ON cp.course_id = c.node
       )
       SELECT 1 FROM chain WHERE node = $2 LIMIT 1`,
      [prerequisite_id, id]
    );
    if (cycleRes.rows.length) {
      return res.status(409).json({
        success: false,
        message: `Adding ${prereqRes.rows[0].code} as a prerequisite would create a circular dependency.`,
      });
    }

    await query(
      'INSERT INTO course_prerequisites (course_id, prerequisite_id, is_concurrent) VALUES ($1, $2, $3)',
      [id, prerequisite_id, !!is_concurrent]
    );

    const updated = await query(
      `SELECT cp.is_concurrent, c.id AS prerequisite_id, c.code, c.name, c.name_ar, c.credit_hours
       FROM course_prerequisites cp
       JOIN courses c ON c.id = cp.prerequisite_id
       WHERE cp.course_id = $1 ORDER BY c.code`,
      [id]
    );

    const courseCode = courseRes.rows[0].code;
    const prereqCode = prereqRes.rows[0].code;
    await logActivity({
      req,
      action:      'prerequisite.add',
      entityType:  'prerequisite',
      entityId:    id,
      entityLabel: `${courseCode} ← ${prereqCode}`,
      description: `Added ${prereqCode} as prerequisite of ${courseCode}`,
      metadata: {
        course_id:       id,
        course_code:     courseCode,
        prerequisite_id,
        prerequisite_code: prereqCode,
        is_concurrent:   !!is_concurrent,
      },
    });

    res.status(201).json({
      success: true,
      message: `${prereqRes.rows[0].code} added as prerequisite.`,
      data: { prerequisites: updated.rows },
    });
  } catch (error) {
    next(error);
  }
}

async function updateCoursePrerequisite(req, res, next) {
  try {
    const { id, prerequisiteId } = req.params;
    const { is_concurrent } = req.body;

    if (is_concurrent === undefined || is_concurrent === null) {
      return res.status(400).json({ success: false, message: 'is_concurrent is required.' });
    }

    const result = await query(
      `UPDATE course_prerequisites
       SET is_concurrent = $1
       WHERE course_id = $2 AND prerequisite_id = $3
       RETURNING *`,
      [!!is_concurrent, id, prerequisiteId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Prerequisite relationship not found.' });
    }

    res.json({ success: true, message: 'Prerequisite updated.', data: { prerequisite: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

async function removeCoursePrerequisite(req, res, next) {
  try {
    const { id, prerequisiteId } = req.params;

    // Fetch course codes for the activity log (non-critical)
    let courseCode = id, prereqCode = prerequisiteId;
    try {
      const [c1, c2] = await Promise.all([
        query('SELECT code FROM courses WHERE id = $1', [id]),
        query('SELECT code FROM courses WHERE id = $1', [prerequisiteId]),
      ]);
      courseCode = c1.rows[0]?.code || id;
      prereqCode = c2.rows[0]?.code || prerequisiteId;
    } catch (_) {}

    const result = await query(
      `DELETE FROM course_prerequisites
       WHERE course_id = $1 AND prerequisite_id = $2
       RETURNING prerequisite_id`,
      [id, prerequisiteId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Prerequisite relationship not found.' });
    }

    await logActivity({
      req,
      action:      'prerequisite.remove',
      entityType:  'prerequisite',
      entityId:    id,
      entityLabel: `${courseCode} ← ${prereqCode}`,
      description: `Removed ${prereqCode} from prerequisites of ${courseCode}`,
      metadata: {
        course_id:         id,
        course_code:       courseCode,
        prerequisite_id:   prerequisiteId,
        prerequisite_code: prereqCode,
      },
    });

    res.json({ success: true, message: 'Prerequisite removed.' });
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
  getDepartments,
  getCoursePrerequisites,
  addCoursePrerequisite,
  updateCoursePrerequisite,
  removeCoursePrerequisite,
};