require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { pool }  = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are BTECHPLUS AI — a friendly, expert assistant for Kenyan secondary school students navigating KUCCPS, KMTC, TVET, and university admissions.

You help with:
- KUCCPS cluster points, course requirements, cut-off points
- KMTC and TVET college applications and requirements
- How to apply, deadlines, and required documents
- Understanding the Kenyan education system (KCSE → university/college)
- Career guidance for Kenyan students

Keep responses concise (max 200 words), friendly, and use simple English. Format with bullet points when listing items. Always encourage students.

If asked something outside education/admissions, politely redirect to your area of expertise.`;

const aiKB = [
  { keys:['kuccps','apply university','university application','cluster points'], ans:'KUCCPS (Kenya Universities and Colleges Central Placement Service) handles university admissions. Steps: 1) Get KCSE results. 2) Calculate cluster points for your desired courses. 3) Apply at kuccps.net during the application window. 4) Select up to 6 courses in order of preference. Check deadlines on our Deadlines Ticker above!' },
  { keys:['kmtc','medical training','nursing','clinical officer'], ans:'KMTC (Kenya Medical Training College) offers medical courses: Clinical Medicine, Nursing, Pharmacy, Nutrition, Medical Lab, etc. Requirements: KCSE C+ or better (varies by course). Apply at kmtc.ac.ke or through KUCCPS. Campuses nationwide. Very competitive — apply early!' },
  { keys:['cluster','calculate','points'], ans:'Cluster points are calculated from 4 subjects relevant to your chosen course, divided by 4, then multiplied by 12. For example: If you scored A(12), B+(10), B(9), C+(7) in your cluster subjects → (12+10+9+7)/4 × 12 = 114/4 = 28.5 × 12? No — correct formula: (sum of 4 subject points out of 12 each) / 4. Max is 12.000. Use our Cluster Calculator on this page!' },
  { keys:['grade','c+','c plain','b-','requirement'], ans:'Minimum KCSE grades for popular courses: Medicine C+ overall + B+ in Biology & Chemistry. Nursing C+. Engineering C+ + B in Maths & Physics. Computer Science C+. Teaching C+ (degree) or C- (diploma). Law B+. Always check specific cut-off points at kuccps.net as they change yearly.' },
  { keys:['helb','loan','fee','pay','afford'], ans:'HELB (Higher Education Loans Board) provides loans for university students. Apply at hef.co.ke after getting placement. Loan ranges: KES 35,000–60,000/year. You repay after employment. Also check: NG-CDF bursaries (your MP\'s office), county bursaries (January–March annually), and scholarships from Equity Foundation, KCB, and Mastercard Foundation.' },
  { keys:['tvet','technical','vocational'], ans:'TVET colleges offer practical courses: Electrical, Plumbing, Carpentry, ICT, Fashion Design, Catering, Motor Vehicle, etc. Entry: KCPE or KCSE (any grade). Duration: 6 months – 3 years. Apply directly to TVET institutions or through KUCCPS TVET portal. Government-sponsored slots available — very affordable!' },
  { keys:['deadline','when','date','application window'], ans:'Application deadlines change each year. Check the Application Deadlines section on this page for current KUCCPS, KMTC, HELB, and TVET deadlines. Generally: KUCCPS opens May–June for March intake, and Oct–Nov for September intake. Set reminders — missing deadlines means waiting another cycle!' },
  { keys:['bursary','scholarship','cdf','county fund'], ans:'Bursary options: 1) HELB loan (hef.co.ke). 2) NG-CDF bursaries — your local MP office or ngcdf.go.ke. 3) County bursaries — county offices, usually Jan–March. 4) Equity Wings to Fly, KCB Foundation, Mastercard Foundation scholarships. Apply to as many as possible — they stack!' },
  { keys:['cut off','cutoff','minimum points','minimum grade'], ans:'2024 cluster cut-offs (out of 12.000): Medicine UoN ~42.8pts equiv, Law UoN ~43.6, Engineering ~39.2, Computer Science ~36.4, Nursing ~34.2. Points vary every cycle depending on competition. Your actual cluster score matters most — calculate yours using our Cluster Calculator!' },
  { keys:['support','donate','mpesa','paybill'], ans:'BTECHPLUS is completely free for all Kenyan students. If this tool helped you, support us via M-Pesa Till: 3348765 (Account: BTechPlus). Even KES 50 helps keep this service running. Click "Support Us 💚" at the top of the page. Asante sana!' },
];

function localFallback(message) {
  const q = message.toLowerCase();
  for (const entry of aiKB) {
    if (entry.keys.some(k => q.includes(k))) return entry.ans;
  }
  return 'Samahani, I could not find a specific answer for that. Please ask about courses, cluster points, KUCCPS, KMTC, HELB, or application deadlines. You can also browse the Courses section on this page!';
}

async function chat(sessionId, userMessage) {
  // Try Claude API first
  try {
    const hist = await pool.query(
      `SELECT role, content FROM ai_conversations
       WHERE session_id=$1
       ORDER BY created_at DESC LIMIT 12`,
      [sessionId]
    );

    // Build history — skip admin-injected rows and ensure proper alternation
    const rawHistory = hist.rows.reverse();
    const history = [];
    for (const r of rawHistory) {
      // Map 'admin' role → 'assistant' for the Claude API
      const apiRole = (r.role === 'user') ? 'user' : 'assistant';
      // Skip consecutive same roles (Claude requires strict alternation)
      if (history.length > 0 && history[history.length - 1].role === apiRole) continue;
      history.push({ role: apiRole, content: r.content });
    }

    // Save user message
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

    const reply = response.content[0]?.text || localFallback(userMessage);

    await pool.query(
      `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [sessionId, reply]
    );

    return { reply, source: 'claude' };

  } catch (err) {
    console.error('Claude API error:', err.message);

    // Save user message even on Claude failure
    try {
      await pool.query(
        `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'user', $2)`,
        [sessionId, userMessage]
      );
    } catch (_) {}

    const reply = localFallback(userMessage);

    try {
      await pool.query(
        `INSERT INTO ai_conversations (session_id, role, content) VALUES ($1, 'assistant', $2)`,
        [sessionId, reply]
      );
    } catch (_) {}

    return { reply, source: 'local' };
  }
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
