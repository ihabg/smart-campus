const { query } = require('../config/db');

async function getRoomTypes(req, res, next) {
  try {
    const result = await query(`
      SELECT
        id,
        value,
        label_en,
        label_ar,
        icon,
        color,
        is_teaching,
        is_accessible,
        is_public,
        is_active,
        sort_order
      FROM   room_types
      WHERE  is_active = true
      ORDER  BY sort_order, value
    `);

    res.json({
      success: true,
      data: { roomTypes: result.rows },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getRoomTypes };
