const axios = require('axios');
const { pool } = require('./db');

// Safaricom Production URLs
const AUTH_URL  = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_URL   = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
const QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

async function getToken() {
  const cred = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const res = await axios.get(AUTH_URL, {
    headers: { Authorization: `Basic ${cred}` },
    timeout: 12000,
  });
  return res.data.access_token;
}

function getPasswordAndTimestamp() {
  const ts       = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw      = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${ts}`;
  const password = Buffer.from(raw).toString('base64');
  return { password, timestamp: ts };
}

function normalisePhone(raw) {
  let p = String(raw).replace(/\D/g, '');
  if (p.startsWith('0'))    p = '254' + p.slice(1);
  if (p.startsWith('254') && p.length === 12) return p;
  if (p.startsWith('+254')) p = p.slice(1);
  return p;
}

// ── STK Push ──────────────────────────────────────────────────────────────────
async function stkPush(phone, amount) {
  const p = normalisePhone(phone);
  if (!/^2547\d{8}$|^2541\d{8}$/.test(p)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  const token = await getToken();
  const { password, timestamp } = getPasswordAndTimestamp();

  // Use Till Number (BuyGoods) if MPESA_TILL_NUMBER set, else Paybill
  const useTill = process.env.MPESA_TILL_NUMBER && process.env.MPESA_TILL_NUMBER !== process.env.MPESA_SHORTCODE;
  const transactionType = useTill ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
  const partyB          = useTill ? process.env.MPESA_TILL_NUMBER : process.env.MPESA_SHORTCODE;
  const accountRef      = useTill ? 'BTECHPLUS' : 'BTECHPLUS';

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   transactionType,
    Amount:            Math.ceil(Number(amount)),
    PartyA:            p,
    PartyB:            partyB,
    PhoneNumber:       p,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  accountRef,
    TransactionDesc:   'BTECHPLUS Donation',
  };

  console.log(`📱 STK push → ${p} | KES ${amount} | Type: ${transactionType} | PartyB: ${partyB}`);
  console.log(`📋 Shortcode: ${process.env.MPESA_SHORTCODE} | Till: ${process.env.MPESA_TILL_NUMBER} | Passkey set: ${!!process.env.MPESA_PASSKEY}`);

  const res = await axios.post(STK_URL, payload, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });

  const d = res.data;
  if (d.ResponseCode !== '0') {
    throw new Error(d.ResponseDescription || 'STK push rejected');
  }

  // Save pending donation
  await pool.query(
    `INSERT INTO donations (phone, amount, merchant_request_id, checkout_request_id, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     ON CONFLICT (checkout_request_id) DO NOTHING`,
    [p, Math.ceil(amount), d.MerchantRequestID, d.CheckoutRequestID]
  );

  return {
    success:           true,
    checkoutRequestId: d.CheckoutRequestID,
    merchantRequestId: d.MerchantRequestID,
    message:           d.CustomerMessage || 'Check your phone and enter M-Pesa PIN',
  };
}

// ── Safaricom callback ────────────────────────────────────────────────────────
async function handleCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return console.warn('⚠️  Invalid callback body');

  const checkoutId = stk.CheckoutRequestID;
  const code       = stk.ResultCode;
  const desc       = stk.ResultDesc;

  if (code === 0) {
    const items  = stk.CallbackMetadata?.Item || [];
    const get    = (name) => items.find(i => i.Name === name)?.Value ?? null;
    const receipt = get('MpesaReceiptNumber');
    const amount  = get('Amount');
    const phone   = String(get('PhoneNumber') || '');

    await pool.query(
      `UPDATE donations
       SET status='SUCCESS', mpesa_receipt=$1, amount=COALESCE($2::numeric, amount),
           result_desc=$3, updated_at=NOW()
       WHERE checkout_request_id=$4`,
      [receipt, amount, desc, checkoutId]
    );
    console.log(`✅ Payment SUCCESS | Receipt:${receipt} | KES ${amount} | ${phone}`);
  } else {
    await pool.query(
      `UPDATE donations SET status='FAILED', result_desc=$1, updated_at=NOW()
       WHERE checkout_request_id=$2`,
      [desc, checkoutId]
    );
    console.log(`❌ Payment FAILED | ${desc}`);
  }
}

// ── Query status from Safaricom ───────────────────────────────────────────────
async function queryStatus(checkoutRequestId) {
  const token = await getToken();
  const { password, timestamp } = getPasswordAndTimestamp();

  const res = await axios.post(QUERY_URL, {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 12000,
  });

  return res.data;
}

module.exports = { stkPush, handleCallback, queryStatus };
