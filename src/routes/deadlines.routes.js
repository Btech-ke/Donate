const express  = require('express');
const router   = express.Router();
const { pool } = require('../db');

// GET /api/deadlines
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, title, category, deadline_date, status, description, portal_url, created_at
       FROM deadlines ORDER BY deadline_date ASC`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/deadlines — admin create
router.post('/', async (req, res) => {
  const { title, category, deadline_date, status, description, portal_url } = req.body || {};
  if (!title || !deadline_date) return res.status(400).json({ error: 'title and deadline_date required' });
  try {
    const r = await pool.query(
      `INSERT INTO deadlines (title, category, deadline_date, status, description, portal_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, category||'General', deadline_date, status||'OPEN', description||'', portal_url||'']
    );
    console.log(`📅 Deadline added: ${title}`);
    res.json({ success: true, deadline: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/deadlines/:id
router.put('/:id', async (req, res) => {
  const { title, category, deadline_date, status, description, portal_url } = req.body || {};
  try {
    await pool.query(
      `UPDATE deadlines SET title=$1, category=$2, deadline_date=$3, status=$4, description=$5, portal_url=$6
       WHERE id=$7`,
      [title, category, deadline_date, status, description, portal_url, req.params.id]
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
