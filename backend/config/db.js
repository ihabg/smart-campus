const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'smart_campus',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max:               20,    // max pool connections
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Set session timezone to Palestine local time on every new connection
// so CURRENT_DATE, CURRENT_TIME, and NOW() reflect the app's locale
// rather than the PostgreSQL server's system clock (which may be UTC).
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Hebron'");
});

/**
 * Test the database connection on startup.
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT NOW() AS now, current_database() AS db, current_setting('TIMEZONE') AS tz`
    );
    console.log(
      `✅ PostgreSQL connected: ${result.rows[0].db} @ ${result.rows[0].now} (tz: ${result.rows[0].tz})`
    );
  } finally {
    client.release();
  }
}

/**
 * Execute a parameterised query.
 * @param {string} text  - SQL query string with $1, $2… placeholders
 * @param {Array}  params - parameter values
 */
async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB] ${duration}ms | rows: ${result.rowCount} | ${text.substring(0, 80)}`);
  }
  return result;
}

/**
 * Get a client from the pool for transactions.
 */
async function getClient() {
  return pool.connect();
}

/**
 * Execute multiple queries inside a transaction.
 * @param {Function} callback - async function receiving the client
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, getClient, withTransaction, testConnection };
