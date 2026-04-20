const { query, withTransaction } = require('../config/db');

// ─── Get floor with full room coordinate data ─────────────────

async function getFloorForEditing(req, res, next) {
  try {
    const { floor_id } = req.params;

    const floorResult = await query(
      `SELECT f.*, b.code AS building_code, b.name AS building_name
       FROM floors f JOIN buildings b ON b.id = f.building_id
       WHERE f.id = $1`,
      [floor_id]
    );

    if (!floorResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }

    const roomsResult = await query(
      `SELECT id, room_number, name, type, department, capacity,
              coord_x, coord_y, coord_width, coord_height, polygon_points,
              is_accessible, is_active, features
       FROM rooms
       WHERE floor_id = $1
       ORDER BY room_number`,
      [floor_id]
    );

    const adjacencyResult = await query(
      `SELECT ra.room_a_id, ra.room_b_id, ra.weight, ra.is_active
       FROM room_adjacency ra
       JOIN rooms r ON r.id = ra.room_a_id
       WHERE r.floor_id = $1 AND ra.is_active = TRUE`,
      [floor_id]
    );

    res.json({
      success: true,
      data: {
        floor:     floorResult.rows[0],
        rooms:     roomsResult.rows,
        adjacency: adjacencyResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Save entire floor layout (rooms + adjacency) ─────────────

async function saveFloorLayout(req, res, next) {
  try {
    const { floor_id } = req.params;
    const { rooms, adjacency } = req.body;

    if (!Array.isArray(rooms)) {
      return res.status(400).json({ success: false, message: 'rooms array required.' });
    }

    await withTransaction(async client => {
      // Update each room's coordinates
      for (const room of rooms) {
        if (room.id) {
          // Update existing room
          await client.query(
            `UPDATE rooms SET
               coord_x=$1, coord_y=$2, coord_width=$3, coord_height=$4,
               polygon_points=$5, name=$6, type=$7, department=$8,
               capacity=$9, is_accessible=$10
             WHERE id=$11 AND floor_id=$12`,
            [
              room.coord_x, room.coord_y, room.coord_width, room.coord_height,
              room.polygon_points ? JSON.stringify(room.polygon_points) : null,
              room.name, room.type, room.department || null,
              room.capacity || null, room.is_accessible !== false,
              room.id, floor_id,
            ]
          );
        } else {
          // Insert new room from editor
          await client.query(
            `INSERT INTO rooms
               (floor_id, room_number, name, type, department, capacity,
                coord_x, coord_y, coord_width, coord_height, polygon_points, is_accessible)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (floor_id, room_number) DO UPDATE SET
               name=$3, type=$4, department=$5, capacity=$6,
               coord_x=$7, coord_y=$8, coord_width=$9, coord_height=$10,
               polygon_points=$11, is_accessible=$12`,
            [
              floor_id, room.room_number, room.name, room.type,
              room.department || null, room.capacity || null,
              room.coord_x, room.coord_y, room.coord_width, room.coord_height,
              room.polygon_points ? JSON.stringify(room.polygon_points) : null,
              room.is_accessible !== false,
            ]
          );
        }
      }

      // Replace adjacency for this floor
      if (Array.isArray(adjacency)) {
        // Remove old adjacency for this floor's rooms
        await client.query(
          `DELETE FROM room_adjacency
           WHERE room_a_id IN (SELECT id FROM rooms WHERE floor_id=$1)`,
          [floor_id]
        );
        // Insert new adjacency
        for (const edge of adjacency) {
          // Both directions
          await client.query(
            `INSERT INTO room_adjacency (room_a_id, room_b_id, weight)
             VALUES ($1,$2,$3), ($2,$1,$3)
             ON CONFLICT DO NOTHING`,
            [edge.room_a_id, edge.room_b_id, edge.weight || 1.0]
          );
        }
      }
    });

    res.json({ success: true, message: `Floor layout saved. ${rooms.length} room(s) updated.` });
  } catch (error) {
    next(error);
  }
}

// ─── Quick save single room position (drag-and-drop) ─────────

async function saveRoomPosition(req, res, next) {
  try {
    const { room_id } = req.params;
    const { coord_x, coord_y, coord_width, coord_height, polygon_points } = req.body;

    const result = await query(
      `UPDATE rooms
       SET coord_x=$1, coord_y=$2, coord_width=$3, coord_height=$4, polygon_points=$5
       WHERE id=$6
       RETURNING id, room_number, coord_x, coord_y, coord_width, coord_height`,
      [coord_x, coord_y, coord_width, coord_height,
       polygon_points ? JSON.stringify(polygon_points) : null,
       room_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    res.json({ success: true, data: { room: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

module.exports = { getFloorForEditing, saveFloorLayout, saveRoomPosition };
