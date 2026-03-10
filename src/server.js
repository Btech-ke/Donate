require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const { initDB } = require('./db');

const app = express();

// ── CORS — allow btechplus.com + any onrender.com subdomain ──────────────────
const allowedOrigins = [
  'https://btechplus.com',
  'https://www.btechplus.com',
  'https://donate-erxu.onrender.com',
  /\.onrender\.com$/,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('combined'));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server-to-server
    const ok = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    cb(ok ? null : new Error('Not allowed by CORS'), ok);
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status: 'ok',
  service: 'BTECHPLUS Campus Pathway API',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  endpoints: ['/health', '/api/mpesa/stk', '/api/ai/chat', '/api/forum/posts'],
}));

app.get('/health', (req, res) => res.json({
  status: 'healthy',
  db: 'connected',
  uptime: process.uptime().toFixed(0) + 's',
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/mpesa', require('./routes/mpesa.routes'));
app.use('/api/ai',    require('./routes/ai.routes'));
app.use('/api/forum', require('./routes/forum.routes'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 BTECHPLUS API running on port ${PORT}`);
      console.log(`   Render URL : https://donate-erxu.onrender.com`);
      console.log(`   Frontend   : ${process.env.FRONTEND_URL}`);
      console.log(`   M-Pesa CB  : ${process.env.MPESA_CALLBACK_URL}`);
    });
  })
  .catch(err => {
    console.error('💥 Startup failed:', err.message);
    process.exit(1);
  });

module.exports = app;
