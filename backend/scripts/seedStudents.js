/**
 * seedStudents.js
 * Smart Campus Navigation System — Demo Student Seed
 *
 * Creates 1120 demo student accounts:
 *   14 departments × 80 students each
 *   Password for every account: 1234 (bcrypt cost 12)
 *   Email format: s{student_id}@stu.najah.edu
 *
 * Student ID format: {prefix}{dept_index:02d}{seq:03d}  — always 8 digits
 *   Prefixes: 120 (yr 6) | 121 (yr 5) | 122 (yr 4)
 *             123 (yr 3) | 124 (yr 2) | 125 (yr 1)
 *
 * Safe to run more than once — skips existing students.
 * Never deletes or overwrites existing data.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedStudents.js
 */

'use strict';

// Load .env from backend/ (one level up from scripts/)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────
// 1. DEPARTMENT DEFINITIONS
// ─────────────────────────────────────────────────────────────
// index  — 1-based, used to build the 8-digit student ID
// code   — short code stored in departments.code
// name_en / name_ar — stored in departments table
// shortName — used as students' first_name so the admin panel
//             shows which department the student belongs to
const DEPARTMENTS = [
  {
    index: 1, code: 'GE',
    name_en: 'Geomatics Engineering',
    name_ar: 'هندسة الجيوماتكس',
    shortName: 'Geomatics',
  },
  {
    index: 2, code: 'MMAJ',
    name_en: 'Mechanical Engineering Major',
    name_ar: 'رئيسي الهندسة الميكانيكية',
    shortName: 'MechMajor',
  },
  {
    index: 3, code: 'MMIN',
    name_en: 'Mechanical Engineering Minor',
    name_ar: 'فرعي هندسة الهندسة المدنية',
    shortName: 'MechMinor',
  },
  {
    index: 4, code: 'CE',
    name_en: 'Civil Engineering',
    name_ar: 'هندسة الهندسة المدنية',
    shortName: 'Civil',
  },
  {
    index: 5, code: 'EEE',
    name_en: 'Energy and Environmental Engineering',
    name_ar: 'هندسة الطاقة والبيئة',
    shortName: 'Energy',
  },
  {
    index: 6, code: 'IE',
    name_en: 'Industrial Engineering',
    name_ar: 'الهندسة الصناعية',
    shortName: 'Industrial',
  },
  {
    index: 7, code: 'CHE',
    name_en: 'Chemical Engineering',
    name_ar: 'الهندسة الكيميائية',
    shortName: 'Chemical',
  },
  {
    index: 8, code: 'NSE',
    name_en: 'Network and Intelligent Systems Engineering',
    name_ar: 'هندسة الشبكات والانظمة الذكية',
    shortName: 'Network',
  },
  {
    index: 9, code: 'UPE',
    name_en: 'Urban Planning and Technology Engineering',
    name_ar: 'هندسة التخطيط وتكنولوجيا المدن',
    shortName: 'Urban',
  },
  {
    index: 10, code: 'ELE',
    name_en: 'Electrical Engineering',
    name_ar: 'الهندسة الكهربائية',
    shortName: 'Electrical',
  },
  {
    index: 11, code: 'CPE',
    name_en: 'Computer Engineering',
    name_ar: 'هندسة الحاسوب',
    shortName: 'Computer',
  },
  {
    index: 12, code: 'ME',
    name_en: 'Mechanical Engineering',
    name_ar: 'الهندسة الميكانيكية',
    shortName: 'Mechanical',
  },
  {
    index: 13, code: 'ARE',
    name_en: 'Architectural Engineering',
    name_ar: 'الهندسة المعمارية',
    shortName: 'Architectural',
  },
  {
    index: 14, code: 'AGE',
    name_en: 'Agricultural Engineering',
    name_ar: 'الهندسة الزراعية',
    shortName: 'Agricultural',
  },
];

// ─────────────────────────────────────────────────────────────
// 2. YEAR BATCHES
// 80 students per department split across 6 year-prefixes.
// 13 × 4  +  14 × 2  =  52 + 28 = 80
// ─────────────────────────────────────────────────────────────
const YEAR_BATCHES = [
  { prefix: '120', yearOfStudy: 6, registrationYear: 2020, count: 13 },
  { prefix: '121', yearOfStudy: 5, registrationYear: 2021, count: 13 },
  { prefix: '122', yearOfStudy: 4, registrationYear: 2022, count: 13 },
  { prefix: '123', yearOfStudy: 3, registrationYear: 2023, count: 13 },
  { prefix: '124', yearOfStudy: 2, registrationYear: 2024, count: 14 },
  { prefix: '125', yearOfStudy: 1, registrationYear: 2025, count: 14 },
];

// ── Compile-time assertions ───────────────────────────────────
const STUDENTS_PER_DEPT  = YEAR_BATCHES.reduce((s, b) => s + b.count, 0);
const TOTAL_STUDENTS     = STUDENTS_PER_DEPT * DEPARTMENTS.length;

if (STUDENTS_PER_DEPT !== 80) {
  throw new Error(`Year batch total is ${STUDENTS_PER_DEPT}, expected 80. Fix YEAR_BATCHES.`);
}
if (TOTAL_STUDENTS !== 1120) {
  throw new Error(`Total is ${TOTAL_STUDENTS}, expected 1120. Fix department list.`);
}

// ─────────────────────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Ensures a department row exists.
 * Checks by name_en first, then by code.
 * Inserts only if neither matches.
 * Returns the department's UUID id.
 */
async function ensureDepartment(client, dept) {
  // Match by English name (most precise) or by short code
  const existing = await client.query(
    `SELECT id FROM departments
     WHERE name_en = $1 OR code = $2
     LIMIT 1`,
    [dept.name_en, dept.code]
  );

  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, wasInserted: false };
  }

  const inserted = await client.query(
    `INSERT INTO departments
       (code, name_en, name_ar, faculty, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id`,
    [dept.code, dept.name_en, dept.name_ar, 'Faculty of Engineering']
  );

  return { id: inserted.rows[0].id, wasInserted: true };
}

/**
 * Builds the 8-digit student ID string.
 * Format: {prefix:3}{deptIndex:2}{seq:3}
 * Example: prefix=125, deptIndex=4, seq=1  →  "12504001"
 */
function buildStudentId(prefix, deptIndex, seq) {
  const id =
    prefix +
    String(deptIndex).padStart(2, '0') +
    String(seq).padStart(3, '0');

  if (id.length !== 8) {
    throw new Error(
      `Student ID "${id}" is not 8 digits ` +
      `(prefix=${prefix}, deptIndex=${deptIndex}, seq=${seq})`
    );
  }

  return id;
}

// ─────────────────────────────────────────────────────────────
// 4. MAIN
// ─────────────────────────────────────────────────────────────
async function seed() {
  console.log('');
  console.log('🌱  Smart Campus — Demo Student Seed');
  console.log('======================================');
  console.log(`    Departments : ${DEPARTMENTS.length}`);
  console.log(`    Students    : ${TOTAL_STUDENTS} (${STUDENTS_PER_DEPT} per department)`);
  console.log('');

  // Hash password once — bcrypt cost 12 matches the backend
  console.log('⏳  Hashing password "1234" with bcrypt cost 12…');
  console.log('    (this takes a few seconds — done only once)');
  const passwordHash = await bcrypt.hash('1234', 12);
  console.log('✅  Password hashed.\n');

  const client = await pool.connect();

  let deptInserted = 0;
  let deptExisting = 0;
  const deptMap = {};       // name_en → UUID

  let studentsInserted = 0;
  let studentsSkipped  = 0;

  try {
    // ══════════════════════════════════════════════════════════
    // PHASE 1 — Departments
    // ══════════════════════════════════════════════════════════
    console.log('📂  Phase 1 — Departments');
    console.log('------------------------------');

    await client.query('BEGIN');
    try {
      for (const dept of DEPARTMENTS) {
        const { id, wasInserted } = await ensureDepartment(client, dept);
        deptMap[dept.name_en] = id;

        if (wasInserted) {
          deptInserted++;
          console.log(`    ✅  Inserted : ${dept.name_en}  (${dept.code})`);
        } else {
          deptExisting++;
          console.log(`    ⏭   Exists  : ${dept.name_en}  (${dept.code})`);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log('');
    console.log(
      `    Departments — inserted: ${deptInserted}` +
      `, already existed: ${deptExisting}\n`
    );

    // ══════════════════════════════════════════════════════════
    // PHASE 2 — Students
    // One transaction per department (14 × 80 = 1120 inserts).
    // ══════════════════════════════════════════════════════════
    console.log('👥  Phase 2 — Students');
    console.log('------------------------------');

    for (const dept of DEPARTMENTS) {
      const deptId = deptMap[dept.name_en];
      let deptInsertCount  = 0;
      let deptSkippedCount = 0;

      await client.query('BEGIN');
      try {
        for (const batch of YEAR_BATCHES) {
          for (let seq = 1; seq <= batch.count; seq++) {
            const studentId = buildStudentId(batch.prefix, dept.index, seq);
            const email     = `s${studentId}@stu.najah.edu`;

            // ── Check for existing student ───────────────────
            // Both checks must pass before we insert anything.
            // Checking registration_number in addition to email
            // prevents inserting a user whose profile already
            // exists from a previous partial run (or manual insert).
            const existingUser = await client.query(
              'SELECT id FROM users WHERE email = $1',
              [email]
            );
            const existingProfile = await client.query(
              'SELECT id FROM student_profiles WHERE registration_number = $1',
              [studentId]
            );

            if (existingUser.rows.length > 0 || existingProfile.rows.length > 0) {
              studentsSkipped++;
              deptSkippedCount++;
              continue;
            }

            // ── Insert user ──────────────────────────────────
            // first_name = short dept name   → identifies dept in admin panel
            // last_name  = prefix + seq      → identifies year + sequence
            // e.g. "Civil 125001"
            const userId    = uuidv4();
            const firstName = dept.shortName;
            const lastName  = `${batch.prefix}${String(seq).padStart(3, '0')}`;

            await client.query(
              `INSERT INTO users
                 (id, first_name, last_name, email, password_hash,
                  student_id, department, year_of_study, role, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'student', 'active')`,
              [
                userId,
                firstName,
                lastName,
                email,
                passwordHash,
                studentId,          // users.student_id = text reg. number
                dept.name_en,       // users.department = English name
                batch.yearOfStudy,  // users.year_of_study = 1–6
              ]
            );

            // ── Insert student_profile ───────────────────────
            // We already confirmed registration_number does not exist
            // in the pre-check above, so this INSERT should always
            // produce rowCount = 1.
            // ON CONFLICT DO NOTHING is kept as a DB-level guard.
            // If it fires (rowCount = 0), we throw so the entire
            // department batch is rolled back — no orphaned user.
            const profileResult = await client.query(
              `INSERT INTO student_profiles
                 (id, user_id, registration_number,
                  department_id, year_of_study, registration_year)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (registration_number) DO NOTHING`,
              [
                uuidv4(),
                userId,
                studentId,              // registration_number = same as student_id
                deptId,                 // FK → departments.id
                batch.yearOfStudy,
                batch.registrationYear,
              ]
            );

            if (profileResult.rowCount !== 1) {
              throw new Error(
                `student_profiles insert was silently skipped for ` +
                `registration_number "${studentId}" (${email}). ` +
                `The user row was inserted but the profile was not — ` +
                `rolling back this department batch.`
              );
            }

            studentsInserted++;
            deptInsertCount++;
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      console.log(
        `    ✅  ${dept.name_en.padEnd(48)} ` +
        `inserted: ${String(deptInsertCount).padStart(2)}` +
        `  skipped: ${deptSkippedCount}`
      );
    }

    // ══════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════
    console.log('');
    console.log('======================================');
    console.log('📊  Seed Summary');
    console.log('======================================');
    console.log(`Departments : ${DEPARTMENTS.length} checked`);
    console.log(`              ✅  Inserted       : ${deptInserted}`);
    console.log(`              ⏭   Already existed: ${deptExisting}`);
    console.log('');
    console.log(`Students    : ${TOTAL_STUDENTS} generated`);
    console.log(`              ✅  Inserted       : ${studentsInserted}`);
    console.log(`              ⏭   Skipped        : ${studentsSkipped}`);
    console.log('');
    console.log('✅  Seed complete.');
    console.log('');

  } catch (err) {
    // Any uncaught error — the current transaction was already rolled
    // back inside the try/catch above, so no partial dept/student batch
    // will be left in the DB.
    console.error('');
    console.error('❌  Seed failed — see error below.');
    console.error(`    ${err.message}`);
    console.error('');
    console.error('    Completed before the error:');
    console.error(`      Departments inserted : ${deptInserted}`);
    console.error(`      Students inserted    : ${studentsInserted}`);
    console.error('');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
