const Anthropic = require('@anthropic-ai/sdk');
const { pool }  = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the BTECHPLUS Campus Pathway AI — a friendly, expert guide helping Kenyan students navigate their education journey after KCSE.

You have deep knowledge of:
- KUCCPS portal process (students.kuccps.net), how to apply, deadlines
- All 20 degree programme clusters (1A–20A) and their subject requirements
- KMTC: all 34 diploma and certificate programmes (K01–K34), their grade requirements, subject requirements, and campuses
- TVET: Artisan (D-), Certificate (D), Diploma (C-) programmes across all categories
- Primary Teacher Training Colleges (21 PTTCs in Kenya)
- HELB loans, county bursaries, NG-CDF, Equity Wings to Fly, KCB Foundation, Mastercard Foundation
- Cluster point calculation (4 subjects × max 12 = 48 total), grade values (A=12, A−=11, B+=10...)
- 2024 university cut-off points for major programmes
- University options: UoN, JKUAT, Moi, KU, Egerton, Maseno, MMUST, Strathmore, USIU, MKU, Kabarak

Key facts:
- KMTC Clinical Medicine (K32): Mean C, 44 campuses, most accessible KMTC diploma
- KMTC Community Health Nursing (K04): Mean C, 30 campuses
- KMTC Community Health Assistant (K28): Mean C−, 46 campuses — most accessible
- KMTC Nutrition Diploma (K02): Mean C−, 7 campuses
- TVET Diplomas: require C− minimum, no specific subject requirements for most
- TVET Certificates: D plain minimum
- TVET Artisan: D− and below

Always:
- Be warm, encouraging and use simple language
- Give specific campuses, grade requirements and links where relevant
- Use Kenya-specific context (mention M-Pesa, matatus, KCSE, etc. naturally)
- Keep answers focused and under 200 words unless a detailed comparison is needed
- End with a helpful follow-up question or next step
- Mix English with occasional Swahili greetings/affirmations naturally

Never make up grades, cut-offs or institutions. If unsure, say so and direct to official sources.`;

// ── Main AI chat function ─────────────────────────────────────────────────────
async function chat(sessionId, userMessage) {
  // Load last 10 messages from DB for context
  const histResult = await pool.query(
    `SELECT role, content FROM ai_conversations
     WHERE session_id=$1 ORDER BY created_at DESC LIMIT 10`,
    [sessionId]
  );
  const history = histResult.rows.reverse().map(r => ({
    role: r.role,
    content: r.content,
  }));

  // Save user message
  await pool.query(
    `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, userMessage]
  );

  // Build messages for Claude
  const messages = [...history, { role: 'user', content: userMessage }];

  const response = await client.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 600,
    system:     SYSTEM_PROMPT,
    messages,
  });

  const reply = response.content[0]?.text || 'Sorry, I could not generate a response.';

  // Save assistant reply
  await pool.query(
    `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'assistant', $2)`,
    [sessionId, reply]
  );

  return reply;
}

// ── Get conversation history ──────────────────────────────────────────────────
async function getHistory(sessionId) {
  const result = await pool.query(
    `SELECT role, content, created_at FROM ai_conversations
     WHERE session_id=$1 ORDER BY created_at ASC LIMIT 50`,
    [sessionId]
  );
  return result.rows;
}

module.exports = { chat, getHistory };
