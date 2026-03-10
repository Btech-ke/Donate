const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('DB pool error:', err));

// ── Create tables if they don't exist ───────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id            SERIAL PRIMARY KEY,
        phone         VARCHAR(20) NOT NULL,
        amount        NUMERIC(10,2) NOT NULL,
        merchant_request_id VARCHAR(100),
        checkout_request_id VARCHAR(100) UNIQUE,
        mpesa_receipt VARCHAR(50),
        status        VARCHAR(20) DEFAULT 'PENDING',
        result_desc   TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id         SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        role       VARCHAR(10) NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(80) NOT NULL,
        message    TEXT NOT NULL,
        likes      INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        username     VARCHAR(80) UNIQUE NOT NULL,
        email        VARCHAR(120) UNIQUE,
        password_hash VARCHAR(200),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_donations_checkout ON donations(checkout_request_id);
      CREATE INDEX IF NOT EXISTS idx_ai_session ON ai_conversations(session_id);
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
