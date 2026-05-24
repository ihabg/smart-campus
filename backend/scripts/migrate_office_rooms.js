#!/usr/bin/env node
'use strict';

/**
 * migrate_office_rooms.js
 *
 * Links instructors.office_room_id to the correct room based on:
 *   1. rooms.lecturer_number  ↔  instructors.doctor_number  (primary, reliable)
 *   2. Arabic name parsing from rooms.name                  (secondary, fuzzy)
 *
 * Usage:
 *   node scripts/migrate_office_rooms.js             — DRY RUN (safe, no writes)
 *   node scripts/migrate_office_rooms.js --commit    — writes confirmed matches
 *   node scripts/migrate_office_rooms.js --commit --force  — also overwrites existing assignments
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const isDryRun = !process.argv.includes('--commit');
const isForce  = process.argv.includes('--force');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Arabic normalization ─────────────────────────────────────

function normalizeArabic(str) {
  if (!str) return '';
  return str
    .replace(/[أإآ]/g, 'ا')                // alef variants → bare alef
    .replace(/[ً-ٰٟ]/g, '') // remove tashkeel (harakat) + superscript alef
    .replace(/ة/g, 'ه')                    // ta marbuta → ha (optional — comment out if too aggressive)
    .replace(/\s+/g, ' ')
    .trim();
}

function stripOfficePrefix(name) {
  return name
    .replace(/^مكتب\s*/u, '')
    .replace(/^أ\.د\.\s*/u, '')
    .replace(/^أ\.\s*/u, '')
    .replace(/^د\.\s*/u, '')
    .replace(/^دكتور\s*/u, '')
    .replace(/^دكتورة\s*/u, '')
    .trim();
}

// ─── Main ─────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();
  try {
    // 1. Fetch all active office rooms
    const { rows: officeRooms } = await client.query(
      `SELECT id, room_number, name, lecturer_number
       FROM rooms
       WHERE type = 'office' AND is_active = TRUE
       ORDER BY room_number`
    );

    // 2. Fetch all active instructors
    const { rows: instructors } = await client.query(
      `SELECT id, title, first_name, last_name, email, department,
              doctor_number, office_room_id
       FROM instructors
       WHERE is_active = TRUE`
    );

    // Build lookup maps
    const byDoctorNumber = new Map(); // string → instructor[]
    const byFullName     = new Map(); // normalized → instructor[]
    const byFirstName    = new Map(); // normalized first_name only → instructor[]

    for (const inst of instructors) {
      if (inst.doctor_number !== null && inst.doctor_number !== undefined) {
        const key = String(inst.doctor_number).trim();
        if (!byDoctorNumber.has(key)) byDoctorNumber.set(key, []);
        byDoctorNumber.get(key).push(inst);
      }

      const firstName = normalizeArabic(inst.first_name || '');
      const lastName  = normalizeArabic(inst.last_name  || '');
      const fullName  = [firstName, lastName].filter(Boolean).join(' ');

      if (fullName) {
        if (!byFullName.has(fullName)) byFullName.set(fullName, []);
        byFullName.get(fullName).push(inst);
      }
      if (firstName && firstName !== fullName) {
        if (!byFirstName.has(firstName)) byFirstName.set(firstName, []);
        byFirstName.get(firstName).push(inst);
      }
    }

    // 3. Process each office room
    const stats = {
      willLink:          [], // { room_number, instructor_name, match_type }
      alreadyCorrect:    [], // already has the right office_room_id
      skippedAssigned:   [], // instructor has a different non-null office_room_id (use --force to overwrite)
      ambiguous:         [], // multiple candidate instructors
      unmatched:         [], // no candidate found
    };

    const pendingUpdates = [];

    for (const room of officeRooms) {
      let candidates = [];
      let matchType  = null;

      // ── Primary: lecturer_number ↔ doctor_number ──────────
      if (room.lecturer_number) {
        const key = String(room.lecturer_number).trim();
        candidates = byDoctorNumber.get(key) || [];
        if (candidates.length) matchType = 'doctor_number';
      }

      // ── Secondary: Arabic name parsing ────────────────────
      if (!candidates.length) {
        const stripped  = stripOfficePrefix(room.name || '');
        const normName  = normalizeArabic(stripped);

        if (normName) {
          // Try full name first
          candidates = byFullName.get(normName) || [];
          if (candidates.length) {
            matchType = 'full_name';
          } else {
            // Try first-name-only match
            candidates = byFirstName.get(normName) || [];
            if (candidates.length) matchType = 'first_name';
          }

          // Fallback: check if any stored full name starts with or equals normName
          if (!candidates.length) {
            const found = [];
            for (const [key, insts] of byFullName.entries()) {
              if (key === normName || key.startsWith(normName + ' ') || normName.startsWith(key + ' ')) {
                found.push(...insts);
              }
            }
            // Deduplicate
            const seen = new Set();
            candidates = found.filter(i => !seen.has(i.id) && seen.add(i.id));
            if (candidates.length) matchType = 'partial_name';
          }
        }
      }

      const instName = (inst) =>
        [inst.title, inst.first_name, inst.last_name].filter(Boolean).join(' ');

      // ── Classify ──────────────────────────────────────────
      if (!candidates.length) {
        stats.unmatched.push({
          room_number: room.room_number,
          name: room.name,
          lecturer_number: room.lecturer_number,
        });
        continue;
      }

      if (candidates.length > 1) {
        stats.ambiguous.push({
          room_number: room.room_number,
          name: room.name,
          candidates: candidates.map(instName),
        });
        continue;
      }

      const inst = candidates[0];

      // Already correctly assigned?
      if (inst.office_room_id === room.id) {
        stats.alreadyCorrect.push({ room_number: room.room_number, instructor_name: instName(inst) });
        continue;
      }

      // Has a DIFFERENT assignment and no --force?
      if (inst.office_room_id && !isForce) {
        stats.skippedAssigned.push({
          room_number: room.room_number,
          instructor_name: instName(inst),
          existing_room_id: inst.office_room_id,
        });
        continue;
      }

      // Ready to link
      stats.willLink.push({
        room_number:     room.room_number,
        instructor_name: instName(inst),
        match_type:      matchType,
        was_overwrite:   Boolean(inst.office_room_id),
      });
      pendingUpdates.push({ instructor_id: inst.id, room_id: room.id });
    }

    // ── Print results ─────────────────────────────────────────

    const hr = '═'.repeat(56);
    console.log(`\n${hr}`);
    console.log(`  Office Room → Instructor Migration${isDryRun ? ' [DRY RUN]' : ' [COMMIT]'}${isForce ? ' [FORCE]' : ''}`);
    console.log(`${hr}\n`);

    if (stats.willLink.length) {
      console.log(`✓  WILL LINK (${stats.willLink.length}):`);
      stats.willLink.forEach(m =>
        console.log(`     Room ${m.room_number}  →  ${m.instructor_name}  (via ${m.match_type})${m.was_overwrite ? '  ⚠ overwrites existing' : ''}`)
      );
    }

    if (stats.alreadyCorrect.length) {
      console.log(`\n♻  ALREADY CORRECTLY ASSIGNED (${stats.alreadyCorrect.length}):`);
      stats.alreadyCorrect.forEach(m =>
        console.log(`     Room ${m.room_number}  →  ${m.instructor_name}`)
      );
    }

    if (stats.skippedAssigned.length) {
      console.log(`\n⏭  SKIPPED – instructor already has a different office (${stats.skippedAssigned.length}):`);
      stats.skippedAssigned.forEach(m =>
        console.log(`     Room ${m.room_number}: ${m.instructor_name} already assigned elsewhere`)
      );
      console.log(`     (Add --force to overwrite these)`);
    }

    if (stats.ambiguous.length) {
      console.log(`\n⚠  AMBIGUOUS – manual review required (${stats.ambiguous.length}):`);
      stats.ambiguous.forEach(m => {
        console.log(`     Room ${m.room_number}  "${m.name}":`);
        m.candidates.forEach(c => console.log(`       → ${c}`));
      });
    }

    if (stats.unmatched.length) {
      console.log(`\n✗  UNMATCHED (${stats.unmatched.length}):`);
      stats.unmatched.forEach(m =>
        console.log(`     Room ${m.room_number}  "${m.name}"${m.lecturer_number ? `  [lecturer_number: ${m.lecturer_number}]` : ''}`)
      );
    }

    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  Will link:            ${stats.willLink.length}`);
    console.log(`  Already correct:      ${stats.alreadyCorrect.length}`);
    console.log(`  Skipped (assigned):   ${stats.skippedAssigned.length}`);
    console.log(`  Ambiguous:            ${stats.ambiguous.length}`);
    console.log(`  Unmatched:            ${stats.unmatched.length}`);
    console.log(`  Total office rooms:   ${officeRooms.length}`);

    if (isDryRun) {
      console.log(`\n  ⚡ DRY RUN — no database changes written.`);
      console.log(`     Run with --commit to apply the ${stats.willLink.length} pending link(s).`);
      if (stats.skippedAssigned.length) {
        console.log(`     Run with --commit --force to also overwrite ${stats.skippedAssigned.length} existing assignment(s).`);
      }
      console.log('');
    } else if (pendingUpdates.length === 0) {
      console.log(`\n  Nothing to write.\n`);
    } else {
      console.log(`\n  Writing ${pendingUpdates.length} update(s) to database…`);
      await client.query('BEGIN');
      try {
        for (const u of pendingUpdates) {
          await client.query(
            `UPDATE instructors SET office_room_id = $1, updated_at = NOW() WHERE id = $2`,
            [u.room_id, u.instructor_id]
          );
        }
        await client.query('COMMIT');
        console.log(`  ✓ Done. ${pendingUpdates.length} instructor(s) updated.\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n  ✗ Transaction failed, rolled back: ${err.message}\n`);
        process.exit(1);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
