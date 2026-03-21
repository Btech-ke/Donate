// src/notify.js — BTECHPLUS Email Notifications
// Uses nodemailer with Gmail App Password
// Run first: npm install nodemailer

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.NOTIFY_EMAIL || !process.env.NOTIFY_APP_PASSWORD) {
    console.warn('[notify] NOTIFY_EMAIL or NOTIFY_APP_PASSWORD not set — notifications disabled');
    return null;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFY_EMAIL,
      pass: process.env.NOTIFY_APP_PASSWORD
    }
  });
  return transporter;
}

async function sendAdminNotification({ subject, body }) {
  const t = getTransporter();
  if (!t) return; // silently skip if not configured
  try {
    await t.sendMail({
      from: `"BTECHPLUS Alerts" <${process.env.NOTIFY_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `🔔 ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;background:#0a0a0f;color:#fff;border-radius:12px;border:1px solid #222;">
          <h2 style="color:#c8f135;margin:0 0 16px;font-size:18px;">🔔 BTECHPLUS Alert</h2>
          <div style="background:#13131f;border-radius:8px;padding:16px;color:#ccc;font-size:14px;line-height:1.7;border-left:3px solid #c8f135;">
            ${body}
          </div>
          <a href="https://btechplus.com/campus-pathway.html#adminPanel"
             style="display:inline-block;margin-top:18px;padding:11px 26px;background:#c8f135;color:#0a0a0f;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
            Open Admin Panel →
          </a>
          <p style="font-size:11px;color:#444;margin-top:14px;">${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} · BTECHPLUS</p>
        </div>
      `
    });
    console.log(`[notify] ✅ Email sent: ${subject}`);
  } catch (e) {
    console.warn('[notify] ❌ Email failed:', e.message);
  }
}

module.exports = { sendAdminNotification };