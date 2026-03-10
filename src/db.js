const { Pool } = require('pg');

// ── Validate DATABASE_URL before anything else ────────────────────────────────
const dbUrl = process.env.DATABASE_URL;

console.log('🔍 DATABASE_URL check:',
  dbUrl ? `found (${dbUrl.length} chars, starts with: ${dbUrl.slice(0,20)}...)` : 'MISSING!'
);

if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set. Add it in Render Environment tab.');
  process.exit(1);
}

// Validate it looks like a postgres URL
if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
  console.error(`❌ DATABASE_URL looks wrong. Got: "${dbUrl.slice(0,50)}..."`);
  console.error('   It must start with postgresql:// or postgres://');
  process.exit(1);
}

// ── Create pool ───────────────────────────────────────────────────────────────
let pool;
try {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  console.log('✅ DB pool created');
} catch (err) {
  console.error('❌ Failed to create DB pool:', err.message);
  process.exit(1);
}

pool.on('error', (err) => console.error('DB pool error:', err.message));

// ── Create all tables ─────────────────────────────────────────────────────────
async function initDB() {
  console.log('🔄 Connecting to database...');
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Database connected!');
  } catch (err) {
    console.error('❌ Cannot connect to DB:', err.message);
    console.error('   Check your DATABASE_URL is correct in Render Environment.');
    throw err;
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id                  SERIAL PRIMARY KEY,
        phone               VARCHAR(20)  NOT NULL,
        amount              NUMERIC(10,2) NOT NULL,
        merchant_request_id VARCHAR(100),
        checkout_request_id VARCHAR(100) UNIQUE,
        mpesa_receipt       VARCHAR(50),
        status              VARCHAR(20)  DEFAULT 'PENDING',
        result_desc         TEXT,
        created_at          TIMESTAMPTZ  DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id         SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        role       VARCHAR(10)  NOT NULL,
        content    TEXT         NOT NULL,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forum_posts (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(80)  NOT NULL,
        message    TEXT         NOT NULL,
        likes      INT          DEFAULT 0,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(80)  UNIQUE NOT NULL,
        email         VARCHAR(120) UNIQUE,
        password_hash VARCHAR(200),
        created_at    TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_donations_checkout ON donations(checkout_request_id);
      CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
      CREATE INDEX IF NOT EXISTS idx_ai_session         ON ai_conversations(session_id);
    `);
    console.log('✅ All tables ready');
  } catch (err) {
    console.error('❌ Table creation failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
