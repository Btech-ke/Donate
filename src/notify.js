// src/notify.js — BTECHPLUS Email Notifications
// Uses Brevo (formerly Sendinblue) API — works on Render free tier
// Free plan: 300 emails/day, no SMTP port blocking

async function sendAdminNotification({ subject, body }) {
  if (!process.env.BREVO_API_KEY || !process.env.NOTIFY_EMAIL) {
    console.warn('[notify] BREVO_API_KEY or NOTIFY_EMAIL not set — notifications disabled');
    return;
  }

  try {
    const payload = JSON.stringify({
      sender:     { name: 'BTECHPLUS Alerts', email: process.env.NOTIFY_EMAIL },
      to:         [{ email: process.env.NOTIFY_EMAIL }],
      subject:    `🔔 ${subject}`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;background:#0a0a0f;color:#fff;border-radius:12px;border:1px solid #222;">
          <h2 style="color:#c8f135;margin:0 0 16px;font-size:18px;">🔔 BTECHPLUS Alert</h2>
          <div style="background:#13131f;border-radius:8px;padding:16px;color:#ccc;font-size:14px;line-height:1.7;border-left:3px solid #c8f135;">
            ${body}
          </div>
          <a href="https://btechplus.com/campus-pathway.html"
             style="display:inline-block;margin-top:18px;padding:11px 26px;background:#c8f135;color:#0a0a0f;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
            Open Admin Panel →
          </a>
          <p style="font-size:11px;color:#444;margin-top:14px;">
            ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} · BTECHPLUS
          </p>
        </div>
      `
    });

    const https = require('https');
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.brevo.com',
        path:     '/v3/smtp/email',
        method:   'POST',
        headers: {
          'Content-Type':  'application/json',
          'api-key':       process.env.BREVO_API_KEY,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[notify] ✅ Email sent: ${subject}`);
            resolve();
          } else {
            console.warn(`[notify] ❌ Brevo error ${res.statusCode}: ${data}`);
            resolve();
          }
        });
      });
      req.on('error', (e) => {
        console.warn('[notify] ❌ Email failed:', e.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });

  } catch (e) {
    console.warn('[notify] ❌ Email failed:', e.message);
  }
}

module.exports = { sendAdminNotification };