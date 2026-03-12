const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const { authMiddleware, adminMiddleware } = require('./auth.routes');

const admin = [authMiddleware, adminMiddleware];

// ── DASHBOARD STATS ──────────────────────────────────────────────────────────
router.get('/stats', admin, async (req, res) => {
  try {
    const [donations, users, posts, bookings, sessions] = await Promise.all([
      pool.query(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM donations WHERE status='SUCCESS'`),
      pool.query(`SELECT COUNT(*) c FROM users`),
      pool.query(`SELECT COUNT(*) c FROM forum_posts WHERE is_deleted=FALSE`),
      pool.query(`SELECT COUNT(*) c FROM bookings WHERE status='PENDING'`),
      pool.query(`SELECT COUNT(DISTINCT session_id) c FROM ai_conversations`),
    ]);
    res.json({
      donations:        { count: +donations.rows[0].c, total: +donations.rows[0].total },
      users:            +users.rows[0].c,
      forum_posts:      +posts.rows[0].c,
      pending_bookings: +bookings.rows[0].c,
      ai_sessions:      +sessions.rows[0].c,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DONATIONS ────────────────────────────────────────────────────────────────
router.get('/donations', admin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, phone, amount, mpesa_receipt, status, result_desc, created_at
       FROM donations ORDER BY created_at DESC LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── USERS ────────────────────────────────────────────────────────────────────
router.get('/users', admin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, username, email, is_admin, grade, cluster, county, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/toggle-admin', admin, async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_admin = NOT is_admin WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FORUM MODERATION ─────────────────────────────────────────────────────────
router.get('/forum', admin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT fp.*, u.email FROM forum_posts fp
       LEFT JOIN users u ON fp.user_id = u.id
       WHERE fp.is_deleted = FALSE
       ORDER BY fp.created_at DESC LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forum/:id/reply', admin, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ error: 'Reply text required' });
    await pool.query(`UPDATE forum_posts SET admin_reply=$1 WHERE id=$2`, [reply, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/forum/:id', admin, async (req, res) => {
  try {
    await pool.query(`UPDATE forum_posts SET is_deleted=TRUE WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI CHAT MONITORING ───────────────────────────────────────────────────────
router.get('/chats', admin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT session_id,
              COUNT(*) FILTER (WHERE role='user') AS user_msgs,
              MIN(created_at) AS started,
              MAX(created_at) AS last_active,
              (SELECT content FROM ai_conversations a2
               WHERE a2.session_id = ai_conversations.session_id
               AND a2.role='user' ORDER BY a2.created_at DESC LIMIT 1) AS last_question
       FROM ai_conversations
       GROUP BY session_id
       ORDER BY last_active DESC
       LIMIT 100`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/chats/:sessionId', admin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM ai_conversations WHERE session_id=$1 ORDER BY created_at ASC`,
      [req.params.sessionId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chats/:sessionId/reply', admin, async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ error: 'Reply required' });
    await pool.query(
      `INSERT INTO ai_conversations (session_id, role, content, escalated)
       VALUES ($1, 'assistant', $2, FALSE)`,
      [req.params.sessionId, '[ADMIN] ' + reply.trim()]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DEADLINES ────────────────────────────────────────────────────────────────
router.get('/deadlines', async (req, res) => {  // Public — no auth needed
  try {
    const r = await pool.query(
      `SELECT id, title, description, deadline, type, status, link, created_at
       FROM deadlines ORDER BY deadline ASC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('GET /admin/deadlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/deadlines', admin, async (req, res) => {
  try {
    const { title, description, deadline, type, status, link } = req.body;
    if (!title || !deadline) return res.status(400).json({ error: 'title and deadline required' });
    const r = await pool.query(
      `INSERT INTO deadlines (title, description, deadline, type, status, link)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description || '', deadline, type || 'KUCCPS', status || 'OPEN', link || null]
    );
    console.log(`📅 Admin added deadline: ${title}`);
    res.json({ success: true, id: r.rows[0].id, deadline: r.rows[0] });
  } catch (err) {
    console.error('POST /admin/deadlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/deadlines/:id', admin, async (req, res) => {
  try {
    const { title, description, deadline, type, status, link } = req.body;
    await pool.query(
      `UPDATE deadlines SET title=$1, description=$2, deadline=$3, type=$4, status=$5, link=$6 WHERE id=$7`,
      [title, description, deadline, type, status, link, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/deadlines/:id', admin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM deadlines WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BOOKINGS ─────────────────────────────────────────────────────────────────
router.get('/bookings', admin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM bookings ORDER BY created_at DESC`);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/bookings/:id/status', admin, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(`UPDATE bookings SET status=$1 WHERE id=$2`, [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
