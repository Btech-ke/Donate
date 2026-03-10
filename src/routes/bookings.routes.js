const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// POST /api/bookings — submit a booking request
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, service, message, user_id } = req.body;
    if (!name || !phone || !service) return res.status(400).json({ error: 'name, phone and service required' });
    const r = await pool.query(
      `INSERT INTO bookings (name, phone, email, service, message, user_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status`,
      [name.trim(), phone.trim(), email || null, service, message || null, user_id || null]
    );
    console.log(`📋 New booking: ${service} from ${name} (${phone})`);
    res.json({ success: true, booking_id: r.rows[0].id, status: r.rows[0].status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/bookings/mine — user's own bookings
router.get('/mine', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const r = await pool.query(
      `SELECT id, service, status, created_at FROM bookings WHERE user_id=$1 ORDER BY created_at DESC`,
      [user_id]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
