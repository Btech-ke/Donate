const express  = require('express');
const router   = express.Router();
const { pool } = require('../db');

// GET /api/deadlines — public, used by the ticker on the frontend
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, title, description, deadline, type, status, link, created_at
       FROM deadlines ORDER BY deadline ASC`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /deadlines error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/deadlines — admin create
router.post('/', async (req, res) => {
  const { title, description, deadline, type, status, link } = req.body || {};
  if (!title || !deadline) return res.status(400).json({ error: 'title and deadline required' });
  try {
    const r = await pool.query(
      `INSERT INTO deadlines (title, description, deadline, type, status, link)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description || '', deadline, type || 'KUCCPS', status || 'OPEN', link || null]
    );
    console.log(`📅 Deadline added: ${title}`);
    res.json({ success: true, id: r.rows[0].id, deadline: r.rows[0] });
  } catch (e) {
    console.error('POST /deadlines error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/deadlines/:id
router.put('/:id', async (req, res) => {
  const { title, description, deadline, type, status, link } = req.body || {};
  try {
    await pool.query(
      `UPDATE deadlines SET title=$1, description=$2, deadline=$3, type=$4, status=$5, link=$6 WHERE id=$7`,
      [title, description, deadline, type, status, link, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/deadlines/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM deadlines WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
