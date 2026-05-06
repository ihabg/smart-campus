// ── Password Reset & 2FA additions ─────────────────────────────
// These functions are added to the existing authController.js

const { query } = require('../config/db');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const nodemailer = require('nodemailer');

// ─── Email transporter ────────────────────────────────────────
function getTransporter() {
  // Uses Gmail SMTP — set GMAIL_USER and GMAIL_PASS in .env
  // Or use Ethereal for testing (auto-configured below)
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });
  }
  // Fallback: log to console in development
  return null;
}

async function sendEmail(to, subject, html) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`📧 [DEV EMAIL] To: ${to}\nSubject: ${subject}\n`);
    return true;
  }
  await transporter.sendMail({
    from: `"Smart Campus — An-Najah" <${process.env.GMAIL_USER}>`,
    to, subject, html,
  });
  return true;
}

// ─── Generate 6-digit OTP ────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── 1. Forgot Password — send OTP to email ───────────────────
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success:false, message:'Email required.' });

    const userResult = await query(
      'SELECT id, first_name, email FROM users WHERE email = $1 AND status = $2',
      [email.toLowerCase(), 'active']
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return res.json({ success:true, message:'If this email exists, a reset code has been sent.' });
    }

    const user = userResult.rows[0];
    const otp  = generateOTP();
    const exp  = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate old codes
    await query(
      "UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND type = 'password_reset' AND used = FALSE",
      [user.id]
    );

    // Insert new code
    await query(
      `INSERT INTO verification_codes (user_id, code, type, expires_at)
       VALUES ($1, $2, 'password_reset', $3)`,
      [user.id, otp, exp]
    );

    // Send email
    await sendEmail(
      user.email,
      'Smart Campus — Password Reset Code',
      `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <div style="background:#03184a;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
          <h2 style="color:#c9a84c;margin:0">AN Smart Campus</h2>
          <p style="color:rgba(255,255,255,.6);font-size:12px;margin:4px 0 0">An-Najah National University</p>
        </div>
        <p>Hello <strong>${user.first_name}</strong>,</p>
        <p>You requested a password reset. Use this code:</p>
        <div style="background:#f0f2f8;border-radius:10px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#03184a;font-family:monospace">${otp}</span>
        </div>
        <p style="color:#666;font-size:13px">This code expires in <strong>15 minutes</strong>.</p>
        <p style="color:#666;font-size:13px">If you did not request this, please ignore this email.</p>
      </div>
      `
    );

    res.json({ success:true, message:'If this email exists, a reset code has been sent.' });
  } catch (error) { next(error); }
}

// ─── 2. Verify OTP & Reset Password ──────────────────────────
async function resetPassword(req, res, next) {
  try {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password)
      return res.status(400).json({ success:false, message:'Email, code, and new password required.' });

    // Validate password strength
    if (new_password.length < 8)
      return res.status(400).json({ success:false, message:'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(new_password))
      return res.status(400).json({ success:false, message:'Password must contain at least one uppercase letter.' });
    if (!/[0-9]/.test(new_password))
      return res.status(400).json({ success:false, message:'Password must contain at least one number.' });

    // Get user
    const userResult = await query(
      'SELECT id, first_name, email FROM users WHERE email = $1 AND status = $2',
      [email.toLowerCase(), 'active']
    );
    if (userResult.rows.length === 0)
      return res.status(400).json({ success:false, message:'Invalid request.' });

    const user = userResult.rows[0];

    // Verify OTP
    const codeResult = await query(
      `SELECT id FROM verification_codes
       WHERE user_id = $1 AND code = $2 AND type = 'password_reset'
         AND used = FALSE AND expires_at > NOW()`,
      [user.id, code]
    );
    if (codeResult.rows.length === 0)
      return res.status(400).json({ success:false, message:'Invalid or expired code. Please request a new one.' });

    // Mark code as used
    await query(
      'UPDATE verification_codes SET used = TRUE WHERE id = $1',
      [codeResult.rows[0].id]
    );

    // Hash and update password
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

    // Send confirmation email
    await sendEmail(
      user.email,
      'Smart Campus — Password Changed Successfully',
      `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <div style="background:#03184a;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
          <h2 style="color:#c9a84c;margin:0">AN Smart Campus</h2>
        </div>
        <p>Hello <strong>${user.first_name}</strong>,</p>
        <p>Your password has been successfully changed.</p>
        <p style="color:#666;font-size:13px">If you did not make this change, contact the administration immediately.</p>
        <p style="color:#666;font-size:12px;margin-top:20px">An-Najah National University — Smart Campus System</p>
      </div>
      `
    );

    res.json({ success:true, message:'Password reset successfully. You can now log in.' });
  } catch (error) { next(error); }
}

// ─── 3. Change Password with 2FA (step 1 — request OTP) ───────
async function requestPasswordChange(req, res, next) {
  try {
    const userId = req.user.id;
    const { current_password } = req.body;
    if (!current_password)
      return res.status(400).json({ success:false, message:'Current password required.' });

    // Verify current password
    const userResult = await query(
      'SELECT id, password_hash, email, first_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid)
      return res.status(400).json({ success:false, message:'Current password is incorrect.' });

    // Generate OTP
    const otp = generateOTP();
    const exp = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await query(
      "UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND type = 'password_change_2fa' AND used = FALSE",
      [userId]
    );
    await query(
      `INSERT INTO verification_codes (user_id, code, type, expires_at)
       VALUES ($1, $2, 'password_change_2fa', $3)`,
      [userId, otp, exp]
    );

    await sendEmail(
      user.email,
      'Smart Campus — Verify Password Change',
      `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <div style="background:#03184a;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
          <h2 style="color:#c9a84c;margin:0">AN Smart Campus</h2>
        </div>
        <p>Hello <strong>${user.first_name}</strong>,</p>
        <p>You requested a password change. Enter this verification code to confirm:</p>
        <div style="background:#f0f2f8;border-radius:10px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#03184a;font-family:monospace">${otp}</span>
        </div>
        <p style="color:#666;font-size:13px">This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#666;font-size:13px">If you did not request this, your account may be at risk.</p>
      </div>
      `
    );

    res.json({ success:true, message:`Verification code sent to ${user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}` });
  } catch (error) { next(error); }
}

// ─── 4. Change Password with 2FA (step 2 — confirm OTP) ───────
async function confirmPasswordChange(req, res, next) {
  try {
    const userId = req.user.id;
    const { code, new_password } = req.body;
    if (!code || !new_password)
      return res.status(400).json({ success:false, message:'Code and new password required.' });

    if (new_password.length < 8)
      return res.status(400).json({ success:false, message:'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(new_password))
      return res.status(400).json({ success:false, message:'Must contain at least one uppercase letter.' });
    if (!/[0-9]/.test(new_password))
      return res.status(400).json({ success:false, message:'Must contain at least one number.' });

    const codeResult = await query(
      `SELECT id FROM verification_codes
       WHERE user_id = $1 AND code = $2 AND type = 'password_change_2fa'
         AND used = FALSE AND expires_at > NOW()`,
      [userId, code]
    );
    if (codeResult.rows.length === 0)
      return res.status(400).json({ success:false, message:'Invalid or expired code.' });

    await query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [codeResult.rows[0].id]);

    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

    // Get user info for confirmation email
    const userResult = await query('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    await sendEmail(
      user.email,
      'Smart Campus — Password Changed Successfully',
      `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <div style="background:#03184a;padding:20px;border-radius:12px;text-align:center;margin-bottom:20px">
          <h2 style="color:#c9a84c;margin:0">AN Smart Campus</h2>
        </div>
        <p>Hello <strong>${user.first_name}</strong>,</p>
        <p>✅ Your password has been changed successfully.</p>
        <p style="color:#666;font-size:13px">Time: ${new Date().toLocaleString()}</p>
        <p style="color:#666;font-size:13px">If you did not make this change, contact administration immediately.</p>
      </div>
      `
    );

    res.json({ success:true, message:'Password changed successfully.' });
  } catch (error) { next(error); }
}

module.exports = { forgotPassword, resetPassword, requestPasswordChange, confirmPasswordChange };
