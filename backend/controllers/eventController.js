const { query, withTransaction } = require('../config/db');

// ─── Time formatter for notification bodies ────────────────────
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// ─── List events ───────────────────────────────────────────────
async function listEvents(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let sql = `
      SELECT
        eb.id,
        eb.title,
        eb.description,
        eb.event_date,
        eb.start_time::text   AS start_time,
        eb.end_time::text     AS end_time,
        eb.status,
        eb.created_at,
        r.id                  AS room_id,
        r.room_number,
        r.name                AS room_name,
        r.type                AS room_type,
        r.capacity            AS room_capacity,
        u.first_name || ' ' || u.last_name AS created_by_name
      FROM event_bookings eb
      JOIN rooms r ON r.id = eb.room_id
      JOIN users u ON u.id = eb.created_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status) {
      params.push(status);
      sql += ` AND eb.status = $${idx++}`;
    }

    const countSql = `SELECT COUNT(*) FROM (${sql}) t`;
    const total    = parseInt((await query(countSql, params)).rows[0].count);

    sql += ` ORDER BY eb.event_date DESC, eb.start_time DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        events: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Check lecture conflicts ───────────────────────────────────
async function getConflicts(req, res, next) {
  try {
    const { room_id, date, start_time, end_time } = req.query;

    if (!room_id)    return res.status(400).json({ success: false, message: 'room_id is required.' });
    if (!date)       return res.status(400).json({ success: false, message: 'date is required.' });
    if (!start_time) return res.status(400).json({ success: false, message: 'start_time is required.' });
    if (!end_time)   return res.status(400).json({ success: false, message: 'end_time is required.' });
    if (start_time >= end_time)
      return res.status(400).json({ success: false, message: 'start_time must be before end_time.' });

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime()))
      return res.status(400).json({ success: false, message: 'Invalid date format.' });

    const roomCheck = await query('SELECT id FROM rooms WHERE id = $1', [room_id]);
    if (!roomCheck.rows.length)
      return res.status(404).json({ success: false, message: 'Room not found.' });

    const result = await query(
      `
      SELECT
        sm.id                                                      AS section_meeting_id,
        s.id                                                       AS section_id,
        c.code                                                     AS course_code,
        c.name                                                     AS course_name,
        s.section_number,
        sm.day_of_week,
        sm.start_time::text                                        AS start_time,
        sm.end_time::text                                          AS end_time,
        r.id                                                       AS original_room_id,
        r.room_number                                              AS original_room_number,
        r.name                                                     AS original_room_name,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unassigned') AS instructor_name,
        COUNT(e.student_id)::int                                   AS enrolled_count
      FROM section_meetings sm
      JOIN sections s         ON s.id  = sm.section_id
      JOIN courses c          ON c.id  = s.course_id
      LEFT JOIN rooms r       ON r.id  = sm.room_id
      LEFT JOIN instructors inst ON inst.id = s.instructor_id
      LEFT JOIN users u       ON u.id  = inst.user_id
      LEFT JOIN enrollments e ON e.section_id = s.id AND e.status = 'enrolled'
      WHERE sm.room_id    = $1
        AND s.is_active   = TRUE
        AND sm.day_of_week = EXTRACT(DOW FROM $2::date)::int
        AND sm.start_time <  $3::time
        AND sm.end_time   >  $4::time
      GROUP BY
        sm.id, sm.day_of_week, sm.start_time, sm.end_time,
        s.id, s.section_number,
        c.code, c.name,
        r.id, r.room_number, r.name,
        u.first_name, u.last_name
      ORDER BY sm.start_time
      `,
      [room_id, date, end_time, start_time]
    );

    res.json({
      success: true,
      data: {
        conflicts:     result.rows,
        has_conflicts: result.rows.length > 0,
        event_date:    date,
        weekday:       parsedDate.toLocaleDateString('en-US', { weekday: 'long' }),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get available replacement rooms ──────────────────────────
async function getAvailableRooms(req, res, next) {
  try {
    const { date, start_time, end_time, exclude_room_id } = req.query;

    if (!date)       return res.status(400).json({ success: false, message: 'date is required.' });
    if (!start_time) return res.status(400).json({ success: false, message: 'start_time is required.' });
    if (!end_time)   return res.status(400).json({ success: false, message: 'end_time is required.' });
    if (start_time >= end_time)
      return res.status(400).json({ success: false, message: 'start_time must be before end_time.' });

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime()))
      return res.status(400).json({ success: false, message: 'Invalid date format.' });

    const params = [date, end_time, start_time];
    let excludeClause = '';
    if (exclude_room_id) {
      params.push(exclude_room_id);
      excludeClause = `AND r.id != $${params.length}`;
    }

    const result = await query(
      `
      SELECT
        r.id,
        r.room_number,
        r.name,
        r.type,
        r.capacity,
        r.department,
        f.floor_label,
        b.code AS building_code
      FROM rooms r
      JOIN floors    f ON f.id = r.floor_id
      JOIN buildings b ON b.id = f.building_id
      WHERE r.is_active = TRUE
        ${excludeClause}
        AND NOT EXISTS (
          SELECT 1
          FROM section_meetings sm
          JOIN sections s ON s.id = sm.section_id
          WHERE sm.room_id     = r.id
            AND s.is_active    = TRUE
            AND sm.day_of_week = EXTRACT(DOW FROM $1::date)::int
            AND sm.start_time  < $2::time
            AND sm.end_time    > $3::time
        )
        AND NOT EXISTS (
          SELECT 1
          FROM event_bookings eb
          WHERE eb.room_id    = r.id
            AND eb.status     = 'active'
            AND eb.event_date = $1::date
            AND eb.start_time < $2::time
            AND eb.end_time   > $3::time
        )
      ORDER BY r.room_number
      `,
      params
    );

    res.json({
      success: true,
      data: { rooms: result.rows },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Create event booking (confirm) ───────────────────────────
async function createEvent(req, res, next) {
  try {
    const {
      title,
      description,
      room_id,
      event_date,
      start_time,
      end_time,
      relocations = [],
    } = req.body;

    // ── Basic validation ──────────────────────────────────────
    if (!title || !String(title).trim())
      return res.status(400).json({ success: false, message: 'title is required.' });
    if (!room_id)
      return res.status(400).json({ success: false, message: 'room_id is required.' });
    if (!event_date)
      return res.status(400).json({ success: false, message: 'event_date is required.' });
    if (!start_time)
      return res.status(400).json({ success: false, message: 'start_time is required.' });
    if (!end_time)
      return res.status(400).json({ success: false, message: 'end_time is required.' });
    if (start_time >= end_time)
      return res.status(400).json({ success: false, message: 'start_time must be before end_time.' });

    const parsedDate = new Date(event_date);
    if (isNaN(parsedDate.getTime()))
      return res.status(400).json({ success: false, message: 'Invalid event_date.' });

    // ── Verify room exists ────────────────────────────────────
    const roomCheck = await query('SELECT id FROM rooms WHERE id = $1', [room_id]);
    if (!roomCheck.rows.length)
      return res.status(404).json({ success: false, message: 'Room not found.' });

    // ── Check for duplicate event booking ────────────────────
    const dupCheck = await query(
      `SELECT id FROM event_bookings
       WHERE room_id    = $1
         AND event_date = $2::date
         AND status     = 'active'
         AND start_time < $3::time
         AND end_time   > $4::time`,
      [room_id, event_date, end_time, start_time]
    );
    if (dupCheck.rows.length) {
      return res.status(409).json({
        success: false,
        message: 'This room is already booked for an overlapping event at that date and time.',
      });
    }

    // ── Re-calculate conflicts server-side ────────────────────
    const conflictsResult = await query(
      `
      SELECT
        sm.id                                                       AS section_meeting_id,
        s.id                                                        AS section_id,
        sm.room_id                                                  AS original_room_id,
        sm.day_of_week,
        sm.start_time::text                                         AS start_time,
        sm.end_time::text                                           AS end_time,
        c.code                                                      AS course_code,
        c.name                                                      AS course_name,
        s.section_number,
        r.room_number                                               AS original_room_number,
        r.name                                                      AS original_room_name
      FROM section_meetings sm
      JOIN sections s       ON s.id  = sm.section_id
      JOIN courses c        ON c.id  = s.course_id
      LEFT JOIN rooms r     ON r.id  = sm.room_id
      WHERE sm.room_id    = $1
        AND s.is_active   = TRUE
        AND sm.day_of_week = EXTRACT(DOW FROM $2::date)::int
        AND sm.start_time <  $3::time
        AND sm.end_time   >  $4::time
      `,
      [room_id, event_date, end_time, start_time]
    );
    const conflicts = conflictsResult.rows;

    // ── If conflicts exist, validate relocations ──────────────
    if (conflicts.length > 0) {
      if (!Array.isArray(relocations) || relocations.length === 0) {
        return res.status(400).json({
          success: false,
          message: `This event has ${conflicts.length} lecture conflict${conflicts.length !== 1 ? 's' : ''}. A replacement room is required for each.`,
        });
      }

      const relocationMap = Object.fromEntries(
        relocations.map(r => [r.section_meeting_id, r])
      );

      for (const conflict of conflicts) {
        const rel = relocationMap[conflict.section_meeting_id];
        if (!rel || !rel.replacement_room_id) {
          return res.status(400).json({
            success: false,
            message: `Missing replacement room for ${conflict.course_code} Section ${conflict.section_number}.`,
          });
        }
        if (rel.replacement_room_id === room_id) {
          return res.status(400).json({
            success: false,
            message: `Replacement room for ${conflict.course_code} cannot be the same as the event room.`,
          });
        }
      }

      // Validate each unique replacement room is available
      const uniqueReplacementIds = [...new Set(relocations.map(r => r.replacement_room_id))];

      for (const repId of uniqueReplacementIds) {
        const repExists = await query(
          'SELECT id FROM rooms WHERE id = $1 AND is_active = TRUE', [repId]
        );
        if (!repExists.rows.length) {
          return res.status(400).json({
            success: false,
            message: `Replacement room not found or inactive.`,
          });
        }

        const repLecConflict = await query(
          `SELECT 1 FROM section_meetings sm
           JOIN sections s ON s.id = sm.section_id
           WHERE sm.room_id    = $1
             AND s.is_active   = TRUE
             AND sm.day_of_week = EXTRACT(DOW FROM $2::date)::int
             AND sm.start_time <  $3::time
             AND sm.end_time   >  $4::time
           LIMIT 1`,
          [repId, event_date, end_time, start_time]
        );
        if (repLecConflict.rows.length) {
          return res.status(409).json({
            success: false,
            message: 'A selected replacement room has a lecture scheduled at that time.',
          });
        }

        const repEvtConflict = await query(
          `SELECT 1 FROM event_bookings
           WHERE room_id    = $1
             AND status     = 'active'
             AND event_date = $2::date
             AND start_time < $3::time
             AND end_time   > $4::time
           LIMIT 1`,
          [repId, event_date, end_time, start_time]
        );
        if (repEvtConflict.rows.length) {
          return res.status(409).json({
            success: false,
            message: 'A selected replacement room already has an event booking at that time.',
          });
        }
      }
    }

    // ── Transaction: event + relocations + notifications ──────
    const cleanTitle = String(title).trim();
    const adminId    = req.user.id;

    const dateLabel = parsedDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const txResult = await withTransaction(async (client) => {
      // 1. Insert event booking
      const eventRes = await client.query(
        `INSERT INTO event_bookings
           (title, description, room_id, event_date, start_time, end_time, created_by, status)
         VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, 'active')
         RETURNING *`,
        [
          cleanTitle,
          description ? String(description).trim() || null : null,
          room_id,
          event_date,
          start_time,
          end_time,
          adminId,
        ]
      );
      const eventId = eventRes.rows[0].id;

      let relocationsCreated = 0;
      let notificationsSent  = 0;

      if (conflicts.length > 0) {
        const relocationMap = Object.fromEntries(
          relocations.map(r => [r.section_meeting_id, r])
        );

        for (const conflict of conflicts) {
          const rel     = relocationMap[conflict.section_meeting_id];
          const repId   = rel.replacement_room_id;

          // 2. Insert section_meeting_changes (single-day room relocation)
          await client.query(
            `INSERT INTO section_meeting_changes (
               section_id, section_meeting_id,
               change_scope, change_date,
               old_day_of_week, old_start_time, old_end_time,
               old_room_id, new_room_id,
               reason, created_by, is_active, event_booking_id
             ) VALUES ($1,$2,'single_day',$3::date,$4,$5::time,$6::time,$7,$8,$9,$10,TRUE,$11)`,
            [
              conflict.section_id,
              conflict.section_meeting_id,
              event_date,
              conflict.day_of_week,
              conflict.start_time,
              conflict.end_time,
              conflict.original_room_id,
              repId,
              `Event: ${cleanTitle}`,
              adminId,
              eventId,
            ]
          );
          relocationsCreated++;

          // Fetch replacement room label for notification bodies
          const repRoomRes = await client.query(
            'SELECT room_number, name FROM rooms WHERE id = $1', [repId]
          );
          const repRoom = repRoomRes.rows[0];
          const repLabel = repRoom
            ? (repRoom.name ? `${repRoom.room_number} — ${repRoom.name}` : repRoom.room_number)
            : 'TBD';
          const oldLabel = conflict.original_room_name
            ? `${conflict.original_room_number} — ${conflict.original_room_name}`
            : (conflict.original_room_number || 'TBD');

          const courseStr = (conflict.course_name && conflict.course_name !== conflict.course_code)
            ? `${conflict.course_code} ${conflict.course_name}`
            : conflict.course_code;
          const timeStr = `${fmtTime(conflict.start_time)} to ${fmtTime(conflict.end_time)}`;

          // 3. Notify enrolled students
          const studentBody =
            `Your class ${courseStr} on ${dateLabel} from ${timeStr} ` +
            `has been moved from Room ${oldLabel} to Room ${repLabel} ` +
            `due to event: ${cleanTitle}.`;

          const sNotifRes = await client.query(
            `INSERT INTO notifications
               (title, body, type, sender_id, target_role, related_room_id,
                data, is_published, published_at)
             VALUES ($1,$2,'room_change'::notification_type,$3,'student',$4,'{}'::jsonb,TRUE,NOW())
             RETURNING id`,
            ['Classroom changed', studentBody, adminId, repId]
          );
          await client.query(
            `INSERT INTO notification_receipts (notification_id, user_id)
             SELECT $1, e.student_id
             FROM enrollments e
             WHERE e.section_id = $2 AND e.status = 'enrolled'
             ON CONFLICT (notification_id, user_id) DO NOTHING`,
            [sNotifRes.rows[0].id, conflict.section_id]
          );
          notificationsSent++;

          // 4. Notify professor (if instructor has a linked user account)
          const profRes = await client.query(
            `SELECT i.user_id
             FROM sections s
             JOIN instructors i ON i.id = s.instructor_id
             WHERE s.id = $1 AND i.user_id IS NOT NULL
             LIMIT 1`,
            [conflict.section_id]
          );

          if (profRes.rows.length && profRes.rows[0].user_id) {
            const profBody =
              `Your lecture ${courseStr} on ${dateLabel} from ${timeStr} ` +
              `has been moved from Room ${oldLabel} to Room ${repLabel} ` +
              `due to event: ${cleanTitle}.`;

            const pNotifRes = await client.query(
              `INSERT INTO notifications
                 (title, body, type, sender_id, related_room_id,
                  data, is_published, published_at)
               VALUES ($1,$2,'room_change'::notification_type,$3,$4,'{}'::jsonb,TRUE,NOW())
               RETURNING id`,
              ['Lecture room changed due to event', profBody, adminId, repId]
            );
            await client.query(
              `INSERT INTO notification_receipts (notification_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT (notification_id, user_id) DO NOTHING`,
              [pNotifRes.rows[0].id, profRes.rows[0].user_id]
            );
            notificationsSent++;
          }
        }
      }

      return {
        event:               eventRes.rows[0],
        relocations_created: relocationsCreated,
        notifications_sent:  notificationsSent,
      };
    });

    res.status(201).json({ success: true, data: txResult });
  } catch (error) {
    next(error);
  }
}

// ─── Cancel event booking ──────────────────────────────────────
async function cancelEvent(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // ── Fetch event ───────────────────────────────────────────
    const eventRes = await query(
      `SELECT eb.*,
              r.room_number, r.name AS room_name
       FROM event_bookings eb
       JOIN rooms r ON r.id = eb.room_id
       WHERE eb.id = $1`,
      [id]
    );
    if (!eventRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const event = eventRes.rows[0];

    if (event.status === 'cancelled') {
      return res.json({
        success: true,
        message: 'Event is already cancelled.',
        data: { event, relocations_cancelled: 0, notifications_sent: 0 },
      });
    }

    // ── Fetch active relocations linked to this event ─────────
    const relocRes = await query(
      `SELECT
         smc.id,
         smc.section_id,
         smc.section_meeting_id,
         smc.old_room_id,
         smc.old_start_time::text AS start_time,
         smc.old_end_time::text   AS end_time,
         c.code                   AS course_code,
         c.name                   AS course_name,
         s.section_number,
         r.room_number AS old_room_number,
         r.name        AS old_room_name
       FROM section_meeting_changes smc
       JOIN sections s       ON s.id  = smc.section_id
       JOIN courses c        ON c.id  = s.course_id
       LEFT JOIN rooms r     ON r.id  = smc.old_room_id
       WHERE smc.event_booking_id = $1
         AND smc.is_active = TRUE`,
      [id]
    );
    const relocations = relocRes.rows;

    const dateLabel = new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── Transaction ───────────────────────────────────────────
    const txResult = await withTransaction(async (client) => {
      // 1. Mark event cancelled
      const updatedEvent = await client.query(
        `UPDATE event_bookings
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      // 2. Deactivate all relocation rows for this event
      await client.query(
        `UPDATE section_meeting_changes
         SET is_active = FALSE
         WHERE event_booking_id = $1 AND is_active = TRUE`,
        [id]
      );

      let notificationsSent = 0;

      // 3. Notify students + professor for each deactivated relocation
      for (const rel of relocations) {
        const oldRoomLabel = rel.old_room_name
          ? `${rel.old_room_number} — ${rel.old_room_name}`
          : (rel.old_room_number || 'the original room');

        const courseStr = (rel.course_name && rel.course_name !== rel.course_code)
          ? `${rel.course_code} ${rel.course_name}`
          : rel.course_code;
        const timeStr = `${fmtTime(rel.start_time)} to ${fmtTime(rel.end_time)}`;

        // Student notification
        const studentBody =
          `Your class ${courseStr} on ${dateLabel} from ${timeStr} ` +
          `has returned to Room ${oldRoomLabel} because event "${event.title}" was cancelled.`;

        const sNotifRes = await client.query(
          `INSERT INTO notifications
             (title, body, type, sender_id, target_role, related_room_id,
              data, is_published, published_at)
           VALUES ($1,$2,'room_change'::notification_type,$3,'student',$4,'{}'::jsonb,TRUE,NOW())
           RETURNING id`,
          ['Classroom change cancelled', studentBody, adminId, rel.old_room_id]
        );
        await client.query(
          `INSERT INTO notification_receipts (notification_id, user_id)
           SELECT $1, e.student_id
           FROM enrollments e
           WHERE e.section_id = $2 AND e.status = 'enrolled'
           ON CONFLICT (notification_id, user_id) DO NOTHING`,
          [sNotifRes.rows[0].id, rel.section_id]
        );
        notificationsSent++;

        // Professor notification
        const profRes = await client.query(
          `SELECT i.user_id
           FROM sections s
           JOIN instructors i ON i.id = s.instructor_id
           WHERE s.id = $1 AND i.user_id IS NOT NULL
           LIMIT 1`,
          [rel.section_id]
        );

        if (profRes.rows.length && profRes.rows[0].user_id) {
          const profBody =
            `Your lecture ${courseStr} on ${dateLabel} from ${timeStr} ` +
            `has returned to Room ${oldRoomLabel} because event "${event.title}" was cancelled.`;

          const pNotifRes = await client.query(
            `INSERT INTO notifications
               (title, body, type, sender_id, related_room_id,
                data, is_published, published_at)
             VALUES ($1,$2,'room_change'::notification_type,$3,$4,'{}'::jsonb,TRUE,NOW())
             RETURNING id`,
            ['Lecture room change cancelled', profBody, adminId, rel.old_room_id]
          );
          await client.query(
            `INSERT INTO notification_receipts (notification_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT (notification_id, user_id) DO NOTHING`,
            [pNotifRes.rows[0].id, profRes.rows[0].user_id]
          );
          notificationsSent++;
        }
      }

      return {
        event:                updatedEvent.rows[0],
        relocations_cancelled: relocations.length,
        notifications_sent:    notificationsSent,
      };
    });

    res.json({ success: true, data: txResult });
  } catch (error) {
    next(error);
  }
}

module.exports = { listEvents, getConflicts, getAvailableRooms, createEvent, cancelEvent };
