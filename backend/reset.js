require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

async function reset() {
  const hash = await bcrypt.hash('Admin@1234', 12);
  await pool.query(
    'UPDATE users SET password_hash = $1, role = $2 WHERE email = $3',
    [hash, 'super_admin', 'admin@najah.edu']
  );
  console.log('Done! Login with admin@najah.edu / Admin@1234');
  pool.end();
}

reset();