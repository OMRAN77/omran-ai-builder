// tests/body-reframe.test.cjs — v-body-reframe (لقطة المالك ٧ نوفمبر: صورة وجه وكتفين بكندورة + «ملاكم — قوي» في «الجسم واللياقة» ←
// الصورة نفسها تقريبًا: «شوف شو طالب وشو عطاني»، ثمّ اختار «يرسم جسمي كامل»).
// صورة شخص واحد مقرّب (وجهه أطول من ٢٢٪ من الصورة) = صورة كاملة من الرأس إلى القدمين بالبنية المختارة في لبس رياضيّ ساتر، بأجزاء هويّة
// خاصّة (الوجه وغطاء الرأس كما هما، لا لبس البطاقة ولا غطاء رأسها)، ثمّ قفل الوجه (BODY_FACE_SWAP)؛ وإن لم يُقفل ففحص هويّة قبل الخصم.
// غير ذلك المسار القديم كما هو. (المراجعة العدائيّة: ٧ عيوب مؤكّدة، كلّها هنا.) المعالج الحقيقيّ، KV في الذاكرة، face-swap مستبدَل،
// fetch مزيّف — لا شبكة ولا مفاتيح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'body-reframe-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
for (const k of ['MERGE_FACE_CROPS', 'FAL_KEY', 'FAL_BACKUP', 'FAL_BACKUP_TEST_UNTIL', 'TREND_FACE_SWAP', 'MERGE_FACE_SWAP', 'BODY_FACE_SWAP', 'BODY_REFRAME', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'IMAGE_DUO', 'OPENAI_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'IMAGE_GUARD_FREE']) delete process.env[k];

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
    return null;
  }),
};
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(w, h, c) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2]; p.data[i * 4 + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const SRC = png(64, 96, [200, 160, 120]), GEN = png(60, 90, [128, 128, 128]), OAI = png(60, 90, [9, 9, 9]), SWAPPED = png(60, 90, [1, 2, 3]);
// صناديق الوجه [ymin,xmin,ymax,xmax] من ٠–١٠٠٠: مقرّب (نصف الصورة) / صورة نصفيّة (١٥٪) / شخصان مقرّبان
const CLOSE = [[100, 250, 600, 750]], WAIST = [[60, 400, 210, 600]], TWO_CLOSE = [[100, 50, 600, 450], [120, 550, 600, 950]];

const lockCalls = [];
let lockSwap = true;
stub('api/_lib/face-swap.js', {
  lockFaces: async (frame, refs, o) => { lockCalls.push({ frame, refs, o }); return lockSwap ? { b64: SWAPPED, mime: 'image/jpeg', swapped: 1 } : { b64: frame.b64, mime: frame.mime, swapped: 0, reason: 'x' }; },
});

let faces = CLOSE, detectDown = false, image = 'ok', identity = true;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const text = body ? JSON.stringify(body.contents || '') : '';
  calls.push({ u, body, guard: /Identity check only/.test(text), detect: /Find every human face/.test(text) });
  if (/gemini-flash-latest:generateContent/.test(u)) {
    if (/Identity check only/.test(text)) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ identityPreserved: identity, sameVisualMedium: true }) }] } }] });
    if (detectDown) return Response.json({ error: { message: 'down' } }, { status: 500 });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: faces.map((b) => ({ box_2d: b })) }) }] } }] });
  }
  if (/gemini-3-pro-image:generateContent/.test(u)) {
    if (image === 'none') return Response.json({ candidates: [{ finishReason: 'OTHER', content: { parts: [{ text: 'no' }] } }] });
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: GEN } }] } }] });
  }
  if (/api\.openai\.com/.test(u)) return Response.json({ data: [{ b64_json: OAI }] });
  throw new Error('نداء يفلت من المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

const auth = require(rp('api/_lib/auth.js'));
const studioCreate = require(rp('api/_lib/studio-create.js'));
const CARD = require(rp('api/_lib/studio-card-fix.js'));

function reset(o) {
  store.clear(); calls.length = 0; lockCalls.length = 0;
  faces = (o && o.faces) || CLOSE; detectDown = !!(o && o.down); image = (o && o.image) || 'ok'; lockSwap = !(o && o.noSwap); identity = !(o && o.stranger);
}
async function post(body) {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b }); return this; }, end(b) { done({ code: this.code, raw: b }); return this; } };
  const [out] = await Promise.all([sent, studioCreate({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken('user1'), feature: 'body', style: 'bdboxera', imageBase64: SRC, mimeType: 'image/png' }, body || {}) }, res)]);
  return out;
}
const proCalls = () => calls.filter((c) => /gemini-3-pro-image/.test(c.u));
const promptOf = (c) => c.body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');

test('١. صورة وجه + «ملاكم — قوي» ← صورة كاملة من الرأس إلى القدمين بالبنية المختارة، ٢:٣، كشف واحد، قفل الوجه (BODY_FACE_SWAP)، وreframed', async () => {
  reset();
  const r = await post();
  assert.equal(r.code, 200);
  assert.equal(r.body.reframed, true);
  assert.equal(r.body.imageBase64, SWAPPED, 'الوجه مقفول من الصورة');
  assert.equal(proCalls().length, 1);
  assert.equal(calls.filter((c) => c.detect).length, 1, 'كشف الوجه مرّة واحدة (لا ثانية في faceCrops)');
  assert.equal(calls.filter((c) => c.guard).length, 0, 'القفل عمل — لا فحص هويّة إضافيّ');
  const p = promptOf(proCalls()[0]);
  assert.match(p, /^Photo 1 of 1:/);
  assert.match(p, /Create a new full-body standing photo of this same person, the whole figure visible from the top of the head down to the feet/);
  assert.match(p, /a light boxer's build/, 'البنية المختارة');
  // v-body-sport: لبس رياضيّ كالبطاقات، والرجل رأسه مكشوف (لا غترة ولا كاب)، والمرأة بحجابها، وخلفيّة البطاقات
  assert.match(p, /a man wears a fitted short-sleeved athletic t-shirt that clearly shows the build, knee-length athletic shorts or slim athletic joggers, and sneakers/);
  assert.match(p, /a woman wears a modest fitted long-sleeved athletic top with a hip-length tunic over full-length leggings/);
  assert.match(p, /Never a bare chest or midriff, never swimwear, never loose everyday clothes that hide the build/);
  assert.match(p, /a man's ghutra, shemagh, agal, kufi or cap is removed — his head is bare, with short neat hair whose colour matches his beard and age, and nothing on his head/);
  assert.match(p, /A woman's hijab or headscarf stays, fully covering, worn as a fitted sports hijab\. Never add a head covering to anyone who wears none/);
  assert.match(p, /Dark warm brown studio backdrop with soft golden light/);
  // v-body-eyes-colors: «مشكّر العيون» — عينان مفتوحتان تنظران إلى الكاميرا (لا تعبير الصورة كما هو)
  assert.match(p, /Expression: both eyes fully open, clear and looking straight at the camera — never closed, squinting or half-closed — with a natural, relaxed smile/);
  assert.ok(!/apparent age and expression\./.test(p), 'تعبير الصورة (الضحكة التي تضيّق العينين) لا يُنسخ');
  assert.ok(!/clothing — MUST be reproduced|never averaged or blended/.test(p), 'لا قالب الدمج (يأمر بإبقاء اللبس)');
  assert.ok(!/STRICT EDIT LOCK/.test(p), 'لا قفل إطار — الإطار جديد');
  assert.equal(proCalls()[0].body.generationConfig.imageConfig.aspectRatio, '2:3');
  assert.equal(lockCalls.length, 1);
  assert.equal(lockCalls[0].refs[0].data, SRC);
  assert.deepEqual(lockCalls[0].o.only, [0]);
});

test('٢. لا لبس البطاقة ولا غطاء رأسها يصل الأمر (حجاب رياضيّ للرجل، قبعة سباحة، قميص ضاغط) — البنية وحدها', async () => {
  for (const style of ['slim', 'toned', 'posture', 'bdswimmera', 'bdabsb', 'bdhourglassa', 'bdboxera']) {
    reset();
    await post({ style });
    const p = promptOf(proCalls()[0]);
    const frame = CARD.FRAME['body:' + style];
    if (frame) assert.ok(!p.includes(frame), style + ': تأطير البطاقة بلبسها');
    assert.ok(!/black sports hijab|swim cap|compression|second-skin|boxing shorts|mid-thigh/i.test(p), style);
  }
});

test('٣. صورة نصفيّة، أو شخصان مقرّبان، أو تعذّر الكشف، أو BODY_REFRAME=off، أو ميزة غير الجسم ← المسار القديم', async () => {
  for (const o of [{ faces: WAIST }, { faces: TWO_CLOSE }, { down: true }]) {
    reset(o);
    const r = await post();
    assert.equal(r.code, 200, JSON.stringify(o));
    assert.ok(!r.body.reframed, JSON.stringify(o));
    assert.match(promptOf(proCalls()[0]), /Change the body shape to/);
    assert.equal(lockCalls.length, 0);
  }
  process.env.BODY_REFRAME = 'off';
  try {
    reset(); const r = await post();
    assert.ok(!r.body.reframed); assert.match(promptOf(proCalls()[0]), /Change the body shape to/);
  } finally { delete process.env.BODY_REFRAME; }
  reset();
  const r = await post({ feature: 'hair', style: 'black' });
  assert.ok(!r.body.reframed);
  assert.ok(!promptOf(proCalls()[0]).includes('down to the feet'));
});

test('٤. الوجه لم يُقفل (BODY_FACE_SWAP=off أو تعذّر القفل) ← فحص هويّة قبل الخصم: نفس الشخص ٢٠٠، وجه غريب ٤٢٢', async () => {
  process.env.BODY_FACE_SWAP = 'off';
  try {
    reset();
    let r = await post();
    assert.equal(lockCalls.length, 0, 'البوّابة مطفأة');
    assert.equal(calls.filter((c) => c.guard).length, 1, 'فحص الهويّة');
    assert.equal(r.code, 200); assert.equal(r.body.imageBase64, GEN); assert.equal(r.body.reframed, true);
    reset({ stranger: true });
    r = await post();
    assert.equal(r.code, 422); assert.equal(r.body.error, 'image_edit_identity_mismatch');
  } finally { delete process.env.BODY_FACE_SWAP; }
  reset({ noSwap: true, stranger: true });
  const r = await post();
  assert.equal(lockCalls.length, 1);
  assert.equal(r.code, 422, 'القفل لم يبدّل والوجه غريب = لا تسليم');
});

test('٥. رفض برو ← إنقاذ (gpt-image) بالأمر نفسه ثمّ القفل؛ وبلا إنقاذ ← رمز خطأ بلا خصم؛ والوصف يُلحق', async () => {
  process.env.OPENAI_API_KEY = 'oa-test';
  try {
    reset({ image: 'none' });
    const r = await post();
    assert.equal(r.code, 200); assert.equal(r.body.engine, 'openai'); assert.equal(r.body.reframed, true);
    assert.equal(lockCalls.length, 1); assert.equal(lockCalls[0].frame.b64, OAI);
  } finally { delete process.env.OPENAI_API_KEY; }
  reset({ image: 'none' });
  const r2 = await post();
  assert.ok(r2.code >= 400); assert.equal(r2.body.error, 'image_generation_failed'); assert.equal(lockCalls.length, 0);
  reset();
  await post({ style: 'bdboxerc', description: 'في نادي ملاكمة' });
  const p = promptOf(proCalls()[0]);
  assert.match(p, /a strongly boxer's build/);
  assert.match(p, /Extra request: في نادي ملاكمة/);
});

test('٥ب. «الملابس خلها في كل مرّه الوان مختلفه»: ألوان اللبس من رقم الشكل (عدّاد العميل) — ضغطتان متتاليتان بلونين مختلفين', async () => {
  const colourOf = (p) => (/Sportswear colours for this photo: a (.+?) top with (.+?) shorts, joggers or leggings/.exec(p) || []).slice(1).join(' / ');
  const seen = [];
  for (const v of [1, 2, 3]) {
    reset();
    await post({ variant: v });
    seen.push(colourOf(promptOf(proCalls()[0])));
  }
  assert.ok(seen.every(Boolean), 'سطر الألوان في الأمر');
  assert.equal(new Set(seen).size, 3, 'كلّ ضغطة بلون: ' + seen.join(' | '));
  reset();
  await post({ variant: 1 });
  assert.equal(colourOf(promptOf(proCalls()[0])), seen[0], 'الرقم نفسه = اللون نفسه');
  reset();
  await post({});
  assert.ok(colourOf(promptOf(proCalls()[0])), 'بلا رقم: لون من القائمة');
});

test('٦. الواجهة: نتيجة reframed تخفي «قبل/بعد» في المسار الواحد والسلسلة', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
  assert.match(src, /setupBeforeAfter\(\);\n\s*if\(data\.reframed\) studioBaShow\(false\);/);
  assert.match(src, /setupBeforeAfter\(\);\n\s*if\(r\.last\.reframed\) studioBaShow\(false\);/);
  assert.match(src, /reframed: !!\(data\.reframed \|\| \(last && last\.reframed\)\)/);
});
