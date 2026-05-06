const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');

// ─── Student ID Parser ──────────────────────────────────────
// First 3 digits = batch number
// batch 121 → enrolled 2021 → Year 5 in 2026
function getAcademicYear(studentId) {
  const str = String(studentId).replace(/\D/g, '');
  if (str.length < 3) return null;
  const batch          = parseInt(str.slice(0, 3));
  const yearSuffix     = batch % 100;          // 121 % 100 = 21
  const enrollmentYear = 2000 + yearSuffix;    // 2021
  const currentYear    = new Date().getFullYear();
  const yearsStudied   = currentYear - enrollmentYear + 1;
  if (yearsStudied < 1) return 1;
  if (yearsStudied > 6) return 6;
  return yearsStudied;
}

// ─── Register ───────────────────────────────────────────────

async function register(req, res, next) {
  try {
    const { first_name, last_name, email, password, student_id, department } = req.body;
    // Auto-calculate academic year from student ID
    const year_of_study = student_id ? getAcademicYear(student_id) : null;

    // Check duplicate email
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Check duplicate student_id
    if (student_id) {
      const existingSid = await query('SELECT id FROM users WHERE student_id = $1', [student_id]);
      if (existingSid.rows.length) {
        return res.status(409).json({ success: false, message: 'Student ID already registered.' });
      }
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    const result = await query(
      `INSERT INTO users
         (id, first_name, last_name, email, password_hash, student_id, department, year_of_study, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'student')
       RETURNING id, first_name, last_name, email, role, student_id, department, year_of_study, created_at`,
      [id, first_name, last_name, email, password_hash, student_id || null, department || null, year_of_study || null]
    );

    const user = result.rows[0];
    const accessToken  = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id });

    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      data: { user, accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Login ──────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT id, first_name, last_name, email, password_hash, role, status,
              student_id, department, year_of_study, avatar_url, fcm_token
       FROM users WHERE email = $1`,
      [email]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact administration.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account inactive.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const accessToken  = signAccessToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id });

    await query(
      'UPDATE users SET refresh_token = $1, last_login = NOW() WHERE id = $2',
      [refreshToken, user.id]
    );

    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful.',
      data: { user, accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Refresh Token ──────────────────────────────────────────

async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required.' });
    }

    const decoded = verifyRefreshToken(token);
    const result  = await query(
      'SELECT id, role, refresh_token, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows.length || result.rows[0].refresh_token !== token) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const user = result.rows[0];
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account inactive.' });
    }

    const newAccessToken  = signAccessToken({ id: user.id, role: user.role });
    const newRefreshToken = signRefreshToken({ id: user.id });

    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Refresh token expired. Please log in again.' });
    }
    next(error);
  }
}

// ─── Logout ─────────────────────────────────────────────────

async function logout(req, res, next) {
  try {
    await query('UPDATE users SET refresh_token = NULL WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
}

// ─── Get Me ──────────────────────────────────────────────────

async function getMe(req, res, next) {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, email, role, status, student_id,
              department, year_of_study, avatar_url, last_login, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    next(error);
  }
}

// ─── Change Password ─────────────────────────────────────────

async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const isMatch = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password incorrect.' });
    }

    const new_hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1, refresh_token = NULL WHERE id = $2', [new_hash, req.user.id]);

    res.json({ success: true, message: 'Password updated. Please log in again.' });
  } catch (error) {
    next(error);
  }
}

// ─── Update FCM Token ─────────────────────────────────────────

async function updateFcmToken(req, res, next) {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ success: false, message: 'FCM token required.' });
    }
    await query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcm_token, req.user.id]);
    res.json({ success: true, message: 'FCM token updated.' });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, refreshToken, logout, getMe, changePassword, updateFcmToken };
