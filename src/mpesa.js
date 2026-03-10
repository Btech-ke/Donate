const axios = require('axios');
const { pool } = require('./db');

// ── URLs: switch between sandbox and production ───────────────────────────────
const isProd = (process.env.MPESA_ENV || 'production') === 'production';
const BASE   = isProd
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const AUTH_URL  = `${BASE}/oauth/v1/generate?grant_type=client_credentials`;
const STK_URL   = `${BASE}/mpesa/stkpush/v1/processrequest`;
const QUERY_URL = `${BASE}/mpesa/stkpushquery/v1/query`;

console.log(`🌍 M-Pesa environment: ${isProd ? 'PRODUCTION' : 'SANDBOX'}`);
console.log(`🔗 Auth URL: ${AUTH_URL}`);

async function getToken() {
  const key    = (process.env.MPESA_CONSUMER_KEY    || '').trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || '').trim();

  if (!key)    throw new Error('MPESA_CONSUMER_KEY is not set');
  if (!secret) throw new Error('MPESA_CONSUMER_SECRET is not set');

  console.log(`🔑 Auth attempt | Key[0..8]: ${key.slice(0,8)} | Secret[0..6]: ${secret.slice(0,6)} | Lengths: ${key.length}/${secret.length}`);

  // Build Basic Auth — must be key:secret base64 encoded
  const cred = Buffer.from(`${key}:${secret}`).toString('base64');
  console.log(`🔑 Basic Auth header (first 20): ${cred.slice(0,20)}...`);

  try {
    const res = await axios.get(AUTH_URL, {
      headers: {
        'Authorization': `Basic ${cred}`,
        'Content-Type':  'application/json',
      },
      timeout: 15000,
    });
    console.log('✅ Token obtained successfully');
    return res.data.access_token;
  } catch (err) {
    const status  = err.response?.status;
    const body    = err.response?.data;
    const headers = err.response?.headers;
    console.error('❌ TOKEN FAIL status :', status);
    console.error('❌ TOKEN FAIL body   :', JSON.stringify(body));
    console.error('❌ TOKEN FAIL headers:', JSON.stringify(headers));
    throw new Error(`Safaricom auth failed (${status}): ${JSON.stringify(body) || err.message}`);
  }
}

function getPasswordAndTimestamp() {
  const shortcode = (process.env.MPESA_SHORTCODE || '').trim();
  const passkey   = (process.env.MPESA_PASSKEY   || '').trim();

  if (!shortcode) throw new Error('MPESA_SHORTCODE is not set');
  if (!passkey)   throw new Error('MPESA_PASSKEY is not set');

  const ts  = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw = `${shortcode}${passkey}${ts}`;
  console.log(`🔐 Password build | Shortcode: ${shortcode} | Passkey[0..8]: ${passkey.slice(0,8)} | TS: ${ts}`);
  return { password: Buffer.from(raw).toString('base64'), timestamp: ts };
}

function normalisePhone(raw) {
  let p = String(raw).replace(/\D/g, '');
  if (p.startsWith('0'))    p = '254' + p.slice(1);
  if (p.startsWith('+254')) p = p.slice(1);
  return p;
}

async function stkPush(phone, amount) {
  const p = normalisePhone(phone);
  console.log(`📱 Phone raw: ${phone} → normalised: ${p}`);

  if (!/^2547\d{8}$|^2541\d{8}$/.test(p)) {
    throw new Error(`Invalid phone after normalisation: ${p}`);
  }

  const token = await getToken();
  const { password, timestamp } = getPasswordAndTimestamp();

  const shortcode = (process.env.MPESA_SHORTCODE   || '').trim();
  const till      = (process.env.MPESA_TILL_NUMBER  || '').trim();
  const callback  = (process.env.MPESA_CALLBACK_URL || '').trim();

  if (!callback) throw new Error('MPESA_CALLBACK_URL is not set');

  // CustomerBuyGoodsOnline  → use Till Number as PartyB
  // CustomerPayBillOnline   → use Paybill (shortcode) as PartyB, need AccountReference
  const useTill         = !!till && till !== shortcode;
  const transactionType = useTill ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
  const partyB          = useTill ? till : shortcode;

  console.log(`📋 STK payload | Type: ${transactionType} | Shortcode: ${shortcode} | PartyB: ${partyB} | Amount: ${Math.ceil(amount)} | Callback: ${callback}`);

  const payload = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   transactionType,
    Amount:            Math.ceil(Number(amount)),
    PartyA:            p,
    PartyB:            partyB,
    PhoneNumber:       p,
    CallBackURL:       callback,
    AccountReference:  'BTECHPLUS',
    TransactionDesc:   'BTECHPLUS Support',
  };

  try {
    const res = await axios.post(STK_URL, payload, {
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/json',
      },
      timeout: 30000,
    });

    const d = res.data;
    console.log('📲 STK Response:', JSON.stringify(d));

    if (d.ResponseCode !== '0') {
      throw new Error(d.ResponseDescription || `STK rejected: ${JSON.stringify(d)}`);
    }

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

  } catch (stkErr) {
    console.error('❌ STK PUSH FAIL status :', stkErr.response?.status);
    console.error('❌ STK PUSH FAIL body   :', JSON.stringify(stkErr.response?.data));
    console.error('❌ STK PUSH FAIL message:', stkErr.message);
    throw stkErr;
  }
}

async function handleCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return console.warn('⚠️  Invalid callback body:', JSON.stringify(body));

  const checkoutId = stk.CheckoutRequestID;
  const code       = stk.ResultCode;
  const desc       = stk.ResultDesc;

  if (code === 0) {
    const items   = stk.CallbackMetadata?.Item || [];
    const get     = (name) => items.find(i => i.Name === name)?.Value ?? null;
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
    console.log(`✅ PAYMENT SUCCESS | Receipt: ${receipt} | KES ${amount} | ${phone}`);
  } else {
    await pool.query(
      `UPDATE donations SET status='FAILED', result_desc=$1, updated_at=NOW()
       WHERE checkout_request_id=$2`,
      [desc, checkoutId]
    );
    console.log(`❌ PAYMENT FAILED | Code: ${code} | ${desc}`);
  }
}

async function queryStatus(checkoutRequestId) {
  const token = await getToken();
  const { password, timestamp } = getPasswordAndTimestamp();

  const res = await axios.post(QUERY_URL, {
    BusinessShortCode: (process.env.MPESA_SHORTCODE || '').trim(),
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  return res.data;
}

module.exports = { stkPush, handleCallback, queryStatus };
