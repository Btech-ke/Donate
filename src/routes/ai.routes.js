const express = require('express');
const router  = express.Router();
const { chat, getHistory } = require('../ai');

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

module.exports = router;
