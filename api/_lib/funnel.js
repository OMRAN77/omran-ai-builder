'use strict';
/* api/_lib/funnel.js — v-funnel (المالك ٢١ نوفمبر ٢٠٢٦، على أرقامه «١٠ آلاف متابع ← ١٥٠ دخول ← ٨ مشتركين»: «نجرب، ركّب» عن قياس
   يبيّن المسار من المتابع إلى التسجيل): عدّاد داخليّ مجهول لمسار الزائر الجديد (واجهته آخر js/app-10-features.js) — زيارة ← (متجر) ← موافقة ← أوّل رسالة ← دخول بحساب —
   حسب المصدر (تيك توك، إنستغرام، بحث…) ونوع الجهاز.

   لماذا ليس أداة خارجيّة: سياسة الخصوصيّة تقول «لا نشارك بياناتك مع أطراف ثالثة»، وأداة تنتظر الموافقة لا ترى من يغادر قبلها — وهو
   أوّل ما نريد قياسه. هنا أعداد فقط: لا هويّة، لا كوكيز، لا IP محفوظ، لا ربط بحساب. خانة واحدة لكلّ يوم (UTC) في KV:
     HINCRBY funnel/day/<YYYY-MM-DD>  "<حدث>|<مصدر>|<جهاز>"  1
   القيم كلّها من قوائم مغلقة، فطلب عابث لا يكبّر الخانة ولا يكتب نصًّا.

   POST  {e, s, p}                     ← 204 دائمًا (بلا دخول؛ يُهمَل بصمت: حدث مجهول، زاحف، أو تجاوز الحدّ)
   GET|POST  op=report&token=&days=    ← المالك وحده: مجموع الأيّام، وحسب المصدر والجهاز واليوم */
const crypto = require('crypto');
const { sessionUser } = require('./_session.js');
const { isOwnerName } = require('./_owner.js');

const EVENTS = ['visit', 'store', 'consent', 'msg', 'account'];
const SOURCES = ['tiktok', 'instagram', 'snapchat', 'youtube', 'facebook', 'x', 'whatsapp', 'telegram', 'linkedin', 'google', 'search', 'invite', 'site', 'direct', 'other'];
const PLATFORMS = ['android', 'ios', 'desktop', 'other'];
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|preview|monitor|uptime|scrap|curl|wget|python|httpclient|node-fetch|axios|go-http|java\//i;
const MAX_BODY_CHARS = 200;
const MAX_DAYS = 90;

const dayKey = (day) => 'funnel/day/' + day;
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/* الحدّ في ذاكرة الدالّة لا في KV: عدّاد لكلّ طلب كان يضاعف أوامر التخزين (حدّ يوميّ في الباقة) ليحمي عدّادًا قيمته أمر واحد.
   الزائر الحقيقيّ يرسل خمسة أحداث في عمره؛ ١٢ في عشر دقائق لكلّ عنوان واسع لشبكات NAT، وسقف للدالّة كلّها يحدّ كلفة أيّ سيل.
   العنوان يُبصَم ولا يُحفظ، ولا يخرج من هذه الخريطة. */
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 12;
const PER_MINUTE = 300;
const hits = new Map();
let minute = { t: 0, n: 0 };
function allow(ip, now) {
  const m = Math.floor(now / 60000);
  if (minute.t !== m) minute = { t: m, n: 0 };
  if (++minute.n > PER_MINUTE) return false;
  if (!ip) return true;
  if (hits.size > 5000) hits.clear();
  const k = crypto.createHash('sha256').update(ip).digest('base64').slice(0, 12);
  const h = hits.get(k);
  if (!h || now - h.t > WINDOW_MS) { hits.set(k, { t: now, n: 1 }); return true; }
  return ++h.n <= PER_IP;
}

/** جسم الحدث ← الخانة «حدث|مصدر|جهاز»، أو '' إن كان الحدث خارج القائمة. المصدر والجهاز المجهولان = other. */
function fieldOf(body) {
  const b = body || {};
  const e = String(b.e || '');
  if (EVENTS.indexOf(e) === -1) return '';
  const s = String(b.s || ''), p = String(b.p || '');
  return e + '|' + (SOURCES.indexOf(s) !== -1 ? s : 'other') + '|' + (PLATFORMS.indexOf(p) !== -1 ? p : 'other');
}

const zero = () => ({ visit: 0, store: 0, consent: 0, msg: 0, account: 0 });
/* ردّ HGETALL: مصفوفة [خانة، قيمة، …] (Upstash REST)، أو كائن — يُقبل الشكلان */
function pairsOf(row) {
  if (Array.isArray(row)) { const out = []; for (let i = 0; i + 1 < row.length; i += 2) out.push([row[i], row[i + 1]]); return out; }
  return row && typeof row === 'object' ? Object.entries(row) : [];
}

/** days: [{day, row}] الأحدث أوّلًا ← المجموع وحسب المصدر والجهاز واليوم. خانة بشكل غير معروف تُترك. */
function aggregate(days) {
  const total = zero(), src = {}, plat = {}, byDay = [];
  let since = null;
  for (const d of days) {
    const t = zero();
    let any = false;
    for (const [f, v] of pairsOf(d.row)) {
      const parts = String(f).split('|');
      const n = parseInt(v, 10);
      if (parts.length !== 3 || EVENTS.indexOf(parts[0]) === -1 || !(n > 0)) continue;
      const s = SOURCES.indexOf(parts[1]) !== -1 ? parts[1] : 'other', p = PLATFORMS.indexOf(parts[2]) !== -1 ? parts[2] : 'other';
      any = true;
      total[parts[0]] += n; t[parts[0]] += n;
      (src[s] = src[s] || zero())[parts[0]] += n;
      (plat[p] = plat[p] || zero())[parts[0]] += n;
    }
    if (any) { byDay.push(Object.assign({ day: d.day }, t)); since = d.day; }
  }
  const rows = (o, key) => Object.keys(o).map((k) => Object.assign({ [key]: k }, o[k])).sort((a, b) => b.visit - a.visit || b.account - a.account || String(a[key]).localeCompare(String(b[key])));
  return { since, total, bySource: rows(src, 'src'), byPlatform: rows(plat, 'plat'), byDay: byDay.slice(0, 14) };
}

module.exports = async (req, res, deps) => {
  const d = deps || {};
  const kv = d.kv || require('./kv.js');
  const now = typeof d.now === 'function' ? d.now() : Date.now();
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const q = req.query || {};
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) { res.status(204).end(); return; }
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } // جسم لا يُقرأ = بلا حدث
  }
  body = body && typeof body === 'object' ? body : {};

  if (q.op === 'report' || body.op === 'report') {
    if (!isOwnerName(sessionUser(q.token || body.token || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
    const n = Math.min(MAX_DAYS, Math.max(1, parseInt(q.days || body.days, 10) || 30));
    const dayList = [];
    for (let i = 0; i < n; i++) dayList.push(dayStr(now - i * 86400000));
    try {
      const rows = await kv.kvPipeline(dayList.map((day) => ['HGETALL', dayKey(day)]));
      res.status(200).json(Object.assign({ days: n, today: dayList[0] }, aggregate(dayList.map((day, i) => ({ day, row: rows[i] })))));
    } catch (e) {
      console.error('[funnel] report ' + (e && e.message));
      res.status(503).json({ error: 'unavailable' });
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const h = req.headers || {};
  const field = fieldOf(body);
  const ip = String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim().slice(0, 64);
  if (field && !BOT_RE.test(String(h['user-agent'] || '')) && allow(ip, now)) {
    try { await kv.kvPipeline([['HINCRBY', dayKey(dayStr(now)), field, '1']]); }
    catch (e) { console.warn('[funnel] ' + (e && e.message)); } // عطل العدّ لا يصل الزائر
  }
  res.status(204).end();
};
module.exports.EVENTS = EVENTS;
module.exports.SOURCES = SOURCES;
module.exports.PLATFORMS = PLATFORMS;
module.exports.fieldOf = fieldOf;
module.exports.aggregate = aggregate;
module.exports.__resetLimiter = () => { hits.clear(); minute = { t: 0, n: 0 }; };
