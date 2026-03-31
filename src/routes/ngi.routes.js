const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');

// 1. Safely Initialize Firebase Admin (Only for NGI)
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 NGI Firebase Bridge Initialized!");
  } catch (error) {
    console.error("❌ NGI Firebase Error: ", error.message);
  }
}
const db = admin.apps.length ? admin.firestore() : null;

// 2. Safaricom Auth Helper (Isolated from BTECHPLUS)
async function getSafaricomToken() {
  const key = (process.env.MPESA_CONSUMER_KEY || '').trim();
  const secret = (process.env.MPESA_CONSUMER_SECRET || '').trim();
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  
  // Using production URL based on your mpesa.js logic
  const res = await axios.get('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 10000
  });
  return res.data.access_token;
}

// 3. THE NGI STK PUSH ROUTE
router.post('/stkpush', async (req, res) => {
  try {
    if (!db) throw new Error("Firebase not connected");

    const { phone, amount, uid, ngiId, type } = req.body; // <-- Added type
    
    // Normalise phone to 254...
    let p = String(phone).replace(/\D/g, '');
    if (p.startsWith('0')) p = '254' + p.slice(1);
    if (p.startsWith('+254')) p = p.slice(1);

    const token = await getSafaricomToken();
    const shortcode = (process.env.MPESA_SHORTCODE || '').trim();
    const passkey = (process.env.MPESA_PASSKEY || '').trim();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    // ⚠️ THE ISOLATED NGI CALLBACK URL
    const callbackUrl = 'https://donate-erxu.onrender.com/api/ngi/callback';

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline', // Using BuyGoods based on your till
      Amount: Math.ceil(amount),
      PartyA: p,
      PartyB: (process.env.MPESA_TILL_NUMBER || '').trim() || shortcode,
      PhoneNumber: p,
      CallBackURL: callbackUrl,
      AccountReference: 'NGI App',
      TransactionDesc: 'Wallet Deposit'
    };

    const stkRes = await axios.post('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const checkoutId = stkRes.data.CheckoutRequestID;

    // Save the pending transaction to FIREBASE (Using checkoutId as the document ID!)
    await db.collection("wallet_transactions").doc(checkoutId).set({
      id: checkoutId,
      uid: uid,
      ngiId: ngiId,
      type: "Deposit",
      amount: Math.ceil(amount),
      status: "Pending",
      timestamp: Date.now()
    });

    res.json({ success: true, message: 'STK Push sent successfully!' });

  } catch (err) {
    console.error("NGI STK Error:", err?.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Payment gateway error' });
  }
});

// 4. THE NGI CALLBACK ROUTE
router.post('/callback', async (req, res) => {
  console.log('--- NGI APP M-PESA CALLBACK RECEIVED ---');
  
  // Always tell Safaricom we received it immediately
  res.json({ ResultCode: 0, ResultDesc: "Success" });

  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk || !db) return;

    const checkoutId = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;

    if (resultCode === 0) {
      // Payment Success!
      const items = stk.CallbackMetadata?.Item || [];
      let mpesaReceipt = "";
      items.forEach(item => {
        if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = item.Value;
      });

      // Find the pending transaction in Firebase
      const txRef = db.collection("wallet_transactions").doc(checkoutId);
      const txDoc = await txRef.get();

      if (txDoc.exists) {
        const txData = txDoc.data();
        const uid = txData.uid;
        const amount = txData.amount;

        // 1. Mark transaction as completed
        await txRef.update({
          status: "Completed",
          mpesaRef: mpesaReceipt,
          description: "M-Pesa Wallet Deposit",
          updatedAt: Date.now()
        });

        // 2. Add the money to the user's NGI wallet
        const userRef = db.collection("users").doc(uid);
        await userRef.update({
          walletBalance: admin.firestore.FieldValue.increment(amount)
        });

        console.log(`✅ NGI Wallet Credited! KES ${amount} added for UID: ${uid}`);
      }
    } else {
      // Payment Failed/Cancelled
      await db.collection("wallet_transactions").doc(checkoutId).update({
        status: "Failed",
        description: stk.ResultDesc,
        updatedAt: Date.now()
      });
      console.log(`❌ NGI Payment Failed: ${stk.ResultDesc}`);
    }
  } catch (err) {
    console.error("NGI Callback Error:", err);
  }
});

module.exports = router;