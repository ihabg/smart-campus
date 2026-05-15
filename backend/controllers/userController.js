const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// ─── Get all users (admin) ────────────────────────────────────

async function getAllUsers(req, res, next) {
  try {
    const {
      role, status, department, search,
      page = 1, limit = 20,
    } = req.query;

    let sql = `
      SELECT id, first_name, last_name, email, role, status,
             student_id, department, year_of_study, avatar_url,
             last_login, created_at
      FROM users WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (role)       { params.push(role);       sql += ` AND role = $${idx++}`; }
    if (status)     { params.push(status);     sql += ` AND status = $${idx++}`; }
    if (department) { params.push(department); sql += ` AND department = $${idx++}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (first_name ILIKE $${idx} OR last_name ILIKE $${idx}
                    OR email ILIKE $${idx} OR student_id ILIKE $${idx})`;
      idx++;
    }

    const countResult = await query(`SELECT COUNT(*) FROM (${sql}) t`, params);
    const total       = parseInt(countResult.rows[0].count);

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);

    res.json({
      success: true,
      data: {
        users: result.rows,
        pagination: {
          total, page: parseInt(page), limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get single user (admin) ──────────────────────────────────

async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, first_name, last_name, email, role, status,
              student_id, department, year_of_study, avatar_url,
              last_login, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Update own profile ───────────────────────────────────────

async function updateMyProfile(req, res, next) {
  try {
    const { first_name, last_name, department, year_of_study } = req.body;
    const allowed = { first_name, last_name, department, year_of_study };

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(allowed)) {
      if (val !== undefined) {
        fields.push(`${key}=$${idx++}`);
        values.push(val);
      }
    }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${fields.join(',')} WHERE id = $${idx}
       RETURNING id, first_name, last_name, email, role, department, year_of_study, avatar_url`,
      values
    );

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Upload avatar ────────────────────────────────────────────

async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ success: true, data: { avatar_url: avatarUrl } });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: update user role/status ──────────────────────────

async function adminUpdateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { role, status, department } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (role)       { fields.push(`role=$${idx++}`);       values.push(role); }
    if (status)     { fields.push(`status=$${idx++}`);     values.push(status); }
    if (department) { fields.push(`department=$${idx++}`); values.push(department); }

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(',')} WHERE id = $${idx}
       RETURNING id, first_name, last_name, email, role, status, department`,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: delete user ───────────────────────────────────────

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: get dashboard stats ───────────────────────────────
async function getDashboardStats(req, res, next) {
  try {
    const [
      usersRes,
      roomsRes,
      roomTypesRes,
      sectionsRes,
      notifRes,
      buildingsRes
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE role = 'student')::int AS students,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
          COUNT(*) FILTER (WHERE role = 'super_admin')::int AS super_admins,
          COUNT(*) FILTER (WHERE role = 'professor')::int AS professors,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
        FROM users
      `),

      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE type = 'classroom')::int AS classrooms,
          COUNT(*) FILTER (WHERE type = 'lecture_hall')::int AS lecture_halls,
          COUNT(*) FILTER (WHERE type = 'lab')::int AS labs,
          COUNT(*) FILTER (WHERE type = 'office')::int AS offices,
          COUNT(*) FILTER (WHERE type = 'restroom')::int AS restrooms,
          COUNT(*) FILTER (WHERE type = 'bathroom')::int AS bathrooms,
          COUNT(*) FILTER (WHERE type = 'stairs')::int AS stairs,
          COUNT(*) FILTER (WHERE type = 'elevator')::int AS elevators,
          COUNT(*) FILTER (WHERE type = 'storage')::int AS storage,
          COUNT(*) FILTER (WHERE type = 'meeting_room')::int AS meeting_rooms,
          COUNT(*) FILTER (WHERE type = 'professor_lounge')::int AS professor_lounges,
          COUNT(*) FILTER (WHERE type = 'amphitheater')::int AS amphitheaters,
          COUNT(*) FILTER (WHERE type = 'engineering_drawing_room')::int AS engineering_drawing_rooms,
          COUNT(*) FILTER (WHERE type = 'engineering_drawing_studio')::int AS engineering_drawing_studios,
          COUNT(*) FILTER (WHERE type = 'other')::int AS other
        FROM rooms
        WHERE is_active = TRUE
      `),

      query(`
        SELECT
          type::text AS type,
          COUNT(*)::int AS count
        FROM rooms
        WHERE is_active = TRUE
        GROUP BY type
        ORDER BY type::text
      `),

      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
          COUNT(*) FILTER (
            WHERE is_active = TRUE
              AND semester = 'spring'
              AND academic_year = '2025/2026'
          )::int AS spring_active
        FROM sections
      `),

      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_published = TRUE)::int AS published
        FROM notifications
      `),

      query(`
        SELECT
          COUNT(*)::int AS total
        FROM buildings
        WHERE is_active = TRUE
      `)
    ]);

    const users = usersRes.rows[0];
    const rooms = roomsRes.rows[0];
    const sections = sectionsRes.rows[0];
    const notifications = notifRes.rows[0];
    const buildings = buildingsRes.rows[0];

    res.json({
      success: true,
      data: {
        users: {
          total: users.total || 0,
          students: users.students || 0,
          admins: users.admins || 0,
          super_admins: users.super_admins || 0,
          professors: users.professors || 0,
          active: users.active || 0,
          suspended: users.suspended || 0
        },

        rooms: {
          total: rooms.total || 0,
          classrooms: rooms.classrooms || 0,
          lecture_halls: rooms.lecture_halls || 0,
          labs: rooms.labs || 0,
          offices: rooms.offices || 0,
          restrooms: rooms.restrooms || 0,
          bathrooms: rooms.bathrooms || 0,
          stairs: rooms.stairs || 0,
          elevators: rooms.elevators || 0,
          storage: rooms.storage || 0,
          meeting_rooms: rooms.meeting_rooms || 0,
          professor_lounges: rooms.professor_lounges || 0,
          amphitheaters: rooms.amphitheaters || 0,
          engineering_drawing_rooms: rooms.engineering_drawing_rooms || 0,
          engineering_drawing_studios: rooms.engineering_drawing_studios || 0,
          other: rooms.other || 0,

          // This is the important one for the dashboard list.
          by_type: roomTypesRes.rows
        },

        sections: {
          total: sections.total || 0,
          active: sections.active || 0,
          spring_active: sections.spring_active || 0
        },

        notifications: {
          total: notifications.total || 0,
          published: notifications.published || 0
        },

        buildings: {
          total: buildings.total || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllUsers, getUserById, updateMyProfile, uploadAvatar,
  adminUpdateUser, deleteUser, getDashboardStats,
};
