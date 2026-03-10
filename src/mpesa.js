const axios = require('axios');
const { pool } = require('./db');

const MPESA_AUTH_URL  = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const MPESA_STK_URL   = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
const MPESA_QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

// ── Get OAuth token ──────────────────────────────────────────────────────────
async function getToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth   = Buffer.from(`${key}:${secret}`).toString('base64');
  const res    = await axios.get(MPESA_AUTH_URL, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 10000,
  });
  return res.data.access_token;
}

// ── Generate password + timestamp ────────────────────────────────────────────
function getPassword() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const ts        = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  return { password, timestamp: ts };
}

// ── STK Push (prompt user phone) ─────────────────────────────────────────────
async function stkPush(phone, amount) {
  // Normalise phone → 254XXXXXXXXX
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0'))   p = '254' + p.slice(1);
  if (p.startsWith('+'))   p = p.slice(1);
  if (!p.startsWith('254')) p = '254' + p;

  const token = await getToken();
  const { password, timestamp } = getPassword();

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerBuyGoodsOnline',  // Till number
    Amount:            Math.ceil(amount),
    PartyA:            p,
    PartyB:            process.env.MPESA_TILL_NUMBER,
    PhoneNumber:       p,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  'BTECHPLUS',
    TransactionDesc:   'BTECHPLUS Donation - Thank you!',
  };

  const res = await axios.post(MPESA_STK_URL, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const data = res.data;

  // Save to DB
  await pool.query(
    `INSERT INTO donations (phone, amount, merchant_request_id, checkout_request_id, status)
     VALUES ($1, $2, $3, $4, 'PENDING')`,
    [p, amount, data.MerchantRequestID, data.CheckoutRequestID]
  );

  return {
    success:           data.ResponseCode === '0',
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    message:           data.CustomerMessage || 'STK push sent',
  };
}

// ── Handle callback from Safaricom ───────────────────────────────────────────
async function handleCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return;

  const checkoutId = stk.CheckoutRequestID;
  const resultCode = stk.ResultCode;
  const resultDesc = stk.ResultDesc;

  if (resultCode === 0) {
    // Payment successful
    const items  = stk.CallbackMetadata?.Item || [];
    const getVal = (name) => items.find(i => i.Name === name)?.Value || null;

    const receipt = getVal('MpesaReceiptNumber');
    const amount  = getVal('Amount');
    const phone   = String(getVal('PhoneNumber') || '');

    await pool.query(
      `UPDATE donations
       SET status='SUCCESS', mpesa_receipt=$1, amount=COALESCE($2, amount),
           result_desc=$3, updated_at=NOW()
       WHERE checkout_request_id=$4`,
      [receipt, amount, resultDesc, checkoutId]
    );

    console.log(`✅ Donation SUCCESS | Receipt: ${receipt} | Amount: ${amount} | Phone: ${phone}`);
  } else {
    await pool.query(
      `UPDATE donations SET status='FAILED', result_desc=$1, updated_at=NOW()
       WHERE checkout_request_id=$2`,
      [resultDesc, checkoutId]
    );
    console.log(`❌ Donation FAILED | ${resultDesc}`);
  }
}

// ── Query STK push status ─────────────────────────────────────────────────────
async function queryStatus(checkoutRequestId) {
  const token = await getToken();
  const { password, timestamp } = getPassword();

  const res = await axios.post(MPESA_QUERY_URL, {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  return res.data;
}

module.exports = { stkPush, handleCallback, queryStatus };
