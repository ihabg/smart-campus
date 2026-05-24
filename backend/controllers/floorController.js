const path = require('path');
const { query, withTransaction } = require('../config/db');
const { deleteFile }             = require('../config/multer');
const { AppError }               = require('../middleware/errorHandler');

// ─── Get all floors (grouped by building) ───────────────────

async function getAllFloors(req, res, next) {
  try {
    const { building_id, active_only = 'true' } = req.query;

    let sql = `
      SELECT f.*, b.code AS building_code, b.name AS building_name
      FROM floors f
      JOIN buildings b ON b.id = f.building_id
      WHERE 1=1
    `;
    const params = [];

    if (building_id) {
      params.push(building_id);
      sql += ` AND f.building_id = $${params.length}`;
    }
    if (active_only === 'true') {
      sql += ' AND f.is_active = TRUE';
    }
    sql += ' ORDER BY b.code, f.display_order, f.floor_number';

    const result = await query(sql, params);
    res.json({ success: true, data: { floors: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Get single floor with rooms ────────────────────────────

async function getFloorById(req, res, next) {
  try {
    const { id } = req.params;

    const floorResult = await query(
      `SELECT f.*, b.code AS building_code, b.name AS building_name
       FROM floors f JOIN buildings b ON b.id = f.building_id
       WHERE f.id = $1`,
      [id]
    );

    if (!floorResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }

    const roomsResult = await query(
      `SELECT r.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', ra.room_b_id,
                    'weight', ra.weight
                  )
                ) FILTER (WHERE ra.room_b_id IS NOT NULL),
                '[]'
              ) AS adjacent_rooms
       FROM rooms r
       LEFT JOIN room_adjacency ra ON ra.room_a_id = r.id AND ra.is_active = TRUE
       WHERE r.floor_id = $1 AND r.is_active = TRUE
       GROUP BY r.id
       ORDER BY r.room_number`,
      [id]
    );

    res.json({
      success: true,
      data: { floor: floorResult.rows[0], rooms: roomsResult.rows },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Create floor (admin) ────────────────────────────────────

async function createFloor(req, res, next) {
  try {
    const { building_id, floor_number, floor_label, name, display_order } = req.body;

    const result = await query(
      `INSERT INTO floors (building_id, floor_number, floor_label, name, display_order)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [building_id, floor_number, floor_label, name || null, display_order || 0]
    );

    res.status(201).json({ success: true, data: { floor: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Update floor (admin) ────────────────────────────────────

async function updateFloor(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      'floor_number',
      'floor_label',
      'name',
      'map_image_url',
      'map_width',
      'map_height',
      'svg_data',
      'display_order',
      'is_active'
    ];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }

    if (!fields.length) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update.'
      });
    }

    fields.push(`updated_at = NOW()`);

    values.push(id);

    const result = await query(
      `
      UPDATE floors
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
      `,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Floor not found.'
      });
    }

    res.json({
      success: true,
      data: {
        floor: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
}

// ─── Upload floor map image (admin) ─────────────────────────

async function uploadFloorMap(req, res, next) {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    // Get existing map URL to delete old file
    const existing = await query('SELECT map_image_url FROM floors WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }

    // Delete old map file if it exists
    if (existing.rows[0].map_image_url) {
      const oldPath = path.join(__dirname, '..', existing.rows[0].map_image_url.replace('/uploads/', 'uploads/'));
      deleteFile(oldPath);
    }

    const imageUrl = `/uploads/maps/${req.file.filename}`;

    const result = await query(
      'UPDATE floors SET map_image_url = $1 WHERE id = $2 RETURNING *',
      [imageUrl, id]
    );

    res.json({
      success: true,
      message: 'Map uploaded successfully.',
      data: { floor: result.rows[0] },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Delete floor (admin) ────────────────────────────────────

async function deleteFloor(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM floors WHERE id = $1 RETURNING id, map_image_url', [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Floor not found.' });
    }

    // Delete associated map file
    if (result.rows[0].map_image_url) {
      const filePath = path.join(__dirname, '..', result.rows[0].map_image_url.replace('/uploads/', 'uploads/'));
      deleteFile(filePath);
    }

    res.json({ success: true, message: 'Floor deleted.' });
  } catch (error) {
    next(error);
  }
}

// ─── Get all buildings (public — active only) ────────────────

async function getBuildings(req, res, next) {
  try {
    const result = await query(
      `SELECT b.*, COUNT(f.id) AS floor_count
       FROM buildings b
       LEFT JOIN floors f ON f.building_id = b.id AND f.is_active = TRUE
       WHERE b.is_active = TRUE
       GROUP BY b.id
       ORDER BY b.code`,
    );
    res.json({ success: true, data: { buildings: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Get all buildings including inactive (admin only) ───────

async function getBuildingsAdmin(req, res, next) {
  try {
    const result = await query(
      `SELECT b.*, COUNT(f.id) AS floor_count
       FROM buildings b
       LEFT JOIN floors f ON f.building_id = b.id AND f.is_active = TRUE
       GROUP BY b.id
       ORDER BY b.code`,
    );
    res.json({ success: true, data: { buildings: result.rows } });
  } catch (error) {
    next(error);
  }
}

// ─── Create building (admin) ─────────────────────────────────

async function createBuilding(req, res, next) {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'code and name are required.' });
    }

    const existing = await query('SELECT id FROM buildings WHERE LOWER(code) = LOWER($1)', [code]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: `A building with code "${code}" already exists.` });
    }

    const result = await query(
      `INSERT INTO buildings (code, name, description, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [code.trim().toUpperCase(), name.trim(), description?.trim() || null],
    );

    res.status(201).json({ success: true, data: { building: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Update building (admin) ─────────────────────────────────

async function updateBuilding(req, res, next) {
  try {
    const { id } = req.params;
    const { code, name, description, is_active } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (code !== undefined) {
      // Check code uniqueness against other buildings
      const dup = await query(
        'SELECT id FROM buildings WHERE LOWER(code) = LOWER($1) AND id <> $2',
        [code, id],
      );
      if (dup.rows.length) {
        return res.status(409).json({ success: false, message: `A building with code "${code}" already exists.` });
      }
      fields.push(`code = $${idx++}`);
      values.push(code.trim().toUpperCase());
    }

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description?.trim() || null); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(Boolean(is_active)); }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE buildings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Building not found.' });
    }

    res.json({ success: true, data: { building: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Delete building (admin, only if no floors) ──────────────

async function deleteBuilding(req, res, next) {
  try {
    const { id } = req.params;

    const floorCheck = await query(
      'SELECT COUNT(*) AS cnt FROM floors WHERE building_id = $1',
      [id],
    );
    if (Number(floorCheck.rows[0].cnt) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a building that has floors. Archive it instead.',
      });
    }

    const result = await query('DELETE FROM buildings WHERE id = $1 RETURNING id', [id]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Building not found.' });
    }

    res.json({ success: true, message: 'Building deleted.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllFloors, getFloorById, createFloor, updateFloor, uploadFloorMap, deleteFloor,
  getBuildings, getBuildingsAdmin, createBuilding, updateBuilding, deleteBuilding,
};
