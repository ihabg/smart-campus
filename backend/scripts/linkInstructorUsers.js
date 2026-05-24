/**
 * linkInstructorUsers.js
 * Smart Campus — Link Instructor Login Accounts
 *
 * For every instructor where user_id IS NULL:
 *   - If a users row already exists with the same email → link it
 *   - Otherwise → create a new users row (role=professor, status=active)
 *     and link it
 *
 * Default password for new accounts = doctor_number (bcrypt cost 12).
 * Instructors with no email are skipped.
 * Instructors with no doctor_number and no existing user are skipped.
 * Safe to run more than once — only processes unlinked instructors.
 *
 * Usage:
 *   cd backend
 *   node scripts/linkInstructorUsers.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

async function run() {
  console.log('');
  console.log('Smart Campus — Link Instructor User Accounts');
  console.log('==============================================');

  const client = await pool.connect();

  let created           = 0;
  let linked            = 0;
  let skippedNoEmail    = 0;
  let skippedNoPassword = 0;
  let failed            = 0;

  try {
    const { rows: instructors } = await client.query(
      `SELECT id, first_name, last_name, email, department, doctor_number
       FROM   instructors
       WHERE  user_id IS NULL
       ORDER  BY last_name, first_name`
    );

    if (instructors.length === 0) {
      console.log('\nAll instructors are already linked. Nothing to do.\n');
      return;
    }

    console.log(`\nFound ${instructors.length} unlinked instructor(s).\n`);

    for (const inst of instructors) {
      const label = `${inst.first_name} ${inst.last_name}`;

      if (!inst.email) {
        skippedNoEmail++;
        console.log(`  SKIP  (no email)        : ${label}`);
        continue;
      }

      try {
        await client.query('BEGIN');

        // ── Check for an existing user with this email ──────
        const existing = await client.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
          [inst.email]
        );

        let userId;

        if (existing.rows.length > 0) {
          // Link to the existing user — do not create a duplicate
          userId = existing.rows[0].id;
          await client.query(
            `UPDATE instructors SET user_id = $1, updated_at = NOW() WHERE id = $2`,
            [userId, inst.id]
          );
          linked++;
          console.log(`  LINK  (existing user)   : ${label} <${inst.email}>`);

        } else {
          // Need to create a new user row
          if (!inst.doctor_number) {
            await client.query('ROLLBACK');
            skippedNoPassword++;
            console.log(`  SKIP  (no doctor_number): ${label} <${inst.email}>`);
            continue;
          }

          const passwordHash = await bcrypt.hash(inst.doctor_number, 12);
          userId = uuidv4();

          await client.query(
            `INSERT INTO users
               (id, first_name, last_name, email, password_hash,
                department, role, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'professor', 'active')`,
            [
              userId,
              inst.first_name,
              inst.last_name,
              inst.email,
              passwordHash,
              inst.department || null,
            ]
          );

          await client.query(
            `UPDATE instructors SET user_id = $1, updated_at = NOW() WHERE id = $2`,
            [userId, inst.id]
          );

          created++;
          console.log(`  CREATE                  : ${label} <${inst.email}> [password = doctor_number]`);
        }

        await client.query('COMMIT');

      } catch (err) {
        await client.query('ROLLBACK');
        failed++;
        console.error(`  FAIL                    : ${label} — ${err.message}`);
      }
    }

    console.log('');
    console.log('==============================================');
    console.log('Summary');
    console.log('==============================================');
    console.log(`  Created new accounts      : ${created}`);
    console.log(`  Linked to existing users  : ${linked}`);
    console.log(`  Skipped (no email)        : ${skippedNoEmail}`);
    console.log(`  Skipped (no doctor_number): ${skippedNoPassword}`);
    console.log(`  Failed                    : ${failed}`);
    console.log('');

    if (created > 0) {
      console.log('NOTE: Default password for each new account is the');
      console.log('      instructor\'s doctor_number. Ask professors to');
      console.log('      change their password on first login.');
      console.log('');
    }

    console.log('Done.');
    console.log('');

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

run();
