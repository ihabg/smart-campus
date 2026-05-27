const { query } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

const VALID_CATEGORIES = ['major_required', 'university_required', 'major_elective', 'free_elective'];

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

    const [coursesRes, reqsRes] = await Promise.all([
      query(`
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
      `, [id]),
      query(`
        SELECT category, required_hours, label_en, label_ar, sort_order
        FROM study_plan_category_requirements
        WHERE plan_id = $1
        ORDER BY sort_order ASC, category ASC
      `, [id]),
    ]);

    res.json({
      success: true,
      data: {
        plan:                  planRes.rows[0],
        courses:               coursesRes.rows,
        category_requirements: reqsRes.rows,
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

    const plan = result.rows[0];

    // Fetch department name for the log (non-critical)
    let deptName = department_id;
    try {
      const d = await query('SELECT name_en FROM departments WHERE id = $1', [department_id]);
      deptName = d.rows[0]?.name_en || department_id;
    } catch (_) {}

    await logActivity({
      req,
      action:      'study_plan.create',
      entityType:  'study_plan',
      entityId:    plan.id,
      entityLabel: plan.label || `${deptName} ${plan.plan_year}`,
      description: `Created study plan ${plan.label || plan.plan_year} for ${deptName}`,
      metadata: {
        department_id,
        department_name: deptName,
        plan_year:       plan.plan_year,
        label:           plan.label || null,
      },
    });

    res.status(201).json({ success: true, data: plan });
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

    // Pre-fetch for before state
    const beforeRes = await query('SELECT label FROM study_plans WHERE id = $1', [id]);
    const beforeLabel = beforeRes.rows[0]?.label ?? null;

    const result = await query(`
      UPDATE study_plans
      SET label = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, label ?? null]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }

    const updated = result.rows[0];
    await logActivity({
      req,
      action:      'study_plan.update',
      entityType:  'study_plan',
      entityId:    id,
      entityLabel: updated.label || id,
      description: `Updated study plan ${updated.label || id}`,
      metadata: {
        changes: { label: label ?? null },
        before:  { label: beforeLabel },
        after:   { label: updated.label ?? null },
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ── Delete a plan (cascades to study_plan_courses) ────────────
async function deletePlan(req, res, next) {
  try {
    const { id } = req.params;

    // Fetch plan info before deleting for the log
    const snapRes = await query(`
      SELECT sp.label, sp.plan_year, sp.department_id, d.name_en AS department_name
      FROM study_plans sp
      LEFT JOIN departments d ON d.id = sp.department_id
      WHERE sp.id = $1
    `, [id]);
    const snap = snapRes.rows[0] || null;

    const result = await query(`DELETE FROM study_plans WHERE id = $1 RETURNING id`, [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }

    await logActivity({
      req,
      action:      'study_plan.delete',
      entityType:  'study_plan',
      entityId:    id,
      entityLabel: snap?.label || id,
      description: `Deleted study plan ${snap?.label || id}${snap?.department_name ? ' (' + snap.department_name + ')' : ''}`,
      metadata: {
        label:           snap?.label       || null,
        plan_year:       snap?.plan_year   || null,
        department_id:   snap?.department_id   || null,
        department_name: snap?.department_name || null,
      },
    });

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
      AND c.is_active = TRUE
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
      category             = 'major_required',
      recommended_year,
      recommended_semester,
      is_required          = true,
      sort_order           = 0,
    } = req.body;

    if (!course_id) {
      return res.status(400).json({ success: false, message: 'course_id is required.' });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      });
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

    // Log context (non-critical)
    let planLabel = id, courseCode = course_id;
    try {
      const [p, c] = await Promise.all([
        query('SELECT label FROM study_plans WHERE id = $1', [id]),
        query('SELECT code FROM courses WHERE id = $1', [course_id]),
      ]);
      planLabel  = p.rows[0]?.label || id;
      courseCode = c.rows[0]?.code  || course_id;
    } catch (_) {}

    await logActivity({
      req,
      action:      'study_plan.add_course',
      entityType:  'study_plan',
      entityId:    id,
      entityLabel: planLabel,
      description: `Added course ${courseCode} to study plan ${planLabel}`,
      metadata: {
        course_id,
        course_code:          courseCode,
        category,
        recommended_year:     recommended_year || null,
        recommended_semester: recommended_semester || null,
      },
    });

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

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      });
    }

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

    // Fetch plan/course labels for log (non-critical)
    let planLabel = id, courseCode = courseId;
    try {
      const [p, c] = await Promise.all([
        query('SELECT label FROM study_plans WHERE id = $1', [id]),
        query('SELECT code FROM courses WHERE id = $1', [courseId]),
      ]);
      planLabel  = p.rows[0]?.label || id;
      courseCode = c.rows[0]?.code  || courseId;
    } catch (_) {}

    const result = await query(`
      DELETE FROM study_plan_courses
      WHERE plan_id = $1 AND course_id = $2
      RETURNING id
    `, [id, courseId]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Course not found in this plan.' });
    }

    await logActivity({
      req,
      action:      'study_plan.remove_course',
      entityType:  'study_plan',
      entityId:    id,
      entityLabel: planLabel,
      description: `Removed course ${courseCode} from study plan ${planLabel}`,
      metadata: { course_id: courseId, course_code: courseCode },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── List batch assignments for a plan ────────────────────────
async function listBatchAssignments(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT registration_year, is_active, created_at
      FROM   study_plan_batch_assignments
      WHERE  plan_id = $1
      ORDER  BY registration_year ASC
    `, [id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// ── Assign batch year(s) to a plan ────────────────────────────
// Body: { registration_year, force } — single year
//    or { from_year, to_year, force } — range (max 50 years)
// force=true overwrites conflicts (years already assigned to another plan).
// Without force, conflicts are returned in data.conflicts for UI resolution.
async function assignBatch(req, res, next) {
  try {
    const { id } = req.params;
    const { registration_year, from_year, to_year, force = false } = req.body;

    const planRes = await query(
      `SELECT id, department_id FROM study_plans WHERE id = $1`,
      [id]
    );
    if (!planRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }
    const deptId = planRes.rows[0].department_id;

    // Build year list
    let years;
    if (registration_year !== undefined) {
      const y = Number(registration_year);
      if (!Number.isInteger(y) || y < 1990 || y > 2100) {
        return res.status(400).json({ success: false, message: 'Invalid registration_year.' });
      }
      years = [y];
    } else if (from_year !== undefined && to_year !== undefined) {
      const from = Number(from_year);
      const to   = Number(to_year);
      if (
        !Number.isInteger(from) || !Number.isInteger(to) ||
        from < 1990 || to > 2100 || from > to || to - from > 50
      ) {
        return res.status(400).json({ success: false, message: 'Invalid year range. Max 50 years.' });
      }
      years = [];
      for (let y = from; y <= to; y++) years.push(y);
    } else {
      return res.status(400).json({
        success: false,
        message: 'registration_year or from_year + to_year are required.',
      });
    }

    // For single year without force: do a quick conflict check first so we can
    // return a clean 409 with the current plan info before touching anything.
    if (years.length === 1 && !force) {
      const check = await query(`
        SELECT spba.plan_id, sp.plan_year, sp.label
        FROM   study_plan_batch_assignments spba
        JOIN   study_plans sp ON sp.id = spba.plan_id
        WHERE  spba.department_id = $1 AND spba.registration_year = $2
      `, [deptId, years[0]]);

      if (check.rows[0] && check.rows[0].plan_id !== id) {
        return res.status(409).json({
          success:      false,
          message:      'This batch year is already assigned to another plan.',
          current_plan: check.rows[0],
        });
      }
    }

    // Process each year
    const assigned          = [];
    const already_this_plan = [];
    const reassigned        = [];
    const conflicts         = [];

    for (const year of years) {
      const existing = await query(`
        SELECT spba.plan_id, sp.plan_year, sp.label
        FROM   study_plan_batch_assignments spba
        JOIN   study_plans sp ON sp.id = spba.plan_id
        WHERE  spba.department_id = $1 AND spba.registration_year = $2
      `, [deptId, year]);

      const row = existing.rows[0];

      if (!row) {
        await query(
          `INSERT INTO study_plan_batch_assignments (plan_id, department_id, registration_year) VALUES ($1, $2, $3)`,
          [id, deptId, year]
        );
        assigned.push(year);
      } else if (row.plan_id === id) {
        already_this_plan.push(year);
      } else if (force) {
        await query(
          `UPDATE study_plan_batch_assignments SET plan_id = $1, updated_at = NOW() WHERE department_id = $2 AND registration_year = $3`,
          [id, deptId, year]
        );
        reassigned.push(year);
      } else {
        conflicts.push({
          year,
          current_plan: { plan_id: row.plan_id, plan_year: row.plan_year, label: row.label },
        });
      }
    }

    return res.json({
      success: true,
      data: { assigned, already_this_plan, reassigned, conflicts },
    });
  } catch (err) {
    next(err);
  }
}

// ── Remove a single batch assignment ─────────────────────────
async function removeBatchAssignment(req, res, next) {
  try {
    const { id, year } = req.params;

    const planRes = await query(`SELECT id FROM study_plans WHERE id = $1`, [id]);
    if (!planRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }

    const result = await query(
      `DELETE FROM study_plan_batch_assignments WHERE plan_id = $1 AND registration_year = $2 RETURNING id`,
      [id, Number(year)]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Batch assignment not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── List category requirements for a plan ────────────────────
async function listCategoryRequirements(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT category, required_hours, label_en, label_ar, sort_order, updated_at
      FROM study_plan_category_requirements
      WHERE plan_id = $1
      ORDER BY sort_order ASC, category ASC
    `, [id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}

// ── Upsert a single category requirement ─────────────────────
async function upsertCategoryRequirement(req, res, next) {
  try {
    const { id, category } = req.params;
    const { required_hours } = req.body;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      });
    }

    const hours = Number(required_hours);
    if (isNaN(hours) || hours < 0) {
      return res.status(400).json({ success: false, message: 'required_hours must be a non-negative number.' });
    }

    const planCheck = await query(`SELECT id, label FROM study_plans WHERE id = $1`, [id]);
    if (!planCheck.rows[0]) {
      return res.status(404).json({ success: false, message: 'Study plan not found.' });
    }
    const planLabel = planCheck.rows[0].label || id;

    const result = await query(`
      INSERT INTO study_plan_category_requirements (plan_id, category, required_hours)
      VALUES ($1, $2, $3)
      ON CONFLICT (plan_id, category) DO UPDATE
        SET required_hours = EXCLUDED.required_hours,
            updated_at     = NOW()
      RETURNING category, required_hours, label_en, label_ar, sort_order, updated_at
    `, [id, category, hours]);

    await logActivity({
      req,
      action:      'study_plan.upsert_requirement',
      entityType:  'study_plan',
      entityId:    id,
      entityLabel: planLabel,
      description: `Updated ${category} requirement for plan ${planLabel}: ${hours} hours`,
      metadata: {
        plan_id:        id,
        category,
        required_hours: hours,
      },
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ── Delete a category requirement (reset to unconfigured) ────
async function deleteCategoryRequirement(req, res, next) {
  try {
    const { id, category } = req.params;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      });
    }

    const result = await query(`
      DELETE FROM study_plan_category_requirements
      WHERE plan_id = $1 AND category = $2
      RETURNING category
    `, [id, category]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Category requirement not found.' });
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
  listBatchAssignments,
  assignBatch,
  removeBatchAssignment,
  listCategoryRequirements,
  upsertCategoryRequirement,
  deleteCategoryRequirement,
};
