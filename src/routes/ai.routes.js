const express = require('express');
const router  = express.Router();
const { chat, getHistory } = require('../ai');
const { pool } = require('../db');

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error:'message and sessionId required' });
    if (message.length > 1000) return res.status(400).json({ error:'Message too long (max 1000 chars)' });
    const result = await chat(sessionId, message);
    // result is { reply, source } — always returns 200 now
    res.json({ reply: result.reply, source: result.source });
  } catch(err) {
    console.error('AI route error:', err.message);
    res.status(200).json({ reply: 'Samahani! Service is temporarily busy. Please try again in a moment.', source: 'error' });
  }
});

// GET /api/ai/history/:sessionId
router.get('/history/:sessionId', async (req, res) => {
  try {
    const history = await getHistory(req.params.sessionId);
    res.json(history);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/sessions — list all sessions for admin
router.get('/sessions', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT session_id,
             COUNT(*) as message_count,
             MAX(created_at) as last_active,
             (SELECT content FROM ai_conversations c2 WHERE c2.session_id = c.session_id AND c2.role='user' ORDER BY created_at DESC LIMIT 1) as last_message
      FROM ai_conversations c
      GROUP BY session_id
      ORDER BY last_active DESC
      LIMIT 100
    `);
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/admin-reply — inject admin reply into a session
router.post('/admin-reply', async (req, res) => {
  try {
    const { sessionId, reply } = req.body;
    if (!sessionId || !reply) return res.status(400).json({ error: 'sessionId and reply required' });
    await pool.query(
      `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [sessionId, '[ADMIN] ' + reply.trim()]
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


   const { sendAdminNotification } = require('../notify');
   sendAdminNotification({
     subject: '💬 New AI Chat Message — BTECHPLUS',
     body: `Session: <code>${sessionId}</code><br><br>Message: "${message}"<br><br>Go to Admin → AI Chats to reply.`
  });
module.exports = router;
