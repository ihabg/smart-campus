'use strict';
require('dotenv').config();
const { pool } = require('../config/db');

const IS_COMMIT      = process.argv.includes('--commit');
const SEMESTER       = 'spring';
const ACADEMIC_YEAR  = '2025/2026';
const AMR_STUDENT_NO = '12143698';

// The old deleted Microcontrollers §1 — must never appear in any write.
const BLOCKED_SECTION_ID = '1a5bddea-4f80-4ec6-93c2-168bbcf9f1f6';

// ─────────────────────────────────────────────────────────────────────────────
// Section definitions  (looked up dynamically by course_code + section_number)
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_SECTIONS = [
  { course_code: '10636316', section_number: '1', label: 'Web Programming §1' },
  { course_code: '10636315', section_number: '1', label: 'Database Systems §1' },
  { course_code: '10636313', section_number: '1', label: 'Software Engineering §1' },
  { course_code: '10636318', section_number: '1', label: 'Digital Image Processing §1' },
  { course_code: '10636426', section_number: '2', label: 'Microcontrollers §2' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Material definitions
// ─────────────────────────────────────────────────────────────────────────────
const MATERIAL_DEFS = [
  {
    course_code: '10636315', section_number: '1',
    title:         'Course Outline — Spring 2025/2026',
    material_type: 'lecture_notes',
    week_number:   null,
    description:   'Course overview, topics, grading policy, exam schedule, and lab requirements for Database Systems, Spring 2025/2026.',
  },
  {
    course_code: '10636315', section_number: '1',
    title:         'Week 1: Introduction to Databases',
    material_type: 'slides',
    week_number:   1,
    description:   'Relational model, ER diagrams, entity sets, relationship sets, keys, and introduction to relational algebra.',
  },
  {
    course_code: '10636316', section_number: '1',
    title:         'Week 1: HTML5 & CSS3 Fundamentals',
    material_type: 'slides',
    week_number:   1,
    description:   'HTML5 semantic elements, CSS3 selectors, Flexbox layout model, and responsive design fundamentals.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Assignment definition
// ─────────────────────────────────────────────────────────────────────────────
const ASSIGNMENT_DEF = {
  course_code: '10636315', section_number: '1',
  title:           'Assignment 1 — ER Diagram Design',
  assessment_type: 'assignment',
  description:     'Design a complete ER diagram for a university registration system. Identify all entities, attributes (simple, composite, multivalued), and relationships with cardinality ratios. Submit as a single PDF file.',
  week_number:     2,
  points:          100,
  allow_late:      false,
  allow_review:    false,
  // opens_at = now() - 7 days  |  closes_at = now() + 14 days
};

// ─────────────────────────────────────────────────────────────────────────────
// Quiz definition  (questions and options seeded only when quiz is new)
// ─────────────────────────────────────────────────────────────────────────────
const QUIZ_DEF = {
  course_code: '10636316', section_number: '1',
  title:            'Quiz 1 — HTML & CSS Basics',
  assessment_type:  'quiz',
  description:      'Short quiz covering HTML5 semantic tags, CSS selectors, and responsive layout techniques.',
  week_number:      2,
  points:           20,
  duration_minutes: 30,
  allow_late:       false,
  allow_review:     true,
  // opens_at = now() - 1 day  |  closes_at = now() + 7 days
  questions: [
    {
      question_text: 'Which HTML5 element defines a navigation bar?',
      question_type: 'single_choice',
      points:        7,
      position:      1,
      case_sensitive: false,
      options: [
        { option_text: '<nav>',     is_correct: true,  position: 1 },
        { option_text: '<header>',  is_correct: false, position: 2 },
        { option_text: '<div>',     is_correct: false, position: 3 },
        { option_text: '<section>', is_correct: false, position: 4 },
      ],
    },
    {
      question_text: 'Which CSS property value is used to define a flexible box layout?',
      question_type: 'single_choice',
      points:        7,
      position:      2,
      case_sensitive: false,
      options: [
        { option_text: 'display: flex',      is_correct: true,  position: 1 },
        { option_text: 'display: flexbox',   is_correct: false, position: 2 },
        { option_text: 'display: grid-flex', is_correct: false, position: 3 },
        { option_text: 'display: inline',    is_correct: false, position: 4 },
      ],
    },
    {
      question_text: 'CSS Grid is designed for two-dimensional layouts.',
      question_type: 'single_choice',
      points:        6,
      position:      3,
      case_sensitive: false,
      options: [
        { option_text: 'True',  is_correct: true,  position: 1 },
        { option_text: 'False', is_correct: false, position: 2 },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sep(char = '─', len = 68) { return char.repeat(len); }

function fmtDate(d) {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function daysAgo(n) {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return t;
}

function daysFromNow(n) {
  const t = new Date();
  t.setDate(t.getDate() + n);
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB lookups
// ─────────────────────────────────────────────────────────────────────────────

async function findAmr(client) {
  const r = await client.query(
    `SELECT id, first_name, last_name, student_id, department, year_of_study, status
     FROM   users
     WHERE  student_id = $1`,
    [AMR_STUDENT_NO]
  );
  if (!r.rows.length) {
    throw new Error(`Student with registration number "${AMR_STUDENT_NO}" not found.`);
  }
  return r.rows[0];
}

async function getAmrSpringEnrollments(client, userId) {
  const r = await client.query(
    `SELECT s.id AS section_id, c.code, c.name AS course_name,
            s.section_number, e.status AS enrollment_status
     FROM   enrollments e
     JOIN   sections s ON s.id = e.section_id
     JOIN   courses  c ON c.id = s.course_id
     WHERE  e.student_id  = $1
       AND  s.semester    = $2
       AND  s.academic_year = $3
     ORDER  BY c.code, s.section_number`,
    [userId, SEMESTER, ACADEMIC_YEAR]
  );
  return r.rows;
}

async function lookupSection(client, courseCode, sectionNumber) {
  const r = await client.query(
    `SELECT s.id,
            c.id   AS course_id,
            c.code AS course_code,
            c.name AS course_name,
            s.section_number,
            s.semester,
            s.academic_year,
            s.is_active,
            s.enrolled,
            s.max_capacity,
            i.id   AS instructor_id,
            TRIM(CONCAT_WS(' ',
              NULLIF(TRIM(COALESCE(i.title, '')), ''),
              i.first_name,
              i.last_name
            ))     AS instructor_name,
            (SELECT COUNT(*)::int
             FROM   section_meetings sm
             WHERE  sm.section_id = s.id) AS meeting_count
     FROM   sections s
     JOIN   courses  c ON c.id  = s.course_id
     LEFT JOIN instructors i ON i.id = s.instructor_id
     WHERE  c.code          = $1
       AND  s.section_number = $2
       AND  s.semester       = $3
       AND  s.academic_year  = $4
       AND  s.is_active      = TRUE`,
    [courseCode, sectionNumber, SEMESTER, ACADEMIC_YEAR]
  );
  return r.rows[0] ?? null;
}

async function getEnrollmentStatus(client, studentId, sectionId) {
  const r = await client.query(
    `SELECT status FROM enrollments WHERE student_id = $1 AND section_id = $2`,
    [studentId, sectionId]
  );
  return r.rows[0]?.status ?? null;   // null = no row, 'enrolled' | 'dropped' otherwise
}

async function materialExists(client, sectionId, title) {
  const r = await client.query(
    `SELECT 1 FROM professor_course_materials
     WHERE  section_id = $1 AND title = $2 LIMIT 1`,
    [sectionId, title]
  );
  return r.rows.length > 0;
}

async function assessmentExists(client, sectionId, title, type) {
  const r = await client.query(
    `SELECT 1 FROM course_assessments
     WHERE  section_id = $1 AND title = $2 AND assessment_type = $3 LIMIT 1`,
    [sectionId, title, type]
  );
  return r.rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build plan  (read-only, no writes)
// ─────────────────────────────────────────────────────────────────────────────

async function buildPlan(client) {
  // Dates computed once — same values used in dry-run display and actual writes
  const assignOpensAt  = daysAgo(7);
  const assignClosesAt = daysFromNow(14);
  const quizOpensAt    = daysAgo(1);
  const quizClosesAt   = daysFromNow(7);

  // ── Amr ───────────────────────────────────────────────────────────────────
  const amr            = await findAmr(client);
  const amrEnrollments = await getAmrSpringEnrollments(client, amr.id);

  // ── Resolve target sections ───────────────────────────────────────────────
  const sectionMap = new Map();  // key = `${courseCode}_${sectionNumber}`
  const missing    = [];

  for (const def of TARGET_SECTIONS) {
    const key = `${def.course_code}_${def.section_number}`;
    const sec = await lookupSection(client, def.course_code, def.section_number);

    if (!sec) {
      missing.push(def);
      continue;
    }

    // Block the old deleted section from ever appearing in writes
    if (sec.id === BLOCKED_SECTION_ID) {
      throw new Error(
        `ABORT — section lookup returned the old deleted Microcontrollers §1 ` +
        `[${BLOCKED_SECTION_ID}]. This must not happen. Halting.`
      );
    }

    sectionMap.set(key, { ...sec, def });
  }

  if (missing.length) {
    const lines = missing.map(d => `  ${d.label}  (code=${d.course_code}, §${d.section_number})`);
    throw new Error(
      `ABORT — these target sections were not found in ${SEMESTER} ${ACADEMIC_YEAR}:\n` +
      lines.join('\n')
    );
  }

  // ── Enrollment plan ───────────────────────────────────────────────────────
  const enrollPlan = [];
  for (const def of TARGET_SECTIONS) {
    const sec      = sectionMap.get(`${def.course_code}_${def.section_number}`);
    const existing = await getEnrollmentStatus(client, amr.id, sec.id);
    enrollPlan.push({
      def,
      sec,
      existing,                               // null | 'enrolled' | 'dropped'
      action: existing === 'enrolled' ? 'skip' : 'enroll',
    });
  }

  // ── Materials plan ────────────────────────────────────────────────────────
  const matPlan = [];
  for (const md of MATERIAL_DEFS) {
    const sec    = sectionMap.get(`${md.course_code}_${md.section_number}`);
    const exists = await materialExists(client, sec.id, md.title);
    matPlan.push({ def: md, sec, exists, action: exists ? 'skip' : 'insert' });
  }

  // ── Assignment plan ───────────────────────────────────────────────────────
  const aSec         = sectionMap.get(`${ASSIGNMENT_DEF.course_code}_${ASSIGNMENT_DEF.section_number}`);
  const assignExists = await assessmentExists(
    client, aSec.id, ASSIGNMENT_DEF.title, ASSIGNMENT_DEF.assessment_type
  );
  const assignPlan = {
    def:       ASSIGNMENT_DEF,
    sec:       aSec,
    exists:    assignExists,
    action:    assignExists ? 'skip' : 'insert',
    opens_at:  assignOpensAt,
    closes_at: assignClosesAt,
  };

  // ── Quiz plan ─────────────────────────────────────────────────────────────
  const qSec       = sectionMap.get(`${QUIZ_DEF.course_code}_${QUIZ_DEF.section_number}`);
  const quizExists = await assessmentExists(
    client, qSec.id, QUIZ_DEF.title, QUIZ_DEF.assessment_type
  );
  const quizPlan = {
    def:       QUIZ_DEF,
    sec:       qSec,
    exists:    quizExists,
    action:    quizExists ? 'skip' : 'insert',
    opens_at:  quizOpensAt,
    closes_at: quizClosesAt,
  };

  return { amr, amrEnrollments, sectionMap, enrollPlan, matPlan, assignPlan, quizPlan };
}

// ─────────────────────────────────────────────────────────────────────────────
// Print plan (dry-run report)
// ─────────────────────────────────────────────────────────────────────────────

function printPlan(plan) {
  const { amr, amrEnrollments, enrollPlan, matPlan, assignPlan, quizPlan } = plan;

  // Pre-calculate totals
  const newEnrollments = enrollPlan.filter(e => e.action === 'enroll').length;
  const newMaterials   = matPlan.filter(m => m.action === 'insert').length;
  const newAssignment  = assignPlan.action === 'insert' ? 1 : 0;
  const newQuiz        = quizPlan.action   === 'insert' ? 1 : 0;
  const newQuestions   = newQuiz ? QUIZ_DEF.questions.length : 0;
  const newOptions     = newQuiz ? QUIZ_DEF.questions.reduce((s, q) => s + q.options.length, 0) : 0;
  const grandTotal     = newEnrollments + newMaterials + newAssignment + newQuiz + newQuestions + newOptions;

  console.log('');
  console.log(sep('═'));
  console.log('  seedSpringDemoContent2025_2026  —  Spring 2025/2026');
  console.log(`  Mode : ${IS_COMMIT ? 'COMMIT — data will be written' : 'DRY-RUN — nothing will change'}`);
  console.log(sep('═'));
  console.log('');

  // ── Demo student ──────────────────────────────────────────────────────────
  console.log(sep());
  console.log('  DEMO STUDENT');
  console.log(sep());
  console.log(`  Name           : ${amr.first_name} ${amr.last_name}`);
  console.log(`  Registration # : ${amr.student_id}`);
  console.log(`  User ID        : ${amr.id}`);
  console.log(`  Department     : ${amr.department}`);
  console.log(`  Year           : ${amr.year_of_study}`);
  console.log(`  Status         : ${amr.status}`);
  console.log('');
  console.log(`  Current Spring 2025/2026 enrollments (${amrEnrollments.length}):`);
  if (!amrEnrollments.length) {
    console.log('    (none)');
  } else {
    for (const e of amrEnrollments) {
      const badge = e.enrollment_status.toUpperCase().padEnd(8);
      console.log(`    [${badge}]  ${e.code}  §${e.section_number}  —  ${e.course_name}`);
    }
  }
  console.log('');

  // ── Safety check ──────────────────────────────────────────────────────────
  console.log(sep());
  console.log('  SAFETY  —  Old Deleted Microcontrollers §1');
  console.log(sep());
  console.log(`  Blocked ID : ${BLOCKED_SECTION_ID}`);
  console.log('  Status     : NOT referenced in any target section, material, or assessment. ✓');
  console.log('');

  // ── Enrollment plan ───────────────────────────────────────────────────────
  console.log(sep());
  console.log(`  ENROLLMENTS  (${newEnrollments} new, ${enrollPlan.length - newEnrollments} already enrolled)`);
  console.log(sep());
  for (const ep of enrollPlan) {
    const tag   = ep.action === 'skip' ? 'SKIP — already enrolled' : 'ENROLL';
    const warn  = ep.sec.meeting_count === 0 ? '  ⚠ no meetings' : '';
    const react = ep.existing === 'dropped' ? '  (re-activates dropped row)' : '';
    console.log(`  [${tag}]  ${ep.def.label}${react}`);
    if (ep.action === 'enroll') {
      console.log(`    section_id : ${ep.sec.id}`);
      console.log(`    course     : ${ep.sec.course_code}  §${ep.sec.section_number}  —  ${ep.sec.course_name}`);
      console.log(`    instructor : ${ep.sec.instructor_name}`);
      console.log(`    enrolled   : ${ep.sec.enrolled}${ep.sec.max_capacity ? ' / ' + ep.sec.max_capacity : ''}  |  meetings: ${ep.sec.meeting_count}${warn}`);
    }
    console.log('');
  }

  // ── Materials plan ────────────────────────────────────────────────────────
  console.log(sep());
  console.log(`  MATERIALS  (${newMaterials} new, ${matPlan.length - newMaterials} already exist)`);
  console.log(sep());
  for (const mp of matPlan) {
    const tag = mp.action === 'skip' ? 'SKIP — exists' : 'INSERT';
    console.log(`  [${tag}]  "${mp.def.title}"`);
    if (mp.action === 'insert') {
      console.log(`    section    : ${mp.def.course_code}  §${mp.def.section_number}  —  ${mp.sec.course_name}`);
      console.log(`    section_id : ${mp.sec.id}`);
      console.log(`    type       : ${mp.def.material_type}  |  week: ${mp.def.week_number ?? '—'}`);
      console.log(`    instructor : ${mp.sec.instructor_name}  [${mp.sec.instructor_id}]`);
      console.log(`    file_url   : null  (text/description only — no upload needed)`);
    }
    console.log('');
  }

  // ── Assignment plan ───────────────────────────────────────────────────────
  console.log(sep());
  console.log(`  ASSIGNMENT  (${newAssignment} new)`);
  console.log(sep());
  if (assignPlan.action === 'insert') {
    console.log(`  [INSERT]  "${assignPlan.def.title}"`);
    console.log(`    section    : ${assignPlan.def.course_code}  §${assignPlan.def.section_number}  —  ${assignPlan.sec.course_name}`);
    console.log(`    section_id : ${assignPlan.sec.id}`);
    console.log(`    instructor : ${assignPlan.sec.instructor_name}  [${assignPlan.sec.instructor_id}]`);
    console.log(`    type       : ${assignPlan.def.assessment_type}  |  points: ${assignPlan.def.points}  |  week: ${assignPlan.def.week_number}`);
    console.log(`    opens_at   : ${fmtDate(assignPlan.opens_at)}    ← 7 days ago  (visible to students now)`);
    console.log(`    closes_at  : ${fmtDate(assignPlan.closes_at)}   ← in 14 days`);
    console.log(`    published  : true`);
  } else {
    console.log(`  [SKIP — exists]  "${assignPlan.def.title}"`);
  }
  console.log('');

  // ── Quiz plan ─────────────────────────────────────────────────────────────
  console.log(sep());
  console.log(`  QUIZ  (${newQuiz} new)`);
  console.log(sep());
  if (quizPlan.action === 'insert') {
    console.log(`  [INSERT]  "${quizPlan.def.title}"`);
    console.log(`    section    : ${quizPlan.def.course_code}  §${quizPlan.def.section_number}  —  ${quizPlan.sec.course_name}`);
    console.log(`    section_id : ${quizPlan.sec.id}`);
    console.log(`    instructor : ${quizPlan.sec.instructor_name}  [${quizPlan.sec.instructor_id}]`);
    console.log(`    type       : ${quizPlan.def.assessment_type}  |  points: ${quizPlan.def.points}  |  duration: ${quizPlan.def.duration_minutes} min  |  week: ${quizPlan.def.week_number}`);
    console.log(`    opens_at   : ${fmtDate(quizPlan.opens_at)}    ← yesterday  (open now)`);
    console.log(`    closes_at  : ${fmtDate(quizPlan.closes_at)}   ← in 7 days`);
    console.log(`    published  : true  |  allow_review: ${quizPlan.def.allow_review}`);
    console.log('');

    let questionPtsTotal = 0;
    for (const q of quizPlan.def.questions) {
      questionPtsTotal += q.points;
      const trunc = q.question_text.length > 62
        ? q.question_text.slice(0, 62) + '…'
        : q.question_text;
      console.log(`    Q${q.position} [${q.question_type.padEnd(15)}]  ${q.points} pts  "${trunc}"`);
      for (const o of q.options) {
        const mark = o.is_correct ? '✓' : '○';
        console.log(`       ${mark}  "${o.option_text}"`);
      }
      console.log('');
    }
    console.log(`    Total question pts: ${questionPtsTotal}  (quiz total: ${quizPlan.def.points})`);
    console.log(`    quiz_questions rows : ${QUIZ_DEF.questions.length}`);
    console.log(`    quiz_options  rows  : ${QUIZ_DEF.questions.reduce((s, q) => s + q.options.length, 0)}`);
  } else {
    console.log(`  [SKIP — exists]  "${quizPlan.def.title}"`);
  }
  console.log('');

  // ── Grand summary ─────────────────────────────────────────────────────────
  console.log(sep());
  console.log('  SUMMARY');
  console.log(sep());
  function row(label, n) {
    const flag = n > 0 ? ' ←' : '';
    console.log(`  ${'  ' + label}`.padEnd(42) + String(n).padStart(4) + flag);
  }
  row('enrollments  (INSERT / upsert)', newEnrollments);
  row('professor_course_materials',    newMaterials);
  row('course_assessments',            newAssignment + newQuiz);
  row('quiz_questions',                newQuestions);
  row('quiz_options',                  newOptions);
  console.log('  ' + '─'.repeat(40));
  console.log(`  ${'TOTAL new rows'.padEnd(40)}${String(grandTotal).padStart(4)}`);
  console.log('');
  console.log('  Tables NOT touched:');
  console.log('  • users, students, instructors, courses, rooms, semesters');
  console.log('  • sections, section_meetings, grades, attendance');
  console.log('  • old deleted Microcontrollers §1  [' + BLOCKED_SECTION_ID + ']');
  console.log('  • fall 2025/2026  |  any other semester  |  .env');
  console.log('');

  return grandTotal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute writes  (called inside a single BEGIN … COMMIT)
// ─────────────────────────────────────────────────────────────────────────────

async function executeWrites(client, plan) {
  const { amr, enrollPlan, matPlan, assignPlan, quizPlan } = plan;
  let written = 0;

  // ── Enrollments ───────────────────────────────────────────────────────────
  for (const ep of enrollPlan) {
    if (ep.action === 'skip') {
      console.log(`  skip    enroll   ${ep.def.label}`);
      continue;
    }

    // Safety: never write to the blocked old section
    if (ep.sec.id === BLOCKED_SECTION_ID) {
      throw new Error(`ABORT — enroll target resolved to blocked section ID ${BLOCKED_SECTION_ID}.`);
    }

    await client.query(
      `INSERT INTO enrollments (student_id, section_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, section_id)
         DO UPDATE SET status = 'enrolled', updated_at = NOW()`,
      [amr.id, ep.sec.id]
    );

    // Keep sections.enrolled counter consistent
    await client.query(
      `UPDATE sections SET enrolled = enrolled + 1 WHERE id = $1`,
      [ep.sec.id]
    );

    const note = ep.existing === 'dropped' ? '  ← re-activated from dropped' : '';
    console.log(`  insert  enroll   ${ep.def.label}${note}`);
    written++;
  }

  // ── Materials ─────────────────────────────────────────────────────────────
  for (const mp of matPlan) {
    if (mp.action === 'skip') {
      console.log(`  skip    material  "${mp.def.title}"`);
      continue;
    }

    // Safety check
    if (mp.sec.id === BLOCKED_SECTION_ID) {
      throw new Error(`ABORT — material target resolved to blocked section ID ${BLOCKED_SECTION_ID}.`);
    }

    await client.query(
      `INSERT INTO professor_course_materials
         (instructor_id, section_id, course_id,
          title, material_type, description,
          file_url, week_number, semester, academic_year, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)`,
      [
        mp.sec.instructor_id,
        mp.sec.id,
        mp.sec.course_id,
        mp.def.title,
        mp.def.material_type,
        mp.def.description,
        null,             // file_url nullable — no fake upload needed
        mp.def.week_number,
        SEMESTER,
        ACADEMIC_YEAR,
      ]
    );

    console.log(`  insert  material  "${mp.def.title}"`);
    written++;
  }

  // ── Assignment ────────────────────────────────────────────────────────────
  if (assignPlan.action === 'skip') {
    console.log(`  skip    assignment  "${assignPlan.def.title}"`);
  } else {
    if (assignPlan.sec.id === BLOCKED_SECTION_ID) {
      throw new Error(`ABORT — assignment target resolved to blocked section ID ${BLOCKED_SECTION_ID}.`);
    }

    await client.query(
      `INSERT INTO course_assessments
         (instructor_id, section_id, course_id,
          title, description, assessment_type,
          week_number, opens_at, closes_at,
          points, allow_late, is_published, allow_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, FALSE)`,
      [
        assignPlan.sec.instructor_id,
        assignPlan.sec.id,
        assignPlan.sec.course_id,
        assignPlan.def.title,
        assignPlan.def.description,
        assignPlan.def.assessment_type,
        assignPlan.def.week_number,
        assignPlan.opens_at,
        assignPlan.closes_at,
        assignPlan.def.points,
        assignPlan.def.allow_late,
      ]
    );
    console.log(`  insert  assignment  "${assignPlan.def.title}"`);
    written++;
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────
  if (quizPlan.action === 'skip') {
    console.log(`  skip    quiz  "${quizPlan.def.title}"`);
  } else {
    if (quizPlan.sec.id === BLOCKED_SECTION_ID) {
      throw new Error(`ABORT — quiz target resolved to blocked section ID ${BLOCKED_SECTION_ID}.`);
    }

    const quizRow = await client.query(
      `INSERT INTO course_assessments
         (instructor_id, section_id, course_id,
          title, description, assessment_type,
          week_number, opens_at, closes_at,
          points, duration_minutes, allow_late, is_published, allow_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, $13)
       RETURNING id`,
      [
        quizPlan.sec.instructor_id,
        quizPlan.sec.id,
        quizPlan.sec.course_id,
        quizPlan.def.title,
        quizPlan.def.description,
        quizPlan.def.assessment_type,
        quizPlan.def.week_number,
        quizPlan.opens_at,
        quizPlan.closes_at,
        quizPlan.def.points,
        quizPlan.def.duration_minutes,
        quizPlan.def.allow_late,
        quizPlan.def.allow_review,
      ]
    );
    const quizId = quizRow.rows[0].id;
    console.log(`  insert  quiz      "${quizPlan.def.title}"  [${quizId}]`);
    written++;

    // Questions + options — only when quiz is freshly created
    for (const q of quizPlan.def.questions) {
      const qRow = await client.query(
        `INSERT INTO quiz_questions
           (assessment_id, question_text, question_type,
            points, position, case_sensitive)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [quizId, q.question_text, q.question_type, q.points, q.position, q.case_sensitive]
      );
      const qId = qRow.rows[0].id;
      console.log(`    insert  question  Q${q.position}  [${q.question_type}]  "${q.question_text.slice(0, 55)}"`);
      written++;

      for (const opt of q.options) {
        await client.query(
          `INSERT INTO quiz_options (question_id, option_text, is_correct, position)
           VALUES ($1, $2, $3, $4)`,
          [qId, opt.option_text, opt.is_correct, opt.position]
        );
        written++;
      }
      console.log(`      inserted ${q.options.length} option(s) for Q${q.position}`);
    }
  }

  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    console.log('');
    console.log(sep('─'));
    console.log('  seedSpringDemoContent2025_2026.js');
    console.log(`  Semester : ${SEMESTER}  ${ACADEMIC_YEAR}`);
    console.log(`  Mode     : ${IS_COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
    console.log(sep('─'));

    // Build plan (read-only)
    const plan = await buildPlan(client);

    // Print dry-run report
    const grandTotal = printPlan(plan);

    if (!IS_COMMIT) {
      console.log(sep('═'));
      console.log('  DRY-RUN COMPLETE — no data was changed.');
      console.log('  Inspect the plan above, then run:');
      console.log('    node scripts/seedSpringDemoContent2025_2026.js --commit');
      console.log(sep('═'));
      console.log('');
      return;
    }

    // ── Commit mode ───────────────────────────────────────────────────────────
    console.log(sep('═'));
    console.log('  EXECUTING WRITES');
    console.log(sep('═'));
    console.log('');

    await client.query('BEGIN');

    try {
      const written = await executeWrites(client, plan);
      await client.query('COMMIT');

      console.log('');
      console.log(sep('═'));
      console.log(`  COMMITTED — ${written} rows written.`);
      console.log('');
      console.log('  What was seeded:');
      console.log('  • Amr Jamhour enrolled in 5 Spring 2025/2026 sections');
      console.log('  • 3 course materials (Database Systems ×2, Web Programming ×1)');
      console.log('  • 1 assignment (Database Systems §1 — due in 14 days)');
      console.log('  • 1 quiz with 3 questions + 10 options (Web Programming §1 — due in 7 days)');
      console.log('');
      console.log('  Old deleted Microcontrollers §1 was NOT touched.');
      console.log(sep('═'));
      console.log('');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('');
      console.error(sep('!'));
      console.error('  ROLLBACK — nothing was written.');
      console.error(`  Reason: ${err.message}`);
      console.error(sep('!'));
      console.error('');
      process.exit(1);
    }

  } catch (err) {
    console.error('');
    console.error(`  ERROR: ${err.message}`);
    console.error('');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
