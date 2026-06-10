'use strict';

/**
 * Demo seed – Spring 2025/2026 · Faculty of Engineering
 *
 * Dry-run (default, no writes):
 *   node scripts/seedDemoSpring2025_2026.js
 *
 * Commit to DB (single transaction, all-or-nothing):
 *   node scripts/seedDemoSpring2025_2026.js --commit
 */

require('dotenv').config();
const { pool } = require('../config/db');

// ─── Runtime flags ────────────────────────────────────────────────────────────
const IS_COMMIT    = process.argv.includes('--commit');
const SEMESTER     = 'spring';
const ACADEMIC_YEAR = '2025/2026';

// ─── Room type sets (derived from rooms.type enum) ───────────────────────────
const TEACHING_TYPES = new Set([
  'lecture_hall', 'lab', 'amphitheater',
  'engineering_drawing_room', 'engineering_drawing_studio',
]);
const LAB_TYPES = new Set([
  'lab', 'engineering_drawing_room', 'engineering_drawing_studio',
]);
const LECTURE_TYPES = new Set(['lecture_hall', 'amphitheater']);

// ─── Day labels ───────────────────────────────────────────────────────────────
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION DEFINITIONS
//   · No hardcoded UUIDs — all IDs resolved at runtime
//   · section_number is varchar (matches DB column type)
//   · Pattern A : days=[0,2,4]  Sun+Tue 1h in-person, Thu 1h online (room=null)
//   · Pattern B : days=[1,3]    Mon 1h in-person, Wed 2h in-person
//   · Lab 2×2   : days=[1,3]    Mon+Wed equal duration, lab room
//   · Lab 4×Thu : days=[4]      Thursday 4h, lab room
// ─────────────────────────────────────────────────────────────────────────────
const SECTION_DEFS = [

  // ── CPE · Pattern A ──────────────────────────────────────────────────────
  { label: 'Discrete Mathematics §1',
    course_code: '10636215', section_number: '1', doctor_number: 1022,
    room_number: '1020', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '1020', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '1020', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Database Systems §1',
    course_code: '10636315', section_number: '1', doctor_number: 1007,
    room_number: '1060', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1060', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1060', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 20, year_min: 2, year_max: 4 },

  { label: 'Web Programming §1',
    course_code: '10636316', section_number: '1', doctor_number: 1008,
    room_number: '1070', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1070', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1070', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 20, year_min: 2, year_max: 4 },

  { label: 'Software Engineering §1',
    course_code: '10636313', section_number: '1', doctor_number: 1006,
    room_number: '1021', days: [0,2,4], start_time: '10:00', end_time: '11:00',
    meetings: [
      { day: 0, start: '10:00', end: '11:00', room: '1021', type: 'lecture' },
      { day: 2, start: '10:00', end: '11:00', room: '1021', type: 'lecture' },
      { day: 4, start: '10:00', end: '11:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 18, year_min: 3, year_max: 4 },

  { label: 'Data Structures and Algorithms §2',
    course_code: '10636211', section_number: '2', doctor_number: 1016,
    room_number: '1031', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '1031', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '1031', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Object Oriented Programming §2',
    course_code: '10636213', section_number: '2', doctor_number: 1017,
    room_number: '1030', days: [0,2,4], start_time: '12:00', end_time: '13:00',
    meetings: [
      { day: 0, start: '12:00', end: '13:00', room: '1030', type: 'lecture' },
      { day: 2, start: '12:00', end: '13:00', room: '1030', type: 'lecture' },
      { day: 4, start: '12:00', end: '13:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Digital Circuits Design II §1',
    course_code: '10636321', section_number: '1', doctor_number: 1052,
    room_number: '1060', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '1060', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '1060', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    dept: 'Computer Engineering', enroll: 17, year_min: 2, year_max: 3 },

  // ── CPE · Pattern B ──────────────────────────────────────────────────────
  { label: 'Algorithms and Computational Complexity §2',
    course_code: '10636217', section_number: '2', doctor_number: 1005,
    room_number: '1021', days: [1,3], start_time: '10:00', end_time: '12:00',
    meetings: [
      { day: 1, start: '10:00', end: '11:00', room: '1021', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '10:00', end: '12:00', room: '1021', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Computer Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Microcontrollers §2',
    course_code: '10636426', section_number: '2', doctor_number: 1019,
    room_number: '1031', days: [1,3], start_time: '11:00', end_time: '13:00',
    meetings: [
      { day: 1, start: '11:00', end: '12:00', room: '1031', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '11:00', end: '13:00', room: '1031', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Computer Engineering', enroll: 16, year_min: 3, year_max: 4 },

  { label: 'Digital Image Processing §1',
    course_code: '10636318', section_number: '1', doctor_number: 1050,
    room_number: '1080', days: [1,3], start_time: '12:00', end_time: '14:00',
    meetings: [
      { day: 1, start: '12:00', end: '13:00', room: '1080', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '12:00', end: '14:00', room: '1080', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Computer Engineering', enroll: 16, year_min: 3, year_max: 4 },

  // ── CPE · Labs ───────────────────────────────────────────────────────────
  { label: 'Digital Circuits Design II Lab §1',
    course_code: '10636391', section_number: '1', doctor_number: 1063,
    room_number: 'B1030', days: [1,3], start_time: '13:00', end_time: '15:00',
    meetings: [
      { day: 1, start: '13:00', end: '15:00', room: 'B1030', type: 'lab' },
      { day: 3, start: '13:00', end: '15:00', room: 'B1030', type: 'lab' },
    ],
    dept: 'Computer Engineering', enroll: 12, year_min: 2, year_max: 3 },

  { label: 'Microprocessors Lab §1',
    course_code: '10636392', section_number: '1', doctor_number: 1094,
    room_number: 'B1040', days: [4], start_time: '08:00', end_time: '12:00',
    meetings: [
      { day: 4, start: '08:00', end: '12:00', room: 'B1040', type: 'lab' },
    ],
    dept: 'Computer Engineering', enroll: 12, year_min: 3, year_max: 4 },

  { label: 'Microcontrollers Lab §1',
    course_code: '10636496', section_number: '1', doctor_number: 1069,
    room_number: 'B1050', days: [1,3], start_time: '15:00', end_time: '17:00',
    meetings: [
      { day: 1, start: '15:00', end: '17:00', room: 'B1050', type: 'lab' },
      { day: 3, start: '15:00', end: '17:00', room: 'B1050', type: 'lab' },
    ],
    dept: 'Computer Engineering', enroll: 12, year_min: 3, year_max: 4 },

  { label: 'Networks Lab §1',
    course_code: '10636594', section_number: '1', doctor_number: 1062,
    room_number: 'B1070', days: [4], start_time: '13:00', end_time: '17:00',
    meetings: [
      { day: 4, start: '13:00', end: '17:00', room: 'B1070', type: 'lab' },
    ],
    dept: 'Computer Engineering', enroll: 12, year_min: 3, year_max: 4 },

  // ── EE · Pattern A ───────────────────────────────────────────────────────
  { label: 'Electrical Circuits 2 §1',
    course_code: '10641212', section_number: '1', doctor_number: 1001,
    room_number: '1100', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1100', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1100', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    dept: 'Electrical Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Electrical Measurements & Sensors §1',
    course_code: '10641315', section_number: '1', doctor_number: 1064,
    room_number: '1170', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '1170', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '1170', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    dept: 'Electrical Engineering', enroll: 16, year_min: 2, year_max: 4 },

  { label: 'Analogue and Digital Telecommunication §1',
    course_code: '10641316', section_number: '1', doctor_number: 1066,
    room_number: '1190', days: [0,2,4], start_time: '13:00', end_time: '14:00',
    meetings: [
      { day: 0, start: '13:00', end: '14:00', room: '1190', type: 'lecture' },
      { day: 2, start: '13:00', end: '14:00', room: '1190', type: 'lecture' },
      { day: 4, start: '13:00', end: '14:00', room: null,   type: 'online'  },
    ],
    dept: 'Electrical Engineering', enroll: 15, year_min: 3, year_max: 4 },

  // ── EE · Pattern B ───────────────────────────────────────────────────────
  { label: 'Applied Electromagnetic §1',
    course_code: '10641271', section_number: '1', doctor_number: 1009,
    room_number: '1191', days: [1,3], start_time: '10:00', end_time: '12:00',
    meetings: [
      { day: 1, start: '10:00', end: '11:00', room: '1191', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '10:00', end: '12:00', room: '1191', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Electrical Engineering', enroll: 16, year_min: 3, year_max: 4 },

  // ── CE · Pattern A ───────────────────────────────────────────────────────
  { label: 'Mechanics of Materials §1',
    course_code: '10601201', section_number: '1', doctor_number: 1021,
    room_number: '2020', days: [0,2,4], start_time: '08:00', end_time: '09:00',
    meetings: [
      { day: 0, start: '08:00', end: '09:00', room: '2020', type: 'lecture' },
      { day: 2, start: '08:00', end: '09:00', room: '2020', type: 'lecture' },
      { day: 4, start: '08:00', end: '09:00', room: null,   type: 'online'  },
    ],
    dept: 'Civil Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Fluid Mechanics §1',
    course_code: '10601340', section_number: '1', doctor_number: 1015,
    room_number: '1170', days: [0,2,4], start_time: '09:00', end_time: '10:00',
    meetings: [
      { day: 0, start: '09:00', end: '10:00', room: '1170', type: 'lecture' },
      { day: 2, start: '09:00', end: '10:00', room: '1170', type: 'lecture' },
      { day: 4, start: '09:00', end: '10:00', room: null,   type: 'online'  },
    ],
    dept: 'Civil Engineering', enroll: 18, year_min: 2, year_max: 3 },

  { label: 'Structural Analysis I §1',
    course_code: '10601315', section_number: '1', doctor_number: 1033,
    room_number: '2020', days: [0,2,4], start_time: '11:00', end_time: '12:00',
    meetings: [
      { day: 0, start: '11:00', end: '12:00', room: '2020', type: 'lecture' },
      { day: 2, start: '11:00', end: '12:00', room: '2020', type: 'lecture' },
      { day: 4, start: '11:00', end: '12:00', room: null,   type: 'online'  },
    ],
    dept: 'Civil Engineering', enroll: 18, year_min: 3, year_max: 4 },

  { label: 'Soil Mechanics §1',
    course_code: '10601331', section_number: '1', doctor_number: 1036,
    room_number: '2020', days: [0,2,4], start_time: '13:00', end_time: '14:00',
    meetings: [
      { day: 0, start: '13:00', end: '14:00', room: '2020', type: 'lecture' },
      { day: 2, start: '13:00', end: '14:00', room: '2020', type: 'lecture' },
      { day: 4, start: '13:00', end: '14:00', room: null,   type: 'online'  },
    ],
    dept: 'Civil Engineering', enroll: 16, year_min: 3, year_max: 4 },

  // ── ME · Pattern B ───────────────────────────────────────────────────────
  { label: 'Thermodynamics 1 §1',
    course_code: '10621220', section_number: '1', doctor_number: 1024,
    room_number: '3020', days: [1,3], start_time: '09:00', end_time: '11:00',
    meetings: [
      { day: 1, start: '09:00', end: '10:00', room: '3020', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '09:00', end: '11:00', room: '3020', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Mechanical Engineering', enroll: 16, year_min: 2, year_max: 3 },

  { label: 'Fluid Mechanics 1 §1',
    course_code: '10621320', section_number: '1', doctor_number: 1042,
    room_number: '3021', days: [1,3], start_time: '11:00', end_time: '13:00',
    meetings: [
      { day: 1, start: '11:00', end: '12:00', room: '3021', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '11:00', end: '13:00', room: '3021', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Mechanical Engineering', enroll: 16, year_min: 2, year_max: 3 },

  { label: 'Engineering Materials §1',
    course_code: '10621330', section_number: '1', doctor_number: 1030,
    room_number: '3020', days: [1,3], start_time: '12:00', end_time: '14:00',
    meetings: [
      { day: 1, start: '12:00', end: '13:00', room: '3020', type: 'lecture' }, // Mon 1 h
      { day: 3, start: '12:00', end: '14:00', room: '3020', type: 'lecture' }, // Wed 2 h
    ],
    dept: 'Mechanical Engineering', enroll: 15, year_min: 2, year_max: 3 },
];

// ─── Rooms intentionally kept free for demo (availability map, room change, event booking) ──
const FREE_DEMO_ROOMS = [
  '1180','1181','1230',
  'G0010','G0011','G0110','G0120','G0140','G0150','G0190','G0250','G0260',
  '4030','4040','4050','4070','4100',
  'B1060','B1080','B1100','B1110','B1120','B1130','B1140','B1150',
  'B1160','B1170','B1180','B1200','B1210','B1220','B1230',
  'B2040','B2050','B2080','B2090','B2100',
];

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
  console.log(`\n${'─'.repeat(62)}`);
  console.log(` ${title}`);
  console.log('─'.repeat(62));
}
function line(sym, msg) { console.log(`  ${sym}  ${msg}`); }
const ok   = m => line('✓', m);
const warn = m => line('⚠', m);
const fail = m => line('✗', m);
const info = m => line('·', m);

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT  – validate all references, load existing state (read-only)
// ─────────────────────────────────────────────────────────────────────────────
async function preflight(client) {
  const state = {
    semesterRow:    null,
    courseMap:      {},   // code  → { id, name, credit_hours, department }
    instrMap:       {},   // doctor_number → { id, department }
    roomMap:        {},   // room_number   → { id, room_type }
    deptStudentMap: {},   // dept_name_en  → [user_id, ...]
    existingSections: [], // rows already in DB for this semester
    errors:         [],   // fatal errors (stop commit)
    warnings:       [],   // non-fatal issues
  };

  // 1. Semester ───────────────────────────────────────────────────────────────
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
        `Students will not see sections until status = 'published'. ` +
        `Safe action: run UPDATE semesters SET status='published' WHERE semester='spring' AND academic_year='2025/2026';`
      );
    }
  }

  // 2. Courses ────────────────────────────────────────────────────────────────
  const courseCodes = [...new Set(SECTION_DEFS.map(s => s.course_code))];
  for (const code of courseCodes) {
    const r = await client.query(
      `SELECT id, name, credit_hours, department FROM courses WHERE code=$1 AND is_active=true`,
      [code]
    );
    if (!r.rows.length) {
      state.errors.push(`Course not found or inactive: code=${code}`);
    } else {
      state.courseMap[code] = r.rows[0];
    }
  }

  // 3. Instructors ────────────────────────────────────────────────────────────
  const docNums = [...new Set(SECTION_DEFS.map(s => s.doctor_number))];
  for (const dn of docNums) {
    const r = await client.query(
      `SELECT id, department FROM instructors WHERE doctor_number=$1 AND is_active=true`,
      [dn]
    );
    if (!r.rows.length) {
      state.errors.push(`Instructor not found or inactive: doctor_number=${dn}`);
    } else {
      state.instrMap[dn] = r.rows[0];
    }
  }

  // 4. Rooms ──────────────────────────────────────────────────────────────────
  // Collect unique physical rooms used in meetings (null = online, skip)
  const roomNums = [...new Set(
    SECTION_DEFS.flatMap(s => s.meetings.map(m => m.room)).filter(Boolean)
  )];
  for (const rn of roomNums) {
    const r = await client.query(
      `SELECT id, type::text AS room_type FROM rooms WHERE room_number=$1 AND is_active=true`,
      [rn]
    );
    if (!r.rows.length) {
      state.errors.push(`Room not found or inactive: room_number=${rn}`);
    } else {
      const { id, room_type } = r.rows[0];
      state.roomMap[rn] = { id, room_type };
      if (!TEACHING_TYPES.has(room_type)) {
        state.errors.push(`Room ${rn} is type="${room_type}" which is not a teaching room`);
      }
    }
  }

  // 5. Lab/lecture room-type correctness per section ─────────────────────────
  for (const sec of SECTION_DEFS) {
    for (const m of sec.meetings) {
      if (!m.room) continue; // online
      const rt = state.roomMap[m.room]?.room_type;
      if (!rt) continue; // already reported as missing
      if (m.type === 'lab' && !LAB_TYPES.has(rt)) {
        state.errors.push(`${sec.label}: meeting type=lab but room ${m.room} is "${rt}" (not a lab room)`);
      }
      if (m.type === 'lecture' && !LECTURE_TYPES.has(rt)) {
        state.errors.push(`${sec.label}: meeting type=lecture but room ${m.room} is "${rt}" (not a lecture hall)`);
      }
    }
  }

  // 6. Existing sections for this semester ───────────────────────────────────
  const exRes = await client.query(
    `SELECT s.id, s.course_id, s.section_number, s.instructor_id, s.room_id,
            s.day_of_week, s.start_time::text AS start_time,
            s.end_time::text AS end_time, s.enrolled,
            c.code AS course_code, c.name AS course_name,
            r.room_number, i.doctor_number
     FROM sections s
     JOIN courses c ON c.id = s.course_id
     LEFT JOIN rooms r ON r.id = s.room_id
     LEFT JOIN instructors i ON i.id = s.instructor_id
     WHERE s.semester=$1 AND s.academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );

  // Group by (course_code, section_number) to detect duplicates
  const groupMap = {};
  for (const row of exRes.rows) {
    const key = `${row.course_code}|${row.section_number}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(row);
  }

  for (const [key, rows] of Object.entries(groupMap)) {
    const [code, secNum] = key.split('|');
    if (rows.length > 1) {
      // Prefer rows with normal start_time (>= 06:00); among those, keep the latest
      const sorted = [...rows].sort((a, b) => {
        const aOk = a.start_time && toMins(a.start_time.slice(0,5)) >= 360 ? 1 : 0;
        const bOk = b.start_time && toMins(b.start_time.slice(0,5)) >= 360 ? 1 : 0;
        if (bOk !== aOk) return bOk - aOk; // normal rows first
        return a.start_time > b.start_time ? -1 : 1; // then latest
      });
      const keepRow    = sorted[0];
      const deleteRows = sorted.slice(1);
      state.warnings.push(
        `Duplicate rows found: course ${code} §${secNum} has ${rows.length} section rows. ` +
        `Data integrity issue — please clean up manually before commit.\n` +
        `  Keep:   id=${keepRow.id} (start_time=${keepRow.start_time})\n` +
        `  Delete: ${deleteRows.map(r => `id=${r.id} (start_time=${r.start_time})`).join(', ')}\n` +
        `  SQL:    DELETE FROM sections WHERE id IN (${deleteRows.map(r => `'${r.id}'`).join(',')});` +
        `  (cascades to section_meetings for that row; enrollments attach to section id, verify manually)`
      );
    }
    // Use the highest-quality row as canonical
    const canonical = [...rows].sort((a, b) => {
      const aOk = a.start_time && toMins(a.start_time.slice(0,5)) >= 360 ? 1 : 0;
      const bOk = b.start_time && toMins(b.start_time.slice(0,5)) >= 360 ? 1 : 0;
      if (bOk !== aOk) return bOk - aOk;
      return a.start_time > b.start_time ? -1 : 1;
    })[0];

    // Load meetings for canonical row
    const meetRes = await client.query(
      `SELECT sm.day_of_week AS day, sm.start_time::text AS start,
              sm.end_time::text AS end, sm.meeting_type AS type,
              sm.room_id, r.room_number, r.type::text AS room_type
       FROM section_meetings sm
       LEFT JOIN rooms r ON r.id = sm.room_id
       WHERE sm.section_id = $1`,
      [canonical.id]
    );
    canonical.dbMeetings = meetRes.rows;

    // Check for corrupt meetings (time before 06:00 is suspicious)
    const corrupt = meetRes.rows.filter(m => m.start && toMins(m.start.slice(0,5)) < 360);
    if (corrupt.length) {
      state.warnings.push(
        `${code} §${secNum} has ${corrupt.length} suspicious meeting row(s) with start_time ` +
        `${corrupt.map(m => m.start).join(', ')} — likely data corruption. ` +
        `Suggested fix: DELETE FROM section_meetings WHERE section_id='${canonical.id}' AND start_time < '06:00';`
      );
    }

    // Check room type validity
    for (const m of meetRes.rows) {
      if (m.room_number && !TEACHING_TYPES.has(m.room_type || '')) {
        state.warnings.push(`${code} §${secNum}: existing meeting uses non-teaching room "${m.room_number}" (${m.room_type})`);
      }
    }

    // Enrollment count
    const enRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM enrollments WHERE section_id = $1`,
      [canonical.id]
    );
    canonical.enrollmentCount = parseInt(enRes.rows[0].cnt);

    state.existingSections.push(canonical);
  }

  // 7. Students per department ────────────────────────────────────────────────
  const depts = [...new Set(SECTION_DEFS.map(s => s.dept))];
  for (const dept of depts) {
    const r = await client.query(
      `SELECT u.id FROM users u
       JOIN student_profiles sp ON sp.user_id = u.id
       JOIN departments d ON d.id = sp.department_id
       WHERE d.name_en = $1 AND u.status = 'active'
       ORDER BY u.id`,
      [dept]
    );
    state.deptStudentMap[dept] = r.rows.map(r => r.id);
    if (!r.rows.length) {
      state.warnings.push(`No active students found for department "${dept}" — enrollments will be skipped for this dept`);
    }
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT CHECK  – new-vs-existing and new-vs-new
// Returns array of conflict description strings (empty = no conflicts).
// ─────────────────────────────────────────────────────────────────────────────
function buildConflicts(state) {
  const conflicts = [];

  // Build a flat list of all committed meetings (existing) with day/time/room/instructor
  const committed = [];
  for (const es of state.existingSections) {
    for (const m of es.dbMeetings || []) {
      if (!m.start) continue;
      committed.push({
        label:   `${es.course_code} §${es.section_number} (existing)`,
        day:     m.day,
        start:   m.start.slice(0, 5),
        end:     m.end.slice(0, 5),
        room:    m.room_number || null,
        docNum:  es.doctor_number,
      });
    }
  }

  // Add planned new meetings incrementally; check each against committed + prior planned
  const planned = [];
  for (const sec of SECTION_DEFS) {
    // Skip if this section already exists in DB (will be skipped on insert)
    const alreadyExists = state.existingSections.some(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    if (alreadyExists) continue;

    for (const m of sec.meetings) {
      if (!m.room) continue; // online → no room conflict possible

      const newMeeting = {
        label:  sec.label,
        day:    m.day,
        start:  m.start,
        end:    m.end,
        room:   m.room,
        docNum: sec.doctor_number,
      };

      for (const prior of [...committed, ...planned]) {
        if (prior.day !== newMeeting.day) continue;
        if (!overlaps(newMeeting.start, newMeeting.end, prior.start, prior.end)) continue;

        // Room conflict
        if (prior.room && prior.room === newMeeting.room) {
          conflicts.push(
            `ROOM CONFLICT: ${newMeeting.label} and ${prior.label} — ` +
            `both use room ${newMeeting.room} on ${DAY_NAME[newMeeting.day]} ` +
            `${newMeeting.start}–${newMeeting.end} / ${prior.start}–${prior.end}`
          );
        }
        // Instructor conflict
        if (prior.docNum && prior.docNum === newMeeting.docNum) {
          conflicts.push(
            `INSTRUCTOR CONFLICT: ${newMeeting.label} and ${prior.label} — ` +
            `same instructor (#${newMeeting.docNum}) on ${DAY_NAME[newMeeting.day]} ` +
            `${newMeeting.start}–${newMeeting.end} / ${prior.start}–${prior.end}`
          );
        }
      }

      planned.push(newMeeting);
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT PLAN  – assign student IDs to sections
// ─────────────────────────────────────────────────────────────────────────────
function buildEnrollmentPlan(state) {
  // Track which student IDs are already used, keyed by dept, to spread load
  const usedByDept = {};
  const plan = []; // { sectionDef, studentIds[] }

  for (const sec of SECTION_DEFS) {
    const alreadyExists = state.existingSections.some(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    if (alreadyExists) { plan.push({ sec, studentIds: [] }); continue; }

    const pool = state.deptStudentMap[sec.dept] || [];
    if (!pool.length) { plan.push({ sec, studentIds: [] }); continue; }

    if (!usedByDept[sec.dept]) usedByDept[sec.dept] = new Set();
    const used = usedByDept[sec.dept];

    // Pick students not already enrolled in another section of the same course
    // (simplified: just cycle through unused first, then reuse)
    const candidates = pool.filter(id => !used.has(id));
    const selected   = candidates.slice(0, sec.enroll);

    // If not enough unused, fill remaining from the front of pool
    if (selected.length < sec.enroll) {
      const extra = pool.filter(id => !selected.includes(id)).slice(0, sec.enroll - selected.length);
      selected.push(...extra);
    }

    selected.forEach(id => used.add(id));
    plan.push({ sec, studentIds: selected });
  }

  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRY-RUN REPORT
// ─────────────────────────────────────────────────────────────────────────────
function printReport(state, conflicts, enrollmentPlan) {
  hr('SEMESTER CHECK');
  if (state.semesterRow) {
    ok(`${SEMESTER} ${ACADEMIC_YEAR} found — status: ${state.semesterRow.status}`);
  }

  hr('PREFLIGHT — REFERENCES');
  const missingCourses = SECTION_DEFS
    .filter(s => !state.courseMap[s.course_code])
    .map(s => s.course_code);
  const missingInstrs = [...new Set(SECTION_DEFS
    .filter(s => !state.instrMap[s.doctor_number])
    .map(s => `#${s.doctor_number}`))];
  const missingRooms  = [...new Set(
    SECTION_DEFS.flatMap(s => s.meetings.map(m => m.room)).filter(r => r && !state.roomMap[r])
  )];

  if (missingCourses.length) {
    fail(`Missing courses: ${missingCourses.join(', ')}`);
  } else {
    ok(`All ${Object.keys(state.courseMap).length} courses found`);
  }
  if (missingInstrs.length) {
    fail(`Missing instructors: ${missingInstrs.join(', ')}`);
  } else {
    ok(`All ${Object.keys(state.instrMap).length} instructors found`);
  }
  if (missingRooms.length) {
    fail(`Missing rooms: ${missingRooms.join(', ')}`);
  } else {
    ok(`All ${Object.keys(state.roomMap).length} physical rooms found and are teaching rooms`);
  }

  hr('EXISTING SECTIONS AUDIT');
  if (!state.existingSections.length) {
    info('No existing sections for this semester');
  }
  for (const es of state.existingSections) {
    const meetCount  = (es.dbMeetings || []).length;
    const normalMeet = (es.dbMeetings || []).filter(m => m.start && toMins(m.start.slice(0,5)) >= 360).length;
    const corrupt    = meetCount - normalMeet;
    const nonTeach   = (es.dbMeetings || []).filter(m => m.room_number && !TEACHING_TYPES.has(m.room_type || '')).length;

    const flags = [];
    if (!meetCount)   flags.push('NO MEETINGS');
    if (corrupt)      flags.push(`${corrupt} CORRUPT MEETING(S)`);
    if (nonTeach)     flags.push('NON-TEACHING ROOM');

    const sym = flags.length ? '⚠' : '✓';
    console.log(`\n  ${sym}  ${es.course_code} §${es.section_number} — ${es.course_name}`);
    info(`room: ${es.room_number || 'N/A'} | days: ${JSON.stringify(es.day_of_week)} | ${es.start_time}–${es.end_time}`);
    info(`instructor: doc#${es.doctor_number} | meetings: ${meetCount} (${normalMeet} normal${corrupt ? `, ${corrupt} corrupt` : ''}) | enrollments: ${es.enrollmentCount}`);
    if (flags.length) warn(`Issues: ${flags.join(', ')}`);
  }

  hr('PLANNED NEW SECTIONS  (25 total)');
  let toInsert = 0, toSkip = 0, totalMeetings = 0;
  for (const { sec, studentIds } of enrollmentPlan) {
    const existing = state.existingSections.find(
      es => es.course_code === sec.course_code && es.section_number === sec.section_number
    );
    if (existing) {
      info(`SKIP  ${sec.label} (already exists as section_id ${existing.id})`);
      toSkip++;
    } else {
      const days  = sec.meetings.map(m => `${DAY_NAME[m.day]} ${m.start}–${m.end}${!m.room ? ' [online]' : ''}`).join('  ');
      const enMsg = studentIds.length ? `enroll ${studentIds.length} students` : 'no students';
      ok(`INSERT ${sec.label}`);
      info(`       room: ${sec.room_number} | ${days} | ${enMsg}`);
      toInsert++;
      totalMeetings += sec.meetings.length;
    }
  }
  console.log(`\n  Summary: ${toInsert} to insert, ${toSkip} to skip`);
  info(`Total meetings to insert: ${totalMeetings}`);
  info(`Total enrollments to insert: ${enrollmentPlan.reduce((n, p) => n + p.studentIds.length, 0)}`);

  hr('CONFLICT CHECK');
  if (!conflicts.length) {
    ok('No room or instructor conflicts found');
  } else {
    conflicts.forEach(c => fail(c));
  }

  hr('WARNINGS');
  if (!state.warnings.length) {
    ok('No warnings');
  } else {
    state.warnings.forEach(w => warn(w));
  }

  hr('ROOMS INTENTIONALLY FREE FOR DEMO');
  info(`${FREE_DEMO_ROOMS.length} rooms kept fully unbooked:`);
  info(FREE_DEMO_ROOMS.join('  '));

  hr('VALIDATION SUMMARY');
  const hardErrors   = state.errors;
  const hasConflicts = conflicts.length > 0;
  if (hardErrors.length) {
    fail(`${hardErrors.length} preflight error(s) — SEED BLOCKED:`);
    hardErrors.forEach(e => fail(`  ${e}`));
  } else if (hasConflicts) {
    fail(`${conflicts.length} schedule conflict(s) — SEED BLOCKED`);
  } else {
    ok('Preflight passed. No conflicts. Safe to commit.');
    if (IS_COMMIT) {
      ok('--commit flag detected. Proceeding with DB writes...');
    } else {
      info('Re-run with --commit to write to DB.');
    }
  }

  return { blocked: hardErrors.length > 0 || hasConflicts };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTE  – single all-or-nothing transaction
// ─────────────────────────────────────────────────────────────────────────────
async function executeCommit(client, state, enrollmentPlan) {
  let sectionsInserted = 0, meetingsInserted = 0, enrollsInserted = 0;

  await client.query('BEGIN');
  try {
    for (const { sec, studentIds } of enrollmentPlan) {
      // Idempotency check: skip if this (course, section_number, semester, year) already exists
      const existing = await client.query(
        `SELECT id FROM sections
         WHERE course_id = $1 AND section_number = $2 AND semester = $3 AND academic_year = $4`,
        [state.courseMap[sec.course_code].id, sec.section_number, SEMESTER, ACADEMIC_YEAR]
      );
      if (existing.rows.length) {
        info(`Skip ${sec.label} — already exists`);
        continue;
      }

      // Insert section
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
          SEMESTER,
          ACADEMIC_YEAR,
          sec.section_number,
          sec.days,
          sec.start_time,
          sec.end_time,
        ]
      );
      const sectionId = secRes.rows[0].id;
      sectionsInserted++;

      // Insert per-day meetings directly (bypass insertSectionMeetings helper)
      for (const m of sec.meetings) {
        const mRoomId = m.room ? state.roomMap[m.room].id : null;
        await client.query(
          `INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time, room_id, meeting_type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [sectionId, m.day, m.start, m.end, mRoomId, m.type]
        );
        meetingsInserted++;
      }

      // Enroll students
      for (const userId of studentIds) {
        const enRes = await client.query(
          `INSERT INTO enrollments (student_id, section_id)
           VALUES ($1,$2)
           ON CONFLICT (student_id, section_id) DO NOTHING`,
          [userId, sectionId]
        );
        if (enRes.rowCount) enrollsInserted++;
      }

      // Update enrolled count
      await client.query(
        `UPDATE sections SET enrolled = (SELECT COUNT(*) FROM enrollments WHERE section_id=$1) WHERE id=$1`,
        [sectionId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return { sectionsInserted, meetingsInserted, enrollsInserted };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-SEED VALIDATION  – read back from DB and verify quality
// ─────────────────────────────────────────────────────────────────────────────
async function postSeedValidation(client) {
  hr('POST-SEED VALIDATION REPORT');

  // Count sections / meetings / enrollments for this semester
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

  info(`Total sections in DB for ${SEMESTER} ${ACADEMIC_YEAR}: ${secCnt.rows[0].count}`);
  info(`Total section_meetings: ${meetCnt.rows[0].count}`);
  info(`Total enrollments: ${enCnt.rows[0].count}`);

  // Non-teaching rooms
  const badRooms = await client.query(
    `SELECT DISTINCT r.room_number, r.type::text
     FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     JOIN rooms r ON r.id=sm.room_id
     WHERE s.semester=$1 AND s.academic_year=$2`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  const nonTeachRooms = badRooms.rows.filter(r => !TEACHING_TYPES.has(r.type));
  if (nonTeachRooms.length) {
    fail(`Non-teaching rooms used in meetings: ${nonTeachRooms.map(r => r.room_number).join(', ')}`);
  } else {
    ok('Non-teaching rooms used: 0');
  }

  // Online meetings with a physical room
  const onlineWithRoom = await client.query(
    `SELECT COUNT(*) FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     WHERE s.semester=$1 AND s.academic_year=$2 AND sm.meeting_type='online' AND sm.room_id IS NOT NULL`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (parseInt(onlineWithRoom.rows[0].count)) {
    fail(`Online meetings with a physical room assigned: ${onlineWithRoom.rows[0].count}`);
  } else {
    ok('Online meetings with physical room: 0');
  }

  // Lab meetings not in lab rooms
  const labNotInLab = await client.query(
    `SELECT COUNT(*) FROM section_meetings sm
     JOIN sections s ON s.id=sm.section_id
     JOIN rooms r ON r.id=sm.room_id
     WHERE s.semester=$1 AND s.academic_year=$2 AND sm.meeting_type='lab'
       AND r.type::text NOT IN ('lab','engineering_drawing_room','engineering_drawing_studio')`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (parseInt(labNotInLab.rows[0].count)) {
    fail(`Lab meetings not in lab rooms: ${labNotInLab.rows[0].count}`);
  } else {
    ok('Lab meetings in non-lab rooms: 0');
  }

  // Room conflicts in new data
  const roomConflict = await client.query(
    `SELECT sm1.room_id, COUNT(*) AS cnt
     FROM section_meetings sm1
     JOIN section_meetings sm2 ON sm2.room_id=sm1.room_id
       AND sm2.day_of_week=sm1.day_of_week
       AND sm2.id <> sm1.id
       AND sm1.start_time < sm2.end_time AND sm2.start_time < sm1.end_time
     JOIN sections s ON s.id=sm1.section_id
     WHERE s.semester=$1 AND s.academic_year=$2 AND sm1.room_id IS NOT NULL
     GROUP BY sm1.room_id`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (roomConflict.rows.length) {
    fail(`Room conflicts found (meeting pairs sharing same room at same time): ${roomConflict.rows.length} room(s) affected`);
  } else {
    ok('Room conflicts: 0');
  }

  // Instructor conflicts
  const instrConflict = await client.query(
    `SELECT s1.instructor_id, COUNT(*) AS cnt
     FROM section_meetings sm1
     JOIN sections s1 ON s1.id=sm1.section_id
     JOIN section_meetings sm2 ON sm2.id <> sm1.id AND sm2.day_of_week=sm1.day_of_week
       AND sm1.start_time < sm2.end_time AND sm2.start_time < sm1.end_time
     JOIN sections s2 ON s2.id=sm2.section_id AND s2.instructor_id=s1.instructor_id
     WHERE s1.semester=$1 AND s1.academic_year=$2
     GROUP BY s1.instructor_id`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (instrConflict.rows.length) {
    fail(`Instructor conflicts: ${instrConflict.rows.length} instructor(s) double-booked`);
  } else {
    ok('Instructor conflicts: 0');
  }

  // Sections missing meetings
  const noMeetings = await client.query(
    `SELECT COUNT(*) FROM sections s
     WHERE s.semester=$1 AND s.academic_year=$2
       AND NOT EXISTS (SELECT 1 FROM section_meetings sm WHERE sm.section_id=s.id)`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  if (parseInt(noMeetings.rows[0].count)) {
    warn(`Sections with no meetings: ${noMeetings.rows[0].count}`);
  } else {
    ok('All sections have at least one meeting');
  }

  // Sections missing enrollments (just informational)
  const noEnroll = await client.query(
    `SELECT COUNT(*) FROM sections s
     WHERE s.semester=$1 AND s.academic_year=$2 AND s.enrolled=0`,
    [SEMESTER, ACADEMIC_YEAR]
  );
  info(`Sections with 0 enrollments: ${noEnroll.rows[0].count}`);

  ok('Validation complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(62));
  console.log(` Spring 2025/2026 Demo Seed — Faculty of Engineering`);
  console.log(` Mode: ${IS_COMMIT ? '⚡ COMMIT (writing to DB)' : '🔍 DRY-RUN (no writes)'}`);
  console.log('═'.repeat(62));

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

    hr('BUILDING CONFLICT MAP');
    const conflicts = buildConflicts(state);
    const enrollmentPlan = buildEnrollmentPlan(state);

    const { blocked } = printReport(state, conflicts, enrollmentPlan);

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
    const { sectionsInserted, meetingsInserted, enrollsInserted } = await executeCommit(client, state, enrollmentPlan);

    hr('COMMIT RESULTS');
    ok(`Sections inserted:    ${sectionsInserted}`);
    ok(`Meetings inserted:    ${meetingsInserted}`);
    ok(`Enrollments inserted: ${enrollsInserted}`);

    await postSeedValidation(client);

    console.log('\n✓  Seed complete. Spring 2025/2026 is ready.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n✗  Seed failed with error:', err.message);
  process.exit(1);
});
