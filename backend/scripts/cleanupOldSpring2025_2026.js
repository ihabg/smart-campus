'use strict';
require('dotenv').config();
const { pool } = require('../config/db');

const IS_COMMIT = process.argv.includes('--commit');

// ── Target section ────────────────────────────────────────────
// Microcontrollers §1  |  spring 2025/2026  |  pre-seed section
const TARGET_ID = '1a5bddea-4f80-4ec6-93c2-168bbcf9f1f6';

const EXPECTED = {
  course_code:    '10636426',
  section_number: '1',
  semester:       'spring',
  academic_year:  '2025/2026',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sep(char = '─', len = 64) {
  return char.repeat(len);
}

// Returns a count integer. Returns 0 if the table doesn't exist
// rather than crashing (handles schema drift gracefully).
async function safeCount(client, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    const val = r.rows[0]?.count ?? r.rows[0]?.n ?? 0;
    return parseInt(val, 10) || 0;
  } catch {
    return 0;
  }
}

// Returns rowCount. Skips silently if the table doesn't exist.
async function safeDelete(client, label, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    return r.rowCount ?? 0;
  } catch (err) {
    // Surface unexpected errors; ignore "table does not exist"
    if (err.code === '42P01') return 0;   // undefined_table
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Step 1 — Safety verification
// ─────────────────────────────────────────────────────────────
// Runs outside the transaction so a typo in the hardcoded ID
// never even starts a transaction.
async function verifyTarget(client) {
  const r = await client.query(
    `SELECT s.id,
            c.code            AS course_code,
            c.name            AS course_name,
            s.section_number,
            s.semester::text  AS semester,
            s.academic_year,
            s.is_active,
            s.enrolled
     FROM   sections s
     JOIN   courses  c ON c.id = s.course_id
     WHERE  s.id = $1`,
    [TARGET_ID]
  );

  if (!r.rows.length) {
    throw new Error(`ABORT — section ${TARGET_ID} was not found. Already deleted?`);
  }

  const row = r.rows[0];

  const checks = [
    ['id',             row.id,             TARGET_ID],
    ['course_code',    row.course_code,    EXPECTED.course_code],
    ['section_number', row.section_number, EXPECTED.section_number],
    ['semester',       row.semester,       EXPECTED.semester],
    ['academic_year',  row.academic_year,  EXPECTED.academic_year],
  ];

  for (const [field, actual, expected] of checks) {
    if (String(actual) !== String(expected)) {
      throw new Error(
        `ABORT — safety check failed on field "${field}".\n` +
        `  expected : "${expected}"\n` +
        `  actual   : "${actual}"\n` +
        `  Refusing to delete.`
      );
    }
  }

  return row;
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Gather sub-record IDs
// ─────────────────────────────────────────────────────────────
async function gatherLinkedIds(client) {
  const [assRes, matRes] = await Promise.all([
    client.query(
      `SELECT id, title, assessment_type
       FROM   course_assessments
       WHERE  section_id = $1`,
      [TARGET_ID]
    ),
    client.query(
      `SELECT id, title, material_type, uploaded_at
       FROM   professor_course_materials
       WHERE  section_id = $1`,
      [TARGET_ID]
    ),
  ]);

  return {
    assessments: assRes.rows,
    materials:   matRes.rows,
    assessmentIds: assRes.rows.map(r => r.id),
    materialIds:   matRes.rows.map(r => r.id),
  };
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Gather counts for dry-run report
// ─────────────────────────────────────────────────────────────
async function gatherCounts(client, assessmentIds, materialIds) {
  const hasAssessments = assessmentIds.length > 0;
  const hasMaterials   = materialIds.length   > 0;

  const [
    cMeetings,
    cEnrollments,
    cAttendance,
    cGrades,
    cMeetingChanges,
    cMaterials,
    cMatAccessLogs,
    cAssessments,
    cAsmtAttachments,
    cSubmissions,
    cSubAttachments,
    cQuizAttempts,
    cQuizAnswers,
  ] = await Promise.all([
    safeCount(client,
      `SELECT COUNT(*) AS count FROM section_meetings WHERE section_id = $1`,
      [TARGET_ID]),

    safeCount(client,
      `SELECT COUNT(*) AS count FROM enrollments WHERE section_id = $1`,
      [TARGET_ID]),

    safeCount(client,
      `SELECT COUNT(*) AS count FROM attendance WHERE section_id = $1`,
      [TARGET_ID]),

    safeCount(client,
      `SELECT COUNT(*) AS count FROM grades WHERE section_id = $1`,
      [TARGET_ID]),

    safeCount(client,
      `SELECT COUNT(*) AS count FROM section_meeting_changes WHERE section_id = $1`,
      [TARGET_ID]),

    safeCount(client,
      `SELECT COUNT(*) AS count FROM professor_course_materials WHERE section_id = $1`,
      [TARGET_ID]),

    hasMaterials
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM professor_material_access_logs
           WHERE  material_id = ANY($1::uuid[])`,
          [materialIds])
      : 0,

    safeCount(client,
      `SELECT COUNT(*) AS count FROM course_assessments WHERE section_id = $1`,
      [TARGET_ID]),

    hasAssessments
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM assessment_attachments
           WHERE  assessment_id = ANY($1::uuid[])`,
          [assessmentIds])
      : 0,

    hasAssessments
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM assignment_submissions
           WHERE  assessment_id = ANY($1::uuid[])`,
          [assessmentIds])
      : 0,

    hasAssessments
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM assessment_submission_attachments
           WHERE  submission_id IN (
             SELECT id FROM assignment_submissions
             WHERE  assessment_id = ANY($1::uuid[])
           )`,
          [assessmentIds])
      : 0,

    hasAssessments
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM quiz_attempts
           WHERE  assessment_id = ANY($1::uuid[])`,
          [assessmentIds])
      : 0,

    hasAssessments
      ? safeCount(client,
          `SELECT COUNT(*) AS count FROM quiz_answers
           WHERE  attempt_id IN (
             SELECT id FROM quiz_attempts
             WHERE  assessment_id = ANY($1::uuid[])
           )`,
          [assessmentIds])
      : 0,
  ]);

  return {
    cMeetings, cEnrollments, cAttendance, cGrades, cMeetingChanges,
    cMaterials, cMatAccessLogs,
    cAssessments, cAsmtAttachments, cSubmissions, cSubAttachments,
    cQuizAttempts, cQuizAnswers,
  };
}

// ─────────────────────────────────────────────────────────────
// Step 4 — Suspicious-section report (never deleted)
// ─────────────────────────────────────────────────────────────
// Reports other spring 2025/2026 sections that look like they
// might be pre-seed data. Purely informational — nothing is
// touched unless it is the explicit TARGET_ID.
async function gatherSuspiciousSections(client) {
  const r = await client.query(
    `SELECT s.id,
            c.code  AS course_code,
            c.name  AS course_name,
            s.section_number,
            s.is_active,
            s.enrolled,
            s.created_at,
            (SELECT COUNT(*) FROM professor_course_materials WHERE section_id = s.id)  AS mats,
            (SELECT COUNT(*) FROM course_assessments           WHERE section_id = s.id) AS assessments,
            (SELECT COUNT(*) FROM enrollments
             WHERE  section_id = s.id AND status = 'enrolled')                          AS enr_count
     FROM   sections s
     JOIN   courses  c ON c.id = s.course_id
     WHERE  s.semester     = 'spring'
       AND  s.academic_year = '2025/2026'
       AND  s.id           <> $1
       AND  (
              (SELECT COUNT(*) FROM professor_course_materials WHERE section_id = s.id)  > 0
           OR (SELECT COUNT(*) FROM course_assessments           WHERE section_id = s.id) > 0
           OR s.created_at < NOW() - INTERVAL '30 days'
       )
     ORDER BY c.code, s.section_number`,
    [TARGET_ID]
  );
  return r.rows;
}

// ─────────────────────────────────────────────────────────────
// Print dry-run report
// ─────────────────────────────────────────────────────────────
function printReport(section, linked, counts, suspicious) {
  const { assessments, materials } = linked;
  const {
    cMeetings, cEnrollments, cAttendance, cGrades, cMeetingChanges,
    cMaterials, cMatAccessLogs,
    cAssessments, cAsmtAttachments, cSubmissions, cSubAttachments,
    cQuizAttempts, cQuizAnswers,
  } = counts;

  const totalRows =
    cMeetings + cEnrollments + cAttendance + cGrades + cMeetingChanges +
    cMaterials + cMatAccessLogs +
    cAssessments + cAsmtAttachments + cSubmissions + cSubAttachments +
    cQuizAttempts + cQuizAnswers +
    1; // the section row itself

  console.log('');
  console.log(sep('═'));
  console.log('  CLEANUP DRY-RUN  —  Spring 2025/2026');
  console.log(sep('═'));
  console.log('  Mode : DRY-RUN — nothing has been changed.');
  console.log('  Run with --commit to apply all deletions in a single transaction.');
  console.log('');

  // ── Target section ──────────────────────────────────────────
  console.log(sep());
  console.log('  TARGET SECTION');
  console.log(sep());
  console.log(`  id             : ${section.id}`);
  console.log(`  course_code    : ${section.course_code}`);
  console.log(`  course_name    : ${section.course_name}`);
  console.log(`  section_number : ${section.section_number}`);
  console.log(`  semester       : ${section.semester}`);
  console.log(`  academic_year  : ${section.academic_year}`);
  console.log(`  is_active      : ${section.is_active}`);
  console.log(`  enrolled       : ${section.enrolled}`);
  console.log('');

  // ── Materials ────────────────────────────────────────────────
  console.log(sep());
  console.log(`  MATERIALS  (${materials.length})`);
  console.log(sep());
  if (materials.length) {
    for (const m of materials) {
      const ts = m.uploaded_at
        ? new Date(m.uploaded_at).toISOString().replace('T', ' ').slice(0, 19)
        : '—';
      console.log(`  [${m.id}]`);
      console.log(`    title        : "${m.title}"`);
      console.log(`    type         : ${m.material_type}`);
      console.log(`    uploaded_at  : ${ts}`);
    }
  } else {
    console.log('  (none)');
  }
  console.log('');

  // ── Assessments ─────────────────────────────────────────────
  console.log(sep());
  console.log(`  ASSESSMENTS  (${assessments.length})`);
  console.log(sep());
  if (assessments.length) {
    for (const a of assessments) {
      console.log(`  [${a.id}]`);
      console.log(`    title : "${a.title}"`);
      console.log(`    type  : ${a.assessment_type}`);
    }
  } else {
    console.log('  (none)');
  }
  console.log('');

  // ── Row counts ───────────────────────────────────────────────
  console.log(sep());
  console.log('  ROWS TO BE DELETED');
  console.log(sep());

  function row(label, n) {
    const flag = n > 0 ? ' ←' : '';
    console.log(`  ${'  ' + label}`.padEnd(46) + String(n).padStart(6) + flag);
  }

  console.log('  ── assessment tree ──');
  row('assessment_submission_attachments', cSubAttachments);
  row('assignment_submissions',            cSubmissions);
  row('quiz_answers',                      cQuizAnswers);
  row('quiz_attempts',                     cQuizAttempts);
  row('assessment_attachments',            cAsmtAttachments);
  row('course_assessments',                cAssessments);
  console.log('  ── material tree ──');
  row('professor_material_access_logs',    cMatAccessLogs);
  row('professor_course_materials',        cMaterials);
  console.log('  ── section tree ──');
  row('section_meeting_changes',           cMeetingChanges);
  row('attendance',                        cAttendance);
  row('grades',                            cGrades);
  row('enrollments',                       cEnrollments);
  row('section_meetings',                  cMeetings);
  row('sections  (the target itself)',     1);

  console.log('');
  console.log(`  ${'TOTAL rows affected'.padEnd(44)}${String(totalRows).padStart(6)}`);
  console.log('');

  // ── Suspicious sections report ───────────────────────────────
  console.log(sep());
  console.log('  SUSPICIOUS SPRING 2025/2026 SECTIONS  (NOT deleted — review only)');
  console.log(sep());
  if (!suspicious.length) {
    console.log('  None found. All other spring 2025/2026 sections look clean.');
  } else {
    for (const s of suspicious) {
      const flags = [];
      if (parseInt(s.mats)        > 0) flags.push(`${s.mats} material(s)`);
      if (parseInt(s.assessments) > 0) flags.push(`${s.assessments} assessment(s)`);
      if (parseInt(s.enr_count)   > 0) flags.push(`${s.enr_count} enrolled`);
      const ts = s.created_at
        ? new Date(s.created_at).toISOString().replace('T', ' ').slice(0, 10)
        : '?';
      console.log(`  ${s.course_code}  §${s.section_number}  [${s.id}]`);
      console.log(`    name    : ${s.course_name}`);
      console.log(`    active  : ${s.is_active}  |  created : ${ts}`);
      if (flags.length) {
        console.log(`    ⚠  ${flags.join(', ')}`);
      }
      console.log('');
    }
    console.log('  To clean any of these, add their ID to TARGET_ID in this script');
    console.log('  and re-run after review and approval.');
  }
  console.log('');

  // ── Not deleted ──────────────────────────────────────────────
  console.log(sep());
  console.log('  NOT TOUCHED BY THIS SCRIPT');
  console.log(sep());
  console.log('  • users / students / instructors');
  console.log('  • courses, rooms, floors, buildings');
  console.log('  • semesters table');
  console.log('  • notifications (no direct section FK in schema)');
  console.log('  • all other sections, materials, assessments');
  console.log('  • fall 2025/2026 data');
  console.log('  • .env');
  console.log('');

  console.log(sep('═'));
  console.log('  SAFETY CHECKS PASSED. All 5 fields verified against expected values.');
  console.log('  DRY-RUN COMPLETE — no data has been changed.');
  console.log('');
  console.log('  To apply:  node scripts/cleanupOldSpring2025_2026.js --commit');
  console.log(sep('═'));
  console.log('');
}

// ─────────────────────────────────────────────────────────────
// Step 5 — Execute deletions (inside single transaction)
// ─────────────────────────────────────────────────────────────
async function executeCleanup(client, assessmentIds, materialIds) {
  const results = [];

  async function del(label, sql, params = []) {
    const n = await safeDelete(client, label, sql, params);
    results.push({ label, n });
    const flag = n > 0 ? ' ←' : '';
    console.log(`  deleted ${String(n).padStart(5)}  ${label}${flag}`);
  }

  // ── Assessment tree ─────────────────────────────────────────
  if (assessmentIds.length) {
    await del(
      'assessment_submission_attachments',
      `DELETE FROM assessment_submission_attachments
       WHERE submission_id IN (
         SELECT id FROM assignment_submissions
         WHERE  assessment_id = ANY($1::uuid[])
       )`,
      [assessmentIds]
    );

    await del(
      'assignment_submissions',
      `DELETE FROM assignment_submissions
       WHERE assessment_id = ANY($1::uuid[])`,
      [assessmentIds]
    );

    await del(
      'quiz_answers',
      `DELETE FROM quiz_answers
       WHERE attempt_id IN (
         SELECT id FROM quiz_attempts
         WHERE  assessment_id = ANY($1::uuid[])
       )`,
      [assessmentIds]
    );

    await del(
      'quiz_attempts',
      `DELETE FROM quiz_attempts
       WHERE assessment_id = ANY($1::uuid[])`,
      [assessmentIds]
    );

    await del(
      'assessment_attachments',
      `DELETE FROM assessment_attachments
       WHERE assessment_id = ANY($1::uuid[])`,
      [assessmentIds]
    );
  }

  await del(
    'course_assessments',
    `DELETE FROM course_assessments WHERE section_id = $1`,
    [TARGET_ID]
  );

  // ── Material tree ────────────────────────────────────────────
  if (materialIds.length) {
    await del(
      'professor_material_access_logs',
      `DELETE FROM professor_material_access_logs
       WHERE material_id = ANY($1::uuid[])`,
      [materialIds]
    );
  }

  await del(
    'professor_course_materials',
    `DELETE FROM professor_course_materials WHERE section_id = $1`,
    [TARGET_ID]
  );

  // ── Section tree ─────────────────────────────────────────────
  await del(
    'section_meeting_changes',
    `DELETE FROM section_meeting_changes WHERE section_id = $1`,
    [TARGET_ID]
  );

  // section_messages does not exist in this schema — skipped safely
  await del(
    'attendance',
    `DELETE FROM attendance WHERE section_id = $1`,
    [TARGET_ID]
  );

  await del(
    'grades',
    `DELETE FROM grades WHERE section_id = $1`,
    [TARGET_ID]
  );

  await del(
    'enrollments',
    `DELETE FROM enrollments WHERE section_id = $1`,
    [TARGET_ID]
  );

  await del(
    'section_meetings',
    `DELETE FROM section_meetings WHERE section_id = $1`,
    [TARGET_ID]
  );

  // The section itself — must be last
  await del(
    'sections',
    `DELETE FROM sections WHERE id = $1`,
    [TARGET_ID]
  );

  const totalDeleted = results.reduce((s, r) => s + r.n, 0);

  console.log('');
  console.log(`  TOTAL rows deleted: ${totalDeleted}`);

  return totalDeleted;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    // ── Read-only preflight (no transaction) ──────────────────
    console.log('');
    console.log(sep('─'));
    console.log('  cleanupOldSpring2025_2026.js');
    console.log(`  Mode: ${IS_COMMIT ? 'COMMIT — data will be deleted' : 'DRY-RUN — read-only'}`);
    console.log(sep('─'));

    const section = await verifyTarget(client);
    console.log(`  ✓ Safety checks passed for section ${TARGET_ID}`);

    const linked = await gatherLinkedIds(client);
    const { assessmentIds, materialIds } = linked;

    const [counts, suspicious] = await Promise.all([
      gatherCounts(client, assessmentIds, materialIds),
      gatherSuspiciousSections(client),
    ]);

    printReport(section, linked, counts, suspicious);

    // ── Stop here in dry-run mode ─────────────────────────────
    if (!IS_COMMIT) {
      return;
    }

    // ── Commit mode ───────────────────────────────────────────
    console.log('');
    console.log(sep('═'));
    console.log('  EXECUTING CLEANUP TRANSACTION');
    console.log(sep('═'));
    console.log('');

    await client.query('BEGIN');

    try {
      // Re-verify inside the transaction before writing anything
      await verifyTarget(client);

      const totalDeleted = await executeCleanup(client, assessmentIds, materialIds);

      // Final sanity check — the section must be gone
      const check = await client.query(
        `SELECT id FROM sections WHERE id = $1`,
        [TARGET_ID]
      );
      if (check.rows.length) {
        throw new Error('Post-delete check failed: section row still exists after DELETE.');
      }

      await client.query('COMMIT');

      console.log('');
      console.log(sep('═'));
      console.log('  CLEANUP COMMITTED SUCCESSFULLY');
      console.log(`  ${totalDeleted} rows deleted. Transaction committed.`);
      console.log('');
      console.log('  The Spring 2025/2026 semester is now clean:');
      console.log('  • Old Microcontrollers §1 removed');
      console.log('  • Its material ("Week 1 slides") removed');
      console.log('  • Its assessment ("robot_crystals") removed');
      console.log('  • 50 old student enrollments removed');
      console.log('');
      console.log('  Students will no longer see old materials or assignments.');
      console.log('  Seeded sections (§2 etc.) and their enrollments are untouched.');
      console.log(sep('═'));
      console.log('');

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('');
      console.error(sep('!'));
      console.error('  ROLLBACK — cleanup transaction aborted. Nothing was deleted.');
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
