const https = require('https');

const FROM_NAME = 'Smart Campus — An-Najah University';

function getKey() { return process.env.BREVO_API_KEY; }

function sendEmail({ to, toName, subject, html }) {
  return new Promise((resolve, reject) => {
    const key = getKey();
    if (!key) {
      console.log('\n📧 [DEV MODE] No BREVO_API_KEY found');
      console.log('📧 To:', to, '| Subject:', subject);
      const m = html.match(/(\d{6})/);
      if (m) console.log('📧 CODE:', m[1]);
      return resolve({ id: 'dev' });
    }

    const body = JSON.stringify({
      sender:      { name: FROM_NAME, email: 'amrojamhour4@gmail.com' },
      to:          [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    });

    const req = https.request({
      hostname: 'api.brevo.com',
      path:     '/v3/smtp/email',
      method:   'POST',
      headers:  {
        'api-key':        key,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('📧 Email sent to', to, '(' + res.statusCode + ')');
            resolve(data);
          } else {
            console.error('📧 Email failed:', res.statusCode, data);
            reject(new Error(data.message || 'Email send failed'));
          }
        } catch (e) { reject(new Error('Invalid API response')); }
      });
    });
    req.on('error', e => { console.error('📧 Email error:', e.message); reject(e); });
    req.on('timeout', () => { req.destroy(); reject(new Error('Email timeout')); });
    req.write(body);
    req.end();
  });
}

function otpHtml(name, otp, purpose) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f0f2f8;padding:20px">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(135deg,#010e2e,#03184a);padding:24px;text-align:center">
      <div style="background:#c9a84c;display:inline-block;padding:6px 16px;border-radius:8px;font-weight:800;color:#010e2e;font-family:monospace;font-size:16px">AN</div>
      <div style="color:#fff;font-size:17px;font-weight:700;margin-top:8px">Smart Campus</div>
      <div style="color:rgba(255,255,255,0.5);font-size:12px">An-Najah National University</div>
    </div>
    <div style="padding:30px">
      <p style="font-size:15px;color:#1a202c">Hello <strong>${name}</strong>,</p>
      <p style="font-size:14px;color:#4a5568">${purpose}</p>
      <div style="background:#f7f9fc;border:2px dashed #c3d0e8;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:10px">Verification Code</div>
        <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#03184a;font-family:monospace">${otp}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:10px">Expires in <strong>10 minutes</strong> &nbsp;·&nbsp; Max <strong>5 attempts</strong></div>
      </div>
      <div style="background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px">
        <p style="margin:0;font-size:13px;color:#92400e">⚠️ Never share this code. Our team will never ask for it.</p>
      </div>
    </div>
    <div style="background:#f8fafc;padding:14px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;color:#9ca3af">An-Najah National University — Smart Campus System</p>
    </div>
  </div></body></html>`;
}

function confirmHtml(name, action) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f0f2f8;padding:20px">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(135deg,#010e2e,#03184a);padding:24px;text-align:center">
      <div style="background:#c9a84c;display:inline-block;padding:6px 16px;border-radius:8px;font-weight:800;color:#010e2e;font-family:monospace;font-size:16px">AN</div>
      <div style="color:#fff;font-size:17px;font-weight:700;margin-top:8px">Smart Campus</div>
    </div>
    <div style="padding:30px;text-align:center">
      <p style="font-size:15px;color:#1a202c;text-align:left">Hello <strong>${name}</strong>,</p>
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:24px;margin:20px 0">
        <div style="font-size:36px">✅</div>
        <div style="font-size:16px;font-weight:700;color:#065f46;margin-top:8px">${action}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">${new Date().toLocaleString()}</div>
      </div>
      <p style="font-size:13px;color:#991b1b;text-align:left">If you did not do this, contact administration immediately.</p>
    </div>
  </div></body></html>`;
}

async function sendPasswordResetCode(user, otp) {
  return sendEmail({ to: user.email, toName: user.first_name, subject: '🔐 Smart Campus — Password Reset Code', html: otpHtml(user.first_name, otp, 'You requested to reset your Smart Campus password. Use the code below:') });
}

async function sendPasswordChangeCode(user, otp) {
  return sendEmail({ to: user.email, toName: user.first_name, subject: '🔐 Smart Campus — Verify Password Change', html: otpHtml(user.first_name, otp, 'You requested to change your password. Confirm with the code below:') });
}

async function sendPasswordChangedConfirmation(user) {
  return sendEmail({ to: user.email, toName: user.first_name, subject: '✅ Smart Campus — Password Changed', html: confirmHtml(user.first_name, 'Your password has been changed successfully.') });
}

async function sendPasswordResetConfirmation(user) {
  return sendEmail({ to: user.email, toName: user.first_name, subject: '✅ Smart Campus — Password Reset', html: confirmHtml(user.first_name, 'Your password has been reset successfully.') });
}

module.exports = { sendPasswordResetCode, sendPasswordChangeCode, sendPasswordChangedConfirmation, sendPasswordResetConfirmation };
