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

let faces = CLOSE, detectDown = false, image = 'ok', identity = true, photoG = '', photoCovered = false, cardCheck = true, facePts = null;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const text = body ? JSON.stringify(body.contents || '') : '';
  const form = init && init.body && typeof init.body.get === 'function' ? init.body : null;
  calls.push({ u, body, guard: /Identity check only/.test(text), detect: /Find every human face/.test(text), cardCheck: /should show that same person/.test(text),
    oaiPrompt: form ? String(form.get('prompt')) : '', oaiImages: form ? form.getAll('image').length + form.getAll('image[]').length : 0 });
  if (/gemini-flash-latest:generateContent/.test(u)) {
    if (/a man or a woman/.test(text)) return photoG === 'down' ? Response.json({ error: {} }, { status: 500 }) : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ gender: photoG || 'unknown', covered: photoCovered }) }] } }] });
    if (/should show that same person/.test(text)) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ onePerson: cardCheck, samePerson: true, skinMatches: true }) }] } }] });
    if (/Identity check only/.test(text)) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ identityPreserved: identity, sameVisualMedium: true }) }] } }] });
    if (detectDown) return Response.json({ error: { message: 'down' } }, { status: 500 });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: faces.map((b, i) => Object.assign({ box_2d: b }, (facePts && facePts[i]) || {})) }) }] } }] });
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
  faces = (o && o.faces) || CLOSE; detectDown = !!(o && o.down); image = (o && o.image) || 'ok'; lockSwap = !(o && o.noSwap); identity = !(o && o.stranger); photoG = (o && o.g) || ''; photoCovered = !!(o && o.covered); cardCheck = !(o && o.cardReject); facePts = (o && o.pts) || null;
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

/* ───── v-body-card-match (المالك: «الصور ماتتطابق الشكل الي اطلبه… عدّل مرّة وحدة»): البطاقة المخزّنة نفسها مرجع البنية والوقفة واللبس ───── */
const CARD_IMG = png(40, 60, [90, 60, 30]);
const cardKey = (style, rev) => 'studio:preview:v2:body:' + style + (rev ? ':r' + rev : '');
const imagesOf = (c) => c.body.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.data);
const cardChecks = () => calls.filter((c) => c.cardCheck);
function cache(style) {
  const rev = CARD.REV['body:' + style] || 0;
  store.set(cardKey(style, rev), CARD_IMG);
}

test('٨. بطاقة مخزّنة + جنس الصورة = جنس نموذجها ← الصورة والبطاقة معًا، وأمر يعيد رسم البطاقة بوجهه ولون بشرته وألوانه، ثمّ القفل والفحص', async () => {
  reset({ g: 'man' });
  cache('bdsurferc');
  const r = await post({ style: 'bdsurferc', variant: 3 });
  assert.equal(r.code, 200); assert.equal(r.body.reframed, true);
  const call = proCalls()[0];
  assert.deepEqual(imagesOf(call), [SRC, CARD_IMG], 'صورته ثمّ البطاقة');
  const p = promptOf(call);
  assert.match(p, /^Photo 1 of 2 — the user \(identity reference\):/);
  assert.match(p, /Photo 2 of 2 — the chosen look \(the option card the user picked: an example photo of a different, generic model — never the user, and never a second person in the result\):/);
  assert.match(p, /recreates the chosen look in Photo 2: the same body build, muscularity and proportions, the same pose and stance, the same camera angle, framing, lighting, backdrop and props, and the same top and bottoms \(pieces and cut\) as Photo 2/);
  assert.match(p, /a strongly surfer's build/);
  assert.match(p, /Exactly one person in the result/);
  assert.match(p, /the model's face, skin tone and hair, and anything on or around the model's head \(a sports hijab, swim cap, goggles, ear guards or headband\), are not part of the look — ignore them/);
  assert.match(p, /the skin tone \(on the face and on all visible skin — neck, arms, hands and legs\)/);
  assert.match(p, /both eyes fully open/);
  assert.match(p, /Clothes: the same pieces as Photo 2 recoloured — a .+ top with .+ bottoms; footwear \(or bare feet\) exactly as in Photo 2/);
  assert.ok(!/sneakers|down to the feet|like the model in Photo 2/.test(p), 'لا حذاء ولا إطار ثابتان، ولا «رأس كنموذج البطاقة»');
  assert.match(p, /a woman whose hair is uncovered in Photo 1 keeps her own hair, uncovered/);
  assert.equal(call.body.generationConfig.imageConfig.aspectRatio, '2:3');
  assert.equal(lockCalls.length, 1, 'قفل الوجه بعده');
  assert.equal(lockCalls[0].o.faceOnly, true);
  assert.equal(cardChecks().length, 1, 'فحص ما بعد الرسم');
});

test('٩. البطاقة بمراجعتها الحاليّة أوّلًا ثمّ الأقدم؛ وبطاقة الحجاب لامرأة محجّبة', async () => {
  const rev = CARD.REV['body:bdsurfera'];
  assert.ok(rev >= 1, 'خيار له مراجعة');
  reset({ g: 'man' });
  store.set(cardKey('bdsurfera', rev), CARD_IMG); store.set(cardKey('bdsurfera'), SRC);
  await post({ style: 'bdsurfera' });
  assert.equal(imagesOf(proCalls()[0])[1], CARD_IMG, 'المراجعة الحاليّة');
  reset({ g: 'man' });
  store.set(cardKey('bdsurfera'), CARD_IMG);
  await post({ style: 'bdsurfera' });
  assert.equal(imagesOf(proCalls()[0])[1], CARD_IMG, 'الأقدم حين لا الحاليّة');
  reset({ g: 'woman', covered: true });
  cache('slim');
  await post({ style: 'slim' });
  assert.equal(imagesOf(proCalls()[0]).length, 2, 'بطاقة الحجاب لامرأة محجّبة');
});

test('١٠. ← الوصف النصّيّ: جنس مختلف، امرأة شعرها مكشوف مع بطاقة حجاب، بطاقة جانبيّة، لا بطاقة، جنس غير واضح، تعذّر الفحص', async () => {
  const cases = [
    [{ g: 'man' }, 'slim', true, 'رجل وبطاقة امرأة'],
    [{ g: 'woman' }, 'bdsurferc', true, 'امرأة وبطاقة رجل'],
    [{ g: 'woman', covered: false }, 'bdhourglassa', true, 'امرأة شعرها مكشوف وبطاقة حجاب'],
    [{ g: 'man' }, 'bdposturea', true, 'بطاقة جانبيّة'],
    [{ g: 'man' }, 'bdflatstomachb', true, 'بطاقة جانبيّة'],
    [{ g: 'man' }, 'bdsurferc', false, 'لا بطاقة'],
    [{ g: '' }, 'bdsurferc', true, 'جنس غير واضح'],
    [{ g: 'down' }, 'bdsurferc', true, 'تعذّر الفحص'],
  ];
  for (const [o, style, cached, why] of cases) {
    reset(o);
    if (cached) cache(style);
    const r = await post({ style });
    assert.equal(r.code, 200, why);
    assert.equal(imagesOf(proCalls()[0]).length, 1, why + ': صورته وحدها');
    assert.match(promptOf(proCalls()[0]), /^Photo 1 of 1:[\s\S]*Create a new full-body standing photo of this same person/, why);
    assert.equal(cardChecks().length, 0, why + ': لا فحص بطاقة');
  }
  reset({ g: 'man' });
  await post({ style: 'bdsurferc' });
  assert.equal(calls.filter((c) => /a man or a woman/.test(JSON.stringify(c.body && c.body.contents || ''))).length, 0, 'لا فحص جنس بلا بطاقة مخزّنة');
});

test('١١. رفض برو في وضع البطاقة ← الإنقاذ بالوصف النصّيّ وصورته وحدها (لا «Photo 2» ولا البطاقة)', async () => {
  process.env.OPENAI_API_KEY = 'oa-test';
  try {
    reset({ g: 'man', image: 'none' });
    cache('bdsurferc');
    const r = await post({ style: 'bdsurferc' });
    assert.equal(r.code, 200); assert.equal(r.body.engine, 'openai');
    const oai = calls.find((c) => /api\.openai\.com/.test(c.u));
    assert.ok(oai, 'نداء الإنقاذ');
    assert.match(oai.oaiPrompt, /Create a new full-body standing photo of this same person/);
    assert.ok(!/Photo 2/.test(oai.oaiPrompt));
    assert.equal(oai.oaiImages, 1, 'صورته وحدها');
    assert.equal(cardChecks().length, 0, 'ناتج الإنقاذ ليس من البطاقة');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('١٢. بطاقات السباحة والأمواج والمصارعة: لبس السباحة يُبدَّل رياضيًّا بالقصّة نفسها، ولا قبّعة سباحة ولا نظّارة ولا واقيات أذن', async () => {
  for (const style of ['bdswimmera', 'bdsurfera', 'bdwrestlera']) {
    reset({ g: 'man' });
    cache(style);
    await post({ style });
    const p = promptOf(proCalls()[0]);
    assert.equal(imagesOf(proCalls()[0]).length, 2, style + ': وضع البطاقة');
    if (style !== 'bdwrestlera') assert.match(p, /Photo 2 shows swimwear: dress the user instead in a fitted athletic t-shirt with the same sleeves and knee-length athletic shorts of the same cut — never swimwear/, style);
    if (style !== 'bdsurfera') assert.match(p, /no swim cap, goggles, ear guards or other headgear, even though Photo 2 shows them/, style);
    assert.ok(!/like the model in Photo 2/.test(p), style);
  }
  reset({ g: 'man' });
  cache('bdboxerc');
  await post({ style: 'bdboxerc' });
  const p = promptOf(proCalls()[0]);
  assert.ok(!/Photo 2 shows swimwear|even though Photo 2 shows them/.test(p), 'بطاقة بلا سباحة ولا غطاء رأس = بلا جملتي الاستبدال');
});

test('١٣. فحص ما بعد الرسم رفض (شخص ثانٍ/جلد آخر) ← إعادة الرسم بالوصف النصّيّ مرّة والقفل، والنتيجة من النصّ', async () => {
  reset({ g: 'man', cardReject: true });
  cache('bdsurferc');
  const r = await post({ style: 'bdsurferc' });
  assert.equal(r.code, 200);
  assert.equal(proCalls().length, 2, 'رسم بالبطاقة ثمّ بالنصّ');
  assert.equal(imagesOf(proCalls()[1]).length, 1);
  assert.match(promptOf(proCalls()[1]), /^Photo 1 of 1:/);
  assert.equal(lockCalls.length, 2, 'قفل لكلّ رسم');
  assert.equal(cardChecks().length, 1, 'الفحص لناتج البطاقة وحده');
});

test('١٤. سمات البطاقات من تأطيرها: الحجاب والسباحة وغطاء الرأس والجانبيّة', () => {
  const FR = CARD.FRAME;
  const hijab = Object.keys(FR).filter((k) => k.startsWith('body:') && /hijab/i.test(FR[k])).map((k) => k.slice(5)).sort();
  assert.deepEqual(hijab, ['bdhourglassa', 'bdhourglassb', 'bdhourglassc', 'posture', 'slim', 'toned']);
  /* ترتيب studio-preview نفسه: SUBJECT المصحَّح أوّلًا ثمّ PREVIEW_SUBJECT */
  for (const k of hijab) assert.equal(CARD.SUBJECT['body:' + k] || require(rp('api/_lib/studio-more.js')).PREVIEW_SUBJECT.body[k], 'w', k + ': بطاقات الحجاب لنموذج امرأة');
});

/* ───── v-body-upright (لقطة المالك ٧ نوفمبر: سيلفي مائل نحو ٧٠° بفلتر والوجه يملأ الصورة ← جسم كامل بوجه امرأة أخرى ولون عيون آخر،
   وغطاء رأس أسود لم تلبسه، والقفل «بدّل ١/١»: «بعده يغير الملامح خسرتني توكن وتجارب كثير») ───── */
const MI = require(rp('api/_lib/merge-identity.js'));
const { decodeImage } = require(rp('api/_lib/image-diff.js'));
/* «وجه» اصطناعيّ بميل معلوم: عين يسراه زرقاء ويمناه صفراء (المراجعة: عينان بلون واحد لا تكشفان لقطة معكوسة كالمرآة)، فم أحمر، قمّة رأس
   خضراء على جلد — والنقاط والصندوق كما يعيدها الكاشف (نسبيّة) */
const SKIN = [200, 160, 120], BLUE = [20, 40, 230], YELLOW = [230, 210, 30], RED = [230, 30, 30], GREEN = [30, 200, 40];
function paint(W, H, dots, rad) {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = SKIN;
    for (const [p, col] of dots) if (Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1]) < rad) c = col;
    const i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { w: W, h: H, data };
}
function tiltedFace(rollDeg, o) {
  const W = 600, H = 800, d = (o && o.d) || 100, r = rollDeg * Math.PI / 180;
  const up = [Math.sin(r), -Math.cos(r)], rt = [Math.cos(r), Math.sin(r)];
  const e = [300, 380], m = [e[0] - d * up[0], e[1] - d * up[1]];
  const a = [e[0] - 0.45 * d * rt[0], e[1] - 0.45 * d * rt[1]], b = [e[0] + 0.45 * d * rt[0], e[1] + 0.45 * d * rt[1]];
  const top = [e[0] + 1.2 * d * up[0], e[1] + 1.2 * d * up[1]];
  const img = paint(W, H, [[a, BLUE], [b, YELLOW], [m, RED], [top, GREEN]], 0.14 * d);
  const rel = (p) => [p[0] / W, p[1] / H];
  return { img, face: { box: [(e[0] - 1.5 * d) / W, (e[1] - 1.5 * d) / H, (e[0] + 1.5 * d) / W, (e[1] + 1.5 * d) / H], eyes: [rel(a), rel(b)], mouth: rel(m) } };
}
/* مراكز الألوان في اللقطة: L = العين الزرقاء (يسرى الوجه)، R = الصفراء */
function blobs(b64) {
  const im = decodeImage(Buffer.from(b64, 'base64'));
  const pick = (t) => { const out = []; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4; if (t(im.data[i], im.data[i + 1], im.data[i + 2])) out.push([x, y]); } return out; };
  const mean = (p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  const L = pick((r, g, b) => b > 160 && r < 90 && g < 110), R = pick((r, g, b) => r > 170 && g > 170 && b < 100);
  return { T: im.w, nL: L.length, nR: R.length, L: mean(L), R: mean(R), mouth: mean(pick((r, g, b) => r > 170 && g < 90 && b < 90)), top: mean(pick((r, g, b) => g > 150 && r < 100 && b < 110)) };
}

test('١٥. uprightCrop: وجه مائل بأيّ زاوية (٠، ٢، ٣٠، ‎-٧٩ كصورتها، ٩٠، مقلوب ١٨٠) ← لقطة مستقيمة: العينان أفقيّتان فوق الفم، والرأس في الأعلى', () => {
  for (const deg of [0, 2, 30, -79, 90, 180]) {
    const { img, face } = tiltedFace(deg);
    const up = MI.uprightCrop(img, face);
    assert.ok(up, deg + '°');
    assert.equal(up.mime, 'image/jpeg');
    assert.equal(up.side, 400, deg + '°: الضلع ٤ أضعاف مسافة العينين←الفم');
    const expect = Math.abs(deg) < 4 ? 0 : deg;
    assert.ok(Math.abs(((up.roll - expect + 540) % 360) - 180) <= 1, deg + '°: roll=' + up.roll);
    const k = blobs(up.data);
    assert.ok(k.nL > 20 && k.nR > 20, deg + '°: العينان في اللقطة');
    assert.ok(k.L[0] < k.R[0], deg + '°: يسرى الوجه يسارًا — دوران لا مرآة');
    assert.ok(Math.abs(k.L[1] - k.R[1]) < 0.03 * k.T, deg + '°: العينان على خطّ أفقيّ ' + JSON.stringify(k));
    assert.ok(Math.abs((k.R[0] - k.L[0]) - 90) < 8, deg + '°: مسافة العينين كما هي (لا تكبير ولا تصغير)');
    assert.ok(k.L[0] < k.mouth[0] && k.mouth[0] < k.R[0] && Math.abs(k.mouth[0] - k.T / 2) < 0.04 * k.T, deg + '°: الفم في الوسط بين العينين');
    assert.ok(k.mouth[1] > k.L[1] + 0.15 * k.T, deg + '°: الفم تحت العينين');
    assert.ok(k.top[1] < k.L[1] - 0.15 * k.T && Math.abs(k.top[0] - k.T / 2) < 0.04 * k.T, deg + '°: قمّة الرأس في الأعلى');
  }
});

test('١٦. نقاط لا تشبه وجهًا ← null (والمتّصل يعود إلى faceCrops): بلا فم، عين واحدة، عين خارج الصندوق، العينان على محور الوجه، عين فوق عين، وجه صغير', () => {
  const { img, face } = tiltedFace(30);
  assert.equal(MI.uprightCrop(img, Object.assign({}, face, { mouth: undefined })), null, 'بلا فم');
  assert.equal(MI.uprightCrop(img, Object.assign({}, face, { eyes: [face.eyes[0]] })), null, 'عين واحدة');
  assert.equal(MI.uprightCrop(img, Object.assign({}, face, { eyes: [[0.97, 0.97], face.eyes[1]] })), null, 'عين خارج الصندوق');
  const z = tiltedFace(0);
  /* المراجعة: «عين خارج الصندوق» أعلاه يسقط بفحوص الهندسة قبل الصندوق — هنا الصندوق وحده: نقاط سليمة الهندسة وصندوق في مكان آخر */
  assert.ok(MI.uprightCrop(z.img, z.face), 'الضابط: النقاط نفسها بصندوقها = لقطة');
  assert.equal(MI.uprightCrop(z.img, Object.assign({}, z.face, { box: [0, 0, 0.2, 0.15] })), null, 'النقاط خارج صندوق الوجه');
  assert.equal(MI.uprightCrop(z.img, Object.assign({}, z.face, { eyes: [[0.5, 340 / 800], [0.5, 420 / 800]] })), null, 'خطّ العينين على محور الوجه');
  assert.equal(MI.uprightCrop(z.img, Object.assign({}, z.face, { eyes: [[0.5, 380 / 800], [0.5, 380 / 800]] })), null, 'العينان نقطة واحدة');
  const s = tiltedFace(0, { d: 10 });
  assert.equal(MI.uprightCrop(s.img, s.face), null, 'وجه أصغر من أن يُقوَّم');
});

test('١٧. صورتها مائلة والوجه يملأ الصورة ← لقطة وجه مستقيمة مع صورتها للرسم، ومرجعًا للقفل وفحص الجنس وفحص البطاقة؛ والكشف يطلب العينين والفم', async () => {
  // CLOSE = وجه بنصف ارتفاع الصورة (faceCrops لا يقصّ له لقطة)؛ أعلى الوجه إلى اليسار (‎-٩٠°)
  const PTS = [{ eyes: [250, 330, 450, 330], mouth: [350, 560] }];
  reset({ pts: PTS, g: 'woman' });
  cache('toned');
  const logs = [], log0 = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  let r;
  try { r = await post({ style: 'toned' }); } finally { console.log = log0; }
  assert.equal(r.code, 200); assert.equal(r.body.reframed, true);
  assert.match(JSON.stringify(calls.find((c) => c.detect).body.contents), /Also return eyes \[y1, x1, y2, x2\]: the centre of each of the two eyes, and mouth \[y, x\]: the centre of the mouth/);
  const call = proCalls()[0], imgs = imagesOf(call);
  assert.equal(imgs.length, 2, 'صورتها ثمّ لقطة وجهها المستقيمة');
  assert.equal(imgs[0], SRC);
  assert.match(promptOf(call), /Close-up 1 — the face of the person in Photo 1 \(the same person, zoomed in and turned upright; identity reference only, not an extra person\):/);
  assert.equal(lockCalls.length, 1);
  assert.deepEqual(lockCalls[0].refs[0], { data: imgs[1], mime: 'image/jpeg', face: true }, 'القفل من وجهها المستقيم لا الصورة المائلة');
  assert.equal(lockCalls[0].o.faceOnly, true);
  const look = calls.find((c) => /a man or a woman/.test(JSON.stringify((c.body && c.body.contents) || '')));
  assert.deepEqual(look.body.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.data), [SRC, imgs[1]], 'فحص الجنس يرى وجهها المستقيم أيضًا');
  assert.match(JSON.stringify(look.body.contents), /the second image is a close-up of that same person's face, turned upright/);
  assert.ok(logs.some((s) => /body reframe toned: text \(card cached, photo w uncovered, card model w, hijab card, face upright -90°\)/.test(s)), logs.join(' | '));
  // وضع البطاقة: فحص ما بعد الرسم يقارن بوجهه المستقيم
  reset({ pts: PTS, g: 'man' });
  cache('bdsurferc');
  await post({ style: 'bdsurferc' });
  const crop = imagesOf(proCalls()[0])[1];
  assert.equal(imagesOf(proCalls()[0]).length, 3, 'صورته ولقطته والبطاقة');
  assert.equal(cardChecks()[0].body.contents[0].parts[1].inlineData.data, crop, 'Image A = وجهه المستقيم');
  // بلا نقاط (كشف قديم أو ناقص) = كما كان حرفيًّا: لا لقطة لوجه يملأ الصورة، والقفل من الصورة
  reset();
  await post();
  assert.equal(imagesOf(proCalls()[0]).length, 1);
  assert.equal(lockCalls[0].refs[0].data, SRC);
});

test('١٨. «شعرها مكشوف» من فحص الصورة ← سطر رأس صريح (شعرها كما هو، لا شيء على الرأس ولا الرقبة، لا «حجاب رياضيّ»)؛ الرجل والمحجّبة والفحص المتعذّر بالسطر العامّ وفيه «المكشوف يبقى مكشوفًا»', async () => {
  const head = (p) => (/\nHead: [^\n]*/.exec(p) || [''])[0];
  for (const [o, why] of [[{ g: 'woman' }, 'امرأة شعرها مكشوف'], [{ g: '' }, 'جنس غير واضح وشعر مكشوف']]) {
    reset(o); cache('toned');
    await post({ style: 'toned' });
    const h = head(promptOf(proCalls()[0]));
    assert.match(h, /Head: the hair is uncovered in Photo 1 — keep their own hair exactly as in Photo 1 \(the same hairstyle, fringe, length and colour\), fully visible, and add nothing on the head or around the neck that Photo 1 does not show: no hood, cap, balaclava or neck gaiter\. A hijab, headscarf or shayla that Photo 1 does show stays exactly as worn\./, why);
    assert.ok(!/sports hijab|ghutra/.test(h), why);
    /* المراجعة: «مكشوف» جواب Flash قد يخطئ (شيلة رخوة تُظهر الغرّة) — السطر لا يأمر بنزع غطاء أبدًا */
    assert.ok(!/no hijab|no headscarf|remove/i.test(h), why + ': لا أمر بنزع');
  }
  for (const [o, style, cached, why] of [[{ g: 'man' }, 'toned', true, 'رجل'], [{ g: 'woman', covered: true }, 'bdboxera', true, 'محجّبة'], [{ g: 'down' }, 'toned', true, 'تعذّر الفحص'], [{ g: 'woman' }, 'toned', false, 'لا بطاقة = لا فحص']]) {
    reset(o); if (cached) cache(style);
    await post({ style });
    const h = head(promptOf(proCalls()[0]));
    assert.match(h, /^\nHead: a man's ghutra, shemagh, agal, kufi or cap is removed/, why);
    assert.match(h, /Never add a head covering to anyone who wears none — uncovered hair stays uncovered, in its own hairstyle, never under a hood, balaclava or neck gaiter\.$/, why);
  }
});

test('١٩. detectFaces: بلا points الطلب والمخطّط والناتج كما كانت حرفيًّا (الدمج والترندات والفيديو)؛ وبها العينان والفم نسبيّةً [x, y]', async () => {
  const bodies = [];
  const fake = async (u, init) => { bodies.push(JSON.parse(init.body)); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: [{ box_2d: [100, 200, 500, 600], eyes: [250, 300, 260, 500], mouth: [400, 400] }] }) }] } }] }); };
  const img = { w: 10, h: 10, data: Buffer.alloc(400, 128) };
  const plain = await MI.detectFaces('k', img, { fetchImpl: fake });
  const pts = await MI.detectFaces('k', img, { fetchImpl: fake, points: true });
  assert.equal(bodies[0].contents[0].parts[1].text, 'Find every human face in this photo. For each face return box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000, from the hairline/forehead to the chin and ear to ear. Return JSON {"faces": [{"box_2d": [...]}]} only; an empty list if there are no people.');
  assert.equal(JSON.stringify(bodies[0].generationConfig.responseSchema), JSON.stringify({ type: 'OBJECT', required: ['faces'], properties: { faces: { type: 'ARRAY', items: { type: 'OBJECT', required: ['box_2d'], properties: { box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } } } } } } }));
  assert.deepEqual(plain, [{ box: [0.2, 0.1, 0.6, 0.5] }], 'بلا نقاط وإن أعادها الموديل');
  assert.match(bodies[1].contents[0].parts[1].text, /Also return eyes \[y1, x1, y2, x2\]: the centre of each of the two eyes, and mouth \[y, x\]: the centre of the mouth, normalized to 0-1000 in the same way\. Return JSON \{"faces": \[\{"box_2d": \[\.\.\.\], "eyes": \[\.\.\.\], "mouth": \[\.\.\.\]\}\]\}/);
  assert.deepEqual(Object.keys(bodies[1].generationConfig.responseSchema.properties.faces.items.properties), ['box_2d', 'eyes', 'mouth']);
  assert.deepEqual(pts, [{ box: [0.2, 0.1, 0.6, 0.5], eyes: [[0.3, 0.25], [0.5, 0.26]], mouth: [0.4, 0.4] }]);
});

/* المراجعة العدائيّة لـv-body-upright (٤ مؤكّدة، مصلحة): وجه ثلاثة أرباع من تحت كان يُرفض، ومفتاح MERGE_FACE_CROPS كان يُتخطّى */
/* وجه ثلاثيّ الأبعاد مُسقَط بمنظور سيلفي: العينان ±٣٢ مم، والفم ٧٠ مم تحتهما و١٠ مم أمامهما، والكاميرا على ٣٥٠ مم؛ التفات (yaw) ثمّ
   انحناء (pitch) ثمّ ميل في الصورة (roll) — النقاط كما يراها الكاشف لوجه حقيقيّ */
function projectedFace(yawDeg, pitchDeg, rollDeg) {
  const W = 600, H = 1000, f = 1.6, D = 350;
  const th = yawDeg * Math.PI / 180, ph = pitchDeg * Math.PI / 180, ps = rollDeg * Math.PI / 180;
  const proj = ([x, y, z]) => {
    const x1 = x * Math.cos(th) + z * Math.sin(th), z1 = -x * Math.sin(th) + z * Math.cos(th);
    const y2 = y * Math.cos(ph) - z1 * Math.sin(ph), z2 = y * Math.sin(ph) + z1 * Math.cos(ph);
    const s = D / (D - z2), u = x1 * s * f, v = -y2 * s * f;
    return [W / 2 + u * Math.cos(ps) - v * Math.sin(ps), H / 2 + u * Math.sin(ps) + v * Math.cos(ps)];
  };
  const a = proj([-32, 0, 0]), b = proj([32, 0, 0]), m = proj([0, -70, 10]), top = proj([0, 75, -10]);
  const d = Math.hypot((a[0] + b[0]) / 2 - m[0], (a[1] + b[1]) / 2 - m[1]);
  const xs = [a[0], b[0], m[0], top[0]], ys = [a[1], b[1], m[1], top[1]];
  const box = [Math.min(...xs) - 0.6 * d, Math.min(...ys) - 0.6 * d, Math.max(...xs) + 0.6 * d, Math.max(...ys) + 0.6 * d];
  const img = paint(W, H, [[a, BLUE], [b, YELLOW], [m, RED], [top, GREEN]], 0.14 * d);
  const rel = (p) => [p[0] / W, p[1] / H];
  return { img, face: { box: [box[0] / W, box[1] / H, box[2] / W, box[3] / H].map((v) => Math.max(0, Math.min(1, v))), eyes: [rel(a), rel(b)], mouth: rel(m) } };
}

test('٢٠. المراجعة: وجه ملتفت ثلاثة أرباع مصوَّر من تحت أو فوق، مائل كصورتها (‎-٧٩°) ← لقطة مستقيمة لا null (كان حدّ التعامد ٠٫٥ يرفضه فيعود العطل نفسه)', () => {
  for (const yaw of [-45, 45]) {
    for (const pitch of [-35, -25, 25, 35]) {
      const why = 'yaw ' + yaw + ' pitch ' + pitch;
      const { img, face } = projectedFace(yaw, pitch, -79);
      const up = MI.uprightCrop(img, face);
      assert.ok(up, why + ': لقطة');
      const k = blobs(up.data);
      assert.ok(k.nL > 20 && k.nR > 20, why + ': العينان في اللقطة');
      assert.ok(k.L[0] < k.R[0], why + ': دوران لا مرآة');
      assert.ok(k.mouth[1] > Math.max(k.L[1], k.R[1]) + 0.1 * k.T, why + ': الفم تحت العينين');
      assert.ok(Math.abs(k.mouth[0] - (k.L[0] + k.R[0]) / 2) < 0.05 * k.T, why + ': محور الفم←العينين قائم ' + JSON.stringify(k));
      assert.ok(k.top[1] < Math.min(k.L[1], k.R[1]), why + ': قمّة الرأس فوق العينين');
    }
  }
});

test('٢١. المراجعة: MERGE_FACE_CROPS=off (إيقاف اللقطات بلا نشر) يوقف لقطة الجسم المستقيمة أيضًا ← صورته وحدها للرسم والقفل وفحص الجنس، والسجلّ «no face crop»', async () => {
  process.env.MERGE_FACE_CROPS = 'off';
  try {
    reset({ pts: [{ eyes: [250, 330, 450, 330], mouth: [350, 560] }], g: 'woman' });
    cache('toned');
    const logs = [], log0 = console.log;
    console.log = (...a) => { logs.push(a.join(' ')); };
    try { await post({ style: 'toned' }); } finally { console.log = log0; }
    assert.equal(imagesOf(proCalls()[0]).length, 1, 'صورته وحدها للرسم');
    assert.deepEqual(lockCalls[0].refs[0], { data: SRC, mime: 'image/png' }, 'القفل من الصورة كما كان (لا لقطة)');
    const look = calls.find((c) => /a man or a woman/.test(JSON.stringify((c.body && c.body.contents) || '')));
    assert.equal(look.body.contents[0].parts.filter((p) => p.inlineData).length, 1, 'فحص الجنس بالصورة وحدها');
    assert.ok(logs.some((s) => /body reframe toned: .*, no face crop\)$/.test(s)), logs.join(' | '));
  } finally { delete process.env.MERGE_FACE_CROPS; }
});
