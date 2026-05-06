require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

bcrypt.hash('Staff@1234', 12).then(hash => {
  pool.query(
    "UPDATE users SET password_hash = $1 WHERE email LIKE '%najah.edu%'",
    [hash]
  ).then(r => {
    console.log('Updated rows:', r.rowCount);
    pool.end();
  });
});