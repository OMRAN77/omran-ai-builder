// رأيك يهمنا — user feedback storage (Upstash Redis)
// POST { rating, chips, note, lang, token? } -> saved (capped list) — الاسم من الجلسة الموقّعة لا من الجسم
// GET ?key=MONITOR_KEY أو ?token=<جلسة المالك> -> { feedback: [...] } (owner only)
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const LOG_PATH = 'db/feedback/list.json';
const REPORTS_PATH = 'db/reports/list.json';
const MAX_ITEMS = 200;
const { isOwner } = require('./_owner.js');
const { logError } = require('./log-error.js');
const { sessionUser, tokenOf } = require('./_session.js');

/* v-sec-feedback: تدقيق ١٠ أكتوبر — POST بلا دخول كان يخزّن `user` و`chips` كما أرسلها أيّ زائر، ولوحة المالك
   («آراء المستخدمين») ترسمها HTML، فجرى سكربت في متصفّح المالك من ثلاث طلبات بلا حساب (المسبار: fb=1 ch=1).
   الاسم الآن من رمز جلسة موقَّع وحده (الجسم/‎?token=‎/Bearer، ثمّ كوكي aiapp_auth_token الذي يرسله المتصفّح
   تلقائيًّا لمن اختار «تذكّرني») وإلّا ‹guest› — `body.user` لا يُصدَّق أبدًا. والشرائح من القائمة المعروفة وحدها.
   والعرض في العميل يهرّب كلّ حقل أيضًا (السجلّات القديمة المخزّنة قبل الإصلاح). */
const FB_CHIPS = ['fbChipEasy', 'fbChipDesign', 'fbChipAI', 'fbChipSlow', 'fbChipBug']; // = fbChipKeys في app-05-ui.js

function cookieToken(req) {
  const m = String((req && req.headers && req.headers.cookie) || '').match(/(?:^|;\s*)aiapp_auth_token=([^;]*)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return ''; } // كوكي مشوّه = لا جلسة
}

/** صاحب الطلب من رمز جلسة صالح فقط، وإلّا ‹guest›. */
function verifiedUser(req, body) {
  const tok = body && body.token ? String(body.token) : tokenOf(req);
  const u = sessionUser(tok) || sessionUser(cookieToken(req));
  return u ? u.slice(0, 40) : 'guest';
}

async function readList() {
  try {
    const items = await kvGetJSON(LOG_PATH);
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    const items = await readList();
    let reports = [];
    try { const r = await kvGetJSON(REPORTS_PATH); if (Array.isArray(r)) reports = r; } catch (e) { logError('feedback/kv-read', e); }
    res.status(200).json({ feedback: items, reports });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};

    // 11.16 — report inappropriate AI-generated content
    if (body.type === 'report') {
      const content = String(body.content || '').slice(0, 2000);
      if (!content) { res.status(400).json({ error: 'no content' }); return; }
      let reports = [];
      try { const r = await kvGetJSON(REPORTS_PATH); if (Array.isArray(r)) reports = r; } catch (e) { logError('feedback/kv-read', e); }
      reports.unshift({
        content,
        provider: String(body.provider || '').replace(/[<>"'&`]/g, '').slice(0, 30),
        user: verifiedUser(req, body),
        lang: String(body.lang || '').replace(/[^\w-]/g, '').slice(0, 8),
        ts: new Date().toISOString()
      });
      await kvPutJSON(REPORTS_PATH, reports.slice(0, MAX_ITEMS));
      res.status(200).json({ ok: true });
      return;
    }

    const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 0));
    if (!rating) { res.status(400).json({ error: 'no rating' }); return; }
    const chips = Array.isArray(body.chips) ? [...new Set(body.chips.slice(0, 10).map(String))].filter(c => FB_CHIPS.includes(c)) : [];
    const note = String(body.note || '').slice(0, 1000);
    const items = await readList();
    items.unshift({
      rating,
      chips,
      note,
      user: verifiedUser(req, body),
      lang: String(body.lang || '').replace(/[^\w-]/g, '').slice(0, 8),
      ts: new Date().toISOString()
    });
    await kvPutJSON(LOG_PATH, items.slice(0, MAX_ITEMS));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
