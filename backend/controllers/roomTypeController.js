const { query } = require('../config/db');

// ─── Public ──────────────────────────────────────────────────────────────────

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
        is_bookable_for_events,
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

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /room-types/admin — all types (active + inactive) */
async function adminList(req, res, next) {
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
        is_bookable_for_events,
        sort_order,
        created_at,
        updated_at
      FROM   room_types
      ORDER  BY sort_order, value
    `);

    res.json({ success: true, data: { roomTypes: result.rows } });
  } catch (error) {
    next(error);
  }
}

/** PATCH /room-types/:id — update metadata (value/key is immutable) */
async function adminUpdate(req, res, next) {
  try {
    const { id } = req.params;
    const {
      label_en,
      label_ar,
      icon,
      color,
      is_teaching,
      is_accessible,
      is_public,
      is_active,
      is_bookable_for_events,
      sort_order,
    } = req.body;

    // value (enum key) is intentionally excluded — it cannot be changed.
    const result = await query(
      `
      UPDATE room_types SET
        label_en              = COALESCE($1,  label_en),
        label_ar              = $2,
        icon                  = $3,
        color                 = $4,
        is_teaching           = COALESCE($5,  is_teaching),
        is_accessible         = COALESCE($6,  is_accessible),
        is_public             = COALESCE($7,  is_public),
        is_active             = COALESCE($8,  is_active),
        is_bookable_for_events = COALESCE($9, is_bookable_for_events),
        sort_order            = COALESCE($10, sort_order),
        updated_at            = NOW()
      WHERE id = $11
      RETURNING *
      `,
      [
        label_en   != null ? String(label_en)   : null,
        label_ar   != null ? String(label_ar)   : null,
        icon       != null ? String(icon)       : null,
        color      != null ? String(color)      : null,
        is_teaching           != null ? Boolean(is_teaching)           : null,
        is_accessible         != null ? Boolean(is_accessible)         : null,
        is_public             != null ? Boolean(is_public)             : null,
        is_active             != null ? Boolean(is_active)             : null,
        is_bookable_for_events != null ? Boolean(is_bookable_for_events) : null,
        sort_order != null ? Number(sort_order) : null,
        id,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Room type not found.' });
    }

    res.json({ success: true, data: { roomType: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

/** PATCH /room-types/:id/toggle — flip is_active */
async function adminToggleActive(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE room_types
       SET    is_active  = NOT is_active,
              updated_at = NOW()
       WHERE  id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Room type not found.' });
    }

    res.json({ success: true, data: { roomType: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /room-types — create a new room type.
 *
 * This does two things:
 *   1. ALTER TYPE room_type ADD VALUE '<value>'  — extends the PostgreSQL enum.
 *   2. INSERT INTO room_types ...               — adds the metadata row.
 *
 * IMPORTANT: ALTER TYPE ADD VALUE cannot be rolled back in PG < 12.
 * In PG 12+ it can run inside a transaction but the new value is not visible
 * until the transaction commits. We run it outside a transaction here to keep
 * things simple and compatible.
 *
 * The `value` is validated against /^[a-z][a-z0-9_]{1,49}$/ before being
 * interpolated into the ALTER TYPE statement (parameterized queries are not
 * supported for DDL identifiers). The regex guarantees only safe characters.
 */
async function adminCreate(req, res, next) {
  try {
    const {
      value,
      label_en,
      label_ar,
      icon,
      color,
      is_teaching,
      is_accessible,
      is_public,
      is_bookable_for_events,
      sort_order,
    } = req.body;

    // ── Validate key ─────────────────────────────────────────────
    if (!value || !/^[a-z][a-z0-9_]{1,49}$/.test(value)) {
      return res.status(400).json({
        success: false,
        message:
          'Room type key must start with a lowercase letter and contain only ' +
          'lowercase letters, numbers, and underscores (2–50 chars).',
      });
    }

    if (!label_en || !String(label_en).trim()) {
      return res.status(400).json({ success: false, message: 'English label is required.' });
    }

    // ── Check for duplicates ──────────────────────────────────────
    const existing = await query('SELECT id FROM room_types WHERE value = $1', [value]);
    if (existing.rows.length) {
      return res.status(409).json({
        success: false,
        message: `Room type '${value}' already exists.`,
      });
    }

    // ── Extend the enum if value not already present ──────────────
    const enumCheck = await query(
      `SELECT 1
       FROM   pg_enum e
       JOIN   pg_type t ON e.enumtypid = t.oid
       WHERE  t.typname = 'room_type'
         AND  e.enumlabel = $1`,
      [value]
    );

    if (!enumCheck.rows.length) {
      // value passes the regex so interpolation is safe
      await query(`ALTER TYPE room_type ADD VALUE '${value}'`);
    }

    // ── Insert metadata row ───────────────────────────────────────
    const result = await query(
      `INSERT INTO room_types
         (value, label_en, label_ar, icon, color,
          is_teaching, is_accessible, is_public,
          is_bookable_for_events, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        value,
        String(label_en).trim(),
        label_ar ? String(label_ar).trim() : null,
        icon       || null,
        color      || null,
        Boolean(is_teaching           ?? false),
        Boolean(is_accessible         ?? false),
        Boolean(is_public             ?? true),
        Boolean(is_bookable_for_events ?? false),
        Number(sort_order             ?? 999),
      ]
    );

    res.status(201).json({ success: true, data: { roomType: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRoomTypes,
  adminList,
  adminUpdate,
  adminToggleActive,
  adminCreate,
};
