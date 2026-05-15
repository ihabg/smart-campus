const { query, withTransaction } = require('../config/db');

// ─── Get floor with full room coordinate data ─────────────────

async function getFloorForEditing(req, res, next) {
  try {
    const { floor_id } = req.params;

    const floorResult = await query(
      `
      SELECT
        f.*,
        b.code AS building_code,
        b.name AS building_name
      FROM floors f
      JOIN buildings b ON b.id = f.building_id
      WHERE f.id = $1
      `,
      [floor_id]
    );

    if (!floorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found.'
      });
    }

    const roomsResult = await query(
      `
      SELECT
        id,
        room_number,
        name,
        type,
        department,
        capacity,
        description,
        coord_x,
        coord_y,
        coord_width,
        coord_height,
        polygon_points,
        is_accessible,
        is_active,
        features,
        metadata
      FROM rooms
      WHERE floor_id = $1
        AND is_active = TRUE
      ORDER BY room_number
      `,
      [floor_id]
    );

    const adjacencyResult = await query(
      `
      SELECT
        ra.id,
        ra.room_a_id,
        ra.room_b_id,
        ra.weight,
        ra.is_active
      FROM room_adjacency ra
      JOIN rooms a ON a.id = ra.room_a_id
      JOIN rooms b ON b.id = ra.room_b_id
      WHERE ra.is_active = TRUE
        AND a.floor_id = $1
        AND b.floor_id = $1
      ORDER BY ra.created_at
      `,
      [floor_id]
    );

    res.json({
      success: true,
      data: {
        floor: floorResult.rows[0],
        rooms: roomsResult.rows,
        adjacency: adjacencyResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
}

// ─── Save entire floor layout rooms + adjacency ──────────────

async function saveFloorLayout(req, res, next) {
  try {
    const { floor_id } = req.params;
    const { rooms, adjacency } = req.body;

    if (!Array.isArray(rooms)) {
      return res.status(400).json({
        success: false,
        message: 'rooms array required.'
      });
    }

    await withTransaction(async (client) => {
      for (const room of rooms) {
        const polygonPoints =
          room.polygon_points && typeof room.polygon_points === 'object'
            ? JSON.stringify(room.polygon_points)
            : room.polygon_points || null;

        if (room.id) {
          await client.query(
            `
            UPDATE rooms
            SET
              room_number = COALESCE($1, room_number),
              name = COALESCE($2, name),
              type = COALESCE($3::room_type, type),
              department = $4,
              capacity = $5,
              description = $6,
              coord_x = $7,
              coord_y = $8,
              coord_width = $9,
              coord_height = $10,
              polygon_points = $11,
              is_accessible = $12,
              is_active = COALESCE($13, is_active),
              updated_at = NOW()
            WHERE id = $14
              AND floor_id = $15
            `,
            [
              room.room_number || null,
              room.name || null,
              room.type || null,
              room.department || null,
              room.capacity ? Number(room.capacity) : null,
              room.description || null,
              room.coord_x ?? null,
              room.coord_y ?? null,
              room.coord_width ?? null,
              room.coord_height ?? null,
              polygonPoints,
              room.is_accessible !== false,
              room.is_active,
              room.id,
              floor_id
            ]
          );
        } else {
          await client.query(
            `
            INSERT INTO rooms (
              floor_id,
              room_number,
              name,
              type,
              department,
              capacity,
              description,
              coord_x,
              coord_y,
              coord_width,
              coord_height,
              polygon_points,
              is_accessible,
              is_active
            )
            VALUES (
              $1,
              $2,
              $3,
              $4::room_type,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13,
              TRUE
            )
            ON CONFLICT (floor_id, room_number)
            DO UPDATE SET
              name = EXCLUDED.name,
              type = EXCLUDED.type,
              department = EXCLUDED.department,
              capacity = EXCLUDED.capacity,
              description = EXCLUDED.description,
              coord_x = EXCLUDED.coord_x,
              coord_y = EXCLUDED.coord_y,
              coord_width = EXCLUDED.coord_width,
              coord_height = EXCLUDED.coord_height,
              polygon_points = EXCLUDED.polygon_points,
              is_accessible = EXCLUDED.is_accessible,
              is_active = TRUE,
              updated_at = NOW()
            `,
            [
              floor_id,
              room.room_number,
              room.name,
              room.type || 'classroom',
              room.department || null,
              room.capacity ? Number(room.capacity) : null,
              room.description || null,
              room.coord_x ?? null,
              room.coord_y ?? null,
              room.coord_width ?? null,
              room.coord_height ?? null,
              polygonPoints,
              room.is_accessible !== false
            ]
          );
        }
      }

      if (Array.isArray(adjacency)) {
        await client.query(
          `
          DELETE FROM room_adjacency
          WHERE room_a_id IN (
            SELECT id FROM rooms WHERE floor_id = $1
          )
          OR room_b_id IN (
            SELECT id FROM rooms WHERE floor_id = $1
          )
          `,
          [floor_id]
        );

        for (const edge of adjacency) {
          if (!edge.room_a_id || !edge.room_b_id) continue;
          if (edge.room_a_id === edge.room_b_id) continue;

          await client.query(
            `
            INSERT INTO room_adjacency (
              room_a_id,
              room_b_id,
              weight,
              is_active
            )
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (
              LEAST(room_a_id, room_b_id),
              GREATEST(room_a_id, room_b_id)
            )
            DO UPDATE SET
              weight = EXCLUDED.weight,
              is_active = TRUE,
              updated_at = NOW()
            `,
            [
              edge.room_a_id,
              edge.room_b_id,
              Number(edge.weight) || 1.0
            ]
          );
        }
      }
    });

    res.json({
      success: true,
      message: `Floor layout saved. ${rooms.length} room(s) updated.`
    });
  } catch (error) {
    next(error);
  }
}

// ─── Quick save single room position ─────────────────────────

async function saveRoomPosition(req, res, next) {
  try {
    const { room_id } = req.params;
    const {
      coord_x,
      coord_y,
      coord_width,
      coord_height,
      polygon_points
    } = req.body;

    const polygonPoints =
      polygon_points && typeof polygon_points === 'object'
        ? JSON.stringify(polygon_points)
        : polygon_points || null;

    const result = await query(
      `
      UPDATE rooms
      SET
        coord_x = $1,
        coord_y = $2,
        coord_width = $3,
        coord_height = $4,
        polygon_points = $5,
        updated_at = NOW()
      WHERE id = $6
      RETURNING
        id,
        room_number,
        coord_x,
        coord_y,
        coord_width,
        coord_height,
        polygon_points
      `,
      [
        coord_x,
        coord_y,
        coord_width,
        coord_height,
        polygonPoints,
        room_id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Room not found.'
      });
    }

    res.json({
      success: true,
      data: {
        room: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getFloorForEditing,
  saveFloorLayout,
  saveRoomPosition
};