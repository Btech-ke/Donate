require('dotenv').config();

console.log('=== BTECHPLUS v2.0 STARTUP ===');
console.log('NODE_ENV     :', process.env.NODE_ENV || 'not set');
console.log('PORT         :', process.env.PORT || '3000');
console.log('DATABASE_URL :', process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.length} chars)` : '*** NOT SET ***');
console.log('ANTHROPIC_KEY:', process.env.ANTHROPIC_API_KEY ? `SET (starts: ${process.env.ANTHROPIC_API_KEY.slice(0,12)}...)` : '*** NOT SET ***');
console.log('MPESA_KEY    :', process.env.MPESA_CONSUMER_KEY ? `SET (${process.env.MPESA_CONSUMER_KEY.length} chars, starts: ${process.env.MPESA_CONSUMER_KEY.slice(0,8)}...)` : '*** NOT SET ***');
console.log('MPESA_SECRET :', process.env.MPESA_CONSUMER_SECRET ? `SET (${process.env.MPESA_CONSUMER_SECRET.length} chars)` : '*** NOT SET ***');
console.log('MPESA_SHORT  :', process.env.MPESA_SHORTCODE || '*** NOT SET ***');
console.log('MPESA_TILL   :', process.env.MPESA_TILL_NUMBER || '*** NOT SET ***');
console.log('MPESA_PASSKEY:', process.env.MPESA_PASSKEY ? `SET (${process.env.MPESA_PASSKEY.length} chars)` : '*** NOT SET ***');
console.log('MPESA_CB_URL :', process.env.MPESA_CALLBACK_URL || '*** NOT SET ***');
console.log('MPESA_ENV    :', process.env.MPESA_ENV || 'production (default)');
console.log('JWT_SECRET   :', process.env.JWT_SECRET ? 'SET' : 'using default (set JWT_SECRET in Render!)');
console.log('==============================');

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const { initDB } = require('./db');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: ['https://btechplus.com', 'http://localhost:3000', 'http://127.0.0.1:5500', /\.btechplus\.com$/],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));

// ── Routes ────────────────────────────────────────────────
const { router: authRouter } = require('./routes/auth.routes');
const mpesaRouter    = require('./routes/mpesa.routes');
const aiRouter       = require('./routes/ai.routes');
const forumRouter    = require('./routes/forum.routes');
const adminRouter    = require('./routes/admin.routes');
const bookingsRouter = require('./routes/bookings.routes');
const deadlineRouter = require('./routes/deadlines.routes');  // ← was imported but never used
const ngiRouter      = require('./routes/ngi.routes'); // <--- ADD THIS LINE

app.use('/api/auth',      authRouter);
app.use('/api/mpesa',     mpesaRouter);
app.use('/api/ai',        aiRouter);
app.use('/api/forum',     forumRouter);
app.use('/api/admin',     adminRouter);
app.use('/api/bookings',  bookingsRouter);
app.use('/api/deadlines', deadlineRouter);  // ← THIS was missing — caused the 404
app.use('/api/ngi',       ngiRouter);       // <--- ADD THIS LINE

// ── Health & root ─────────────────────────────────────────
app.get('/', (req, res) => res.json({ service: 'BTECHPLUS API v2.0', status: 'online' }));

// UptimeRobot pings this — MUST be before app.listen()
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString(), service: 'BTECHPLUS API' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() }));

// 404 fallback — must be last
app.use((req, res) => res.status(404).json({ error: `Route ${req.path} not found` }));



// ── Start server ──────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 BTECHPLUS API v2 running on port ${PORT}`);
      console.log(`   https://donate-erxu.onrender.com`);

      // Self-ping every 14 min — keeps Render from sleeping
      const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://donate-erxu.onrender.com';
      setInterval(() => {
        try {
          require('https').get(SELF_URL + '/health', (r) => {
            console.log(`[keep-alive] ping OK ${new Date().toISOString()} — status ${r.statusCode}`);
          }).on('error', (e) => {
            console.warn('[keep-alive] ping failed:', e.message);
          });
        } catch(e) {}
      }, 14 * 60 * 1000);

      console.log('[keep-alive] Self-ping initialized — server will not sleep');
    });
  })
  .catch(err => {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  });