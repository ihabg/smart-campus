const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

// ─── Infer academic year from student ID ──────────────────────
// Mirrors the same logic in authController.js
function getAcademicYear(studentId) {
  const str = String(studentId).replace(/\D/g, '');
  if (str.length < 3) return null;
  const batch          = parseInt(str.slice(0, 3));
  const yearSuffix     = batch % 100;
  const enrollmentYear = 2000 + yearSuffix;
  const currentYear    = new Date().getFullYear();
  const yearsStudied   = currentYear - enrollmentYear + 1;
  if (yearsStudied < 1) return 1;
  if (yearsStudied > 6) return 6;
  return yearsStudied;
}

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

    // Pre-fetch before state for activity log
    const beforeRes = await query(
      'SELECT first_name, last_name, email, role, status, department FROM users WHERE id = $1',
      [id]
    );

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(',')} WHERE id = $${idx}
       RETURNING id, first_name, last_name, email, role, status, department`,
      values
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const before  = beforeRes.rows[0] || {};
    const changes = {};
    if (role)       changes.role       = role;
    if (status)     changes.status     = status;
    if (department) changes.department = department;

    await logActivity({
      req,
      action:      'user.update',
      entityType:  'user',
      entityId:    id,
      entityLabel: before.first_name ? `${before.first_name} ${before.last_name}` : id,
      description: `Updated user ${before.email || id}: ${Object.keys(changes).join(', ')} changed`,
      metadata: {
        changes,
        before: {
          role:       before.role,
          status:     before.status,
          department: before.department,
        },
      },
    });

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

    // Fetch before deleting so we can log what was removed
    const userSnap = await query(
      'SELECT first_name, last_name, email, role, student_id FROM users WHERE id = $1',
      [id]
    );

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const u = userSnap.rows[0] || {};
    await logActivity({
      req,
      action:      'user.delete',
      entityType:  'user',
      entityId:    id,
      entityLabel: u.first_name ? `${u.first_name} ${u.last_name}` : id,
      description: `Deleted user account for ${u.email || id}`,
      metadata: {
        email:      u.email      || null,
        role:       u.role       || null,
        student_id: u.student_id || null,
      },
    });

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

// ─── Admin: create student ─────────────────────────────────────
async function createStudent(req, res, next) {
  try {
    const {
      first_name, last_name, email, password,
      student_id, department_id,
      year_of_study, registration_year,
    } = req.body;

    // ── Required field validation ─────────────────────────────
    if (!first_name || !String(first_name).trim())
      return res.status(400).json({ success: false, message: 'first_name is required.' });
    if (!last_name || !String(last_name).trim())
      return res.status(400).json({ success: false, message: 'last_name is required.' });
    if (!email || !String(email).trim())
      return res.status(400).json({ success: false, message: 'email is required.' });
    if (!password || String(password).length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    if (!student_id || !String(student_id).trim())
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    if (!/^\d{6,12}$/.test(String(student_id).trim()))
      return res.status(400).json({ success: false, message: 'student_id must be 6–12 digits.' });
    if (!department_id)
      return res.status(400).json({ success: false, message: 'department_id is required.' });

    const cleanEmail     = String(email).trim().toLowerCase();
    const cleanStudentId = String(student_id).trim();

    // ── Duplicate checks (parallel) ───────────────────────────
    const [emailCheck, sidCheck, regNumCheck] = await Promise.all([
      query('SELECT id FROM users          WHERE email               = $1', [cleanEmail]),
      query('SELECT id FROM users          WHERE student_id          = $1', [cleanStudentId]),
      query('SELECT id FROM student_profiles WHERE registration_number = $1', [cleanStudentId]),
    ]);

    if (emailCheck.rows.length)
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    if (sidCheck.rows.length)
      return res.status(409).json({ success: false, message: 'Student ID is already registered.' });
    if (regNumCheck.rows.length)
      return res.status(409).json({ success: false, message: 'Registration number already exists.' });

    // ── Verify department ─────────────────────────────────────
    const deptResult = await query(
      'SELECT id, name_en FROM departments WHERE id = $1', [department_id]
    );
    if (!deptResult.rows.length)
      return res.status(400).json({ success: false, message: 'Department not found.' });
    const deptNameEn = deptResult.rows[0].name_en;

    // ── Hash password ─────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, 12);
    const userId    = uuidv4();
    const profileId = uuidv4();

    // ── Infer year values when not supplied ───────────────────
    const rawYear = year_of_study ? parseInt(year_of_study) : getAcademicYear(cleanStudentId);
    const finalYear = Math.min(Math.max(rawYear ?? 1, 1), 6);

    const batch = parseInt(cleanStudentId.slice(0, 3));
    const finalRegYear = registration_year
      ? parseInt(registration_year)
      : 2000 + (batch % 100);

    // ── Transaction: both rows or neither ────────────────────
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO users
           (id, first_name, last_name, email, password_hash,
            student_id, department, year_of_study, role, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'student','active')`,
        [
          userId,
          String(first_name).trim(),
          String(last_name).trim(),
          cleanEmail,
          password_hash,
          cleanStudentId,
          deptNameEn,
          finalYear,
        ]
      );

      await client.query(
        `INSERT INTO student_profiles
           (id, user_id, registration_number, department_id, year_of_study, registration_year)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [profileId, userId, cleanStudentId, department_id, finalYear, finalRegYear]
      );
    });

    // ── Return new user (no password_hash) ────────────────────
    const created = await query(
      `SELECT id, first_name, last_name, email, role, status,
              student_id, department, year_of_study, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    const newUser = created.rows[0];
    await logActivity({
      req,
      action:      'user.create_student',
      entityType:  'user',
      entityId:    userId,
      entityLabel: `${newUser.first_name} ${newUser.last_name}`,
      description: `Created student account for ${newUser.email} (ID: ${newUser.student_id})`,
      metadata: {
        student_id:   cleanStudentId,
        email:        cleanEmail,
        department:   deptNameEn,
        year_of_study: finalYear,
      },
    });

    res.status(201).json({ success: true, data: { user: newUser } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllUsers, getUserById, updateMyProfile, uploadAvatar,
  adminUpdateUser, deleteUser, getDashboardStats, createStudent,
};
