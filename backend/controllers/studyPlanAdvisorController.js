const { query } = require('../config/db');

const FAILING_GRADES = new Set(['D-', 'E']);
const PASSING_STATUSES = new Set(['completed']);

function computeStatus(enrollmentStatus, letterGrade, isActive) {
  if (letterGrade) return FAILING_GRADES.has(letterGrade) ? 'failed' : 'completed';
  if (!isActive) return null;
  switch (enrollmentStatus) {
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'enrolled': return 'in_progress';
    default: return 'dropped';
  }
}

function semesterOrder(semester) {
  const s = String(semester || '').toLowerCase();
  if (s === 'fall' || s === 'first') return 1;
  if (s === 'spring' || s === 'second') return 2;
  if (s === 'summer') return 3;
  return 9;
}

function inferNextRegularTerm(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 1 && month <= 5) {
    return { semester: 'fall', academic_year: `${year}/${year + 1}`, label: `Fall ${year}/${year + 1}` };
  }
  if (month >= 6 && month <= 8) {
    return { semester: 'fall', academic_year: `${year}/${year + 1}`, label: `Fall ${year}/${year + 1}` };
  }
  return { semester: 'spring', academic_year: `${year}/${year + 1}`, label: `Spring ${year}/${year + 1}` };
}

function normaliseCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function courseLabel(course) {
  if (!course) return 'Unknown course';
  const name = course.course_name || course.name || course.prerequisite_name || '';
  const code = course.course_code || course.code || course.prerequisite_code || '';
  if (name && code) return `${name} (${code})`;
  return name || code || 'Unknown course';
}

function courseNameList(courses) {
  return (courses || []).map(courseLabel).join(', ');
}

function courseStatusPriority(status) {
  return { completed: 5, in_progress: 4, failed: 3, dropped: 2, not_taken: 1 }[status] || 0;
}

async function tableExists(tableName) {
  const res = await query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return !!res.rows[0]?.table_name;
}

async function buildStudentAdvisorContext(studentId) {
  const identityRes = await query(`
    SELECT
      u.id,
      u.student_id,
      u.first_name,
      u.last_name,
      u.department,
      COALESCE(sp.year_of_study, u.year_of_study) AS year_of_study,
      u.email,
      sp.registration_year,
      sp.registration_number,
      sp.department_id,
      d.name_en AS department_name,
      d.name_ar AS department_name_ar
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN departments d ON d.id = sp.department_id
    WHERE u.id = $1
  `, [studentId]);

  const student = identityRes.rows[0] || null;
  if (!student) {
    const err = new Error('Student not found.');
    err.statusCode = 404;
    throw err;
  }

  const enrollRes = await query(`
    SELECT
      e.id AS enrollment_id,
      e.status AS enrollment_status,
      e.enrolled_at,
      s.id AS section_id,
      s.is_active,
      s.semester,
      s.academic_year,
      s.section_number,
      c.id AS course_id,
      c.code AS course_code,
      c.name AS course_name,
      c.name_ar AS course_name_ar,
      COALESCE(c.credit_hours, 0)::int AS credit_hours,
      c.department AS course_department,
      g.letter_grade,
      CASE
        WHEN g.letter_grade IS NOT NULL THEN
          COALESCE(g.midterm, 0) + COALESCE(g.assignments, 0) + COALESCE(g.final, 0) + COALESCE(g.practical, 0)
        ELSE NULL
      END AS total_grade
    FROM enrollments e
    JOIN sections s ON s.id = e.section_id
    JOIN courses c ON c.id = s.course_id
    LEFT JOIN grades g
      ON g.student_id = e.student_id
     AND g.section_id = e.section_id
    WHERE e.student_id = $1
    ORDER BY s.academic_year DESC,
      CASE s.semester WHEN 'fall' THEN 1 WHEN 'spring' THEN 2 WHEN 'summer' THEN 3 ELSE 0 END DESC,
      c.code ASC
  `, [studentId]);

  const enrollments = enrollRes.rows
    .map(row => ({ ...row, computed_status: computeStatus(row.enrollment_status, row.letter_grade, row.is_active) }))
    .filter(row => row.computed_status !== null);

  const courseHistory = new Map();
  for (const row of enrollments) {
    const existing = courseHistory.get(row.course_id);
    if (!existing || courseStatusPriority(row.computed_status) > courseStatusPriority(existing.computed_status)) {
      courseHistory.set(row.course_id, row);
    }
  }

  const completedIds = new Set();
  const inProgressIds = new Set();
  const failedIds = new Set();
  const completedCodes = new Set();

  for (const row of courseHistory.values()) {
    if (row.computed_status === 'completed') {
      completedIds.add(row.course_id);
      completedCodes.add(normaliseCode(row.course_code));
    }
    if (row.computed_status === 'in_progress') inProgressIds.add(row.course_id);
    if (row.computed_status === 'failed') failedIds.add(row.course_id);
  }

  let planMeta = null;
  let planCourses = [];

  if (student.department_id && student.registration_year) {
    const explicitRes = await query(`
      SELECT sp.id, sp.plan_year, sp.label, d.name_en AS department_name, d.name_ar AS department_name_ar, 'explicit' AS match_type
      FROM study_plan_batch_assignments spba
      JOIN study_plans sp ON sp.id = spba.plan_id
      JOIN departments d ON d.id = sp.department_id
      WHERE spba.department_id = $1
        AND spba.registration_year = $2
        AND spba.is_active = TRUE
      LIMIT 1
    `, [student.department_id, student.registration_year]);

    planMeta = explicitRes.rows[0] || null;

    if (!planMeta) {
      const fallbackRes = await query(`
        SELECT sp.id, sp.plan_year, sp.label, d.name_en AS department_name, d.name_ar AS department_name_ar, 'latest_fallback' AS match_type
        FROM study_plans sp
        JOIN departments d ON d.id = sp.department_id
        WHERE sp.department_id = $1
          AND sp.plan_year <= $2
        ORDER BY sp.plan_year DESC
        LIMIT 1
      `, [student.department_id, student.registration_year]);
      planMeta = fallbackRes.rows[0] || null;
    }
  }

  if (planMeta) {
    const planCoursesRes = await query(`
      SELECT
        spc.id AS plan_course_id,
        spc.category,
        spc.recommended_year,
        spc.recommended_semester,
        spc.is_required,
        spc.sort_order,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        COALESCE(c.credit_hours, 0)::int AS credit_hours,
        c.department AS course_department
      FROM study_plan_courses spc
      JOIN courses c ON c.id = spc.course_id
      WHERE spc.plan_id = $1
      ORDER BY spc.sort_order ASC, c.code ASC
    `, [planMeta.id]);

    planCourses = planCoursesRes.rows.map(pc => {
      const hist = courseHistory.get(pc.course_id);
      return {
        ...pc,
        computed_status: hist?.computed_status || 'not_taken',
        letter_grade: hist?.letter_grade || null,
        total_grade: hist?.total_grade != null ? hist.total_grade : null,
      };
    });
  } else if (student.department) {
    const departmentCoursesRes = await query(`
      SELECT
        NULL::uuid AS plan_course_id,
        'department'::text AS category,
        NULL::smallint AS recommended_year,
        NULL::text AS recommended_semester,
        TRUE AS is_required,
        0 AS sort_order,
        c.id AS course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        COALESCE(c.credit_hours, 0)::int AS credit_hours,
        c.department AS course_department
      FROM courses c
      WHERE c.is_active = TRUE
        AND c.department = $1
      ORDER BY c.code ASC
    `, [student.department]);

    planCourses = departmentCoursesRes.rows.map(pc => {
      const hist = courseHistory.get(pc.course_id);
      return {
        ...pc,
        computed_status: hist?.computed_status || 'not_taken',
        letter_grade: hist?.letter_grade || null,
        total_grade: hist?.total_grade != null ? hist.total_grade : null,
      };
    });
  }

  const prerequisitesByCourseId = new Map();
  if (await tableExists('course_prerequisites')) {
    const ids = planCourses.map(c => c.course_id).filter(Boolean);
    if (ids.length > 0) {
      const prereqRes = await query(`
        SELECT
          cp.course_id,
          cp.prerequisite_id,
          cp.is_concurrent,
          p.code AS prerequisite_code,
          p.name AS prerequisite_name,
          COALESCE(p.credit_hours, 0)::int AS prerequisite_credit_hours
        FROM course_prerequisites cp
        JOIN courses p ON p.id = cp.prerequisite_id
        WHERE cp.course_id = ANY($1::uuid[])
        ORDER BY p.code ASC
      `, [ids]);

      for (const row of prereqRes.rows) {
        if (!prerequisitesByCourseId.has(row.course_id)) prerequisitesByCourseId.set(row.course_id, []);
        prerequisitesByCourseId.get(row.course_id).push(row);
      }
    }
  }

  planCourses = planCourses.map(c => ({
    ...c,
    prerequisites: prerequisitesByCourseId.get(c.course_id) || [],
  }));

  return {
    student,
    plan_meta: planMeta,
    plan_courses: planCourses,
    enrollments,
    course_history: courseHistory,
    completed_ids: completedIds,
    in_progress_ids: inProgressIds,
    failed_ids: failedIds,
    completed_codes: completedCodes,
    next_term: inferNextRegularTerm(),
  };
}

function compactCourse(course) {
  return {
    course_id: course.course_id,
    course_code: course.course_code,
    course_name: course.course_name,
    course_name_ar: course.course_name_ar,
    display_name: courseLabel(course),
    credit_hours: Number(course.credit_hours || 0),
    category: course.category,
    recommended_year: course.recommended_year,
    recommended_semester: course.recommended_semester,
    is_required: course.is_required,
    computed_status: course.computed_status,
    letter_grade: course.letter_grade,
    prerequisites: (course.prerequisites || []).map(p => ({
      course_id: p.prerequisite_id,
      course_code: p.prerequisite_code,
      course_name: p.prerequisite_name,
      display_name: courseLabel({ course_code: p.prerequisite_code, course_name: p.prerequisite_name }),
      is_concurrent: p.is_concurrent,
    })),
  };
}

function isPrerequisiteSatisfied(prereq, context, selectedIds) {
  if (context.completed_ids.has(prereq.prerequisite_id)) return true;
  if (prereq.is_concurrent && selectedIds.has(prereq.prerequisite_id)) return true;
  return false;
}

function resolveSelectedCourses(context, body = {}) {
  const selectedIds = new Set((body.planned_course_ids || body.course_ids || []).filter(Boolean).map(String));
  const selectedCodes = new Set((body.planned_course_codes || body.course_codes || []).map(normaliseCode).filter(Boolean));

  const selected = [];
  for (const course of context.plan_courses) {
    if (selectedIds.has(String(course.course_id)) || selectedCodes.has(normaliseCode(course.course_code))) {
      selected.push(course);
      selectedIds.add(String(course.course_id));
    }
  }
  return selected;
}

function evaluateCourses(context, selectedCourses) {
  const warnings = [];
  const strengths = [];
  const suggestions = [];
  const blocking = [];
  const selectedIds = new Set(selectedCourses.map(c => String(c.course_id)));
  const creditHours = selectedCourses.reduce((sum, c) => sum + Number(c.credit_hours || 0), 0);

  if (selectedCourses.length === 0) {
    return {
      status: 'blocked',
      score: 0,
      label: 'No plan selected',
      summary: 'Choose courses first so I can evaluate the plan.',
      credit_hours: 0,
      course_count: 0,
      strengths: [],
      warnings: ['No courses were selected.'],
      blocking_issues: ['No courses were selected.'],
      suggestions: ['Start with 4–5 eligible courses, usually around 12–16 credit hours.'],
      selected_courses: [],
    };
  }

  let score = 100;

  if (creditHours >= 12 && creditHours <= 16) {
    strengths.push(`The workload is balanced at ${creditHours} credit hours.`);
  } else if (creditHours >= 17 && creditHours <= 18) {
    score -= 6;
    warnings.push(`The plan is a little heavy at ${creditHours} credit hours.`);
    suggestions.push('Keep this only if your GPA and weekly schedule are strong.');
  } else if (creditHours > 18) {
    score -= 22;
    warnings.push(`The plan is too heavy at ${creditHours} credit hours.`);
    suggestions.push('Remove one course or move an elective to a later semester.');
  } else if (creditHours < 12) {
    score -= 14;
    warnings.push(`The plan is light at ${creditHours} credit hours.`);
    suggestions.push('Add another eligible required course if you want normal progress.');
  }

  const requiredCount = selectedCourses.filter(c => c.is_required).length;
  if (requiredCount >= Math.max(1, selectedCourses.length - 1)) {
    strengths.push('The plan focuses mostly on required courses.');
  } else {
    score -= 8;
    warnings.push('The plan contains several non-required courses.');
    suggestions.push('Prioritize required/core courses before electives.');
  }

  for (const course of selectedCourses) {
    if (course.computed_status === 'completed') {
      score -= 20;
      warnings.push(`${courseLabel(course)} is already completed.`);
      suggestions.push(`Remove ${courseLabel(course)} and choose a not-taken course.`);
    }
    if (course.computed_status === 'in_progress') {
      score -= 8;
      warnings.push(`${courseLabel(course)} is already in progress.`);
    }
    if (course.computed_status === 'failed') {
      strengths.push(`${courseLabel(course)} is marked for repeat, which can improve progress if it is required.`);
    }

    const missing = (course.prerequisites || []).filter(p => !isPrerequisiteSatisfied(p, context, selectedIds));
    if (missing.length > 0) {
      score -= 28;
      blocking.push(`${courseLabel(course)} is blocked by missing prerequisite${missing.length > 1 ? 's' : ''}: ${missing.map(p => courseLabel({ course_code: p.prerequisite_code, course_name: p.prerequisite_name })).join(', ')}.`);
      suggestions.push(`Complete ${missing.map(p => courseLabel({ course_code: p.prerequisite_code, course_name: p.prerequisite_name })).join(', ')} before taking ${courseLabel(course)}.`);
    }
  }

  if (selectedCourses.some(c => c.computed_status === 'failed')) {
    strengths.push('The plan includes a course that needs repeat, which is good for cleaning academic progress.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status = 'excellent';
  let label = 'Excellent plan';
  if (blocking.length > 0) {
    status = 'blocked';
    label = 'Needs fixing';
  } else if (score >= 85) {
    status = 'excellent';
    label = 'Excellent plan';
  } else if (score >= 70) {
    status = 'good';
    label = 'Good plan';
  } else {
    status = 'needs_improvement';
    label = 'Needs improvement';
  }

  const summary = (() => {
    if (status === 'excellent') return `Excellent choice. This plan is balanced, prerequisite-safe, and supports steady progress for next semester.`;
    if (status === 'good') return `This is a good plan, but I would adjust a few details before registration.`;
    if (status === 'blocked') return `This plan needs fixing before registration because at least one course has a prerequisite issue.`;
    return `This plan needs improvement. The workload or course mix should be adjusted.`;
  })();

  return {
    status,
    score,
    label,
    summary,
    credit_hours: creditHours,
    course_count: selectedCourses.length,
    strengths: [...new Set(strengths)].slice(0, 6),
    warnings: [...new Set(warnings)].slice(0, 8),
    blocking_issues: [...new Set(blocking)].slice(0, 8),
    suggestions: [...new Set(suggestions)].slice(0, 8),
    selected_courses: selectedCourses.map(compactCourse),
  };
}

function rankCandidate(course, context, targetTerm) {
  let score = 0;
  if (course.computed_status === 'failed') score += 100;
  if (course.is_required) score += 40;
  if (course.category === 'required') score += 20;
  if (course.recommended_semester && course.recommended_semester === targetTerm.semester) score += 12;
  if (course.recommended_year && context.student.year_of_study) {
    const diff = Math.abs(Number(course.recommended_year) - Number(context.student.year_of_study));
    score += Math.max(0, 12 - diff * 4);
  }
  score -= semesterOrder(course.recommended_semester || '') * 0.5;
  score -= Number(course.sort_order || 0) * 0.01;
  return score;
}

function buildRecommendation(context, mode = 'balanced') {
  const targetTerm = context.next_term;
  const maxHours = mode === 'lighter' ? 12 : mode === 'stronger' ? 18 : 16;
  const minHours = mode === 'lighter' ? 9 : mode === 'stronger' ? 15 : 12;

  const candidates = context.plan_courses
    .filter(c => !['completed', 'in_progress'].includes(c.computed_status))
    .filter(c => {
      const selectedIds = new Set([String(c.course_id)]);
      return (c.prerequisites || []).every(p => isPrerequisiteSatisfied(p, context, selectedIds));
    })
    .sort((a, b) => rankCandidate(b, context, targetTerm) - rankCandidate(a, context, targetTerm));

  const selected = [];
  let hours = 0;

  for (const course of candidates) {
    const h = Number(course.credit_hours || 0);
    if (h <= 0) continue;
    if (hours + h > maxHours) continue;
    selected.push(course);
    hours += h;
    if (hours >= minHours) break;
  }

  if (hours < minHours) {
    for (const course of candidates) {
      if (selected.some(c => c.course_id === course.course_id)) continue;
      const h = Number(course.credit_hours || 0);
      if (h <= 0) continue;
      if (hours + h > maxHours + 2) continue;
      selected.push(course);
      hours += h;
      if (hours >= minHours) break;
    }
  }

  const evaluation = evaluateCourses(context, selected);
  const advisorText = selected.length > 0
    ? `I suggested ${selected.length} course${selected.length !== 1 ? 's' : ''} for ${targetTerm.label}: ${courseNameList(selected)}. ${evaluation.summary}`
    : 'I could not build a safe recommendation from the available study plan data. Check if the official plan and prerequisites are configured.';

  return {
    target_term: targetTerm,
    mode,
    recommended_courses: selected.map(compactCourse),
    available_courses: candidates.map(compactCourse),
    evaluation,
    advisor_text: advisorText,
    quick_options: [
      { key: 'suggest', label: 'Suggest next semester plan' },
      { key: 'evaluate', label: 'Check my selected plan' },
      { key: 'lighter', label: 'Make it lighter' },
      { key: 'stronger', label: 'Make it stronger' },
    ],
  };
}

async function getContext(req, res, next) {
  try {
    const context = await buildStudentAdvisorContext(req.user.id);
    res.json({
      success: true,
      data: {
        student: context.student,
        plan_meta: context.plan_meta,
        next_term: context.next_term,
        available_courses: context.plan_courses
          .filter(c => !['completed', 'in_progress'].includes(c.computed_status))
          .map(compactCourse),
        completed_courses: context.plan_courses.filter(c => c.computed_status === 'completed').map(compactCourse),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function recommend(req, res, next) {
  try {
    const context = await buildStudentAdvisorContext(req.user.id);
    const mode = ['lighter', 'stronger', 'balanced'].includes(req.body?.mode) ? req.body.mode : 'balanced';
    const result = buildRecommendation(context, mode);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function evaluate(req, res, next) {
  try {
    const context = await buildStudentAdvisorContext(req.user.id);
    const selectedCourses = resolveSelectedCourses(context, req.body || {});
    const evaluation = evaluateCourses(context, selectedCourses);
    res.json({
      success: true,
      data: {
        target_term: context.next_term,
        evaluation,
        advisor_text: evaluation.summary,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function chat(req, res, next) {
  try {
    const context = await buildStudentAdvisorContext(req.user.id);
    const message = String(req.body?.message || '').toLowerCase();

    if (/lighter|less|easy|reduce/.test(message)) {
      return res.json({ success: true, data: buildRecommendation(context, 'lighter') });
    }
    if (/stronger|more|heavy|graduate faster|faster/.test(message)) {
      return res.json({ success: true, data: buildRecommendation(context, 'stronger') });
    }
    if (/check|evaluate|excellent|good|improve|selected|changed/.test(message)) {
      const selectedCourses = resolveSelectedCourses(context, req.body || {});
      const evaluation = evaluateCourses(context, selectedCourses);
      return res.json({ success: true, data: { target_term: context.next_term, evaluation, advisor_text: evaluation.summary } });
    }

    const recommendation = buildRecommendation(context, 'balanced');
    return res.json({ success: true, data: recommendation });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getContext,
  recommend,
  evaluate,
  chat,
};
