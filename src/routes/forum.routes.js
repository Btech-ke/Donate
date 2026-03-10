const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/forum/posts
router.get('/posts', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, username, message, likes, admin_reply, created_at
       FROM forum_posts WHERE is_deleted=FALSE ORDER BY created_at DESC LIMIT 50`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/forum/posts
router.post('/posts', async (req, res) => {
  try {
    const { username, message, user_id } = req.body;
    if (!username || !message) return res.status(400).json({ error: 'username and message required' });
    const r = await pool.query(
      `INSERT INTO forum_posts (username, message, user_id) VALUES ($1, $2, $3) RETURNING *`,
      [username.trim().slice(0,80), message.trim().slice(0,1000), user_id || null]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/forum/posts/:id/like
router.post('/posts/:id/like', async (req, res) => {
  try {
    await pool.query(`UPDATE forum_posts SET likes=likes+1 WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
