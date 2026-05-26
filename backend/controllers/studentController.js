const { query } = require('../config/db');

// ── GPA helpers ────────────────────────────────────────────────

function gradeToPoint(letter) {
  const map = {
    'A': 4.00, 'A-': 3.75,
    'B+': 3.50, 'B': 3.00, 'B-': 2.75,
    'C+': 2.50, 'C': 2.00, 'C-': 1.75,
    'D+': 1.50, 'D': 1.00, 'D-': 0.75,
    'E': 0.00,
  };
  const v = map[letter];
  return v !== undefined ? v : null;
}

function semesterRank(semester) {
  const s = (semester || '').toLowerCase();
  if (s === 'fall'   || s === 'first')  return 1;
  if (s === 'spring' || s === 'second') return 2;
  if (s === 'summer')                   return 3;
  return 0;
}

function academicYearStart(academicYear) {
  return parseInt(String(academicYear || '').split('/')[0], 10) || 0;
}

// D- and E are failing — they count in GPA but NOT in completed hours
const FAILING_GRADES = new Set(['D-', 'E']);

/**
 * GET /api/student/study-plan
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

    // ── 2. Full enrollment history + official grades ───────────
    // Credit hours come from courses.credit_hours — no study_plan_courses join.
    // Ordered most-recent first: academic_year DESC, then semester rank DESC
    // (fall=1 earliest, spring=2, summer=3 most recent within a year).
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
        ON g.student_id = e.student_id
       AND g.section_id = e.section_id
      WHERE e.student_id = $1
      ORDER BY
        s.academic_year DESC,
        CASE s.semester
          WHEN 'fall'   THEN 1
          WHEN 'spring' THEN 2
          WHEN 'summer' THEN 3
          ELSE 0
        END DESC,
        c.code ASC
    `, [studentId]);

    // ── DEBUG: log raw enrollment+grade rows for test student ─
    if (student.student_id === '12143698') {
      console.log(`[DEBUG student=${student.student_id}] ${enrollRes.rows.length} enrollment rows:`);
      enrollRes.rows.forEach((r, i) => {
        console.log(
          `  [${i}] course=${r.course_code}  section=${r.section_id}` +
          `  ${r.semester} ${r.academic_year}` +
          `  letter=${r.letter_grade ?? 'null'}  total=${r.total_grade ?? 'null'}`
        );
      });
    }

    // ── 3. Compute status per enrollment row ──────────────────
    function computeStatus(enrollmentStatus, letterGrade, isActive) {
      // Dropped enrollments are always dropped — a recorded grade does not override removal
      if (enrollmentStatus === 'dropped') return 'dropped';
      if (letterGrade) {
        // D- and E are failing — do NOT count as completed hours or satisfy plan requirements
        return FAILING_GRADES.has(letterGrade) ? 'failed' : 'completed';
      }
      if (!isActive) return null; // inactive section, no grade — filter out
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

    const enrollments = allEnrollments.filter(row => row.computed_status !== null);

    // ── 4. Deduplicated summary stats ─────────────────────────
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
        case 'completed':   completedHours   += h; completedCourses++;   break;
        case 'in_progress': inProgressHours  += h; inProgressCourses++;  break;
        case 'failed':                              failedCourses++;      break;
        case 'dropped':                             droppedCourses++;     break;
      }
    }

    // ── 5. GPA computation ─────────────────────────────────────
    // Iterates enrollRes.rows directly — includes grades from inactive sections.
    // No join to study_plan_courses; credit_hours always from courses table.
    //
    // Cumulative GPA: latest graded attempt per course, determined by
    //   academicYearStart DESC, then semesterRank DESC (fall<spring<summer).
    // Semester GPA: all graded courses in that semester (no dedup needed).
    const latestAttempt = new Map(); // course_id → { pts, ch, yearStart, semRank }
    const semGpaAccum   = new Map(); // `year||sem` → { academic_year, semester, yearStart, semRank, qp, hours }
    let skippedGpaCourses = 0;

    for (const row of enrollRes.rows) {
      if (!row.letter_grade) continue;
      if (row.enrollment_status === 'dropped') continue; // dropped enrollments don't count in GPA

      const pts = gradeToPoint(row.letter_grade);
      if (pts === null) continue; // unrecognised grade letter — skip silently

      const ch = row.credit_hours;
      if (!ch || ch <= 0) {
        // Missing or zero credit hours — skip to avoid divide-by-zero
        skippedGpaCourses++;
        continue;
      }

      const yearStart = academicYearStart(row.academic_year);
      const semRank   = semesterRank(row.semester);

      // Per-semester accumulation (all attempts, no dedup per course)
      const semKey = `${row.academic_year}||${row.semester}`;
      if (!semGpaAccum.has(semKey)) {
        semGpaAccum.set(semKey, {
          academic_year: row.academic_year,
          semester:      row.semester,
          yearStart,
          semRank,
          qp:    0,
          hours: 0,
        });
      }
      const sg = semGpaAccum.get(semKey);
      sg.qp    += pts * ch;
      sg.hours += ch;

      // Latest-attempt-per-course for cumulative GPA
      const prev = latestAttempt.get(row.course_id);
      const isNewer = !prev
        || yearStart > prev.yearStart
        || (yearStart === prev.yearStart && semRank > prev.semRank);
      if (isNewer) {
        latestAttempt.set(row.course_id, { pts, ch, yearStart, semRank });
      }
    }

    let totalQP = 0, totalGpaHours = 0;
    for (const { pts, ch } of latestAttempt.values()) {
      totalQP       += pts * ch;
      totalGpaHours += ch;
    }
    const cumulativeGpa = totalGpaHours > 0
      ? Math.round(totalQP / totalGpaHours * 100) / 100
      : null;

    const semesterGpa = [...semGpaAccum.values()]
      .sort((a, b) => b.yearStart - a.yearStart || b.semRank - a.semRank)
      .map(g => ({
        academic_year: g.academic_year,
        semester:      g.semester,
        gpa:           Math.round(g.qp / g.hours * 100) / 100,
      }));

    const gpa_summary = {
      cumulative_gpa:       cumulativeGpa,
      semester_gpa:         semesterGpa,
      gpa_hours:            totalGpaHours,
      graded_courses_count: latestAttempt.size,
      skipped_gpa_courses:  skippedGpaCourses,
    };

    // ── 6. Official study plan ─────────────────────────────────
    let has_official_plan        = false;
    let plan_meta                = null;
    let plan_courses             = [];
    let category_requirements    = [];

    if (student.department_id && student.registration_year) {
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

        const [planCoursesRes, catReqsRes] = await Promise.all([
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
              c.credit_hours
            FROM study_plan_courses spc
            JOIN courses c ON c.id = spc.course_id
            WHERE spc.plan_id = $1
            ORDER BY spc.sort_order ASC, c.code ASC
          `, [plan_meta.id]),
          query(`
            SELECT category, required_hours, label_en, label_ar, sort_order
            FROM study_plan_category_requirements
            WHERE plan_id = $1
            ORDER BY sort_order ASC
          `, [plan_meta.id]),
        ]);

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

        // Attach prerequisite data (with student's passing status) to each plan course.
        // Concurrent satisfaction against a specific term is handled on the frontend
        // using the already-loaded myEnrolled list.
        if (plan_courses.length > 0) {
          const courseIds = plan_courses.map(pc => pc.course_id);
          const prereqRes = await query(`
            SELECT
              cp.course_id,
              cp.prerequisite_id,
              cp.is_concurrent,
              c.code,
              c.name,
              c.name_ar,
              c.credit_hours,
              EXISTS (
                SELECT 1
                FROM enrollments e
                JOIN sections s ON s.id = e.section_id
                LEFT JOIN grades g
                  ON g.student_id = e.student_id AND g.section_id = e.section_id
                WHERE e.student_id   = $2
                  AND s.course_id    = cp.prerequisite_id
                  AND e.status      != 'dropped'
                  AND g.letter_grade IS NOT NULL
                  AND g.letter_grade NOT IN ('D-', 'E')
              ) AS passed
            FROM course_prerequisites cp
            JOIN courses c ON c.id = cp.prerequisite_id
            WHERE cp.course_id = ANY($1::uuid[])
            ORDER BY c.code
          `, [courseIds, studentId]);

          const prereqMap = new Map();
          for (const row of prereqRes.rows) {
            if (!prereqMap.has(row.course_id)) prereqMap.set(row.course_id, []);
            prereqMap.get(row.course_id).push({
              course_id:     row.prerequisite_id,
              code:          row.code,
              name:          row.name,
              name_ar:       row.name_ar || null,
              credit_hours:  row.credit_hours,
              is_concurrent: row.is_concurrent,
              passed:        row.passed,
            });
          }

          plan_courses = plan_courses.map(pc => ({
            ...pc,
            prerequisites: prereqMap.get(pc.course_id) || [],
          }));
        }

        category_requirements = catReqsRes.rows;
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
        gpa_summary,
        enrollments,
        has_official_plan,
        plan_meta,
        plan_courses,
        category_requirements,
      },
    });
  } catch (err) {
    if (err.code === '22P02') {
      console.error('[getStudyPlan] 22P02 invalid UUID format:', err.message, err.detail || '');
    }
    next(err);
  }
}

module.exports = { getStudyPlan };