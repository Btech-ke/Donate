const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;
console.log('🔍 DATABASE_URL check:', dbUrl ? `found (${dbUrl.length} chars, starts with: ${dbUrl.slice(0,20)}...)` : 'MISSING!');
if (!dbUrl) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

let pool;
try {
  pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  console.log('✅ DB pool created');
} catch (err) { console.error('❌ DB pool failed:', err.message); process.exit(1); }

pool.on('error', (err) => console.error('DB pool error:', err.message));

async function initDB() {
  console.log('🔄 Connecting to database...');
  const client = await pool.connect();
  console.log('✅ Database connected!');
  try {
    await client.query(`
      -- Donations
      CREATE TABLE IF NOT EXISTS donations (
        id                  SERIAL PRIMARY KEY,
        phone               VARCHAR(20)   NOT NULL,
        amount              NUMERIC(10,2) NOT NULL,
        merchant_request_id VARCHAR(100),
        checkout_request_id VARCHAR(100)  UNIQUE,
        mpesa_receipt       VARCHAR(50),
        status              VARCHAR(20)   DEFAULT 'PENDING',
        result_desc         TEXT,
        created_at          TIMESTAMPTZ   DEFAULT NOW(),
        updated_at          TIMESTAMPTZ   DEFAULT NOW()
      );

      -- Users (real auth)
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(80)  NOT NULL,
        email         VARCHAR(120) UNIQUE NOT NULL,
        password_hash VARCHAR(200) NOT NULL,
        is_admin      BOOLEAN      DEFAULT FALSE,
        grade         VARCHAR(10),
        cluster       VARCHAR(100),
        county        VARCHAR(80),
        created_at    TIMESTAMPTZ  DEFAULT NOW()
      );

      -- AI conversations (linked to user)
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id           SERIAL PRIMARY KEY,
        session_id   VARCHAR(100) NOT NULL,
        user_id      INT REFERENCES users(id) ON DELETE SET NULL,
        role         VARCHAR(15)  NOT NULL,
        content      TEXT         NOT NULL,
        admin_reply  TEXT,
        escalated    BOOLEAN      DEFAULT FALSE,
        created_at   TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Forum posts
      CREATE TABLE IF NOT EXISTS forum_posts (
        id          SERIAL PRIMARY KEY,
        user_id     INT REFERENCES users(id) ON DELETE SET NULL,
        username    VARCHAR(80)  NOT NULL,
        message     TEXT         NOT NULL,
        likes       INT          DEFAULT 0,
        admin_reply TEXT,
        is_deleted  BOOLEAN      DEFAULT FALSE,
        created_at  TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Application deadlines (admin managed)
      CREATE TABLE IF NOT EXISTS deadlines (
        id          SERIAL PRIMARY KEY,
        title       VARCHAR(200) NOT NULL,
        description TEXT,
        deadline    TIMESTAMPTZ  NOT NULL,
        type        VARCHAR(50)  DEFAULT 'KUCCPS',
        status      VARCHAR(20)  DEFAULT 'OPEN',
        link        VARCHAR(300),
        created_at  TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Booking / cyber requests
      CREATE TABLE IF NOT EXISTS bookings (
        id         SERIAL PRIMARY KEY,
        user_id    INT REFERENCES users(id) ON DELETE SET NULL,
        name       VARCHAR(100) NOT NULL,
        phone      VARCHAR(20)  NOT NULL,
        email      VARCHAR(120),
        service    VARCHAR(100) NOT NULL,
        message    TEXT,
        status     VARCHAR(30)  DEFAULT 'PENDING',
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Indexes
      -- Indexes
     CREATE INDEX IF NOT EXISTS idx_donations_checkout ON donations(checkout_request_id);
     CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
     CREATE INDEX IF NOT EXISTS idx_ai_session ON ai_conversations(session_id);
     CREATE INDEX IF NOT EXISTS idx_forum_active ON forum_posts(created_at);
    `);

    // Safe migrations for existing tables
    await client.query(`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS admin_reply TEXT`);
    await client.query(`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS user_id INT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS grade VARCHAR(10)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cluster VARCHAR(100)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS county VARCHAR(80)`);
    await client.query(`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS admin_reply TEXT`);
    await client.query(`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS user_id INT`);

    console.log('✅ All tables ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
