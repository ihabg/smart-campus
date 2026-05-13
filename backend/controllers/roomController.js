const { query, withTransaction } = require('../config/db');
const { AppError }               = require('../middleware/errorHandler');

// ─── Get rooms by floor ──────────────────────────────────────

async function getRoomsByFloor(req, res, next) {
  try {
    const { floor_id, type, active_only = 'true' } = req.query;

    let sql = `
      SELECT r.*,
             f.floor_label,
             f.floor_number,
             f.map_image_url,
             b.code AS building_code,
             b.name AS building_name
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN buildings b ON b.id = f.building_id
      WHERE 1=1
    `;

    const params = [];

    if (floor_id) {
      params.push(floor_id);
      sql += ` AND r.floor_id = $${params.length}`;
    }

    if (type) {
      params.push(type);
      sql += ` AND r.type = $${params.length}`;
    }

    if (active_only === 'true') {
      sql += ` AND r.is_active = TRUE`;
    }

    sql += ` ORDER BY f.display_order, r.room_number`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: { rooms: result.rows }
    });
  } catch (error) {
    next(error);
  }
}
async function getRoomByNumber(req, res, next) {
  try {
    const { roomNumber } = req.params;

    const result = await query(
      `
      SELECT r.*,
             f.id AS floor_id,
             f.floor_label,
             f.floor_number,
             f.map_image_url,
             b.code AS building_code,
             b.name AS building_name
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN buildings b ON b.id = f.building_id
      WHERE LOWER(r.room_number) = LOWER($1)
      LIMIT 1
      `,
      [roomNumber]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Room not found.'
      });
    }

    res.json({
      success: true,
      data: { room: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
}
// ─── Get room by ID ──────────────────────────────────────────

async function getRoomById(req, res, next) {
  try {
    const { id } = req.params;

    const roomResult = await query(
      `SELECT r.*,
              f.floor_label, f.floor_number, f.map_image_url,
              b.code AS building_code, b.name AS building_name,
              b.id   AS building_id
       FROM rooms r
       JOIN floors f ON f.id = r.floor_id
       JOIN buildings b ON b.id = f.building_id
       WHERE r.id = $1`,
      [id]
    );

    if (!roomResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    // Get today's schedule for this room
    const today = new Date().getDay(); // 0=Sun, 6=Sat
    const now   = new Date().toTimeString().slice(0, 5);

    const schedResult = await query(
      `SELECT s.*,
              c.code AS course_code, c.name AS course_name,
              i.title AS instructor_title, i.first_name AS instructor_first, i.last_name AS instructor_last
       FROM sections s
       JOIN courses c ON c.id = s.course_id
       LEFT JOIN instructors i ON i.id = s.instructor_id
       WHERE s.room_id = $1
         AND s.is_active = TRUE
         AND $2 = ANY(s.day_of_week)
       ORDER BY s.start_time`,
      [id, today]
    );

    // Determine current status
    let currentStatus = 'available';
    for (const sec of schedResult.rows) {
      if (sec.start_time <= now && sec.end_time > now) {
        currentStatus = 'in_session';
        break;
      }
    }

    res.json({
      success: true,
      data: {
        room:     roomResult.rows[0],
        schedule: schedResult.rows,
        status:   currentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Create room (admin) ─────────────────────────────────────

async function createRoom(req, res, next) {
  try {
    const {
      floor_id, room_number, name, type, department,
      capacity, description, coord_x, coord_y,
      coord_width, coord_height, polygon_points,
      features, is_accessible,
    } = req.body;

    const result = await query(
      `INSERT INTO rooms
         (floor_id, room_number, name, type, department, capacity, description,
          coord_x, coord_y, coord_width, coord_height, polygon_points, features, is_accessible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        floor_id, room_number, name, type, department || null,
        capacity || null, description || null,
        coord_x || null, coord_y || null, coord_width || null, coord_height || null,
        polygon_points ? JSON.stringify(polygon_points) : null,
        features       ? JSON.stringify(features)       : null,
        is_accessible !== undefined ? is_accessible : true,
      ]
    );

    res.status(201).json({ success: true, data: { room: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Update room (admin) ─────────────────────────────────────

async function updateRoom(req, res, next) {
  try {
    const { id } = req.params;
    const allowed = [
      'room_number','name','type','department','capacity','description',
      'coord_x','coord_y','coord_width','coord_height','polygon_points',
      'features','is_accessible','is_active',
    ];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key}=$${idx++}`);
        const val = (key === 'polygon_points' || key === 'features') && typeof req.body[key] === 'object'
          ? JSON.stringify(req.body[key])
          : req.body[key];
        values.push(val);
      }
    }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(id);
    const result = await query(
      `UPDATE rooms SET ${fields.join(',')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    res.json({ success: true, data: { room: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Delete room (admin) ─────────────────────────────────────

async function deleteRoom(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM rooms WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }
    res.json({ success: true, message: 'Room deleted.' });
  } catch (error) {
    next(error);
  }
}

// ─── Bulk update room coordinates (map editor) ───────────────

async function bulkUpdateCoordinates(req, res, next) {
  try {
    const { rooms } = req.body; // array of {id, coord_x, coord_y, coord_width, coord_height, polygon_points}

    if (!Array.isArray(rooms) || !rooms.length) {
      return res.status(400).json({ success: false, message: 'rooms array required.' });
    }

    await withTransaction(async client => {
      for (const room of rooms) {
        await client.query(
          `UPDATE rooms SET
             coord_x=$1, coord_y=$2, coord_width=$3, coord_height=$4,
             polygon_points=$5
           WHERE id=$6`,
          [
            room.coord_x, room.coord_y, room.coord_width, room.coord_height,
            room.polygon_points ? JSON.stringify(room.polygon_points) : null,
            room.id,
          ]
        );
      }
    });

    res.json({ success: true, message: `${rooms.length} room(s) updated.` });
  } catch (error) {
    next(error);
  }
}

// ─── Manage adjacency (graph edges) ─────────────────────────

async function setAdjacency(req, res, next) {
  try {
    const {
      room_a_id,
      room_b_id,
      distance_meters = 1.0,
      direction_note = null,
      is_accessible = true,
      is_active = true,
    } = req.body;

    await withTransaction(async client => {
      await client.query(
        `INSERT INTO room_adjacency
           (room_a_id, room_b_id, distance_meters, direction_note, is_accessible, is_active)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (room_a_id, room_b_id) DO UPDATE SET
           distance_meters = EXCLUDED.distance_meters,
           direction_note = EXCLUDED.direction_note,
           is_accessible = EXCLUDED.is_accessible,
           is_active = EXCLUDED.is_active`,
        [room_a_id, room_b_id, distance_meters, direction_note, is_accessible, is_active]
      );

      await client.query(
        `INSERT INTO room_adjacency
           (room_a_id, room_b_id, distance_meters, direction_note, is_accessible, is_active)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (room_a_id, room_b_id) DO UPDATE SET
           distance_meters = EXCLUDED.distance_meters,
           direction_note = EXCLUDED.direction_note,
           is_accessible = EXCLUDED.is_accessible,
           is_active = EXCLUDED.is_active`,
        [room_b_id, room_a_id, distance_meters, direction_note, is_accessible, is_active]
      );
    });

    res.json({ success: true, message: 'Adjacency updated.' });
  } catch (error) {
    next(error);
  }
}
module.exports = {
  getRoomsByFloor,
  getRoomById,
  getRoomByNumber,
  createRoom,
  updateRoom,
  deleteRoom,
  bulkUpdateCoordinates,
  setAdjacency,
};
