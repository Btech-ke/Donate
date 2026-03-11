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

// Local fallback KB — used when Anthropic credits run out
const LOCAL_KB = [
  { keys:['hello','hi','hey','hujambo','habari'], ans:'Karibu! Welcome to BTECHPLUS 🇰🇪. I can help with KCSE course placement, cluster points, KUCCPS, KMTC, TVET, HELB loans, and more. What would you like to know?' },
  { keys:['medicine','mbchb','doctor'], ans:'MBChB requires mean grade A− to A. Cluster 13A: BIO B, CHE B, PHY/MAT B, ENG B. Universities: UoN, Moi, JKUAT, Egerton, Kabarak. Cut-off ~42.8/48 at UoN. Apply via KUCCPS.' },
  { keys:['nursing','nurse','kmtc nurs'], ans:'KMTC Diploma Nursing (K04) requires C plain. Available at 30 campuses: Nairobi, Mombasa, Kisumu, Nakuru, Eldoret and more. Certificate Enrolled Nursing (K23) requires C−. Apply via KUCCPS or kmtc.ac.ke.' },
  { keys:['clinical','clinical officer','clinical medicine'], ans:'KMTC Clinical Medicine & Surgery (K32) requires C plain. Available at 44 campuses — the most widely available KMTC programme. Subjects: ENG/KIS C, BIO C, CHE/PSC C−, PHY/MAT A C−.' },
  { keys:['pharmacy'], ans:'KMTC Diploma Pharmacy (K12) requires C plain. Available at: Kisumu, Manza, Mombasa, Nairobi, Nakuru, Nyeri. University B.Pharmacy requires A− or above.' },
  { keys:['lab','laboratory','medical lab'], ans:'KMTC Medical Laboratory Sciences (K08) requires C plain. Available at 12 campuses: Embu, Kakamega, Kisii, Kitui, Machakos, Meru, Nairobi, Nakuru, Nyeri and more.' },
  { keys:['community health','cha'], ans:'KMTC Community Health Assistant (K28) requires C− only. Available at 46 campuses — the most accessible programme including Mandera, Garissa, Lodwar, Tana River.' },
  { keys:['cluster','cluster points','calculate'], ans:'Cluster = sum of 4 subject grades (max 48). Grades: A=12, A−=11, B+=10, B=9, B−=8, C+=7, C=6, C−=5, D+=4, D=3, D−=2, E=1. Use the Cluster Calculator on this page!' },
  { keys:['kuccps','portal','apply','placement'], ans:'KUCCPS portal (students.kuccps.net) opens May–June after KCSE results. You need your KCSE index number + KNEC certificate number. Select programmes in order of preference. Apply within 2 weeks of portal opening.' },
  { keys:['helb','loan','bursary','scholarship'], ans:'Apply for HELB loan at helb.co.ke after admission. Also check: NG-CDF bursaries (your MP office), county bursaries (January–March), Equity Wings to Fly, KCB Foundation, Mastercard Foundation.' },
  { keys:['tvet','vocational','artisan'], ans:'TVET: Artisan certificate requires D− or below. Certificate requires D plain. Diploma requires C−. No specific subject requirements for most TVET courses. Apply via KUCCPS TVET portal.' },
  { keys:['kmtc'], ans:'KMTC has 40+ campuses Kenya-wide. Requirements range from C− to C plain depending on programme. Popular courses: Clinical Medicine (K32), Nursing (K04), Lab Sciences (K08), Community Health (K28). Apply via KUCCPS or kmtc.ac.ke.' },
  { keys:['engineering','electrical','mechanical','civil'], ans:'Engineering degrees require B+ or above. Cluster 5A: MAT A C+, PHY C+, CHE C+, ENG C+. Universities: UoN, JKUAT, TUK, Moi, Dedan Kimathi. TVET Engineering Diplomas only require C−.' },
  { keys:['computer','ict','software','programming'], ans:'BSc Computer Science (Cluster 7A): MAT A C+, PHY C+, ENG C. Available at UoN, JKUAT, Strathmore, Moi, KU, USIU. BSc IT (Cluster 7C): MAT A C plain. TVET Diploma ICT available from C−.' },
  { keys:['law','llb'], ans:'LLB requires A− to B+ depending on university. Cluster 1: ENG/KIS B plain. Universities: UoN, Moi, KU, MKU, Kabarak, Catholic, USIU. After graduation: Kenya School of Law (Advocates Training Programme).' },
  { keys:['d plain','d grade','low grade','failed'], ans:'With D plain: TVET Certificate programmes available in Business, Computing, Tourism, Agriculture, Clothing & Textile — 2-year programmes. With D−: Artisan certificates (1 year) in electrical, plumbing, carpentry, motor vehicle.' },
  { keys:['c minus','c-','certificate programme'], ans:'With C−: KMTC Certificate programmes (K22–K34), TVET Diplomas in Business/Engineering/Computing/Tourism, and some private university degrees. Many great options!' },
  { keys:['teacher','ttc','p1','primary teacher'], ans:'Primary Teacher Training (P1) requires C plain. 21 public PTTCs including Highridge, Kagumo, Kamwenja, Thogoto, Mosoriot, Tambach. 2-year programme. B.Ed Secondary requires B− or above.' },
  { keys:['cut off','cutoff','minimum','required points'], ans:'2024 KUCCPS cut-offs (out of 48): MBChB UoN 42.8, Law UoN 43.6, Civil Engineering UoN 39.2, CompSci UoN 36.4, Nursing UoN 34.2, Pharmacy UoN 38.4, Economics UoN 36.2. Points vary each year.' },
];

function localFallback(msg) {
  const q = msg.toLowerCase();
  for (const entry of LOCAL_KB) {
    if (entry.keys.some(k => q.includes(k))) return entry.ans;
  }
  return 'Samahani, I could not find a specific answer for that. Please try asking about a specific course, grade, or application process. You can also browse the Courses section on this page for detailed information!';
}

async function chat(sessionId, userMessage) {
  // Try Claude API first
  try {
    const hist = await pool.query(
      `SELECT role, content FROM ai_conversations WHERE session_id=$1 ORDER BY created_at DESC LIMIT 8`,
      [sessionId]
    );
    const history = hist.rows.reverse().map(r => ({ role: r.role, content: r.content }));

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
    // API credits exhausted or any other error — use local KB
    const isCreditsError = err.status === 400 && err.message?.includes('credit');
    console.warn(isCreditsError
      ? '⚠️  Anthropic credits exhausted — using local KB fallback'
      : '⚠️  Claude API error — using local KB fallback: ' + err.message
    );
    const reply = localFallback(userMessage);
    return { reply, source: 'local' };
  }
}

async function getHistory(sessionId) {
  const r = await pool.query(
    `SELECT role, content, created_at FROM ai_conversations WHERE session_id=$1 ORDER BY created_at ASC LIMIT 50`,
    [sessionId]
  );
  return r.rows;
}

module.exports = { chat, getHistory };
