const axios = require('axios');
const { pool } = require('./db');

// Safaricom Production URLs
const AUTH_URL  = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_URL   = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
const QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

async function getToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET not set in environment');

  console.log(`🔑 Getting token | Key starts: ${key.slice(0,8)}... | Secret starts: ${secret.slice(0,6)}...`);

  const cred = Buffer.from(`${key}:${secret}`).toString('base64');

  try {
    const res = await axios.get(AUTH_URL, {
      headers: { Authorization: `Basic ${cred}` },
      timeout: 15000,
    });
    console.log('✅ Token obtained');
    return res.data.access_token;
  } catch (err) {
    console.error('❌ TOKEN ERROR status:', err.response?.status);
    console.error('❌ TOKEN ERROR body:', JSON.stringify(err.response?.data));
    throw new Error(`Safaricom auth failed: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }
}

function getPasswordAndTimestamp() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const ts        = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const raw       = `${shortcode}${passkey}${ts}`;
  const password  = Buffer.from(raw).toString('base64');
  console.log(`🔐 Shortcode: ${shortcode} | Passkey starts: ${passkey?.slice(0,8)}... | TS: ${ts}`);
  return { password, timestamp: ts };
}

function normalisePhone(raw) {
  let p = String(raw).replace(/\D/g, '');
  if (p.startsWith('0'))    p = '254' + p.slice(1);
  if (p.startsWith('+254')) p = p.slice(1);
  return p;
}

async function stkPush(phone, amount) {
  const p = normalisePhone(phone);
  console.log(`📱 Normalised phone: ${p}`);

  if (!/^2547\d{8}$|^2541\d{8}$/.test(p)) {
    throw new Error(`Invalid phone number after normalisation: ${p}`);
  }

  const token = await getToken();
  const { password, timestamp } = getPasswordAndTimestamp();

  const shortcode = process.env.MPESA_SHORTCODE;
  const till      = process.env.MPESA_TILL_NUMBER;
  const callback  = process.env.MPESA_CALLBACK_URL;

  // If till number is set and different from shortcode → BuyGoods (till)
  // If same or not set → PayBill
  const useTill        = till && till !== shortcode;
  const transactionType = useTill ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
  const partyB          = useTill ? till : shortcode;

  console.log(`📋 TransactionType: ${transactionType} | PartyB: ${partyB} | Amount: ${Math.ceil(amount)} | Callback: ${callback}`);

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
    TransactionDesc:   'BTECHPLUS Donation',
  };

  try {
    const res = await axios.post(STK_URL, payload, {
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    });

    const d = res.data;
    console.log('📲 STK response:', JSON.stringify(d));

    if (d.ResponseCode !== '0') {
      throw new Error(d.ResponseDescription || 'STK push rejected');
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
    console.error('❌ STK PUSH ERROR status:', stkErr.response?.status);
    console.error('❌ STK PUSH ERROR body:  ', JSON.stringify(stkErr.response?.data));
    throw stkErr;
  }
}

async function handleCallback(body) {
  const stk = body?.Body?.stkCallback;
  if (!stk) return console.warn('⚠️  Invalid callback body');

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
    timeout: 15000,
  });

  return res.data;
}

module.exports = { stkPush, handleCallback, queryStatus };
