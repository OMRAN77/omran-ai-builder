// tests/studio-age.test.cjs — v-studio-age (لقطة المالك ٩ نوفمبر من «ستايل الذكاء الاصطناعي»: «مافي تغير الشكل في الاعمار» — النتيجة نسخة الأصل).
// الجذر في الأمر الذي يصل النموذج: «غيّر العمر» ثمّ قفل «STRICT EDIT LOCK (highest priority): Keep the exact same person and face
// (identity, features, skin…) pixel-for-pixel… Do not regenerate anything else» — والعمر هو الوجه والجلد والشعر، فيطيع القفل ولا يغيّر شيئًا.
// والمحاولة الثانية بعد رفض الحارس كانت «طبقة رقيقة فوق البكسل الأصليّ» فتمحو العمر. هنا المعالج الحقيقيّ بـfetch وKV محاكيين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const { PNG } = require('pngjs');

process.env.AUTH_SECRET = 'studio-age-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
for (const k of ['OPENAI_API_KEY', 'IMAGE_DUO', 'IMAGE_GUARD_FREE', 'IMAGE_UNCHANGED_FREE', 'OWNER_USERNAMES']) delete process.env[k];

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
    if (op === 'DEL') { store.delete(k); return 1; }
    return op === 'EXPIRE' ? 1 : null;
  }),
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(shift) {
  const p = new PNG({ width: 96, height: 128 });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % 96 * 2 + shift) % 256; p.data[i + 1] = (shift * 3) % 256; p.data[i + 2] = 150; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const MINE = png(0), GEM = png(140), GEM2 = png(60);
const PASS = { sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true, requestedChangeApplied: true };
const IDFAIL = Object.assign({}, PASS, { identityPreserved: false });

const auth = require(rp('api/_lib/auth.js'));
const studio = require(rp('api/_lib/studio-create.js'));

let verdicts, genPrompts, guardReqs;
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && typeof init.body === 'string' ? init.body : '';
  const ok = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
  if (u.includes('gemini-flash-latest')) {
    if (/Locate the main person/.test(body)) return ok(JSON.stringify({ face: [300, 300, 600, 600], head: [200, 250, 650, 700] }));
    if (/strict quality gate/.test(body)) {
      const instr = JSON.parse(body).contents[0].parts.map((p) => p.text || '').join('\n');
      guardReqs.push((instr.match(/USER REQUEST: (.*)/) || [])[1] || '');
      return ok(JSON.stringify(verdicts.shift() || PASS));
    }
    return ok('{}');
  }
  if (u.includes('gemini-3-pro-image')) {
    const parts = JSON.parse(body).contents[0].parts;
    const text = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    genPrompts.push(text);
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: /SECOND ATTEMPT/.test(text) ? GEM2 : GEM } }] } }] });
  }
  throw new Error('نداء خارج المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

async function call(feature, style, v) {
  store.clear(); genPrompts = []; guardReqs = []; verdicts = (v || []).slice();
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { done({ code: this.code, body: b }); return this; }, end() { done({ code: this.code }); return this; } };
  const [out] = await Promise.all([sent, studio({ method: 'POST', headers: {}, query: {}, body: { token: auth.makeToken('ageuser'), feature, style, imageBase64: MINE, mimeType: 'image/png' } }, res)]);
  return { code: out.code, body: out.body || {} };
}

const AGES = ['child', 'teen', 'twenties', 'forties', 'sixties', 'elder'];

test('١. أمر العمر يطلب تغيير الوجه والجلد والشعر، ولا يحمل قفل «نفس الوجه والجلد بالبكسل» الذي يناقضه — في الخيارات الستّة', () => {
  for (const st of AGES) {
    const p = studio.buildSinglePrompt('age', st, '', false, 3);
    assert.match(p, /^Realistically change the apparent age of the person so they look like /, st);
    assert.match(p, /facial structure and fullness, skin texture, wrinkles, hair colour and hair density/, st + ': لا يسمّي ما يتغيّر بالعمر');
    assert.match(p, /obvious at first glance/, st);
    assert.match(p, /AGE EDIT LOCK \(highest priority\): the face, skin and hair ARE the edit/, st + ': لا قفل العمر');
    assert.match(p, /recognizable as themselves at that age/, st + ': الهويّة لم تعد مطلوبة');
    assert.match(p, /keep it exactly as it is/, st + ': غطاء الرأس');
    assert.doesNotMatch(p, /STRICT EDIT LOCK|Keep the exact same person and face \(identity, features, skin|pixel-for-pixel|thin overlay/, st + ': القفل المناقض ما زال في الأمر');
    assert.doesNotMatch(p, /keeping the same identity, features and expression/, st + ': القالب القديم');
    assert.doesNotMatch(p, /VARIATION/, st + ': العمر تعديل محدّد بلا تنويع (v-visible-change)');
    assert.match(p, /must remain a real photorealistic photograph/, st + ': قاعدة بقاء الصورة فوتوغرافيّة');
  }
  // الميزات الأخرى لم يُمسّ قفلها
  for (const [f, st] of [['hair', 'blonde'], ['heritage', Object.keys(studio.STYLE_TEXT.heritage)[0]], ['makeup', Object.keys(studio.STYLE_TEXT.makeup)[0]], ['beard', Object.keys(studio.STYLE_TEXT.beard)[0]]]) {
    const p = studio.buildSinglePrompt(f, st, '', false, 3);
    assert.match(p, /STRICT EDIT LOCK \(highest priority\)/, f);
    assert.doesNotMatch(p, /AGE EDIT LOCK/, f);
  }
});

test('٢. المعالج الحقيقيّ: الأمر الذي يصل النموذج بقفل العمر، والحارس يعرف العمر المطلوب بكلماته، والناتج يُسلَّم', async () => {
  const r = await call('age', 'elder');
  assert.equal(r.code, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.imageBase64, GEM);
  assert.equal(genPrompts.length, 1);
  assert.match(genPrompts[0], /AGE EDIT LOCK/);
  assert.doesNotMatch(genPrompts[0], /STRICT EDIT LOCK/);
  assert.equal(guardReqs.length, 1);
  assert.match(guardReqs[0], /^change the apparent age of the same person to an elderly person around 80 years old/, 'الحارس رأى «age elder» فقط');
});

test('٣. رفض الحارس للهويّة: المحاولة الثانية للعمر تُبقي العمر (لا «طبقة رقيقة فوق الأصل»)، وبقيّة الميزات كما كانت', async () => {
  const r = await call('age', 'child', [IDFAIL, PASS]);
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, GEM2, 'المحاولة الثانية هي المسلَّمة');
  assert.equal(genPrompts.length, 2);
  assert.match(genPrompts[1], /SECOND ATTEMPT — the previous result did not look like the same person/);
  assert.match(genPrompts[1], /do not undo the age change/);
  assert.doesNotMatch(genPrompts[1], /thin overlay on the original pixels/, 'سطر المحاولة الثانية يمحو العمر');
  const h = await call('hair', 'blonde', [IDFAIL, PASS]);
  assert.equal(h.code, 200);
  assert.match(genPrompts[1], /thin overlay on the original pixels only/, 'الشعر: المحاولة الثانية كما كانت');
  assert.equal(guardReqs[0].indexOf('hair blonde'), 0, 'طلب الحارس لغير العمر كما كان');
});
