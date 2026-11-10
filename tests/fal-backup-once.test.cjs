// tests/fal-backup-once.test.cjs — v-fal-backup (المراجعة الشاملة): العلم قائم وfal يفشل عابرًا (504) ثمّ Gemini يقول «الرصيد خلص»
// ← محاولة fal واحدة لكلّ صورة في الأزياء والبورتريه وإطار الأفاتار (كانت اثنتين: الصورة تُدفع مرّتين والمهلة تقارب ٣٠٠ ث).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'fal-backup-studios-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.FAL_KEY = 'fal-test-key';
for (const k of ['FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'IMAGE_DUO', 'PSTYLE_FACE_CROP', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'IMAGE_GUARD_FREE', 'VERCEL_ENV', 'OPENAI_API_KEY']) delete process.env[k];

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => {},
  kvDel: async (k) => { store.delete(k); },
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'EXPIRE') return 1;
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(w, h, shift) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % w + shift) % 256; p.data[i + 1] = (shift * 3) % 256; p.data[i + 2] = 120; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const SRC = png(96, 128, 0); // ٣:٤ — نسبة الدمج من الصورة الأساسيّة
const SRC2 = png(96, 128, 60);
const FALIMG = png(120, 180, 140);
const OAI = png(64, 64, 200);

const auth = require(rp('api/_lib/auth.js'));
const fb = require(rp('api/_lib/fal-fallback.js'));
const portrait = require(rp('api/_lib/portrait-style.js'));
const fashion = require(rp('api/_lib/fashion-create.js'));
const preview = require(rp('api/_lib/studio-preview.js'));
const BASE = require(rp('api/_lib/studio-styles.js'));
const CARD_FIX = require(rp('api/_lib/studio-card-fix.js'));

const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const BUSY = 'Resource has been exhausted (e.g. check quota).';
// gem: 'depleted' (429 الرصيد) | '402' | 'busy' (429 زحام عاديّ) — كلّ نداءات Gemini (التوليد والحارس والكشف) بالردّ نفسه كما في الواقع
let gem = 'depleted', falMode = 'ok', oaiMode = 'ok', clockSkew = 0;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const isForm = init && init.body && typeof init.body.get === 'function';
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ u, body, form: isForm ? init.body : null });
  if (/generativelanguage\.googleapis\.com/.test(u)) {
    if (gem === '402') return Response.json({ error: { code: 402, message: 'Payment required.', status: 'PAYMENT_REQUIRED' } }, { status: 402 });
    return Response.json({ error: { code: 429, message: gem === 'busy' ? BUSY : DEPLETED, status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
  }
  if (/^https:\/\/fal\.run\//.test(u)) {
    if (falMode === 'locked') return new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 });
    // 'slow': المحاولة تأكل ١٠٠ ث من الساعة (Date.now المزاحة) ثمّ تفشل عابرًا
    if (falMode === 'slow') { clockSkew += 100000; return new Response('{"detail":"Gateway timeout"}', { status: 504 }); }
    return Response.json({ images: [{ url: 'data:image/png;base64,' + FALIMG, content_type: 'image/png' }] });
  }
  if (/^https:\/\/api\.openai\.com\//.test(u)) {
    if (oaiMode === 'down') return Response.json({ error: { message: 'boom' } }, { status: 500 });
    return Response.json({ data: [{ b64_json: OAI }] });
  }
  throw new Error('نداء يفلت من المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

const day = new Date().toISOString().slice(0, 10);
const tally = (ns, u) => Number(store.get('db/' + ns + '-usage/tally/' + encodeURIComponent(u) + '/' + day) || 0);
const spent = () => Number(store.get(fb.spentKey(day)) || 0);
const falCalls = () => calls.filter((c) => /^https:\/\/fal\.run\//.test(c.u));
const proCalls = () => calls.filter((c) => /gemini-3-pro-image:generateContent/.test(c.u));
const oaiCalls = () => calls.filter((c) => /api\.openai\.com/.test(c.u));
// لا اسم المزوّد الاحتياطيّ ولا نموذجه في ما يصل العميل
const LEAK = /\bfal\b|fal\.(?:run|media|ai)|nano-banana|Nano Banana/i;
function reset(o) {
  store.clear(); calls.length = 0;
  gem = (o && o.gem) || 'depleted'; falMode = (o && o.fal) || 'ok'; oaiMode = (o && o.oai) || 'ok';
  if (o && o.openai) process.env.OPENAI_API_KEY = 'oa-test'; else delete process.env.OPENAI_API_KEY;
}

function fakeRes() {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b, headers: this.headers }); return this; },
    end(b) { done({ code: this.code, raw: b, headers: this.headers }); return this; } };
  return { res, sent };
}
async function post(handler, user, body) {
  const { res, sent } = fakeRes();
  const [out] = await Promise.all([sent, handler({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user) }, body) }, res)]);
  assert.ok(!LEAK.test(JSON.stringify(out.body || {})), 'اسم المزوّد الاحتياطيّ وصل العميل: ' + JSON.stringify(out.body).slice(0, 200));
  return out;
}
async function get(query) {
  const { res, sent } = fakeRes();
  const [out] = await Promise.all([sent, preview({ method: 'GET', headers: {}, query }, res)]);
  if (out.body) assert.ok(!LEAK.test(JSON.stringify(out.body)), 'اسم المزوّد الاحتياطيّ وصل العميل');
  return out;
}

let fm = 'ok';
const origFetch = global.fetch;
global.fetch = async (url, init) => {
  if (/^https:\/\/fal\.run\//.test(String(url)) && fm === '504') { calls.push({ u: String(url) }); return new Response('{"detail":"Gateway timeout"}', { status: 504 }); }
  return origFetch(url, init);
};
test('١. العلم قائم وfal يفشل ٥٠٤ ثمّ Gemini خلص: fal مرّة واحدة لكلّ صورة في الأزياء والبورتريه والأفاتار', async () => {
  for (const [name, h, body] of [
    ['fashion-text', fashion, { mode: 'text', description: 'a red dress', style: 'evening' }],
    ['portrait', portrait, { imageBase64: SRC, mimeType: 'image/png', style: 'anime' }],
    ['portrait-avatar', portrait, { imageBase64: SRC, mimeType: 'image/png', style: 'avatargif' }],
  ]) {
    reset(); fm = '504';
    store.set(fb.OUT_KEY, String(Date.now()));
    const r = await post(h, 'dbl-' + name, body);
    assert.equal(falCalls().length, 1, name + ': محاولة fal واحدة لكلّ صورة (كانت اثنتين)');
    assert.equal(proCalls().length, 1, name + ': نداء Gemini واحد');
    assert.equal(r.code, 502, name + ': المسار القديم بعد رفض الاثنين');
    assert.equal(spent(), 15, name + ': ٥٠٤ قد يُحاسَب فالحجز يبقى، مرّة واحدة');
  }
});
