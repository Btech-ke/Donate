const Anthropic = require('@anthropic-ai/sdk');
const { pool }  = require('./db');

const localAI = require('./localAI');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/* =========================
   SYSTEM PROMPT
========================= */

const SYSTEM = `You are the BTECHPLUS Campus Pathway AI — a trusted Kenyan education advisor helping students after KCSE.

Your expertise includes:
• KUCCPS placement
• University degrees
• KMTC programmes
• TVET options
• HELB loans and scholarships
• Cluster point calculations
• Course comparisons

Guidelines:
• Use simple English
• Be warm and encouraging
• Mix occasional Swahili (karibu, sawa, asante)
• Keep answers under 180 words unless comparison needed
• Always suggest a next step

Never invent institutions or grades.
If unsure, guide the student to KUCCPS portal.

Knowledge is focused on Kenya education system.
`;


/* =========================
   LOCAL KNOWLEDGE BASE
========================= */

const LOCAL_KB = [

/* greetings */

{ keys:['hello','hi','hey','habari','hujambo'],
  ans:'Karibu to BTECHPLUS 🇰🇪. I can help you understand KUCCPS, KMTC courses, TVET programmes, cluster points, HELB loans and more. What would you like to know today?' },


/* KUCCPS */

{ keys:['kuccps','placement','portal'],
  ans:'KUCCPS placement portal is students.kuccps.net. It usually opens May–June after KCSE results. You need KCSE index number and KNEC certificate number. Choose programmes in order of preference before the deadline.' },


/* CLUSTER */

{ keys:['cluster','cluster points','calculate cluster'],
  ans:'Cluster points are calculated using 4 subjects (max 48). Grades: A=12 A−=11 B+=10 B=9 B−=8 C+=7 C=6 C−=5 D+=4 D=3 D−=2 E=1. Universities use cluster points to rank applicants for competitive courses.' },


/* MEDICINE */

{ keys:['doctor','medicine','mbchb'],
  ans:'Medicine (MBChB) requires mean grade A− to A. Key subjects: Biology B+, Chemistry B+, Physics or Maths B+, English B+. Universities offering Medicine include UoN, Moi, Egerton, JKUAT and KMU.' },


/* LAW */

{ keys:['law','llb'],
  ans:'LLB Law typically requires A− to B+. Key subject requirement is English or Kiswahili B plain or above. After graduation students join Kenya School of Law for Advocates Training Programme.' },


/* COMPUTER */

{ keys:['computer','programming','software','ict'],
  ans:'Computer Science requires strong Mathematics (usually C+ or higher). Universities: UoN, JKUAT, Strathmore, Moi, KU. If your grade is lower, TVET Diploma in ICT (requires C−) is a good pathway.' },


/* ENGINEERING */

{ keys:['engineering','civil','electrical','mechanical'],
  ans:'Engineering degrees require B+ mean grade with strong Mathematics and Physics. Cluster subjects: Maths, Physics, Chemistry and English. TVET engineering diplomas are available with C−.' },


/* KMTC NURSING */

{ keys:['nursing','kmtc nursing','nurse'],
  ans:'KMTC Diploma in Community Health Nursing requires C plain. Available in over 30 campuses including Nairobi, Mombasa, Kisumu and Eldoret. Certificate Enrolled Nursing requires C−.' },


/* CLINICAL MEDICINE */

{ keys:['clinical','clinical officer','clinical medicine'],
  ans:'KMTC Diploma in Clinical Medicine & Surgery requires C plain. It is available in over 40 campuses across Kenya. Subjects: Biology C, English/Kiswahili C, Chemistry or Physics C−.' },


/* LAB */

{ keys:['lab','laboratory','medical lab'],
  ans:'KMTC Diploma in Medical Laboratory Sciences requires C plain. It is offered in campuses such as Nairobi, Kisumu, Kakamega, Embu and Nyeri.' },


/* COMMUNITY HEALTH */

{ keys:['community health','health assistant','cha'],
  ans:'Community Health Assistant (KMTC) requires C−. It is one of the most accessible programmes and available in many campuses including Mandera, Garissa and Lodwar.' },


/* TVET */

{ keys:['tvet','artisan','vocational'],
  ans:'TVET programmes: Artisan certificate requires D−. Certificate courses require D plain. Diplomas require C−. Popular areas include Electrical Engineering, ICT, Hospitality, Agriculture and Fashion Design.' },


/* HELB */

{ keys:['helb','loan','bursary'],
  ans:'HELB loans help university and TVET students pay fees. Apply at helb.co.ke after admission. You may also apply for NG-CDF bursaries from your constituency office.' },


/* LOW GRADES */

{ keys:['d plain','d grade','low grade','failed kcse'],
  ans:'Even with a D grade you still have options. You can join TVET certificate programmes in Business, ICT, Agriculture, Hospitality or Fashion Design. These programmes can later progress to diplomas.' },


/* TEACHER */

{ keys:['teacher','ttc','p1'],
  ans:'Primary Teacher Training (P1) requires C plain. Training takes 2 years in public TTC colleges like Kagumo, Kamwenja, Thogoto and Mosoriot.' },

];


/* =========================
   LOCAL FALLBACK ENGINE
========================= */

function localFallback(msg){

  const q = msg.toLowerCase();

  for (const entry of LOCAL_KB){

    if(entry.keys.some(k => q.includes(k))){
      return entry.ans;
    }

  }

  return "Samahani, I couldn't find a direct answer. Please ask about a course, KCSE grade, KMTC programme or KUCCPS placement.";
}



/* =========================
   CHAT ENGINE
========================= */

async function chat(sessionId, userMessage){

  try{

    /* Load last 20 messages for memory */

    const hist = await pool.query(
      `SELECT role, content
       FROM ai_conversations
       WHERE session_id=$1
       ORDER BY created_at DESC
       LIMIT 20`,
      [sessionId]
    );

    const history = hist.rows.reverse().map(r => ({
      role: r.role,
      content: r.content
    }));


    /* Save user message */

    await pool.query(
      `INSERT INTO ai_conversations (session_id, role, content)
       VALUES ($1,'user',$2)`,
      [sessionId, userMessage]
    );


    /* Ask Claude */

    const response = await client.messages.create({

      model: 'claude-sonnet-4-20250514',

      max_tokens: 600,

      system: SYSTEM,

      messages: [
        ...history,
        { role:'user', content:userMessage }
      ]

    });


    const reply = response.content?.[0]?.text || localFallback(userMessage);


    /* Save AI reply */

    await pool.query(
      `INSERT INTO ai_conversations (session_id, role, content)
       VALUES ($1,'assistant',$2)`,
      [sessionId, reply]
    );


    return { reply, source:'claude' };


  } catch(err){

    console.warn('⚠️ Claude unavailable → using local AI');

    const reply = await localAI.ask(userMessage);

    return { reply, source:'local' };

  }

}


/* =========================
   LOAD CHAT HISTORY
========================= */

async function getHistory(sessionId){

  const r = await pool.query(

    `SELECT role, content, created_at
     FROM ai_conversations
     WHERE session_id=$1
     ORDER BY created_at ASC
     LIMIT 50`,

    [sessionId]

  );

  return r.rows;

}


/* =========================
   EXPORTS
========================= */

module.exports = {
  chat,
  getHistory
};