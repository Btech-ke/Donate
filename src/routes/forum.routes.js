const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/forum/posts
router.get('/posts', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM forum_posts ORDER BY created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/forum/posts
router.post('/posts', async (req, res) => {
  try {
    const { username, message } = req.body;
    if (!username || !message) return res.status(400).json({ error:'username and message required' });
    if (message.length > 500) return res.status(400).json({ error:'Message too long' });
    const r = await pool.query(
      'INSERT INTO forum_posts (username, message) VALUES ($1, $2) RETURNING *',
      [username.slice(0,80), message.slice(0,500)]
    );
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/forum/posts/:id/like
router.post('/posts/:id/like', async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE forum_posts SET likes=likes+1 WHERE id=$1 RETURNING likes',
      [req.params.id]
    );
    res.json({ likes: r.rows[0]?.likes ?? 0 });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
