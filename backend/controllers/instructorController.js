const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');

function toPositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

async function getAllInstructors(req, res, next) {
  try {
    const {
      department,
      search,
      page       = 1,
      limit      = 30,
      active_only = 'true',
      has_office,
      has_user,
    } = req.query;

    const currentPage = toPositiveInt(page, 1);
    const pageLimit   = toPositiveInt(limit, 30);
    const offset      = (currentPage - 1) * pageLimit;

    const where  = [];
    const params = [];
    let   idx    = 1;

    // ── active_only three-way switch ──────────────────────────
    if (active_only === 'true') {
      where.push('i.is_active = TRUE');
    } else if (active_only === 'false') {
      where.push('i.is_active = FALSE');
    }
    // anything else (e.g. 'all') → no filter

    if (department) {
      params.push(department);
      where.push(`i.department = $${idx++}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`
        (
          i.first_name ILIKE $${idx}
          OR i.last_name ILIKE $${idx}
          OR i.email ILIKE $${idx}
          OR i.department ILIKE $${idx}
          OR CONCAT(i.title, ' ', i.first_name, ' ', i.last_name) ILIKE $${idx}
          OR i.doctor_number::text ILIKE $${idx}
        )
      `);
      idx++;
    }

    if (has_office === 'true') {
      where.push('i.office_room_id IS NOT NULL');
    } else if (has_office === 'false') {
      where.push('i.office_room_id IS NULL');
    }

    if (has_user === 'true') {
      where.push('i.user_id IS NOT NULL');
    } else if (has_user === 'false') {
      where.push('i.user_id IS NULL');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM instructors i ${whereSql}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `
      SELECT
        i.id,
        i.title,
        i.first_name,
        i.last_name,
        i.email,
        i.department,
        i.doctor_number,
        i.office_room_id,
        i.is_active,
        i.user_id,
        i.created_at,
        i.updated_at,

        r.room_number AS office_room_number,
        r.name        AS office_room_name,

        f.id          AS office_floor_id,
        f.floor_label AS office_floor,

        b.code        AS office_building,
        b.name        AS office_building_name,

        COUNT(s.id)::int AS section_count
      FROM instructors i
      LEFT JOIN rooms r    ON r.id  = i.office_room_id
      LEFT JOIN floors f   ON f.id  = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      LEFT JOIN sections s  ON s.instructor_id = i.id AND s.is_active = TRUE
      ${whereSql}
      GROUP BY
        i.id, r.room_number, r.name,
        f.id, f.floor_label,
        b.code, b.name
      ORDER BY i.last_name, i.first_name
      LIMIT $${idx++}
      OFFSET $${idx++}
      `,
      [...params, pageLimit, offset]
    );

    res.json({
      success: true,
      data: {
        instructors: result.rows,
        pagination: {
          total,
          page:       currentPage,
          limit:      pageLimit,
          totalPages: Math.ceil(total / pageLimit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getInstructorById(req, res, next) {
  try {
    const { id } = req.params;

    const instructorResult = await query(
      `
      SELECT
        i.*,
        r.room_number AS office_room_number,
        r.name        AS office_room_name,
        f.floor_label,
        b.code        AS building_code,
        b.name        AS building_name
      FROM instructors i
      LEFT JOIN rooms r    ON r.id  = i.office_room_id
      LEFT JOIN floors f   ON f.id  = r.floor_id
      LEFT JOIN buildings b ON b.id = f.building_id
      WHERE i.id = $1
      `,
      [id]
    );

    if (!instructorResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Instructor not found.' });
    }

    const sectionsResult = await query(
      `
      SELECT
        s.*,
        c.code AS course_code,
        c.name AS course_name,
        c.name_ar AS course_name_ar,
        r.room_number
      FROM sections s
      JOIN courses c   ON c.id = s.course_id
      LEFT JOIN rooms r ON r.id = s.room_id
      WHERE s.instructor_id = $1 AND s.is_active = TRUE
      ORDER BY s.academic_year DESC, s.semester, c.code
      `,
      [id]
    );

    res.json({
      success: true,
      data: {
        instructor: instructorResult.rows[0],
        sections:   sectionsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createInstructor(req, res, next) {
  try {
    const {
      title,
      first_name,
      last_name,
      email,
      department,
      doctor_number,
      office_room_id,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }

    const result = await query(
      `
      INSERT INTO instructors
        (title, first_name, last_name, email, department, doctor_number, office_room_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        title          || null,
        first_name.trim(),
        last_name.trim(),
        email          || null,
        department     || null,
        doctor_number  || null,
        office_room_id || null,
      ]
    );

    res.status(201).json({ success: true, data: { instructor: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

async function updateInstructor(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      'title',
      'first_name',
      'last_name',
      'email',
      'department',
      'doctor_number',
      'office_room_id',
      'is_active',
    ];

    const fields = [];
    const values = [];
    let   idx    = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(key === 'office_room_id' ? (req.body[key] || null) : req.body[key]);
      }
    }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE instructors SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Instructor not found.' });
    }

    res.json({ success: true, data: { instructor: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

async function deleteInstructor(req, res, next) {
  try {
    const { id } = req.params;

    // Fetch instructor first so we know user_id
    const instRes = await query(`SELECT id, user_id FROM instructors WHERE id = $1`, [id]);
    if (!instRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Instructor not found.' });
    }
    const { user_id } = instRes.rows[0];

    // Check every table that references this instructor
    const refRes = await query(
      `
      SELECT (
        (SELECT COUNT(*)::int FROM sections                  WHERE instructor_id = $1)
        + (SELECT COUNT(*)::int FROM office_hours            WHERE instructor_id = $1)
        + (SELECT COUNT(*)::int FROM professor_course_materials WHERE instructor_id = $1)
      ) AS total
      `,
      [id]
    );
    const refCount = refRes.rows[0]?.total || 0;

    // Soft-delete if there are references OR if a user account is linked
    if (refCount > 0 || user_id) {
      await query(
        `UPDATE instructors SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      const reasons = [];
      if (refCount > 0) reasons.push('has teaching or office-hours data');
      if (user_id)      reasons.push('has a linked professor account');

      return res.json({
        success: true,
        soft_deleted: true,
        message: `Instructor deactivated (${reasons.join(', ')}). No data was deleted.`,
      });
    }

    // Safe to hard-delete — no references, no linked user
    await query(`DELETE FROM instructors WHERE id = $1`, [id]);
    res.json({ success: true, soft_deleted: false, message: 'Instructor deleted.' });
  } catch (error) {
    next(error);
  }
}

// ── Link (or create) a professor user account for an instructor ──
async function linkUser(req, res, next) {
  try {
    const { id } = req.params;

    const instRes = await query(
      `SELECT id, first_name, last_name, email, department, doctor_number, user_id
       FROM instructors WHERE id = $1`,
      [id]
    );
    if (!instRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Instructor not found.' });
    }

    const inst = instRes.rows[0];

    if (inst.user_id) {
      return res.status(409).json({
        success: false,
        message: 'Instructor already has a linked user account.',
        user_id: inst.user_id,
      });
    }

    if (!inst.email) {
      return res.status(400).json({ success: false, message: 'Instructor must have an email to link a user account.' });
    }

    let userId;
    let created = false;

    await withTransaction(async (client) => {
      // Check for existing user with the same email
      const existing = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
        [inst.email]
      );

      if (existing.rows.length > 0) {
        // Link to the existing user — do not create a duplicate
        userId = existing.rows[0].id;
      } else {
        // Need doctor_number to set default password
        if (!inst.doctor_number) {
          throw Object.assign(
            new Error('Instructor has no doctor_number — cannot set a default password. Add a doctor number first.'),
            { statusCode: 400 }
          );
        }

        const passwordHash = await bcrypt.hash(String(inst.doctor_number), 12);
        userId = uuidv4();

        await client.query(
          `INSERT INTO users (id, first_name, last_name, email, password_hash, department, role, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'professor', 'active')`,
          [userId, inst.first_name, inst.last_name, inst.email, passwordHash, inst.department || null]
        );
        created = true;
      }

      await client.query(
        `UPDATE instructors SET user_id = $1, updated_at = NOW() WHERE id = $2`,
        [userId, id]
      );
    });

    res.status(created ? 201 : 200).json({
      success: true,
      created,
      user_id: userId,
      message: created
        ? 'Professor account created and linked. Default password is the doctor number.'
        : 'Existing user account linked to instructor.',
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

module.exports = {
  getAllInstructors,
  getInstructorById,
  createInstructor,
  updateInstructor,
  deleteInstructor,
  linkUser,
};
