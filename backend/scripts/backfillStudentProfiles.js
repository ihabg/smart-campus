/**
 * backfillStudentProfiles.js
 * Smart Campus Navigation System — Backfill student_profiles
 *
 * For every user with role = 'student', ensures student_profiles has:
 *   registration_number = users.student_id
 *   department_id       = matched from departments table using users.department
 *   year_of_study       = users.year_of_study
 *   registration_year   = inferred from student ID prefix (preferred)
 *                         or computed from year_of_study + current academic year (fallback)
 *
 * Two-method registration year inference:
 *   METHOD 1 (preferred) — Student ID prefix
 *     The seeded student IDs follow: {prefix:3}{deptIndex:2}{seq:3}  (8 digits)
 *     Prefix '1XX' encodes the registration year: '121' → 2021, '125' → 2025.
 *     Formula: 2000 + parseInt(studentId.slice(1, 3))
 *     This is deterministic and does not change with the calendar.
 *
 *   METHOD 2 (fallback) — year_of_study + current academic year
 *     Academic year starts in September.
 *     If today is before September: academicStartYear = current year − 1
 *     If today is September or later: academicStartYear = current year
 *     registration_year = academicStartYear − (year_of_study − 1)
 *     Example (run May 2026): startYear = 2025; year 5 → 2021, year 1 → 2025
 *
 * Safety:
 *   - Dry run by default; no DB writes unless --commit is passed
 *   - Without --force: only NULL fields are filled in; non-null fields are preserved
 *   - With --force:    NULL fields are filled, AND differing non-null fields are overwritten
 *   - Per-student transactions; one failure does not affect other students
 *   - Never touches: grades, enrollments, study_plans, courses, users
 *
 * Usage:
 *   node scripts/backfillStudentProfiles.js                        # dry run
 *   node scripts/backfillStudentProfiles.js --commit               # write to DB
 *   node scripts/backfillStudentProfiles.js --commit --force       # overwrite non-null fields too
 *   node scripts/backfillStudentProfiles.js --commit > output.txt  # save full log
 */

'use strict';

// Load .env from backend/ (one level up from scripts/)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { pool } = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const FORCE  = process.argv.includes('--force');

// ─── Registration Year Inference ──────────────────────────────

/**
 * METHOD 1 — parse from student ID prefix.
 * Format: {prefix:3}{deptIdx:2}{seq:3}  total = 8 digits
 * Prefix is '1XX': second and third characters are the last 2 digits of the year.
 *   '120' → 2020   '121' → 2021   '122' → 2022
 *   '123' → 2023   '124' → 2024   '125' → 2025
 */
function regYearFromStudentId(sid) {
  if (!sid || typeof sid !== 'string' || sid.length < 3) return null;
  const prefix = sid.slice(0, 3);
  if (!/^1\d{2}$/.test(prefix)) return null;          // must be '1' + 2 digits
  const yr = 2000 + parseInt(prefix.slice(1), 10);
  return (yr >= 1990 && yr <= 2100) ? yr : null;
}

/**
 * METHOD 2 — infer from year_of_study + current academic year.
 * Academic year starts in September; May 2026 → academic start year = 2025.
 * registration_year = academicStartYear − (year_of_study − 1)
 */
function regYearFromYearOfStudy(yos) {
  if (!yos || yos < 1 || yos > 6) return null;
  const now  = new Date();
  const base = (now.getMonth() + 1) >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const yr   = base - (yos - 1);
  return (yr >= 1990 && yr <= 2100) ? yr : null;
}

// ─── Department Matching ──────────────────────────────────────

/**
 * Build two lookup maps from the departments table rows:
 *   byName  — lowercased name_en → row
 *   byCode  — lowercased code    → row
 */
function buildDeptMaps(rows) {
  const byName = new Map();
  const byCode = new Map();
  for (const d of rows) {
    byName.set(d.name_en.trim().toLowerCase(), d);
    byCode.set(d.code.trim().toLowerCase(),   d);
  }
  return { byName, byCode };
}

/**
 * Match users.department text against departments table.
 * Priority: exact name_en → exact code.
 * Returns the matching department row, or null if no match.
 */
function matchDept(text, { byName, byCode }) {
  if (!text?.trim()) return null;
  const n = text.trim().toLowerCase();
  return byName.get(n) ?? byCode.get(n) ?? null;
}

// ─── Main ─────────────────────────────────────────────────────

async function run() {
  console.log('');
  console.log('Smart Campus — Backfill Student Profiles');
  console.log('==========================================');
  console.log(`Mode  : ${COMMIT
    ? 'COMMIT — database will be modified'
    : 'DRY RUN — no database changes'}`);
  console.log(`Force : ${FORCE
    ? 'YES — will also overwrite non-null fields that differ from computed values'
    : 'NO  — only NULL fields will be filled in; existing non-null values are preserved'}`);
  if (FORCE && !COMMIT) {
    console.log('NOTE  : --force has no effect without --commit (dry run mode).');
  }
  console.log('');

  const client = await pool.connect();

  // ── Counters ─────────────────────────────────────────────────
  const s = {
    total:      0,
    created:    0,
    updated:    0,
    alreadyOk:  0,
    mismatched: 0,  // non-null fields differ from computed; needs --force
    skipNoId:   0,
    skipNoDept: 0,
    skipNoYear: 0,  // includes null year_of_study when creating new profile
    errors:     0,
  };

  // Detail lines for end-of-run report (skips only — don't log per-line)
  const skippedLines   = [];
  const mismatchLines  = [];
  const errorLines     = [];

  try {
    // ── Load departments ────────────────────────────────────
    process.stdout.write('Loading departments…  ');
    const { rows: deptRows } = await client.query(
      `SELECT id, code, name_en FROM departments ORDER BY name_en`
    );
    const deptMaps = buildDeptMaps(deptRows);
    console.log(`${deptRows.length} loaded.`);

    // ── Load all students + their existing profile (if any) ─
    process.stdout.write('Loading students…     ');
    const { rows: students } = await client.query(`
      SELECT
        u.id             AS user_id,
        u.student_id     AS sid,
        u.department,
        u.year_of_study  AS yos,
        sp.id                AS profile_id,
        sp.department_id     AS p_dept,
        sp.registration_year AS p_year
      FROM users u
      LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE u.role = 'student'
      ORDER BY u.student_id NULLS LAST
    `);
    s.total = students.length;
    console.log(`${s.total} found.`);

    if (!s.total) {
      console.log('\nNo students found. Nothing to do.\n');
      return;
    }

    console.log('');
    console.log('Processing students…');
    console.log('─'.repeat(72));

    // ── Per-student loop ─────────────────────────────────────
    for (const st of students) {
      const { user_id, sid, department, yos, profile_id, p_dept, p_year } = st;
      const tag = sid
        ? `[${String(sid).padStart(10)}]`
        : `[uid:${user_id.slice(0, 8)}]`;

      // ── 1. Require student_id ───────────────────────────
      if (!sid) {
        s.skipNoId++;
        const why = 'users.student_id is null — cannot set registration_number';
        skippedLines.push(`${tag}  ${why}`);
        console.log(`  SKIP      ${tag}  ${why}`);
        continue;
      }

      // ── 2. Match department ─────────────────────────────
      const dept = matchDept(department, deptMaps);
      if (!dept) {
        s.skipNoDept++;
        const why = department
          ? `department "${department}" not matched (tried name_en and code)`
          : 'users.department is null/empty';
        skippedLines.push(`${tag}  ${why}`);
        console.log(`  SKIP      ${tag}  ${why}`);
        continue;
      }

      // ── 3. Infer registration year ──────────────────────
      const yearFromId  = regYearFromStudentId(sid);
      const yearFromYos = regYearFromYearOfStudy(yos);
      const targetYear  = yearFromId ?? yearFromYos;
      const yearSrc     = yearFromId ? 'id-prefix' : 'year_of_study-fallback';

      if (!targetYear) {
        s.skipNoYear++;
        const why = `cannot infer registration_year` +
          ` (student_id="${sid}", year_of_study=${yos ?? 'null'})`;
        skippedLines.push(`${tag}  ${why}`);
        console.log(`  SKIP      ${tag}  ${why}`);
        continue;
      }

      // ── 4. Decide action ────────────────────────────────
      if (!profile_id) {
        // ───── No profile → CREATE ──────────────────────
        // year_of_study is required for INSERT (NOT NULL column).
        if (!yos) {
          s.skipNoYear++;
          const why = 'users.year_of_study is null; cannot create profile without it';
          skippedLines.push(`${tag}  ${why}`);
          console.log(`  SKIP      ${tag}  ${why}`);
          continue;
        }

        if (!COMMIT) {
          s.created++;
          console.log(
            `  CREATE    ${tag}  dept:${dept.code.padEnd(6)}` +
            `  regYear:${targetYear}  [${yearSrc}]`
          );
        } else {
          try {
            await client.query('BEGIN');
            await client.query(`
              INSERT INTO student_profiles
                (user_id, registration_number, department_id, year_of_study, registration_year)
              VALUES ($1, $2, $3, $4, $5)
            `, [user_id, sid, dept.id, yos, targetYear]);
            await client.query('COMMIT');
            s.created++;
            console.log(
              `  CREATE    ${tag}  dept:${dept.code.padEnd(6)}` +
              `  regYear:${targetYear}  [${yearSrc}]`
            );
          } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            s.errors++;
            errorLines.push(`${tag}  CREATE: ${err.message}`);
            console.error(`  ERROR     ${tag}  ${err.message}`);
          }
        }

      } else {
        // ───── Profile exists → UPDATE or skip ──────────
        const deptMatch = (p_dept === dept.id);
        const yearMatch = (p_year === targetYear);

        // Fields that need updating:
        //   Without --force: only if the stored value is NULL
        //   With --force:    if NULL or if non-null but differs from computed
        const updateDept = FORCE ? !deptMatch : !p_dept;
        const updateYear = FORCE ? !yearMatch : !p_year;

        if (!updateDept && !updateYear) {
          // Nothing to do for this student
          if (!deptMatch || !yearMatch) {
            // Non-null fields differ from computed values — flag it
            s.mismatched++;
            const deptInfo = deptMatch ? '' : ` dept:stored≠computed(${dept.code})`;
            const yearInfo = yearMatch ? '' : ` regYear:stored=${p_year}≠computed=${targetYear}`;
            const msg = `has profile but field(s) differ from computed — use --force to overwrite.${deptInfo}${yearInfo}`;
            mismatchLines.push(`${tag}  ${msg}`);
            console.log(`  MISMATCH  ${tag}  dept:${deptMatch?'ok':'DIFF'}  regYear:${yearMatch?'ok':'DIFF'}`);
          } else {
            s.alreadyOk++;
            // Don't print; reduces noise for the common case
          }
          continue;
        }

        const fieldLabels = [];
        if (updateDept) fieldLabels.push(`dept→${dept.code}`);
        if (updateYear) fieldLabels.push(`regYear→${targetYear}[${yearSrc}]`);

        if (!COMMIT) {
          s.updated++;
          console.log(
            `  UPDATE    ${tag}  ${fieldLabels.join('  ')}`
          );
        } else {
          try {
            await client.query('BEGIN');

            const setClauses = [];
            const vals = [];
            let   idx  = 1;

            if (updateDept) {
              setClauses.push(`department_id = $${idx++}`);
              vals.push(dept.id);
            }
            if (updateYear) {
              setClauses.push(`registration_year = $${idx++}`);
              vals.push(targetYear);
            }
            setClauses.push('updated_at = NOW()');
            vals.push(profile_id); // WHERE id = $idx

            await client.query(
              `UPDATE student_profiles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
              vals
            );
            await client.query('COMMIT');
            s.updated++;
            console.log(
              `  UPDATE    ${tag}  ${fieldLabels.join('  ')}`
            );
          } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            s.errors++;
            errorLines.push(`${tag}  UPDATE: ${err.message}`);
            console.error(`  ERROR     ${tag}  ${err.message}`);
          }
        }
      }
    }

    // ── Summary ─────────────────────────────────────────────
    const modeLabel = COMMIT ? 'Changes applied' : 'Planned (dry run)';
    const totalSkipped = s.skipNoId + s.skipNoDept + s.skipNoYear;

    console.log('─'.repeat(72));
    console.log('');
    console.log('Summary');
    console.log('==========================================');
    console.log(`Total students found        : ${s.total}`);
    console.log('');
    console.log(`${modeLabel}`);
    console.log(`  Profiles created          : ${s.created}`);
    console.log(`  Profiles updated          : ${s.updated}`);
    console.log(`  Already complete / no-op  : ${s.alreadyOk}`);
    console.log('');
    console.log(`Skipped                     : ${totalSkipped}`);
    console.log(`  No student_id             : ${s.skipNoId}`);
    console.log(`  Department not matched    : ${s.skipNoDept}`);
    console.log(`  Cannot infer year         : ${s.skipNoYear}`);
    console.log('');
    console.log(`Mismatched (use --force)    : ${s.mismatched}`);
    if (s.errors) {
      console.log(`Errors                      : ${s.errors}`);
    }

    if (skippedLines.length) {
      console.log('');
      console.log('── Skipped students (details) ──');
      skippedLines.forEach(l => console.log(`  ${l}`));
    }
    if (mismatchLines.length) {
      console.log('');
      console.log('── Mismatch details ──');
      mismatchLines.forEach(l => console.log(`  ${l}`));
    }
    if (errorLines.length) {
      console.log('');
      console.log('── Error details ──');
      errorLines.forEach(l => console.error(`  ${l}`));
    }

    console.log('');
    if (!COMMIT) {
      console.log('Dry run complete — no database changes were made.');
      console.log('Run with --commit to apply the planned changes.');
    } else {
      console.log('Done. All changes have been committed.');
    }
    console.log('');

    // ── Verification SQL ─────────────────────────────────────
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Verification SQL  (run in pgAdmin after committing)');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`
-- 1. Profiles still missing department_id or registration_year:
SELECT COUNT(*) AS incomplete
FROM student_profiles
WHERE department_id IS NULL OR registration_year IS NULL;

-- 2. Student users with no profile row at all:
SELECT u.student_id, u.department, u.year_of_study
FROM users u
LEFT JOIN student_profiles sp ON sp.user_id = u.id
WHERE u.role = 'student' AND sp.id IS NULL
ORDER BY u.student_id;

-- 3. Study-plan match rate across all students:
SELECT
  COUNT(u.id)                                       AS total_students,
  COUNT(sp.id)                                      AS have_profile,
  SUM(CASE WHEN sp.department_id IS NOT NULL
            AND sp.registration_year IS NOT NULL
            THEN 1 ELSE 0 END)                      AS profile_complete,
  COUNT(stp.id)                                     AS matched_to_plan
FROM users u
LEFT JOIN student_profiles sp
       ON sp.user_id = u.id
LEFT JOIN study_plans stp
       ON stp.department_id = sp.department_id
      AND stp.plan_year     = sp.registration_year
WHERE u.role = 'student';

-- 4. Check a specific student (replace 12143698 with any student_id):
SELECT
  u.student_id,
  sp.registration_year,
  d.code         AS dept_code,
  d.name_en      AS dept_name,
  stp.plan_year  AS plan_year
FROM users u
JOIN student_profiles sp  ON sp.user_id      = u.id
JOIN departments       d  ON d.id            = sp.department_id
LEFT JOIN study_plans  stp ON stp.department_id = sp.department_id
                           AND stp.plan_year    = sp.registration_year
WHERE u.student_id = '12143698';
`);

  } catch (err) {
    console.error('');
    console.error('Fatal error:');
    console.error(`  ${err.message}`);
    console.error('');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
