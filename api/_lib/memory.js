// نظام الذاكرة طويلة المدى: يحفظ ملخصًا صغيرًا عن كل مستخدم مسجّل
// (اسمه، مشاريعه، تفضيلاته) في Blob تحت db/memory/<username>.json،
// ويُحقن هذا الملخص في بداية كل محادثة ليتذكر التطبيق المستخدم.
// التحديث يتم عبر نموذج Groq المجاني (llama-3.3-70b) بدمج آخر تبادل في الملخص.
const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

const MAX_MEMORY_CHARS = 1200;   // سقف حجم الذاكرة المخزنة
const MIN_UPDATE_GAP_MS = 45 * 1000; // لا نحدّث أكثر من مرة كل 45 ثانية لكل مستخدم

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
    const res = await fetch(PUBLIC_BASE + memPath(username) + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return { memory: '', updatedAt: 0 };
    const data = await res.json();
    return { memory: String(data.memory || ''), updatedAt: Number(data.updatedAt || 0) };
  } catch (e) {
    return { memory: '', updatedAt: 0 };
  }
}

async function writeMemory(username, memory) {
  await fetch(BLOB_BASE + '/' + memPath(username), {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + BLOB_TOKEN,
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
    },
    body: JSON.stringify({ memory, updatedAt: Date.now() }),
  });
}

async function mergeWithModel(existing, userText, aiText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const sys =
    'أنت مدير ذاكرة لمساعد ذكي. مهمتك تحديث "ملف ذاكرة المستخدم" بناءً على آخر تبادل في المحادثة.\n' +
    'احتفظ فقط بالمعلومات المفيدة طويلة المدى: اسم المستخدم، لغته المفضلة، مشاريعه وأفكاره، تفضيلاته في التصميم والأسلوب، اهتماماته، معلومات شخصية ذكرها بنفسه.\n' +
    'لا تحفظ: أسئلة عابرة، تحيات، تفاصيل تقنية مؤقتة، أو أي كلمات سر/مفاتيح.\n' +
    'أعد كتابة الملف كاملًا كنقاط قصيرة (سطر لكل معلومة يبدأ بـ "- ")، وادمج الجديد مع القديم بدون تكرار. إذا لم يوجد جديد مفيد، أعد الملف القديم كما هو.\n' +
    'الحد الأقصى ' + MAX_MEMORY_CHARS + ' حرفًا — إذا زاد، احذف الأقل أهمية والأقدم.\n' +
    'أجب بمحتوى الملف فقط بدون أي مقدمة أو شرح. إذا كان الملف فارغًا ولا يوجد جديد مفيد، أجب بكلمة: EMPTY';
  const user =
    'ملف الذاكرة الحالي:\n' + (existing || '(فارغ)') +
    '\n\nآخر رسالة من المستخدم:\n' + String(userText || '').slice(0, 1500) +
    '\n\nملخص رد المساعد:\n' + String(aiText || '').slice(0, 800);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ],
        temperature: 0.2,
        max_tokens: 700,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let out = (((data.choices || [])[0] || {}).message || {}).content || '';
    out = out.trim();
    if (!out || out === 'EMPTY') return '';
    return out.slice(0, MAX_MEMORY_CHARS);
  } catch (e) {
    return null;
  }
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
      res.status(200).json({ memory: cur.memory });
      return;
    }

    if (op === 'clear') {
      await writeMemory(username, '');
      res.status(200).json({ ok: true, memory: '' });
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
