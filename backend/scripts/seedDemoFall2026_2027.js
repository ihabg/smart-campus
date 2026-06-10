'use strict';
/**
 * Demo seed — Fall 2026/2027 · Faculty of Engineering (Computer Engineering)
 *
 * Dry-run (default, no writes):
 *   node scripts/seedDemoFall2026_2027.js
 *
 * Commit to DB (single transaction, all-or-nothing):
 *   node scripts/seedDemoFall2026_2027.js --commit
 *
 * Idempotent: running twice produces the same result (skips existing rows).
 * Safe: rolls back everything if any write fails.
 */
require('dotenv').config();
const { pool } = require('../config/db');

// ─── Runtime flags ────────────────────────────────────────────────────────────
const IS_COMMIT     = process.argv.includes('--commit');
const SEMESTER      = 'fall';
const ACADEMIC_YEAR = '2026/2027';
const AMR_REG_NO    = '12143698';

// Amr's known IDs (printed during preflight; enrollments use user_id)
const AMR_USER_ID = 'c1750294-e784-47b4-84fe-cf57196c5495';
const AMR_SP_ID   = '9a174ce5-1a99-436b-881f-13fe54b4a074';

// ─── Room type sets ───────────────────────────────────────────────────────────
const TEACHING_TYPES = new Set([
  'lecture_hall', 'lab', 'amphitheater',
  'engineering_drawing_room', 'engineering_drawing_studio',
]);
const LAB_TYPES = new Set([
  'lab', 'engineering_drawing_room', 'engineering_drawing_studio',
]);
const LECTURE_TYPES = new Set(['lecture_hall', 'amphitheater']);

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Rooms kept free for event-booking / professor room-change demo ───────────
const FREE_DEMO_ROOMS = [
  '1180','1181','1230',
  'G0010','G0011','G0250','G0260',
  '4040','4050','4070','4100',
  'B1030','B1040','B1050','B1060','B1070','B1080',
  'B1100','B1110','B1150','B1160','B1170','B1180',
  'B1190','B1200','B1210','B1220','B1230',
  'B2040','B2050','B2080','B2090','B2100',
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION DEFINITIONS  (25 sections)
//
//  Pattern A  days=[0,2,4]  Sun 1h in-person, Tue 1h in-person, Thu 1h ONLINE
//  Pattern B  days=[1,3]    Mon 1h in-person, Wed 2h in-person
//  Lab 2×2h   days=[1,3]    Mon 2h lab,       Wed 2h lab
//  Lab 4h Thu days=[4]      Thu 4h lab
//
//  amr:true  → enroll Amr and add demo content to this section
//  All IDs resolved at runtime; no hardcoded UUIDs in SECTION_DEFS.
// ─────────────────────────────────────────────────────────────────────────────
const SECTION_DEFS = [

  // ── Pattern A — Amr's four courses ─────────────────────────────────────────
  { label: 'Artificial Intelligence §1',
    course_code: '10636429', section_number: '1', doctor_number: 1007,
    room_number: '1020', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1020', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1020', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    enroll: 22, amr: true },

  { label: 'Operating Systems §1',
    course_code: '10636451', section_number: '1', doctor_number: 1005,
    room_number: '1021', days: [0,2,4], start_time: '10:00', end_time: '11:00',
    meetings: [
      { day: 0, start: '10:00', end: '11:00', room: '1021', type: 'lecture' },
      { day: 2, start: '10:00', end: '11:00', room: '1021', type: 'lecture' },
      { day: 4, start: '10:00', end: '11:00', room: null,   type: 'online'  },
    ],
    enroll: 22, amr: true },

  { label: 'Information and Network Security §1',
    course_code: '10636511', section_number: '1', doctor_number: 1006,
    room_number: '1031', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '1031', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '1031', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    enroll: 20, amr: true },

  { label: 'Data Mining §1',
    course_code: '10636515', section_number: '1', doctor_number: 1008,
    room_number: '1060', days: [0,2,4], start_time: '13:00', end_time: '14:00',
    meetings: [
      { day: 0, start: '13:00', end: '14:00', room: '1060', type: 'lecture' },
      { day: 2, start: '13:00', end: '14:00', room: '1060', type: 'lecture' },
      { day: 4, start: '13:00', end: '14:00', room: null,   type: 'online'  },
    ],
    enroll: 20, amr: true },

  // ── Pattern A — filler (9 sections) ────────────────────────────────────────
  { label: 'Data Structures §1',
    course_code: '10636210', section_number: '1', doctor_number: 1002,
    room_number: '1020', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '1020', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '1020', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    enroll: 20 },

  { label: 'Object Oriented Programming §1',
    course_code: '10636213', section_number: '1', doctor_number: 1003,
    room_number: '1021', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '1021', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '1021', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    enroll: 20 },

  { label: 'Discrete Mathematics §2',
    course_code: '10636215', section_number: '2', doctor_number: 1004,
    room_number: '1030', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '1030', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '1030', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    enroll: 18 },

  { label: 'Computer Architecture I §1',
    course_code: '10636323', section_number: '1', doctor_number: 1016,
    room_number: '1030', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1030', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1030', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    enroll: 18 },

  { label: 'Microprocessors §1',
    course_code: '10636322', section_number: '1', doctor_number: 1017,
    room_number: '1031', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1031', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1031', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    enroll: 18 },

  { label: 'Algorithms and Complexity §1',
    course_code: '10636314', section_number: '1', doctor_number: 1022,
    room_number: '1060', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1060', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1060', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    enroll: 18 },

  { label: 'Computer Networks II §1',
    course_code: '10636455', section_number: '1', doctor_number: 1050,
    room_number: '1070', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '1070', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '1070', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    enroll: 18 },

  { label: 'Computer Graphics §1',
    course_code: '10636418', section_number: '1', doctor_number: 1052,
    room_number: '1170', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1170', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1170', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    enroll: 17 },

  { label: 'Compiler Construction §1',
    course_code: '10636416', section_number: '1', doctor_number: 1094,
    room_number: '4030', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '4030', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '4030', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    enroll: 16 },

  // ── Pattern B — Amr's three courses ────────────────────────────────────────
  // Monday 1h in-person + Wednesday 2h in-person (NOT 2 × 1.5h)
  { label: 'Advanced Software Engineering §1',
    course_code: '10636512', section_number: '1', doctor_number: 1062,
    room_number: '1080', days: [1,3], start_time: '08:00', end_time: '10:00',
    meetings: [
      { day: 1, start: '08:00', end: '09:00', room: '1080', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '08:00', end: '10:00', room: '1080', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 20, amr: true },

  { label: 'Applied Machine Learning §1',
    course_code: '10636517', section_number: '1', doctor_number: 1063,
    room_number: '1100', days: [1,3], start_time: '10:00', end_time: '12:00',
    meetings: [
      { day: 1, start: '10:00', end: '11:00', room: '1100', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '10:00', end: '12:00', room: '1100', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 20, amr: true },

  { label: 'Mobile Computing §1',
    course_code: '10636513', section_number: '1', doctor_number: 1069,
    room_number: '1191', days: [1,3], start_time: '13:00', end_time: '15:00',
    meetings: [
      { day: 1, start: '13:00', end: '14:00', room: '1191', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '13:00', end: '15:00', room: '1191', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 18, amr: true },

  // ── Pattern B — filler (5 sections) ────────────────────────────────────────
  { label: 'Advanced Database Systems §1',
    course_code: '10636415', section_number: '1', doctor_number: 1019,
    room_number: 'G0110', days: [1,3], start_time: '08:00', end_time: '10:00',
    meetings: [
      { day: 1, start: '08:00', end: '09:00', room: 'G0110', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '08:00', end: '10:00', room: 'G0110', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 18 },

  { label: 'Computer Networks I §1',
    course_code: '10636454', section_number: '1', doctor_number: 1105,
    room_number: 'G0120', days: [1,3], start_time: '09:00', end_time: '11:00',
    meetings: [
      { day: 1, start: '09:00', end: '10:00', room: 'G0120', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '09:00', end: '11:00', room: 'G0120', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 20 },

  { label: 'Distributed Operating Systems §1',
    course_code: '10636456', section_number: '1', doctor_number: 2111,
    room_number: 'G0140', days: [1,3], start_time: '11:00', end_time: '13:00',
    meetings: [
      { day: 1, start: '11:00', end: '12:00', room: 'G0140', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '11:00', end: '13:00', room: 'G0140', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 16 },

  { label: 'Advanced Web Programming §1',
    course_code: '10636514', section_number: '1', doctor_number: 1004,
    room_number: 'G0150', days: [1,3], start_time: '12:00', end_time: '14:00',
    meetings: [
      { day: 1, start: '12:00', end: '13:00', room: 'G0150', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '12:00', end: '14:00', room: 'G0150', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 18 },

  { label: 'Artificial Intelligence §2',
    course_code: '10636429', section_number: '2', doctor_number: 1016,
    room_number: 'G0190', days: [1,3], start_time: '08:00', end_time: '10:00',
    meetings: [
      { day: 1, start: '08:00', end: '09:00', room: 'G0190', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '08:00', end: '10:00', room: 'G0190', type: 'lecture' }, // Wed 2 h
    ],
    enroll: 20 },

  // ── Labs (4 sections) ───────────────────────────────────────────────────────
  // doc 1094: teaches Compiler §1 on Sun/Tue — Thu is free
  { label: 'Microcontrollers Lab §2',
    course_code: '10636496', section_number: '2', doctor_number: 1094,
    room_number: '2050', days: [4], start_time: '08:00', end_time: '12:00',
    meetings: [
      { day: 4, start: '08:00', end: '12:00', room: '2050', type: 'lab' }, // Thu 4 h
    ],
    enroll: 14 },

  // doc 1022: teaches Algorithms §1 on Sun/Tue — Mon/Wed are free
  { label: 'Computer Design Lab §1',
    course_code: '10636493', section_number: '1', doctor_number: 1022,
    room_number: '3100', days: [1,3], start_time: '13:00', end_time: '15:00',
    meetings: [
      { day: 1, start: '13:00', end: '15:00', room: '3100', type: 'lab' }, // Mon 2 h
      { day: 3, start: '13:00', end: '15:00', room: '3100', type: 'lab' }, // Wed 2 h
    ],
    enroll: 14 },

  // doc 1062: teaches Adv SE §1 on Mon/Wed — Thu is free
  { label: 'Networks Lab §1',
    course_code: '10636594', section_number: '1', doctor_number: 1062,
    room_number: 'B1141', days: [4], start_time: '13:00', end_time: '17:00',
    meetings: [
      { day: 4, start: '13:00', end: '17:00', room: 'B1141', type: 'lab' }, // Thu 4 h
    ],
    enroll: 14 },

  // doc 1052: teaches Computer Graphics §1 on Sun/Tue — Mon/Wed are free
  { label: 'VLSI Design Verification Lab §1',
    course_code: '10636495', section_number: '1', doctor_number: 1052,
    room_number: '4080', days: [1,3], start_time: '13:00', end_time: '15:00',
    meetings: [
      { day: 1, start: '13:00', end: '15:00', room: '4080', type: 'lab' }, // Mon 2 h
      { day: 3, start: '13:00', end: '15:00', room: '4080', type: 'lab' }, // Wed 2 h
    ],
    enroll: 14 },
];

// ─────────────────────────────────────────────────────────────────────────────
// DEMO CONTENT  (Amr's sections only)
// ─────────────────────────────────────────────────────────────────────────────

const MATERIAL_DEFS = [
  { course_code: '10636429', section_number: '1',
    title:         'Week 1: Introduction to AI and Search Problems',
    material_type: 'slides',
    week_number:   1,
    description:   'Introduction to Artificial Intelligence, problem-solving agents, state-space representation, uninformed search strategies (BFS, DFS, UCS), and analysis of completeness and optimality.',
  },
  { course_code: '10636451', section_number: '1',
    title:         'Lecture 1: Introduction to Operating Systems',
    material_type: 'lecture_notes',
    week_number:   1,
    description:   'OS definition and goals, roles of an OS, process vs program, kernel and user space, system call interface, and an overview of UNIX/Linux architecture.',
  },
  { course_code: '10636517', section_number: '1',
    title:         'Week 1: Foundations of Supervised Learning',
    material_type: 'slides',
    week_number:   1,
    description:   'Overview of supervised learning, regression vs classification, hypothesis space, loss functions, gradient descent, and the bias-variance trade-off.',
  },
];

// Assignment — duration_minutes MUST be NULL (DB CHECK constraint)
const ASSIGNMENT_DEF = {
  course_code: '10636429', section_number: '1',
  title:           'Assignment 1 — Uninformed Search Algorithms',
  assessment_type: 'assignment',
  description:     'Implement BFS, DFS, and UCS on a given state-space graph. Compare time complexity, space complexity, and optimality for each. Submit a PDF report and commented source code.',
  week_number:     2,
  points:          100,
  duration_minutes: null, // assignment: must be NULL per DB CHECK
  allow_late:      false,
  allow_review:    false,
  // opens_at = 7 days ago  /  closes_at = 14 days from now
};

// Quiz — duration_minutes MUST be > 0 (DB CHECK constraint)
// All questions use single_choice (only valid types: single_choice | multiple_choice | text)
const QUIZ_DEF = {
  course_code: '10636451', section_number: '1',
  title:           'Quiz 1 — OS Fundamentals',
  assessment_type: 'quiz',
  description:     'Short quiz covering process concepts, CPU scheduling, and deadlock conditions.',
  week_number:     2,
  points:          20,
  duration_minutes: 30, // quiz: must be > 0 per DB CHECK
  allow_late:      false,
  allow_review:    true,
  // opens_at = 1 day ago  /  closes_at = 7 days from now
  questions: [
    { question_text: 'What is a process in an operating system?',
      question_type: 'single_choice',
      points: 7, position: 1, case_sensitive: false,
      options: [
        { option_text: 'A program in execution',       is_correct: true,  position: 1 },
        { option_text: 'A file stored on disk',        is_correct: false, position: 2 },
        { option_text: 'A hardware interrupt handler', is_correct: false, position: 3 },
        { option_text: 'A region of physical memory',  is_correct: false, position: 4 },
      ] },
    { question_text: 'Which CPU scheduling algorithm yields the minimum average waiting time when all burst times are known in advance?',
      question_type: 'single_choice',
      points: 7, position: 2, case_sensitive: false,
      options: [
        { option_text: 'First Come First Served (FCFS)', is_correct: false, position: 1 },
        { option_text: 'Round Robin',                    is_correct: false, position: 2 },
        { option_text: 'Shortest Job First (SJF)',        is_correct: true,  position: 3 },
        { option_text: 'Priority Scheduling',            is_correct: false, position: 4 },
      ] },
    { question_text: 'A deadlock requires all four conditions to hold simultaneously: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.',
      question_type: 'single_choice',
      points: 6, position: 3, case_sensitive: false,
      options: [
        { option_text: 'True',  is_correct: true,  position: 1 },
        { option_text: 'False', is_correct: false, position: 2 },
      ] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────
function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function overlaps(s1, e1, s2, e2) {
  return toMins(s1) < toMins(e2) && toMins(s2) < toMins(e1);
}
function hr(title) {
  console.log(`\n${'─'.repeat(66)}`);
  console.log(` ${title}`);
  console.log('─'.repeat(66));
}
const ok   = m => console.log(`  ✓  ${m}`);
const warn = m => console.log(`  ⚠  ${m}`);
const fail = m => console.log(`  ✗  ${m}`);
const info = m => console.log(`  ·  ${m}`);

function daysAgo(n)      { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n)  { const d = new Date(); d.setDate(d.getDate() + n); return d; }

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT  – validate all static references and load existing state
// ─────────────────────────────────────────────────────────────────────────────
async function preflight(client) {
  const state = {
    semesterRow:      null,
    courseMap:        {},   // code  → { id, name, credit_hours }
    instrMap:         {},   // doctor_number → { id }
    roomMap:          {},   // room_number   → { id, room_type }
    existingSections: [],   // rows already in DB for fall 2026/2027
    errors:           [],
    warnings:         [],
  };

  // 1. Amr identity check ────────────────────────────────────────────────────
  const amrRes = await client.query(
    `SELECT u.id AS user_id, u.first_name, u.last_name,
            sp.id AS sp_id, sp.registration_number, sp.year_of_study
     FROM   users u
     JOIN   student_profiles sp ON sp.user_id = u.id
     WHERE  sp.registration_number = $1`,
    [AMR_REG_NO]
  );
  if (!amrRes.rows.length) {
    state.errors.push(`Student with registration_number="${AMR_REG_NO}" not found`);
  } else {
    const a = amrRes.rows[0];
    if (a.user_id !== AMR_USER_ID) {
      state.errors.push(
        `Amr user_id mismatch: DB=${a.user_id} but hardcoded=${AMR_USER_ID}`
      );
    }
    if (a.sp_id !== AMR_SP_ID) {
      state.warnings.push(
        `Amr student_profile id mismatch: DB=${a.sp_id} but hardcoded=${AMR_SP_ID} (harmless — enrollment uses user_id)`
      );
    }
    hr('AMR IDENTITY');
    ok(`Amr ${a.first_name} ${a.last_name}  (Year ${a.year_of_study})`);
    info(`user_id           (used for enrollments) : ${a.user_id}`);
    info(`student_profile_id (NOT used here)       : ${a.sp_id}`);
    info(`registration_number                      : ${a.registration_number}`);
    info(`enrollments.student_id FK → users.id  ✓`);
  }

  // 2. Semester ───────────────────────────────────────────────────────────────
  const semRes = await client.query(
    `SELECT id, status FROM semesters WHERE semester=$1 AND academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (!semRes.rows.length) {
    state.errors.push(`Semester "${SEMESTER} ${ACADEMIC_YEAR}" not found in semesters table`);
  } else {
    state.semesterRow = semRes.rows[0];
    if (state.semesterRow.status !== 'published') {
      state.warnings.push(
        `Semester status is "${state.semesterRow.status}" (not published). ` +
        `Students will not see sections until status = 'published'.`
      );
    }
  }

  // 3. Courses ────────────────────────────────────────────────────────────────
  const courseCodes = [...new Set(SECTION_DEFS.map(s => s.course_code))];
  for (const code of courseCodes) {
    const r = await client.query(
      `SELECT id, name, credit_hours FROM courses WHERE code=$1 AND is_active=true`,
      [code]
    );
    if (!r.rows.length) {
      state.errors.push(`Course not found or inactive: code=${code}`);
    } else {
      state.courseMap[code] = r.rows[0];
    }
  }

  // 4. Instructors ────────────────────────────────────────────────────────────
  const docNums = [...new Set(SECTION_DEFS.map(s => s.doctor_number))];
  for (const dn of docNums) {
    const r = await client.query(
      `SELECT id FROM instructors WHERE doctor_number=$1 AND is_active=true`,
      [dn]
    );
    if (!r.rows.length) {
      state.errors.push(`Instructor not found or inactive: doctor_number=${dn}`);
    } else {
      state.instrMap[dn] = r.rows[0];
    }
  }

  // 5. Rooms — verified against DB room_types.is_teaching flag ───────────────
  const roomNums = [...new Set(
    SECTION_DEFS.flatMap(s => s.meetings.map(m => m.room)).filter(Boolean)
  )];
  for (const rn of roomNums) {
    const r = await client.query(
      `SELECT r.id, r.type::text AS room_type, rt.is_teaching
       FROM   rooms r
       JOIN   room_types rt ON rt.value = r.type::text
       WHERE  r.room_number=$1 AND r.is_active=true`,
      [rn]
    );
    if (!r.rows.length) {
      state.errors.push(`Room not found or inactive: room_number=${rn}`);
    } else {
      const { id, room_type, is_teaching } = r.rows[0];
      state.roomMap[rn] = { id, room_type };
      // Use dynamic is_teaching flag — no hardcoded non-teaching names
      if (!is_teaching) {
        state.errors.push(
          `Room ${rn} has type="${room_type}" which is NOT a teaching room (is_teaching=false). ` +
          `This seed must never use non-teaching rooms.`
        );
      }
    }
  }

  // 6. Meeting-level room-type correctness ───────────────────────────────────
  for (const sec of SECTION_DEFS) {
    for (const m of sec.meetings) {
      if (!m.room) continue; // online → skip
      const rt = state.roomMap[m.room]?.room_type;
      if (!rt) continue; // already reported missing
      if (m.type === 'lab' && !LAB_TYPES.has(rt)) {
        state.errors.push(
          `${sec.label}: meeting type=lab but room ${m.room} is "${rt}" (not a lab room). ` +
          `Lab meetings must use rooms of type: ${[...LAB_TYPES].join(', ')}.`
        );
      }
      if (m.type === 'lecture' && !LECTURE_TYPES.has(rt)) {
        state.errors.push(
          `${sec.label}: meeting type=lecture but room ${m.room} is "${rt}" (not a lecture hall).`
        );
      }
      if (m.type === 'online') {
        state.errors.push(
          `${sec.label}: online meeting has a physical room assigned (${m.room}). ` +
          `Online meetings must have room=null.`
        );
      }
    }
    // Verify online meetings explicitly have room=null
    for (const m of sec.meetings) {
      if (m.type === 'online' && m.room !== null) {
        state.errors.push(`${sec.label}: online meeting must have room=null, got "${m.room}"`);
      }
    }
  }

  // 7. Weekly hours sanity check (per SECTION_DEFS, not DB) ──────────────────
  // Lecture sections (non-lab): Pattern A 3×1h=3h, Pattern B 1h+2h=3h → 180 min
  // Lab sections: 2×2h=4h or 1×4h=4h → 240 min
  for (const sec of SECTION_DEFS) {
    const hasLab = sec.meetings.some(m => m.type === 'lab');
    const expectedMin = hasLab ? 240 : 180;
    const totalMin = sec.meetings.reduce(
      (sum, m) => sum + toMins(m.end) - toMins(m.start), 0
    );
    if (totalMin !== expectedMin) {
      state.errors.push(
        `${sec.label}: weekly contact hours mismatch — ` +
        `expected ${expectedMin} min, got ${totalMin} min`
      );
    }
  }

  // 8. Existing sections for this semester ───────────────────────────────────
  const exRes = await client.query(
    `SELECT s.id, s.course_id, s.section_number, s.instructor_id, s.room_id,
            s.day_of_week, s.start_time::text AS start_time,
            s.end_time::text   AS end_time,   s.enrolled,
            c.code AS course_code, c.name AS course_name,
            r.room_number, i.doctor_number
     FROM   sections s
     JOIN   courses  c ON c.id = s.course_id
     LEFT JOIN rooms r ON r.id = s.room_id
     LEFT JOIN instructors i ON i.id = s.instructor_id
     WHERE  s.semester=$1 AND s.academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );

  const groupMap = {};
  for (const row of exRes.rows) {
    const key = `${row.course_code}|${row.section_number}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(row);
  }

  for (const [key, rows] of Object.entries(groupMap)) {
    if (rows.length > 1) {
      const [code, secNum] = key.split('|');
      state.warnings.push(
        `Duplicate DB rows: course ${code} §${secNum} has ${rows.length} section rows. ` +
        `Clean up manually before commit.`
      );
    }
    const canonical = rows[0];
    const meetRes = await client.query(
      `SELECT sm.day_of_week AS day, sm.start_time::text AS start,
              sm.end_time::text AS end, sm.meeting_type AS type,
              sm.room_id, r.room_number, r.type::text AS room_type
       FROM   section_meetings sm
       LEFT JOIN rooms r ON r.id = sm.room_id
       WHERE  sm.section_id = $1`,
      [canonical.id]
    );
    canonical.dbMeetings = meetRes.rows;

    const enRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM enrollments WHERE section_id=$1`,
      [canonical.id]
    );
    canonical.enrollmentCount = parseInt(enRes.rows[0].cnt);
    state.existingSections.push(canonical);
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT CHECKS
// ─────────────────────────────────────────────────────────────────────────────

// Room and instructor conflicts among planned (new) sections
function buildConflicts(state) {
  const conflicts = [];

  // Flatten committed (existing) meetings
  const committed = [];
  for (const es of state.existingSections) {
    for (const m of es.dbMeetings || []) {
      if (!m.start) continue;
      committed.push({
        label:  `${es.course_code} §${es.section_number} (existing)`,
        day:    m.day,
        start:  m.start.slice(0, 5),
        end:    m.end.slice(0, 5),
        room:   m.room_number || null,
        docNum: es.doctor_number,
      });
    }
  }

  const planned = [];
  for (const sec of SECTION_DEFS) {
    const alreadyExists = state.existingSections.some(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    if (alreadyExists) continue;

    for (const m of sec.meetings) {
      if (!m.room) continue; // online → no physical conflict possible

      const nm = {
        label:  sec.label,
        day:    m.day,
        start:  m.start,
        end:    m.end,
        room:   m.room,
        docNum: sec.doctor_number,
      };

      for (const prior of [...committed, ...planned]) {
        if (prior.day !== nm.day) continue;
        if (!overlaps(nm.start, nm.end, prior.start, prior.end)) continue;

        if (prior.room && prior.room === nm.room) {
          conflicts.push(
            `ROOM CONFLICT: "${nm.label}" and "${prior.label}" — ` +
            `both in room ${nm.room} on ${DAY_NAME[nm.day]} ` +
            `${nm.start}–${nm.end} vs ${prior.start}–${prior.end}`
          );
        }
        if (prior.docNum && prior.docNum === nm.docNum) {
          conflicts.push(
            `INSTRUCTOR CONFLICT: "${nm.label}" and "${prior.label}" — ` +
            `same instructor #${nm.docNum} on ${DAY_NAME[nm.day]} ` +
            `${nm.start}–${nm.end} vs ${prior.start}–${prior.end}`
          );
        }
      }
      planned.push(nm);
    }
  }

  return conflicts;
}

// Amr's personal schedule conflict check (across his 7 enrolled sections)
function buildAmrConflicts(state) {
  const amrSecs = SECTION_DEFS.filter(s => s.amr);
  const conflicts = [];

  for (let i = 0; i < amrSecs.length; i++) {
    const already = state.existingSections.some(
      es => es.course_code === amrSecs[i].course_code &&
            es.section_number === amrSecs[i].section_number
    );
    // still check meetings even for existing sections
    for (const ma of amrSecs[i].meetings) {
      if (!ma.room) continue; // online → skip

      for (let j = i + 1; j < amrSecs.length; j++) {
        for (const mb of amrSecs[j].meetings) {
          if (!mb.room) continue;
          if (ma.day !== mb.day) continue;
          if (!overlaps(ma.start, ma.end, mb.start, mb.end)) continue;
          conflicts.push(
            `Amr schedule conflict: "${amrSecs[i].label}" vs "${amrSecs[j].label}" — ` +
            `${DAY_NAME[ma.day]} ${ma.start}–${ma.end} overlaps ${mb.start}–${mb.end}`
          );
        }
      }
    }
  }
  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRY-RUN REPORT
// ─────────────────────────────────────────────────────────────────────────────
function printReport(state, conflicts, amrConflicts) {
  hr('SEMESTER');
  if (state.semesterRow) {
    ok(`${SEMESTER} ${ACADEMIC_YEAR} — id: ${state.semesterRow.id}`);
    ok(`status: ${state.semesterRow.status}`);
  } else {
    fail(`Semester ${SEMESTER} ${ACADEMIC_YEAR} NOT FOUND`);
  }

  hr('PREFLIGHT — REFERENCES');
  const missingCourses = [...new Set(SECTION_DEFS
    .filter(s => !state.courseMap[s.course_code])
    .map(s => s.course_code))];
  const missingInstrs  = [...new Set(SECTION_DEFS
    .filter(s => !state.instrMap[s.doctor_number])
    .map(s => `#${s.doctor_number}`))];
  const missingRooms   = [...new Set(
    SECTION_DEFS.flatMap(s => s.meetings.map(m => m.room))
      .filter(r => r && !state.roomMap[r])
  )];

  missingCourses.length
    ? fail(`Missing courses: ${missingCourses.join(', ')}`)
    : ok(`All ${Object.keys(state.courseMap).length} courses found`);
  missingInstrs.length
    ? fail(`Missing instructors: ${missingInstrs.join(', ')}`)
    : ok(`All ${Object.keys(state.instrMap).length} instructors found`);
  missingRooms.length
    ? fail(`Missing rooms: ${missingRooms.join(', ')}`)
    : ok(`All ${Object.keys(state.roomMap).length} physical rooms found and are teaching rooms`);

  hr('EXISTING SECTIONS AUDIT');
  if (!state.existingSections.length) {
    info('No existing sections for fall 2026/2027 — all 25 will be inserted');
  }
  for (const es of state.existingSections) {
    const meetCount = (es.dbMeetings || []).length;
    const nonTeach  = (es.dbMeetings || []).filter(
      m => m.room_number && !TEACHING_TYPES.has(m.room_type || '')
    ).length;
    const sym = nonTeach ? '⚠' : '✓';
    console.log(`\n  ${sym}  ${es.course_code} §${es.section_number} — ${es.course_name}`);
    info(`room: ${es.room_number || 'N/A'} | days: ${JSON.stringify(es.day_of_week)} | ${es.start_time}–${es.end_time}`);
    info(`meetings: ${meetCount} | enrollments: ${es.enrollmentCount}`);
    if (nonTeach) warn(`Uses ${nonTeach} non-teaching room(s)`);
  }

  hr(`PLANNED SECTIONS  (${SECTION_DEFS.length} total)`);
  let toInsert = 0, toSkip = 0, totalMeetings = 0, totalEnroll = 0;
  for (const sec of SECTION_DEFS) {
    const existing = state.existingSections.find(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    const amrTag = sec.amr ? ' [AMR]' : '';
    if (existing) {
      info(`SKIP  ${sec.label}${amrTag} (already exists, id=${existing.id})`);
      toSkip++;
    } else {
      const days  = sec.meetings.map(
        m => `${DAY_NAME[m.day]} ${m.start}–${m.end}${!m.room ? ' [online]' : ''}`
      ).join('  ');
      ok(`INSERT ${sec.label}${amrTag}`);
      info(`       room: ${sec.room_number || 'N/A'} | ${days}`);
      toInsert++;
      totalMeetings += sec.meetings.length;
      totalEnroll   += sec.enroll;
    }
  }
  console.log(`\n  Sections: ${toInsert} to insert, ${toSkip} to skip`);
  info(`Meetings to insert:     ${totalMeetings}`);
  info(`Bulk enrollments (filler, if dept students exist): ${totalEnroll}`);

  hr('AMR ENROLLMENTS  (7 target sections)');
  const amrSecs = SECTION_DEFS.filter(s => s.amr);
  for (const sec of amrSecs) {
    const existing = state.existingSections.find(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    const tag = existing ? 'section exists — enrollment will upsert' : 'section will be inserted first';
    info(`${sec.label}  (${tag})`);
    const meetSummary = sec.meetings.map(
      m => `${DAY_NAME[m.day]} ${m.start}–${m.end}${!m.room ? '[online]' : ''}`
    ).join(', ');
    info(`  schedule: ${meetSummary}`);
  }

  hr('DEMO CONTENT  (Amr\'s sections only)');
  info(`Materials  : ${MATERIAL_DEFS.length} to plan`);
  info(`Assessments: 2  (1 assignment + 1 quiz)`);
  info(`Questions  : ${QUIZ_DEF.questions.length}  (all single_choice)`);
  info(`Options    : ${QUIZ_DEF.questions.reduce((n,q) => n + q.options.length, 0)}`);
  MATERIAL_DEFS.forEach(m => info(`  Material: "${m.title}"  → ${m.course_code} §${m.section_number}`));
  info(`  Assignment: "${ASSIGNMENT_DEF.title}"  → ${ASSIGNMENT_DEF.course_code} §${ASSIGNMENT_DEF.section_number}  [duration_minutes=NULL ✓]`);
  info(`  Quiz:       "${QUIZ_DEF.title}"  → ${QUIZ_DEF.course_code} §${QUIZ_DEF.section_number}  [duration_minutes=${QUIZ_DEF.duration_minutes} ✓]`);

  hr('CONFLICT CHECK');
  if (!conflicts.length) {
    ok('Room conflicts:       0');
    ok('Instructor conflicts: 0');
  } else {
    conflicts.forEach(c => fail(c));
  }
  if (!amrConflicts.length) {
    ok('Amr schedule conflicts: 0');
  } else {
    amrConflicts.forEach(c => fail(c));
  }

  hr('WARNINGS');
  if (!state.warnings.length) ok('No warnings');
  else state.warnings.forEach(w => warn(w));

  hr('ROOMS KEPT FREE FOR DEMO');
  info(`${FREE_DEMO_ROOMS.length} rooms intentionally unused in this seed:`);
  info(FREE_DEMO_ROOMS.join('  '));

  hr('VALIDATION SUMMARY');
  const hardErrors   = state.errors;
  const hasConflicts = conflicts.length > 0 || amrConflicts.length > 0;

  // Quick counts for summary table
  const nonTeachRooms = SECTION_DEFS.flatMap(s => s.meetings)
    .filter(m => m.room && state.roomMap[m.room] && !TEACHING_TYPES.has(state.roomMap[m.room].room_type));
  const labsNotInLab  = SECTION_DEFS.flatMap(s => s.meetings)
    .filter(m => m.type === 'lab' && m.room && state.roomMap[m.room] && !LAB_TYPES.has(state.roomMap[m.room].room_type));
  const onlineWithRoom = SECTION_DEFS.flatMap(s => s.meetings)
    .filter(m => m.type === 'online' && m.room !== null);
  const weeklyMismatch = SECTION_DEFS.filter(sec => {
    const hasLab   = sec.meetings.some(m => m.type === 'lab');
    const expected = hasLab ? 240 : 180;
    const actual   = sec.meetings.reduce((n, m) => n + toMins(m.end) - toMins(m.start), 0);
    return actual !== expected;
  });

  console.log('');
  info(`sections planned:              ${SECTION_DEFS.length}`);
  info(`meetings planned:              ${SECTION_DEFS.reduce((n,s) => n + s.meetings.length, 0)}`);
  info(`Amr enrollments planned:       7`);
  info(`materials planned:             ${MATERIAL_DEFS.length}`);
  info(`assessments planned:           2`);
  info(`questions planned:             ${QUIZ_DEF.questions.length}`);
  info(`options planned:               ${QUIZ_DEF.questions.reduce((n,q) => n+q.options.length, 0)}`);
  console.log('');
  (conflicts.length   ? fail : ok)(`room conflicts:                ${conflicts.length}`);
  (conflicts.length   ? fail : ok)(`instructor conflicts:          ${conflicts.filter(c=>c.includes('INSTRUCTOR')).length}`);
  (amrConflicts.length? fail : ok)(`Amr schedule conflicts:        ${amrConflicts.length}`);
  (nonTeachRooms.length ? fail : ok)(`non-teaching rooms used:       ${nonTeachRooms.length}`);
  (labsNotInLab.length  ? fail : ok)(`labs not in lab rooms:         ${labsNotInLab.length}`);
  (onlineWithRoom.length? fail : ok)(`online meetings with room:     ${onlineWithRoom.length}`);
  (weeklyMismatch.length? fail : ok)(`weekly hours mismatch:         ${weeklyMismatch.length}`);

  if (hardErrors.length) {
    fail(`preflight errors: ${hardErrors.length}`);
    hardErrors.forEach(e => fail(`  ${e}`));
  } else if (hasConflicts) {
    fail(`conflicts detected — SEED BLOCKED`);
  } else {
    console.log('');
    ok('Preflight passed. No conflicts. Safe to commit.');
    if (IS_COMMIT) ok('--commit flag detected. Proceeding with DB writes...');
    else           info('Re-run with --commit to write to DB.');
  }

  return { blocked: hardErrors.length > 0 || hasConflicts };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE  – single all-or-nothing transaction
// ─────────────────────────────────────────────────────────────────────────────
async function executeCommit(client, state) {
  let sectionsInserted  = 0, sectionsSkipped    = 0;
  let meetingsInserted  = 0;
  let amrEnrolled       = 0, amrSkipped         = 0;
  let materialsInserted = 0, materialsSkipped    = 0;
  let assessInserted    = 0, assessSkipped       = 0;
  let questInserted     = 0, optInserted         = 0;

  await client.query('BEGIN');
  try {

    // ── 1. Insert sections + meetings ─────────────────────────────────────────
    for (const sec of SECTION_DEFS) {
      // Idempotency: skip if already exists
      const existing = await client.query(
        `SELECT id FROM sections
         WHERE  course_id=$1 AND section_number=$2 AND semester=$3 AND academic_year=$4`,
        [state.courseMap[sec.course_code].id, sec.section_number, SEMESTER, ACADEMIC_YEAR]
      );
      if (existing.rows.length) {
        sectionsSkipped++;
        continue;
      }

      const roomId = sec.room_number ? state.roomMap[sec.room_number].id : null;
      const secRes = await client.query(
        `INSERT INTO sections
           (course_id, instructor_id, room_id, semester, academic_year,
            section_number, day_of_week, start_time, end_time, is_active, enrolled)
         VALUES ($1,$2,$3,$4,$5,$6,$7::smallint[],$8,$9,true,0)
         RETURNING id`,
        [
          state.courseMap[sec.course_code].id,
          state.instrMap[sec.doctor_number].id,
          roomId,
          SEMESTER, ACADEMIC_YEAR,
          sec.section_number,
          sec.days,
          sec.start_time,
          sec.end_time,
        ]
      );
      const sectionId = secRes.rows[0].id;
      sectionsInserted++;

      for (const m of sec.meetings) {
        const mRoomId = m.room ? state.roomMap[m.room].id : null;
        await client.query(
          `INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time, room_id, meeting_type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sectionId, m.day, m.start, m.end, mRoomId, m.type]
        );
        meetingsInserted++;
      }
    }

    // ── 2. Enroll Amr in his 7 sections ──────────────────────────────────────
    for (const sec of SECTION_DEFS.filter(s => s.amr)) {
      // Resolve section id (just inserted or pre-existing)
      const secRow = await client.query(
        `SELECT id FROM sections
         WHERE  course_id=$1 AND section_number=$2 AND semester=$3 AND academic_year=$4`,
        [state.courseMap[sec.course_code].id, sec.section_number, SEMESTER, ACADEMIC_YEAR]
      );
      if (!secRow.rows.length) {
        throw new Error(`Cannot find section after insert: ${sec.label}`);
      }
      const sectionId = secRow.rows[0].id;

      const res = await client.query(
        `INSERT INTO enrollments (student_id, section_id, status)
         VALUES ($1,$2,'enrolled')
         ON CONFLICT (student_id, section_id) DO UPDATE SET status='enrolled', updated_at=NOW()
         RETURNING (xmax = 0) AS was_inserted`,
        [AMR_USER_ID, sectionId]
      );
      // xmax=0 means a fresh insert; otherwise it was an UPDATE (already existed)
      if (res.rows[0].was_inserted) {
        await client.query(
          `UPDATE sections SET enrolled = (SELECT COUNT(*) FROM enrollments WHERE section_id=$1) WHERE id=$1`,
          [sectionId]
        );
        amrEnrolled++;
      } else {
        amrSkipped++;
      }
    }

    // ── 3. Demo content — resolve section IDs ─────────────────────────────────
    // Helper: look up section id by course_code + section_number
    async function resolveSection(courseCode, sectionNumber) {
      const r = await client.query(
        `SELECT s.id, s.instructor_id, s.course_id
         FROM   sections s
         JOIN   courses c ON c.id = s.course_id
         WHERE  c.code=$1 AND s.section_number=$2 AND s.semester=$3 AND s.academic_year=$4`,
        [courseCode, sectionNumber, SEMESTER, ACADEMIC_YEAR]
      );
      if (!r.rows.length) throw new Error(`Section not found: course=${courseCode} §${sectionNumber}`);
      return r.rows[0];
    }

    // ── 3a. Materials ─────────────────────────────────────────────────────────
    for (const md of MATERIAL_DEFS) {
      const sec = await resolveSection(md.course_code, md.section_number);
      const exists = await client.query(
        `SELECT 1 FROM professor_course_materials
         WHERE  section_id=$1 AND title=$2 LIMIT 1`,
        [sec.id, md.title]
      );
      if (exists.rows.length) { materialsSkipped++; continue; }

      await client.query(
        `INSERT INTO professor_course_materials
           (instructor_id, section_id, course_id, title, material_type,
            description, file_url, week_number, semester, academic_year, is_published)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,true)`,
        [
          sec.instructor_id, sec.id, sec.course_id,
          md.title, md.material_type, md.description,
          md.week_number, SEMESTER, ACADEMIC_YEAR,
        ]
      );
      materialsInserted++;
    }

    // ── 3b. Assignment ────────────────────────────────────────────────────────
    {
      const ad  = ASSIGNMENT_DEF;
      const sec = await resolveSection(ad.course_code, ad.section_number);
      const exists = await client.query(
        `SELECT 1 FROM course_assessments
         WHERE  section_id=$1 AND title=$2 AND assessment_type=$3 LIMIT 1`,
        [sec.id, ad.title, ad.assessment_type]
      );
      if (exists.rows.length) {
        assessSkipped++;
      } else {
        await client.query(
          `INSERT INTO course_assessments
             (instructor_id, section_id, course_id, title, description,
              assessment_type, week_number, points, duration_minutes,
              opens_at, closes_at, allow_late, allow_review, is_published)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12,true)`,
          [
            sec.instructor_id, sec.id, sec.course_id,
            ad.title, ad.description,
            ad.assessment_type, ad.week_number, ad.points,
            daysAgo(7), daysFromNow(14),
            ad.allow_late, ad.allow_review,
          ]
        );
        assessInserted++;
      }
    }

    // ── 3c. Quiz + questions + options ────────────────────────────────────────
    {
      const qd  = QUIZ_DEF;
      const sec = await resolveSection(qd.course_code, qd.section_number);
      const existsRow = await client.query(
        `SELECT id FROM course_assessments
         WHERE  section_id=$1 AND title=$2 AND assessment_type=$3 LIMIT 1`,
        [sec.id, qd.title, qd.assessment_type]
      );

      let quizId;
      if (existsRow.rows.length) {
        assessSkipped++;
        quizId = existsRow.rows[0].id;
      } else {
        const qRes = await client.query(
          `INSERT INTO course_assessments
             (instructor_id, section_id, course_id, title, description,
              assessment_type, week_number, points, duration_minutes,
              opens_at, closes_at, allow_late, allow_review, is_published)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
           RETURNING id`,
          [
            sec.instructor_id, sec.id, sec.course_id,
            qd.title, qd.description,
            qd.assessment_type, qd.week_number, qd.points, qd.duration_minutes,
            daysAgo(1), daysFromNow(7),
            qd.allow_late, qd.allow_review,
          ]
        );
        quizId = qRes.rows[0].id;
        assessInserted++;
      }

      // Questions + options (only when quiz is new)
      if (assessInserted > 0 || existsRow.rows.length === 0) {
        // Check if questions already exist for this quiz
        const qCount = await client.query(
          `SELECT COUNT(*) AS cnt FROM quiz_questions WHERE assessment_id=$1`,
          [quizId]
        );
        if (parseInt(qCount.rows[0].cnt) === 0) {
          for (const q of qd.questions) {
            const qRow = await client.query(
              `INSERT INTO quiz_questions
                 (assessment_id, question_text, question_type, points, position, case_sensitive)
               VALUES ($1,$2,$3,$4,$5,$6)
               RETURNING id`,
              [quizId, q.question_text, q.question_type, q.points, q.position, q.case_sensitive]
            );
            questInserted++;
            const questionId = qRow.rows[0].id;
            for (const opt of q.options) {
              await client.query(
                `INSERT INTO quiz_options (question_id, option_text, is_correct, position)
                 VALUES ($1,$2,$3,$4)`,
                [questionId, opt.option_text, opt.is_correct, opt.position]
              );
              optInserted++;
            }
          }
        }
      }
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return {
    sectionsInserted, sectionsSkipped,
    meetingsInserted,
    amrEnrolled, amrSkipped,
    materialsInserted, materialsSkipped,
    assessInserted, assessSkipped,
    questInserted, optInserted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-COMMIT VALIDATION  – read back from DB and verify quality
// ─────────────────────────────────────────────────────────────────────────────
async function postSeedValidation(client, counts) {
  hr('COMMIT RESULTS');
  ok(`sections inserted:     ${counts.sectionsInserted}  (skipped: ${counts.sectionsSkipped})`);
  ok(`meetings inserted:     ${counts.meetingsInserted}`);
  ok(`Amr enrollments:       ${counts.amrEnrolled} new, ${counts.amrSkipped} already existed`);
  ok(`materials inserted:    ${counts.materialsInserted}  (skipped: ${counts.materialsSkipped})`);
  ok(`assessments inserted:  ${counts.assessInserted}  (skipped: ${counts.assessSkipped})`);
  ok(`questions inserted:    ${counts.questInserted}`);
  ok(`options inserted:      ${counts.optInserted}`);

  hr('POST-COMMIT VALIDATION');

  const secCnt = await client.query(
    `SELECT COUNT(*) FROM sections WHERE semester=$1 AND academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  const meetCnt = await client.query(
    `SELECT COUNT(*) FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     WHERE s.semester=$1 AND s.academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  const enCnt = await client.query(
    `SELECT COUNT(*) FROM enrollments e
     JOIN sections s ON s.id=e.section_id
     WHERE s.semester=$1 AND s.academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );

  info(`Sections in DB:    ${secCnt.rows[0].count}`);
  info(`Meetings in DB:    ${meetCnt.rows[0].count}`);
  info(`Enrollments in DB: ${enCnt.rows[0].count}`);

  // Non-teaching rooms
  const badRooms = await client.query(
    `SELECT DISTINCT r.room_number, r.type::text
     FROM section_meetings sm
     JOIN sections s  ON s.id  = sm.section_id
     JOIN rooms    r  ON r.id  = sm.room_id
     JOIN room_types rt ON rt.value = r.type::text
     WHERE s.semester=$1 AND s.academic_year=$2 AND rt.is_teaching = false`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  badRooms.rows.length
    ? fail(`Non-teaching rooms used: ${badRooms.rows.map(r=>r.room_number).join(', ')}`)
    : ok('Non-teaching rooms used: 0');

  // Online meetings with a physical room
  const onlineWithRoom = await client.query(
    `SELECT COUNT(*) FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     WHERE s.semester=$1 AND s.academic_year=$2 AND sm.meeting_type='online' AND sm.room_id IS NOT NULL`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  parseInt(onlineWithRoom.rows[0].count) > 0
    ? fail(`Online meetings with physical room: ${onlineWithRoom.rows[0].count}`)
    : ok('Online meetings with physical room: 0');

  // Lab meetings not in lab rooms
  const labNotInLab = await client.query(
    `SELECT COUNT(*) FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     JOIN rooms r    ON r.id=sm.room_id
     WHERE s.semester=$1 AND s.academic_year=$2 AND sm.meeting_type='lab'
       AND r.type::text NOT IN ('lab','engineering_drawing_room','engineering_drawing_studio')`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  parseInt(labNotInLab.rows[0].count) > 0
    ? fail(`Lab meetings in non-lab rooms: ${labNotInLab.rows[0].count}`)
    : ok('Lab meetings in non-lab rooms: 0');

  // Room conflicts
  const roomConflict = await client.query(
    `SELECT sm1.room_id, COUNT(*) AS cnt
     FROM   section_meetings sm1
     JOIN   section_meetings sm2 ON sm2.room_id=sm1.room_id
              AND sm2.day_of_week=sm1.day_of_week
              AND sm2.id <> sm1.id
              AND sm1.start_time < sm2.end_time AND sm2.start_time < sm1.end_time
     JOIN   sections s ON s.id=sm1.section_id
     WHERE  s.semester=$1 AND s.academic_year=$2 AND sm1.room_id IS NOT NULL
     GROUP  BY sm1.room_id`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  roomConflict.rows.length
    ? fail(`Room conflicts: ${roomConflict.rows.length} room(s) double-booked`)
    : ok('Room conflicts: 0');

  // Instructor conflicts
  const instrConflict = await client.query(
    `SELECT s1.instructor_id, COUNT(*) AS cnt
     FROM   section_meetings sm1
     JOIN   sections s1 ON s1.id=sm1.section_id
     JOIN   section_meetings sm2 ON sm2.id <> sm1.id
              AND sm2.day_of_week=sm1.day_of_week
              AND sm1.start_time < sm2.end_time AND sm2.start_time < sm1.end_time
     JOIN   sections s2 ON s2.id=sm2.section_id AND s2.instructor_id=s1.instructor_id
     WHERE  s1.semester=$1 AND s1.academic_year=$2
     GROUP  BY s1.instructor_id`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  instrConflict.rows.length
    ? fail(`Instructor conflicts: ${instrConflict.rows.length} instructor(s) double-booked`)
    : ok('Instructor conflicts: 0');

  // Amr schedule conflicts
  const amrSectionIds = await client.query(
    `SELECT s.id, c.code
     FROM   enrollments e
     JOIN   sections s ON s.id = e.section_id
     JOIN   courses  c ON c.id = s.course_id
     WHERE  e.student_id=$1 AND s.semester=$2 AND s.academic_year=$3`,
    [AMR_USER_ID, SEMESTER, ACADEMIC_YEAR]
  );
  info(`Amr enrolled in ${amrSectionIds.rows.length} fall 2026/2027 sections: ${amrSectionIds.rows.map(r=>r.code).join(', ')}`);
  if (amrSectionIds.rows.length === 7) ok('Amr enrolled in exactly 7 sections ✓');
  else warn(`Expected 7 Amr enrollments, found ${amrSectionIds.rows.length}`);

  const amrScheduleConflict = await client.query(
    `SELECT sm1.day_of_week, sm1.start_time, sm1.end_time, c1.code AS c1, c2.code AS c2
     FROM   section_meetings sm1
     JOIN   sections s1 ON s1.id=sm1.section_id
     JOIN   courses  c1 ON c1.id=s1.course_id
     JOIN   enrollments e1 ON e1.section_id=s1.id AND e1.student_id=$1
     JOIN   section_meetings sm2 ON sm2.day_of_week=sm1.day_of_week
              AND sm2.id <> sm1.id
              AND sm1.start_time < sm2.end_time AND sm2.start_time < sm1.end_time
              AND sm1.room_id IS NOT NULL AND sm2.room_id IS NOT NULL
     JOIN   sections s2 ON s2.id=sm2.section_id
     JOIN   courses  c2 ON c2.id=s2.course_id
     JOIN   enrollments e2 ON e2.section_id=s2.id AND e2.student_id=$1
     WHERE  s1.semester=$2 AND s1.academic_year=$3`,
    [AMR_USER_ID, SEMESTER, ACADEMIC_YEAR]
  );
  amrScheduleConflict.rows.length > 0
    ? fail(`Amr schedule conflicts: ${amrScheduleConflict.rows.length} overlapping meeting pair(s)`)
    : ok('Amr schedule conflicts: 0');

  // Sections with no meetings
  const noMeetings = await client.query(
    `SELECT COUNT(*) FROM sections s
     WHERE  s.semester=$1 AND s.academic_year=$2
       AND NOT EXISTS (SELECT 1 FROM section_meetings sm WHERE sm.section_id=s.id)`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  parseInt(noMeetings.rows[0].count) > 0
    ? warn(`Sections with no meetings: ${noMeetings.rows[0].count}`)
    : ok('All sections have at least one meeting');

  ok('Validation complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(66));
  console.log(` Fall 2026/2027 Demo Seed — Faculty of Engineering (CPE)`);
  console.log(` Mode: ${IS_COMMIT ? '⚡ COMMIT (writing to DB)' : '🔍 DRY-RUN (no writes)'}`);
  console.log('═'.repeat(66));

  const client = await pool.connect();
  try {
    hr('RUNNING PREFLIGHT');
    const state = await preflight(client);

    if (state.errors.length) {
      hr('FATAL PREFLIGHT ERRORS — SEED BLOCKED');
      state.errors.forEach(e => fail(e));
      console.log('\nFix the above errors and re-run.\n');
      process.exit(1);
    }
    ok(`Preflight passed — ${SECTION_DEFS.length} section definitions loaded`);

    hr('BUILDING CONFLICT MAPS');
    const conflicts     = buildConflicts(state);
    const amrConflicts  = buildAmrConflicts(state);

    const { blocked } = printReport(state, conflicts, amrConflicts);

    if (blocked) {
      console.log('\nSeed blocked. Fix the issues above and re-run.\n');
      process.exit(1);
    }

    if (!IS_COMMIT) {
      console.log('\nDry-run complete. No changes made.');
      console.log('Re-run with --commit to apply.\n');
      return;
    }

    // ── Commit ──────────────────────────────────────────────────────────────
    hr('COMMITTING TO DATABASE');
    const counts = await executeCommit(client, state);
    await postSeedValidation(client, counts);

    console.log('\n✓  Seed complete. Fall 2026/2027 is ready.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n✗  Unhandled error:', err.message);
  process.exit(1);
});
