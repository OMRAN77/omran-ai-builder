// api/_lib/cc.js — v-cc-bridge: مرحّل التطبيق إلى جسر Claude Code الخاصّ بالمالك.
//
// أمر عمران ١٣ سبتمبر: «كلاود كود خام… النشر والدمج بأمري فقط». Claude Code نفسه يعمل
// على خادم المالك (cc-bridge/)، وهذه النقطة لا تفعل إلّا: التحقّق أنّ المنادي هو
// المالك (بوّابة isOwner نفسها: توقيع الجلسة يُفحص في الخادم)، ثمّ تمرير الطلب إلى
// الجسر بالسرّ المشترك من البيئة، وإعادة بثّ SSE كما هو. لا سرّ يبلغ المتصفّح.
//
// العمليّات: chat (بثّ) · attach (استئناف بثّ تشغيل من نقطة) · stop · status ·
// publish · pr · merge · reset — الأربع الأخيرة تُطلب صراحةً من المالك في التطبيق.
const { isOwner } = require('./_owner.js');
const { safeParse } = require('./safe-parse.js');

const OPS = {
  chat: { method: 'POST', path: () => '/chat', stream: true },
  attach: { method: 'GET', path: (b) => '/runs/' + encodeURIComponent(String(b.runId || '')) + '?since=' + (parseInt(b.since, 10) || 0), stream: true },
  stop: { method: 'POST', path: () => '/stop' },
  status: { method: 'GET', path: () => '/status' },
  publish: { method: 'POST', path: () => '/publish' },
  pr: { method: 'GET', path: (b) => '/pr/' + (parseInt(b.prNumber, 10) || 0) },
  merge: { method: 'POST', path: () => '/merge' },
  reset: { method: 'POST', path: () => '/reset' },
  notes: { method: 'GET', path: () => '/notes' },
  notesRead: { method: 'POST', path: () => '/notes/read' },
  watch: { method: 'POST', path: () => '/watch' },
};

function config(env) {
  const e = env || process.env;
  const base = String(e.CC_BRIDGE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(e.CC_BRIDGE_SECRET || '').trim();
  return { base, secret, ok: !!(base && secret && /^https?:\/\//.test(base)) };
}

/** الجسد المرسَل إلى الجسر: الحقول المعروفة فقط، بلا رمز الجلسة ولا أيّ شيء آخر. */
/* v-cc-images: صور مرفقة للجسر — png/jpeg/webp/gif، حتّى ٤ صور، base64 صافٍ، و٣٫٥ مليون حرف مجتمعة. */
function cleanImages(list) {
  const out = [];
  let used = 0;
  for (const i of (Array.isArray(list) ? list : [])) {
    if (out.length >= 4 || !i || typeof i !== 'object') break;
    const mt = String(i.mediaType || ''), data = String(i.data || '');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mt) || !/^[A-Za-z0-9+/=]+$/.test(data) || used + data.length > 3500000) continue;
    used += data.length;
    out.push({ mediaType: mt, data });
  }
  return out;
}

function forwardBody(op, b) {
  if (op === 'chat') {
    const images = cleanImages(b.images);
    /* v-attach-full (بلاغ المالك «أيّ ملفّ أرسله يتقطّع»): رُفع سقف الرسالة من ٢٠ ألف إلى
       ٢٠٠ ألف حرف كي يمرّ الملفّ المرفق كاملًا إلى جسر Claude Code (نفس حدّ العميل). */
    return { message: String(b.message || '').slice(0, 200000), sessionId: String(b.sessionId || '').slice(0, 80), newSession: !!b.newSession, model: b.model ? String(b.model).slice(0, 40) : undefined, images: images.length ? images : undefined };
  }
  if (op === 'publish') return { title: String(b.title || '').slice(0, 200), message: String(b.message || '').slice(0, 300), body: String(b.body || '').slice(0, 6000) };
  if (op === 'merge') return { prNumber: parseInt(b.prNumber, 10) || 0, force: !!b.force };
  if (op === 'reset') return { newSession: !!b.newSession };
  if (op === 'notesRead') return Array.isArray(b.ids) ? { ids: b.ids.slice(0, 100).map((x) => parseInt(x, 10) || 0) } : {};
  if (op === 'watch') return { prNumber: parseInt(b.prNumber, 10) || 0 };
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') body = safeParse(body, {}, 'cc:body');
  const probe = { query: req.query || {}, body };
  if (!isOwner(probe)) { res.status(401).json({ error: 'unauthorized' }); return; }
  const cfg = config();
  if (!cfg.ok) { res.status(503).json({ error: 'الجسر غير مضبوط: أضف CC_BRIDGE_URL وCC_BRIDGE_SECRET في بيئة Vercel (انظر cc-bridge/README.md).' }); return; }
  const op = String(body.op || 'status');
  const spec = OPS[op];
  if (!spec) { res.status(400).json({ error: 'عمليّة غير معروفة: ' + op.slice(0, 20) }); return; }

  const init = { method: spec.method, headers: { 'Authorization': 'Bearer ' + cfg.secret, 'Content-Type': 'application/json', 'Accept': spec.stream ? 'text/event-stream' : 'application/json' } };
  if (spec.method === 'POST') init.body = JSON.stringify(forwardBody(op, body));
  let up;
  try { up = await fetch(cfg.base + spec.path(body), init); }
  catch (e) { res.status(502).json({ error: 'تعذّر الوصول إلى جسر Claude Code: ' + String((e && e.message) || e).slice(0, 120) }); return; }

  if (!spec.stream || !up.ok || !up.body) {
    const text = await up.text();
    res.status(up.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(text || JSON.stringify({ error: 'HTTP ' + up.status }));
    return;
  }
  // بثّ SSE كما وصل — v-flush: الترويسة ثمّ كلّ قطعة فورًا وإلّا بقي الردّ صامتًا عند المتصفّح.
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(dec.decode(value, { stream: true }));
      if (res.flush) res.flush();
    }
  } catch (e) {
    try { res.write('data: ' + JSON.stringify({ error: 'انقطع البثّ من الجسر — أعد الاتّصال (attach).' }) + '\n\n'); } catch (e2) { /* مغلق */ }
  }
  try { res.end(); } catch (e) { /* مغلق */ }
};

module.exports.__test = { OPS, config, forwardBody, cleanImages };
