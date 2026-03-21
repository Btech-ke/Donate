// ═══════════════════════════════════════════════════════════
// ADD THIS TO src/server.js (or a new src/notify.js file)
// Sends you email when someone posts on forum or chats with AI
// Uses Nodemailer with Gmail — FREE, no external service needed
// ═══════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

// Create transporter once
const notifyTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NOTIFY_EMAIL,       // your gmail: btechkenya@gmail.com
    pass: process.env.NOTIFY_APP_PASSWORD  // Gmail App Password (NOT your normal password)
  }
});

async function sendAdminNotification({ subject, body }) {
  try {
    await notifyTransport.sendMail({
      from: `"BTECHPLUS Alerts" <${process.env.NOTIFY_EMAIL}>`,
      to: process.env.NOTIFY_EMAIL,  // sends to yourself
      subject: subject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;padding:20px;background:#0a0a0f;color:#fff;border-radius:12px;">
          <h2 style="color:#c8f135;margin:0 0 16px;">🔔 BTECHPLUS Alert</h2>
          <div style="background:#1a1a2e;border-radius:8px;padding:16px;color:#ccc;font-size:14px;line-height:1.6;">
            ${body}
          </div>
          <a href="https://btechplus.com/campus-pathway.html" 
             style="display:inline-block;margin-top:16px;padding:10px 24px;background:#c8f135;color:#0a0a0f;border-radius:8px;font-weight:700;text-decoration:none;">
            Open Admin Panel →
          </a>
          <p style="font-size:11px;color:#555;margin-top:12px;">${new Date().toLocaleString('en-KE')}</p>
        </div>
      `
    });
  } catch(e) {
    console.warn('[notify] Email failed:', e.message);
  }
}

module.exports = { sendAdminNotification };

// ─── HOW TO USE IN YOUR ROUTES ───────────────────────────
//
// In src/routes/forum.routes.js, after saving the post:
//   const { sendAdminNotification } = require('../notify');
//   sendAdminNotification({
//     subject: '❓ New Forum Question — BTECHPLUS',
//     body: `<strong>${username}</strong> posted:<br><br>"${message}"<br><br>Reply in the admin panel.`
//   });
//
// In src/routes/ai.routes.js, after saving a user chat message:
//   const { sendAdminNotification } = require('../notify');
//   sendAdminNotification({
//     subject: '💬 New AI Chat Message — BTECHPLUS',
//     body: `Session: <code>${sessionId}</code><br><br>Message: "${message}"<br><br>Go to Admin → AI Chats to reply.`
//   });