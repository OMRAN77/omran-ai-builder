// نظام الذاكرة طويلة المدى: يحفظ ملخصًا صغيرًا عن كل مستخدم مسجّل
// (اسمه، مشاريعه، تفضيلاته) في Redis تحت db/memory/<username>.json،
// ويُحقن هذا الملخص في بداية كل محادثة ليتذكر التطبيق المستخدم.
// التحديث يتم عبر نموذج Groq المجاني (llama-3.3-70b) بدمج آخر تبادل في الملخص.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';

const MAX_MEMORY_CHARS = 2800;   // سقف حجم الذاكرة المخزنة (سنة كاملة من المعلومات)
const MIN_UPDATE_GAP_MS = 20 * 1000; // لا نحدّث أكثر من مرة كل 20 ثانية لكل مستخدم

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

function memPath(username) {
  return 'db/memory/' + encodeURIComponent(String(username).toLowerCase()) + '.json';
}

async function readMemory(username) {
  try {
    const data = await kvGetJSON(memPath(username));
    if (!data) return { memory: '', updatedAt: 0, topics: [] };
    return {
      memory: String(data.memory || ''),
      updatedAt: Number(data.updatedAt || 0),
      topics: Array.isArray(data.topics) ? data.topics : [],
    };
  } catch (e) {
    return { memory: '', updatedAt: 0, topics: [] };
  }
}

async function writeMemory(username, memory, topics) {
  const cur = topics === undefined ? await readMemory(username) : null;
  await kvPutJSON(memPath(username), {
    memory,
    updatedAt: Date.now(),
    topics: topics !== undefined ? topics : (cur ? cur.topics : []),
  });
}

// يستدعي نموذجًا لدمج الذاكرة عبر سلسلة احتياطية: Groq → OpenAI → Gemini.
// طالما أي مفتاح واحد يعمل، الذاكرة تُحفظ دائمًا (لا تعتمد على Groq وحده).
async function callMergeModel(sys, user) {
  // ① Groq (llama-3.3-70b) — سريع ومجاني
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_;
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ], temperature: 0.2, max_tokens: 900 }),
      });
      if (res.ok) {
        const d = await res.json();
        const out = (((d.choices || [])[0] || {}).message || {}).content || '';
        if (out.trim()) return out.trim();
      }
    } catch (e) {}
  }
  // ② OpenAI (gpt-4.1-mini) — احتياطي أول
  const oaKey = process.env.OPENAI_API_KEY;
  if (oaKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + oaKey },
        body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ], temperature: 0.2, max_tokens: 900 }),
      });
      if (res.ok) {
        const d = await res.json();
        const out = (((d.choices || [])[0] || {}).message || {}).content || '';
        if (out.trim()) return out.trim();
      }
    } catch (e) {}
  }
  // ③ Gemini (flash) — احتياطي أخير (مفتاح المالك)
  const gKey = process.env.GEMINI_API_KEY;
  if (gKey) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + gKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } }),
      });
      if (res.ok) {
        const d = await res.json();
        const out = ((((d.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
        if (out.trim()) return out.trim();
      }
    } catch (e) {}
  }
  return null;
}

async function mergeWithModel(existing, userText, aiText) {
  const sys =
    'أنت مدير ذاكرة لمساعد ذكي. مهمتك تحديث "ملف ذاكرة المستخدم" بناءً على آخر تبادل في المحادثة.\n' +
    'الأولوية القصوى (لا تُحذف أبدًا مهما ضاق الملف): هوية المستخدم — اسمه، أسماء أفراد عائلته، عمله، مدينته. هذه الأسطر تبقى دائمًا في أول الملف.\n' +
    'ثم المعلومات المفيدة طويلة المدى: لغته المفضلة، مشاريعه وأفكاره، تفضيلاته، اهتماماته، معلومات شخصية ذكرها بنفسه.\n' +
    'ممنوع منعًا باتًا حفظ: أسئلة عابرة، تحيات، تفاصيل تقنية مؤقتة (أرقام إصدارات، أخطاء برمجية، تفاصيل كود، عمليات نشر)، أو أي كلمات سر/مفاتيح. إذا وجدت مثل هذه الأسطر في الملف القديم فاحذفها.\n' +
    'أعد كتابة الملف كاملًا كنقاط قصيرة (سطر لكل معلومة يبدأ بـ "- ")، وادمج الجديد مع القديم بدون تكرار. إذا لم يوجد جديد مفيد، أعد الملف القديم كما هو.\n' +
    'الحد الأقصى ' + MAX_MEMORY_CHARS + ' حرفًا — إذا زاد، احذف الأقل أهمية والأقدم.\n' +
    'أجب بمحتوى الملف فقط بدون أي مقدمة أو شرح. إذا كان الملف فارغًا ولا يوجد جديد مفيد، أجب بكلمة: EMPTY';
  const user =
    'ملف الذاكرة الحالي:\n' + (existing || '(فارغ)') +
    '\n\nآخر رسالة من المستخدم:\n' + String(userText || '').slice(0, 1500) +
    '\n\nملخص رد المساعد:\n' + String(aiText || '').slice(0, 800);
  let out = await callMergeModel(sys, user);
  if (out === null) return null;      // كل النماذج غير متاحة
  out = out.trim();
  if (!out || out === 'EMPTY') return '';
  return out.slice(0, MAX_MEMORY_CHARS);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, op } = body;
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: 'auth_required' }); return; }

    if (op === 'get') {
      const cur = await readMemory(username);
      res.status(200).json({ memory: cur.memory, topics: cur.topics });
      return;
    }

    if (op === 'clear') {
      await writeMemory(username, '', []);
      res.status(200).json({ ok: true, memory: '' });
      return;
    }

    if (op === 'topic') {
      // 🗂️ v326 ذاكرة المواضيع: ملخص سطرين عن كل محادثة (بدون نموذج — رخيص).
      // upsert بمعرّف المحادثة، ونحتفظ بآخر 10 مواضيع فقط.
      const id = String(body.id || '').slice(0, 40);
      const title = String(body.title || '').trim().slice(0, 80);
      const snip = String(body.snip || '').trim().slice(0, 220);
      if (!id || (!title && !snip)) { res.status(400).json({ error: 'empty topic' }); return; }
      const cur = await readMemory(username);
      const topics = (cur.topics || []).filter(t => t && t.id !== id);
      topics.unshift({ id, title, snip, at: Date.now() });
      const trimmed = topics.slice(0, 10);
      await writeMemory(username, cur.memory, trimmed);
      res.status(200).json({ ok: true, topics: trimmed });
      return;
    }

    if (op === 'append') {
      // إضافة مباشرة من مها (أداة remember_info): بدون نموذج وبدون خانق
      const fact = String(body.fact || '').trim().slice(0, 200);
      if (!fact) { res.status(400).json({ error: 'empty fact' }); return; }
      const cur = await readMemory(username);
      let mem = cur.memory || '';
      if (mem.includes(fact)) { res.status(200).json({ ok: true, memory: mem }); return; }
      // معلومات الهوية (اسم/عائلة) تدخل أول الملف ولا تُحذف أبدًا
      const isIdentity = /اسم|يدعى|اسمي|زوجت|ولد|بنت|ابن|أبنا|عائل|أسرت|name is|my name|wife|son|daughter/i.test(fact);
      if (isIdentity) mem = '- ' + fact + (mem ? '\n' + mem : '');
      else mem = (mem ? mem + '\n' : '') + '- ' + fact;
      if (mem.length > MAX_MEMORY_CHARS) {
        // احذف أقدم الأسطر غير المتعلقة بالهوية حتى يدخل الجديد
        const idRe = /اسم|يدعى|اسمي|زوجت|ولد|بنت|ابن|أبنا|عائل|أسرت|name is|my name|wife|son|daughter/i;
        const lines = mem.split('\n');
        while (lines.join('\n').length > MAX_MEMORY_CHARS && lines.length > 1) {
          const idx = lines.findIndex(l => !idRe.test(l));
          if (idx === -1) { lines.pop(); } else { lines.splice(idx, 1); }
        }
        mem = lines.join('\n');
      }
      await writeMemory(username, mem);
      res.status(200).json({ ok: true, memory: mem });
      return;
    }

    if (op === 'update') {
      const cur = await readMemory(username);
      // خانق بسيط: لا نستدعي النموذج أكثر من مرة كل 45 ثانية لكل مستخدم
      if (cur.updatedAt && Date.now() - cur.updatedAt < MIN_UPDATE_GAP_MS) {
        res.status(200).json({ ok: true, skipped: 'throttled', memory: cur.memory });
        return;
      }
      const merged = await mergeWithModel(cur.memory, body.userText, body.aiText);
      if (merged === null) {
        res.status(200).json({ ok: false, skipped: 'model_unavailable', memory: cur.memory });
        return;
      }
      if (merged !== cur.memory) await writeMemory(username, merged);
      res.status(200).json({ ok: true, memory: merged });
      return;
    }

    res.status(400).json({ error: 'unknown op' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
