require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const { initDB } = require('./db');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '*',
    'https://btechplus-backend-mpesa.onrender.com',
    /\.onrender\.com$/,
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status: 'ok',
  service: 'BTECHPLUS Campus Pathway API',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/mpesa',  require('./routes/mpesa.routes'));
app.use('/api/ai',     require('./routes/ai.routes'));
app.use('/api/forum',  require('./routes/forum.routes'));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 BTECHPLUS API running on port ${PORT}`);
    console.log(`   M-Pesa Callback: ${process.env.MPESA_CALLBACK_URL}`);
  });
}).catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

module.exports = app;
