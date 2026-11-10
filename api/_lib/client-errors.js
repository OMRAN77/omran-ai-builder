// Client-side error reporting: the app reports its own JS errors here.
// POST { message, source, line, col, stack, url, ua } -> stored in Redis (deduped, capped)
// GET ?key=MONITOR_KEY أو ?token=<جلسة المالك> -> list of recent errors (for health monitor)
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const LOG_PATH = 'db/client-errors/log.json';
const MAX_ITEMS = 60;
/* v-audit-mahakv (srv-core-4): line وcol كانا يُخزَّنان خامًا (وline داخل التوقيع فيتضاعف) — طلب واحد بلا دخول بـline
   طوله ميغابايتان ضخّم السجلّ إلى ٤ م.ب فتفشل كلّ كتابة بعده وتعمى لوحة المالك. الآن عددان صحيحان محدودان، والتوقيع
   منهما، وجسم فوق ٣٢ ك.ب يُرفض، و٦٠ بلاغًا في الدقيقة لكلّ IP (العميل يرسل ≤ ١٢ في الجلسة؛ السقف واسع لشبكات NAT). */
const MAX_BODY_CHARS = 32 * 1024;
const IP_PER_MINUTE = 60;
function posInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(1e7, n)) : (n === Infinity ? 1e7 : 0);
}
async function overIpRate(req) {
  try {
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
    if (!ip) return false;
    const { kvIncr, kvExpire } = require('./kv.js');
    const key = 'rl:client-errors:' + ip + ':' + Math.floor(Date.now() / 60000);
    const n = Number(await kvIncr(key));
    if (n === 1) await kvExpire(key, 120);
    return n > IP_PER_MINUTE;
  } catch (e) { return false; /* عطل العدّاد لا يُسكت البلاغات — الحدّ حماية لا بوّابة */ }
}
const { isOwner } = require('./_owner.js');

async function readLog() {
  try {
    const items = await kvGetJSON(LOG_PATH);
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

async function writeLog(items) {
  await kvPutJSON(LOG_PATH, items);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    const items = await readLog();
    res.status(200).json({ errors: items });
    return;
  }

  if (req.method === 'DELETE') {
    if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
    await writeLog([]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

  try {
    if (await overIpRate(req)) { res.status(429).json({ error: 'rate' }); return; }
    let body = req.body;
    if ((typeof body === 'string' ? body.length : JSON.stringify(body || {}).length) > MAX_BODY_CHARS) { res.status(413).json({ error: 'too large' }); return; }
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};
    const msg = String(body.message || '').slice(0, 500);
    if (!msg) { res.status(400).json({ error: 'no message' }); return; }
    // Ignore noise: network errors, extension errors, script-error from cross-origin
    const noise = /Failed to fetch|NetworkError|Load failed|Script error\.?$|ResizeObserver|extension/i;
    if (noise.test(msg)) { res.status(200).json({ ok: true, skipped: true }); return; }

    // v-err-build: بصمة الحزمة التي وقع فيها الخطأ — جزء من التوقيع، فخطأ نسخة أُصلحت
    // لا يختلط بتكراره في النسخة الحاليّة، وتنبيه المالك يعرض النسخة الحاليّة فقط.
    const build = /^[0-9a-f]{4,16}$/.test(String(body.build || '')) ? String(body.build) : '';
    const items = await readLog();
    const line = posInt(body.line), col = posInt(body.col);
    const sig = msg + '|' + String(body.source || '').slice(0, 200) + '|' + line + (build ? '|' + build : '');
    const existing = items.find(it => it.sig === sig);
    const now = new Date().toISOString();
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = now;
    } else {
      items.unshift({
        sig,
        message: msg,
        source: String(body.source || '').slice(0, 300),
        line,
        col,
        stack: String(body.stack || '').slice(0, 1500),
        url: String(body.url || '').slice(0, 300),
        ua: String(body.ua || '').slice(0, 200),
        build,
        count: 1,
        firstSeen: now,
        lastSeen: now
      });
    }
    await writeLog(items.slice(0, MAX_ITEMS));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
