const Anthropic = require('@anthropic-ai/sdk');
const { pool }  = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are the BTECHPLUS Campus Pathway AI — a warm, expert guide helping Kenyan students navigate education after KCSE.

DEEP KNOWLEDGE BASE:
- KUCCPS process: students.kuccps.net, opens May–June yearly, needs KCSE index + KNEC cert number
- 20 degree clusters (1A–20A) with specific subject requirements
- All KMTC programmes K01–K34 with grade cutoffs and campus locations
- TVET: Artisan (D-/below), Certificate (D), Diploma (C-) — all categories
- 21 PTTCs (Primary Teacher Training Colleges)
- HELB loans, NG-CDF bursaries, county bursaries, Equity Wings to Fly, KCB Foundation, Mastercard Foundation
- Cluster formula: 4 subjects × max 12 pts = 48 total. A=12,A−=11,B+=10,B=9,B−=8,C+=7,C=6,C−=5,D+=4,D=3,D−=2
- 2024 cut-offs: MBChB UoN 42.8, Law UoN 43.6, Engineering(Civil) UoN 39.2, CompSci UoN 36.4

KEY KMTC FACTS:
- K04 Community Health Nursing: C plain, 30 campuses
- K32 Clinical Medicine & Surgery: C plain, 44 campuses (most widely available)
- K28 Community Health Assistant: C−, 46 campuses (most accessible of all)
- K08 Medical Lab Sciences: C plain, 12 campuses
- K02 Nutrition Diploma: C−, 7 campuses
- K15 Public Health Diploma: C plain, 9 campuses

STYLE: Warm, encouraging, Kenya-specific. Use simple English. Mix occasional Swahili (asante, karibu, sawa). Under 200 words unless comparison needed. Always end with a clear next step or offer to help further. Never invent grades or institutions.`;

async function chat(sessionId, userMessage) {
  // Load last 8 messages for context
  const hist = await pool.query(
    `SELECT role, content FROM ai_conversations
     WHERE session_id=$1 ORDER BY created_at DESC LIMIT 8`,
    [sessionId]
  );
  const history = hist.rows.reverse().map(r => ({ role: r.role, content: r.content }));

  // Save user turn
  await pool.query(
    `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'user', $2)`,
    [sessionId, userMessage]
  );

  const response = await client.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 600,
    system:     SYSTEM,
    messages:   [...history, { role: 'user', content: userMessage }],
  });

  const reply = response.content[0]?.text || 'Samahani, try again!';

  // Save assistant turn
  await pool.query(
    `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'assistant', $2)`,
    [sessionId, reply]
  );

  return reply;
}

async function getHistory(sessionId) {
  const r = await pool.query(
    `SELECT role, content, created_at FROM ai_conversations
     WHERE session_id=$1 ORDER BY created_at ASC LIMIT 50`,
    [sessionId]
  );
  return r.rows;
}

module.exports = { chat, getHistory };
