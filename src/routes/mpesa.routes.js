const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { stkPush, handleCallback, queryStatus } = require('../mpesa');
const { pool } = require('../db');

// ─── DIAGNOSTIC: raw token test endpoint ────────────────────────────────────
// Visit https://donate-erxu.onrender.com/api/mpesa/test-token to see full debug
router.get('/test-token', async (req, res) => {
  const key    = (process.env.MPESA_CONSUMER_KEY    || '').trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || '').trim();

  const info = {
    key_length:    key.length,
    key_start:     key.slice(0, 12),
    key_end:       key.slice(-6),
    secret_length: secret.length,
    secret_start:  secret.slice(0, 8),
    shortcode:     process.env.MPESA_SHORTCODE,
    till:          process.env.MPESA_TILL_NUMBER,
    passkey_len:   (process.env.MPESA_PASSKEY || '').length,
    callback_url:  process.env.MPESA_CALLBACK_URL,
    mpesa_env:     process.env.MPESA_ENV || 'production',
  };

  console.log('🔍 TEST-TOKEN hit. Env info:', JSON.stringify(info));

  const AUTH_URL = (process.env.MPESA_ENV === 'sandbox')
    ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

  try {
    const cred = Buffer.from(`${key}:${secret}`).toString('base64');
    console.log('🔑 Attempting auth to:', AUTH_URL);
    console.log('🔑 Basic cred sample (first 30):', cred.slice(0, 30));

    const tokenRes = await axios.get(AUTH_URL, {
      headers: { Authorization: `Basic ${cred}` },
      timeout: 15000,
    });

    console.log('✅ Token SUCCESS:', JSON.stringify(tokenRes.data));
    res.json({
      success: true,
      token_preview: tokenRes.data.access_token?.slice(0, 20) + '...',
      env_info: info,
    });
  } catch (err) {
    console.error('❌ Token FAILED');
    console.error('   Status  :', err.response?.status);
    console.error('   Headers :', JSON.stringify(err.response?.headers));
    console.error('   Body    :', JSON.stringify(err.response?.data));
    console.error('   Message :', err.message);
    res.status(500).json({
      success: false,
      error:   err.message,
      status:  err.response?.status,
      body:    err.response?.data,
      headers: err.response?.headers,
      env_info: info,
    });
  }
});

// POST /api/mpesa/stk — initiate STK push
router.post('/stk', async (req, res) => {
  console.log('📥 STK request body:', JSON.stringify(req.body));
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) return res.status(400).json({ success:false, error:'phone and amount required' });
    if (amount < 1 || amount > 70000) return res.status(400).json({ success:false, error:'Amount must be 1–70,000' });
    const result = await stkPush(phone, amount);
    console.log('✅ STK success:', JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('❌ STK route error:', err.message);
    const userMsg = err.message || 'M-Pesa request failed';
    res.status(500).json({ success:false, error: userMsg });
  }
});

// POST /api/mpesa/callback — Safaricom callback (must always return 200)
router.post('/callback', async (req, res) => {
  console.log('📲 M-Pesa callback received:', JSON.stringify(req.body));
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
