require('dotenv').config();

// ── Log all env vars on startup (masked) for debugging ───────────────────────
console.log('=== BTECHPLUS STARTUP ===');
console.log('NODE_ENV     :', process.env.NODE_ENV || 'not set');
console.log('PORT         :', process.env.PORT || '3000 (default)');
console.log('DATABASE_URL :', process.env.DATABASE_URL
  ? `SET (${process.env.DATABASE_URL.length} chars)`
  : '*** NOT SET ***');
console.log('ANTHROPIC_KEY:', process.env.ANTHROPIC_API_KEY
  ? `SET (starts: ${process.env.ANTHROPIC_API_KEY.slice(0,12)}...)`
  : '*** NOT SET ***');
console.log('MPESA_KEY    :', process.env.MPESA_CONSUMER_KEY ? 'SET' : '*** NOT SET ***');
console.log('=========================');

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const { initDB } = require('./db');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('tiny'));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // open during development; tighten later
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status: 'ok',
  service: 'BTECHPLUS API',
  version: '1.0.0',
  time: new Date().toISOString(),
}));

app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime().toFixed(1) + 's' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/mpesa', require('./routes/mpesa.routes'));
app.use('/api/ai',    require('./routes/ai.routes'));
app.use('/api/forum', require('./routes/forum.routes'));

// ── 404 + error ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  res.status(500).json({ error: 'Server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`   https://donate-erxu.onrender.com`);
    });
  })
  .catch(err => {
    console.error('💥 Startup failed:', err.message);
    process.exit(1);
  });

module.exports = app;
