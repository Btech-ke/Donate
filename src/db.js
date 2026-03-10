const { Pool } = require('pg');

// Guard: crash with a clear message if DATABASE_URL is missing
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL environment variable is not set!');
  console.error('   Add it in Render → Environment tab and redeploy.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // always on — Render postgres requires SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => console.error('DB pool error:', err.message));

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id                  SERIAL PRIMARY KEY,
        phone               VARCHAR(20) NOT NULL,
        amount              NUMERIC(10,2) NOT NULL,
        merchant_request_id VARCHAR(100),
        checkout_request_id VARCHAR(100) UNIQUE,
        mpesa_receipt       VARCHAR(50),
        status              VARCHAR(20) DEFAULT 'PENDING',
        result_desc         TEXT,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id          SERIAL PRIMARY KEY,
        session_id  VARCHAR(100) NOT NULL,
        role        VARCHAR(10) NOT NULL,
        content     TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id          SERIAL PRIMARY KEY,
        username    VARCHAR(80) NOT NULL,
        message     TEXT NOT NULL,
        likes       INT DEFAULT 0,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(80) UNIQUE NOT NULL,
        email         VARCHAR(120) UNIQUE,
        password_hash VARCHAR(200),
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_donations_checkout ON donations(checkout_request_id);
      CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
      CREATE INDEX IF NOT EXISTS idx_ai_session         ON ai_conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_forum_created      ON forum_posts(created_at DESC);
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
