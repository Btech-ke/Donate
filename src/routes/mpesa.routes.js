const express = require('express');
const router  = express.Router();
const { stkPush, handleCallback, queryStatus } = require('../mpesa');
const { pool } = require('../db');

// POST /api/mpesa/stk — initiate STK push
router.post('/stk', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) return res.status(400).json({ success:false, error:'phone and amount required' });
    if (amount < 1 || amount > 70000) return res.status(400).json({ success:false, error:'Amount must be 1–70,000' });
    const result = await stkPush(phone, amount);
    res.json(result);
  } catch (err) {
    console.error('STK error:', err.response?.data || err.message);
    res.status(500).json({ success:false, error: err.response?.data?.errorMessage || 'M-Pesa request failed' });
  }
});

// POST /api/mpesa/callback — Safaricom callback (must always return 200)
router.post('/callback', async (req, res) => {
  try { await handleCallback(req.body); } catch(e) { console.error('Callback err:', e.message); }
  res.json({ ResultCode:0, ResultDesc:'Accepted' });
});

// GET /api/mpesa/status/:id — poll payment status
router.get('/status/:checkoutId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT status, mpesa_receipt, amount, result_desc FROM donations WHERE checkout_request_id=$1',
      [req.params.checkoutId]
    );
    if (r.rows.length > 0) return res.json(r.rows[0]);
    const mpesaStatus = await queryStatus(req.params.checkoutId);
    res.json({ status: mpesaStatus.ResultCode==='0' ? 'SUCCESS' : 'PENDING', raw: mpesaStatus });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /api/mpesa/donations — admin list
router.get('/donations', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id,phone,amount,mpesa_receipt,status,created_at FROM donations ORDER BY created_at DESC LIMIT 100'
    );
    res.json(r.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
