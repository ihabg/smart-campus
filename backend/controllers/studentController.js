const { query } = require('../config/db');

/**
 * GET /api/student/study-plan
 *
 * Phase 1 — returns the authenticated student's enrollment history and
 * academic progress.  study_plans / study_plan_courses do NOT exist yet,
 * so has_official_plan is always false and "Not Taken" courses are never
 * shown.  No GPA is calculated or returned.
 */
async function getStudyPlan(req, res, next) {
  try {
    const studentId = req.user.id;

    // ── 1. Student identity ────────────────────────────────────
    const identityRes = await query(`
      SELECT
        u.id,
        u.student_id,
        u.first_name,
        u.last_name,
        u.department,
        u.year_of_study,
        u.email,
        sp.registration_year,
        sp.registration_number,
        sp.department_id
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.id = $1
    `, [studentId]);

    const student = identityRes.rows[0] || null;
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // ── 2. Full enrollment history (all statuses) + grades ────
    const enrollRes = await query(`
      SELECT
        e.id              AS enrollment_id,
        e.status          AS enrollment_status,
        e.enrolled_at,
        s.id              AS section_id,
        s.is_active,
        s.semester,
        s.academic_year,
        s.section_number,
        c.id              AS course_id,
        c.code            AS course_code,
        c.name            AS course_name,
        c.name_ar         AS course_name_ar,
        c.credit_hours,
        c.department      AS course_department,
        g.midterm,
        g.final           AS final_grade,
        g.assignments,
        g.practical,
        g.letter_grade,
        CASE
          WHEN g.letter_grade IS NOT NULL THEN
            COALESCE(g.midterm, 0) +
            COALESCE(g.assignments, 0) +
            COALESCE(g.final, 0) +
            COALESCE(g.practical, 0)
          ELSE NULL
        END               AS total_grade
      FROM enrollments e
      JOIN  sections s ON s.id = e.section_id
      JOIN  courses  c ON c.id = s.course_id
      LEFT JOIN grades g
        ON g.student_id = $1
       AND g.section_id = e.section_id
      WHERE e.student_id = $1
      ORDER BY
        s.academic_year DESC,
        CASE s.semester
          WHEN 'summer' THEN 1
          WHEN 'spring' THEN 2
          WHEN 'fall'   THEN 3
        END ASC,
        c.code ASC
    `, [studentId]);

    // ── 3. Compute status per enrollment row ──────────────────
    // Grade is authoritative and always preserved, even on inactive sections.
    // Inactive sections with no grade return null → excluded from results.
    function computeStatus(enrollmentStatus, letterGrade, isActive) {
      if (letterGrade) {
        // Real grade exists: preserve the historical record regardless of
        // whether the section is still active.
        return letterGrade === 'E' ? 'failed' : 'completed';
      }
      if (!isActive) {
        // Section was deactivated and no grade was ever recorded.
        // Return null so the row is filtered out before being sent to
        // the frontend — it should not count as In Progress.
        return null;
      }
      switch (enrollmentStatus) {
        case 'completed': return 'completed';
        case 'failed':    return 'failed';
        case 'enrolled':  return 'in_progress';
        default:          return 'dropped';
      }
    }

    const allEnrollments = enrollRes.rows.map(row => ({
      ...row,
      computed_status: computeStatus(row.enrollment_status, row.letter_grade, row.is_active),
    }));

    // Drop inactive no-grade rows — they must not appear in the Study Plan
    // or contribute to any summary stat.
    const enrollments = allEnrollments.filter(row => row.computed_status !== null);

    // ── 4. Deduplicated summary stats ─────────────────────────
    // Per distinct course, use the best status achieved.
    // Priority: completed > in_progress > failed > dropped
    const priority = { completed: 4, in_progress: 3, failed: 2, dropped: 1 };
    const courseMap = new Map();

    for (const row of enrollments) {
      const existing = courseMap.get(row.course_id);
      const curP  = priority[row.computed_status]            || 0;
      const prevP = existing ? (priority[existing.computed_status] || 0) : -1;
      if (!existing || curP > prevP) {
        courseMap.set(row.course_id, {
          credit_hours:    row.credit_hours,
          computed_status: row.computed_status,
        });
      }
    }

    let completedHours    = 0;
    let inProgressHours   = 0;
    let completedCourses  = 0;
    let inProgressCourses = 0;
    let failedCourses     = 0;
    let droppedCourses    = 0;

    for (const c of courseMap.values()) {
      const h = c.credit_hours || 0;
      switch (c.computed_status) {
        case 'completed':
          completedHours += h;
          completedCourses++;
          break;
        case 'in_progress':
          inProgressHours += h;
          inProgressCourses++;
          break;
        case 'failed':
          failedCourses++;
          break;
        case 'dropped':
          droppedCourses++;
          break;
      }
    }

    // ── 5. Phase 2: look up official study plan ───────────────
    let has_official_plan = false;
    let plan_meta         = null;
    let plan_courses      = [];

    if (student.department_id && student.registration_year) {
      // Step 1: explicit batch assignment lookup
      let planRow = null;
      const explicitRes = await query(`
        SELECT
          sp.id,
          sp.plan_year,
          sp.label,
          d.name_en AS department_name,
          d.name_ar AS department_name_ar,
          'explicit' AS match_type
        FROM study_plan_batch_assignments spba
        JOIN study_plans sp ON sp.id = spba.plan_id
        JOIN departments d  ON d.id  = sp.department_id
        WHERE spba.department_id     = $1
          AND spba.registration_year = $2
          AND spba.is_active         = TRUE
        LIMIT 1
      `, [student.department_id, student.registration_year]);

      planRow = explicitRes.rows[0] || null;

      // Step 2: fallback — latest plan where plan_year <= registration_year
      if (!planRow) {
        const fallbackRes = await query(`
          SELECT
            sp.id,
            sp.plan_year,
            sp.label,
            d.name_en AS department_name,
            d.name_ar AS department_name_ar,
            'latest_fallback' AS match_type
          FROM study_plans sp
          JOIN departments d ON d.id = sp.department_id
          WHERE sp.department_id = $1
            AND sp.plan_year    <= $2
          ORDER BY sp.plan_year DESC
          LIMIT 1
        `, [student.department_id, student.registration_year]);
        planRow = fallbackRes.rows[0] || null;
      }

      if (planRow) {
        has_official_plan = true;
        plan_meta         = planRow;

        const planCoursesRes = await query(`
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
            c.credit_hours
          FROM study_plan_courses spc
          JOIN courses c ON c.id = spc.course_id
          WHERE spc.plan_id = $1
          ORDER BY spc.sort_order ASC, c.code ASC
        `, [plan_meta.id]);

        // Build course_id → best enrollment history entry map
        const courseHistory = new Map();
        for (const e of enrollments) {
          const existing = courseHistory.get(e.course_id);
          const curP     = priority[e.computed_status] || 0;
          const prevP    = existing ? (priority[existing.computed_status] || 0) : -1;
          if (!existing || curP > prevP) {
            courseHistory.set(e.course_id, e);
          }
        }

        plan_courses = planCoursesRes.rows.map(pc => {
          const hist = courseHistory.get(pc.course_id);
          return {
            ...pc,
            computed_status: hist?.computed_status || 'not_taken',
            letter_grade:    hist?.letter_grade    || null,
            total_grade:     hist?.total_grade != null ? hist.total_grade : null,
          };
        });
      }
    }

    return res.json({
      success: true,
      data: {
        student: {
          id:                  student.id,
          student_id:          student.student_id,
          first_name:          student.first_name,
          last_name:           student.last_name,
          department:          student.department,
          year_of_study:       student.year_of_study,
          email:               student.email,
          registration_year:   student.registration_year   || null,
          registration_number: student.registration_number || student.student_id,
        },
        summary: {
          completed_credit_hours:   completedHours,
          in_progress_credit_hours: inProgressHours,
          completed_courses:        completedCourses,
          in_progress_courses:      inProgressCourses,
          failed_courses:           failedCourses,
          dropped_courses:          droppedCourses,
          total_distinct_courses:   courseMap.size,
        },
        enrollments,
        has_official_plan,
        plan_meta,
        plan_courses,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStudyPlan };
