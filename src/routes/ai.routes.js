const express = require('express');
const router  = express.Router();
const { chat, getHistory } = require('../ai');

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error:'message and sessionId required' });
    if (message.length > 1000) return res.status(400).json({ error:'Message too long (max 1000 chars)' });
    const reply = await chat(sessionId, message);
    res.json({ reply });
  } catch(err) {
    console.error('AI error:', err.message);
    res.status(500).json({ error:'AI service unavailable. Try again.' });
  }
});

// GET /api/ai/history/:sessionId
router.get('/history/:sessionId', async (req, res) => {
  try {
    const history = await getHistory(req.params.sessionId);
    res.json(history);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
