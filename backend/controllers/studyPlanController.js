const { query } = require('../config/db');

// ── List all study plans ──────────────────────────────────────
async function listPlans(req, res, next) {
  try {
    const result = await query(`
      SELECT
        sp.id,
        sp.plan_year,
        sp.label,
        sp.created_at,
        sp.updated_at,
        d.id      AS department_id,
        d.code    AS department_code,
        d.name_en AS department_name,
        (SELECT COUNT(*)::int FROM study_plan_courses WHERE plan_id = sp.id) AS course_count
      FROM study_plans sp
      JOIN departments d ON d.id = sp.department_id
      ORDER BY d.name_en ASC, sp.plan_year DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// ── List active departments (for dropdowns) ───────────────────
async function getDepartments(req, res, next) {
  try {
    const result = await query(`
      SELECT id, code, name_en, name_ar
      FROM departments
      WHERE is_active = true
      ORDER BY name_en
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// ── Get a single plan with all its courses ────────────────────
async function getPlan(req, res, next) {
  try {
    const { id } = req.params;

    const planRes = await query(`
      SELECT
        sp.id,
        sp.plan_year,
        sp.label,
        sp.created_at,
        sp.updated_at,
        d.id      AS department_id,
        d.code    AS department_code,
        d.name_en AS department_name,
        d.name_ar AS department_name_ar
      FROM study_plans sp
      JOIN departments d ON d.id = sp.department_id
      WHERE sp.id = $1
    `, [id]);

    if (!planRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }

    const coursesRes = await query(`
      SELECT
        spc.id                AS plan_course_id,
        spc.category,
        spc.recommended_year,
        spc.recommended_semester,
        spc.is_required,
        spc.sort_order,
        c.id                  AS course_id,
        c.code                AS course_code,
        c.name                AS course_name,
        c.name_ar             AS course_name_ar,
        c.credit_hours,
        c.department          AS course_department
      FROM study_plan_courses spc
      JOIN courses c ON c.id = spc.course_id
      WHERE spc.plan_id = $1
      ORDER BY spc.sort_order ASC, c.code ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        plan:    planRes.rows[0],
        courses: coursesRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Create a new study plan ───────────────────────────────────
async function createPlan(req, res, next) {
  try {
    const { department_id, plan_year, label } = req.body;
    if (!department_id || !plan_year) {
      return res.status(400).json({ success: false, message: 'department_id and plan_year are required.' });
    }

    const result = await query(`
      INSERT INTO study_plans (department_id, plan_year, label)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [department_id, Number(plan_year), label || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'A study plan for this department and year already exists.' });
    }
    next(err);
  }
}

// ── Update plan label ─────────────────────────────────────────
async function updatePlan(req, res, next) {
  try {
    const { id }    = req.params;
    const { label } = req.body;

    const result = await query(`
      UPDATE study_plans
      SET label = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, label ?? null]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ── Delete a plan (cascades to study_plan_courses) ────────────
async function deletePlan(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM study_plans WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Courses not yet in the plan (for add-course search) ───────
async function getAvailableCourses(req, res, next) {
  try {
    const { id }  = req.params;
    const { q = '' } = req.query;

    const result = await query(`
      SELECT
        c.id,
        c.code,
        c.name,
        c.name_ar,
        c.credit_hours,
        c.department
      FROM courses c
      WHERE c.id NOT IN (
        SELECT course_id FROM study_plan_courses WHERE plan_id = $1
      )
      AND (
        $2 = ''
        OR c.code ILIKE $3
        OR c.name ILIKE $3
      )
      ORDER BY c.code
      LIMIT 50
    `, [id, q, `%${q}%`]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// ── Add a course to a plan ────────────────────────────────────
async function addCourse(req, res, next) {
  try {
    const { id } = req.params;
    const {
      course_id,
      category             = 'required',
      recommended_year,
      recommended_semester,
      is_required          = true,
      sort_order           = 0,
    } = req.body;

    if (!course_id) {
      return res.status(400).json({ success: false, message: 'course_id is required.' });
    }

    const result = await query(`
      INSERT INTO study_plan_courses
        (plan_id, course_id, category, recommended_year, recommended_semester, is_required, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      id,
      course_id,
      category,
      recommended_year     ? Number(recommended_year)  : null,
      recommended_semester || null,
      is_required,
      Number(sort_order) || 0,
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'This course is already in the plan.' });
    }
    next(err);
  }
}

// ── Update course placement in a plan ─────────────────────────
async function updateCourse(req, res, next) {
  try {
    const { id, courseId } = req.params;
    const { category, recommended_year, recommended_semester, is_required, sort_order } = req.body;

    const sets  = [];
    const vals  = [id, courseId];
    let   idx   = 3;

    if (category             !== undefined) { sets.push(`category = $${idx++}`);             vals.push(category); }
    if (recommended_year     !== undefined) { sets.push(`recommended_year = $${idx++}`);     vals.push(recommended_year !== null ? Number(recommended_year) : null); }
    if (recommended_semester !== undefined) { sets.push(`recommended_semester = $${idx++}`); vals.push(recommended_semester || null); }
    if (is_required          !== undefined) { sets.push(`is_required = $${idx++}`);          vals.push(is_required); }
    if (sort_order           !== undefined) { sets.push(`sort_order = $${idx++}`);           vals.push(Number(sort_order) || 0); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    const result = await query(`
      UPDATE study_plan_courses
      SET ${sets.join(', ')}
      WHERE plan_id = $1 AND course_id = $2
      RETURNING *
    `, vals);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Course not found in this plan.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ── Remove a course from a plan ───────────────────────────────
async function removeCourse(req, res, next) {
  try {
    const { id, courseId } = req.params;
    const result = await query(`
      DELETE FROM study_plan_courses
      WHERE plan_id = $1 AND course_id = $2
      RETURNING id
    `, [id, courseId]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Course not found in this plan.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPlans,
  getDepartments,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  getAvailableCourses,
  addCourse,
  updateCourse,
  removeCourse,
};
