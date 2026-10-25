// tests/studio-card-fix.test.cjs — v-style-match (تدقيق ٢٥ أكتوبر ٢٠٢٦، المالك: «الصور ما تطابق الشي اللي اخترته… افحصها
// واحد واحد» ثمّ «اصلح الاثنين» ثمّ «استعين بنانو بي الصور، أريد الصور مش غبشه ونظيفه ومرتبه»):
//   ١) سطر التنويع لا يناقض ما سمّاه الخيار، والضغطة الأولى ليست واحدة للميزة كلّها.
//   ٢) غطاء الرأس المسمّى في التراثي/الصورة الرسميّة لا يُقفل، وقفل الصورة الرسميّة يسمح باللبس.
//   ٣) البطاقة المصحَّحة: مفتاح ورابط جديدان، وصفها وتأطيرها وجنسها الخاصّة، وحذف القديم في الإنتاج وحده.
//   ٤) البطاقات من نانو بنانا برو 2K وتُصغَّر WebP حادّة؛ والفشل يعرض القديمة مؤقّتًا بلا تخزين.
//   ٥) الواجهة: مرآة REV نفسها، والصور الجاهزة الخاطئة تأخذ المولّدة، وتبويبات الأظافر والبشرة والمكياج معاينة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'studio-card-fix-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.OPENAI_API_KEY = 'oa-test';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const raw = new Map();
const dels = [];
stub('api/_lib/kv.js', {
  kvGetRaw: async (k) => (raw.has(k) ? raw.get(k) : null),
  kvSetRaw: async (k, v) => { raw.set(k, v); },
  kvSetIfAbsent: async () => true,
  kvDel: async (k) => { dels.push(k); raw.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvIncr: async () => 1, kvExpire: async () => {},
});

const variants = require(rp('api/_lib/studio-variants.js'));
const faceLock = require(rp('api/_lib/face-lock.js'));
const studioCreate = require(rp('api/_lib/studio-create.js'));
const STYLES = require(rp('api/_lib/studio-styles.js'));
const MORE = require(rp('api/_lib/studio-more.js'));
const CARD_FIX = require(rp('api/_lib/studio-card-fix.js'));
const preview = require(rp('api/_lib/studio-preview.js'));
const textOf = (f, s) => (STYLES.STYLE_TEXT[f] || MORE.STYLE_PROMPTS[f] || {})[s];

/* كلّ أرقام الدورة لخيار — للتأكّد أنّ لا رقم يأتي بقيمة ممنوعة */
function allDirectives(f, s) {
  const t = textOf(f, s);
  if (!variants.hasVariation(f, s, t)) return [];
  const total = Math.min(variants.variantCount(f, s, t), 3000);
  const out = [];
  for (let n = 0; n < total; n++) out.push(variants.variantDirective(f, n, s, t));
  return out;
}

test('١. التنويع لا يناقض الخيار: حلاقة كاملة بلا لحية، الخلفيّة البيضاء بلا ليل، بلا إطار بلا إطار سميك', () => {
  const clean = Object.keys(STYLES.STYLE_TEXT.beard).filter((k) => /clean-shaven/.test(STYLES.STYLE_TEXT.beard[k]));
  assert.ok(clean.length >= 2, 'خيارات الحلاقة الكاملة موجودة');
  for (const s of clean) {
    assert.ok(!/VARIATION/.test(studioCreate.buildSinglePrompt('beard', s, '', false, 1)), 'beard/' + s + ': حلاقة كاملة يصلها تنويع لحية');
  }
  const cases = [
    ['beard', 'stubble', /fullest length|thick and dense|very thick/],
    ['background', 'plainwhite', /at night|clouds|golden-hour|wide and open/],
    ['glasses', 'rimless', /bold thick frame|acetate|metal/],
    ['makeup', 'natural', /maximum intensity|strong and defined|strong luminous/],
    ['hair', 'black', /blown out|high-gloss|blunt even ends|tapered ends/],
    ['menhair', 'buzz', /blown out|parting|over the shoulders|ends/],
  ];
  for (const [f, s, bad] of cases) {
    assert.ok(textOf(f, s), f + '/' + s + ' موجود');
    for (const d of allDirectives(f, s)) assert.ok(!bad.test(d), f + '/' + s + ': توجيه يناقض الخيار — ' + d);
  }
  // الأنمي: القالب يحفظ التكوين، فلا محور تكوين أبدًا
  for (const s of Object.keys(STYLES.STYLE_TEXT.anime).slice(0, 20)) {
    for (const d of allDirectives('anime', s)) assert.ok(!/bust shot|upper-body shot|off-centre|tilted framing/.test(d), 'anime/' + s + ': ' + d);
  }
  // الألوان والصورة الرسميّة بلا تنويع زيّ (تطريز/حزام/درجة شبه سوداء)
  for (const f of ['palette', 'idphoto']) {
    const s = Object.keys(MORE.STYLE_PROMPTS[f])[0];
    assert.ok(!/VARIATION/.test(studioCreate.buildSinglePrompt(f, s, '', false, 2)), f + ': ما زال يأخذ تنويع الزيّ');
  }
});

test('٢. الضغطة الأولى لكلّ خيار ليست التوجيه نفسه للميزة كلّها، والمخزون الكامل باقٍ', () => {
  const henna = Object.keys(MORE.STYLE_PROMPTS.henna).slice(0, 12);
  const firsts = new Set(henna.map((s) => variants.variantDirective('henna', 1, s, textOf('henna', s))));
  assert.ok(firsts.size >= 6, 'الضغطة الأولى متطابقة في أغلب خيارات الحنّاء (' + firsts.size + ')');
  assert.ok(variants.variantCount('henna') >= 1000, 'مخزون الحنّاء بلا وصف كما هو');
  // أغلب الخيارات ما زالت تتنوّع (طلب المالك ٢٩ سبتمبر «أكثر من ١٠٠ في كلّ شكل» للخيارات التي تترك مجالًا)
  for (const f of ['henna', 'hair', 'makeup', 'glasses', 'tattoo']) {
    const map = STYLES.STYLE_TEXT[f] || MORE.STYLE_PROMPTS[f];
    const keys = Object.keys(map);
    const varying = keys.filter((k) => variants.hasVariation(f, k, map[k])).length;
    assert.ok(varying / keys.length >= 0.6, f + ': ' + varying + ' من ' + keys.length + ' فقط تتنوّع');
  }
});

test('٣. غطاء الرأس المسمّى لا يُقفل: التراثي والصورة الرسميّة؛ وبلا غطاء يبقى القفل كما كان', () => {
  assert.equal(faceLock.protectLevel('heritage', null, 'a traditional Omani look: a white dishdasha with an embroidered kumma cap'), 'face');
  assert.equal(faceLock.protectLevel('idphoto', null, 'a white kandura with a white ghutra and black agal on a plain white background'), 'face');
  assert.equal(faceLock.protectLevel('heritage', null, 'a black bisht cloak with gold trim over a white kandora'), 'body', 'البشت وحده: الغترة تبقى (v-studio-lock)');
  assert.equal(faceLock.protectLevel('idphoto', null, 'a plain white background, front-facing'), 'head');
  assert.equal(faceLock.protectLevel('heritage'), 'body', 'بلا وصف كما كان');
  assert.equal(faceLock.protectLevel('wedding', null, 'a bridal veil and gown'), 'face', 'الزفاف لا يتغيّر');
  const src = read('api/_lib/studio-create.js');
  assert.match(src, /faceLock\.protectLevel\(feature, null, styleTextOf\(feature, style\)\)/, 'المعالج لا يمرّر وصف الخيار للقفل');
});

test('٤. قفل الصورة الرسميّة يسمح باللبس المسمّى، وقفل الجلد لا يمنع خيارات شكل الظفر', () => {
  const suit = Object.keys(MORE.STYLE_PROMPTS.idphoto).find((k) => /suit/.test(MORE.STYLE_PROMPTS.idphoto[k]));
  assert.ok(suit, 'خيار بدلة في الصورة الرسميّة');
  assert.match(studioCreate.buildSinglePrompt('idphoto', suit, '', false, 1), /Change ONLY the background, framing and the outfit named in the request/);
  const nails = studioCreate.buildSinglePrompt('nails', Object.keys(STYLES.STYLE_TEXT.nails)[0], '', false, 1);
  assert.match(nails, /same nail shape and length unless the requested style itself names a nail shape or length/);
});

/* ───── المعالج الحقيقيّ للمعاينة بمخزن ومولّد مزيّفين ───── */
const TINY_PNG = (() => { const { PNG } = require('pngjs'); const p = new PNG({ width: 300, height: 450 }); for (let i = 0; i < p.data.length; i += 4) { p.data[i] = (i / 4) % 300 < 150 ? 255 : 0; p.data[i + 1] = 40; p.data[i + 2] = 90; p.data[i + 3] = 255; } return PNG.sync.write(p).toString('base64'); })();
const calls = [];
let nanoFails = false;
global.fetch = async (url, init) => {
  const u = String(url);
  calls.push({ u, body: init && init.body ? JSON.parse(init.body) : null });
  if (/gemini-3-pro-image:generateContent/.test(u)) {
    if (nanoFails) return { ok: false, status: 402, json: async () => ({ error: { message: 'Your prepayment credits are depleted' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: TINY_PNG } }] } }] }) };
  }
  if (/api\.openai\.com/.test(u)) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: Buffer.from('trend').toString('base64') }] }) };
  return { ok: false, status: 404, json: async () => ({}) };
};
const call = (query) => new Promise((resolve) => {
  const res = { headers: {}, code: 200, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(j) { this.body = j; resolve(this); }, end(b) { this.body = b; resolve(this); } };
  preview({ method: 'GET', query, headers: {} }, res);
});

test('٥. البطاقة المصحَّحة: مفتاح جديد، ووصفها وتأطيرها وجنسها، ونانو بنانا برو 2K بطول ٢:٣ ← WebP', async () => {
  const f = 'iconic', v = Object.keys(MORE.STYLE_PROMPTS.iconic)[0], fk = f + ':' + v;
  const saved = { r: CARD_FIX.REV[fk], d: CARD_FIX.DESC[fk], fr: CARD_FIX.FRAME[fk], s: CARD_FIX.SUBJECT[fk] };
  CARD_FIX.REV[fk] = 7; CARD_FIX.DESC[fk] = 'CARD-ONLY-DESC'; CARD_FIX.FRAME[fk] = 'CARD-ONLY-FRAME'; CARD_FIX.SUBJECT[fk] = 'm';
  raw.clear(); calls.length = 0; nanoFails = false;
  raw.set('studio:preview:v2:' + fk, Buffer.from('old').toString('base64'));
  try {
    const r = await call({ feature: f, value: v, r: '7' });
    assert.equal(r.code, 200);
    assert.ok(raw.has('studio:preview:v2:' + fk + ':r7'), 'المفتاح الجديد لم يُحفظ');
    const nano = calls.filter((c) => /gemini-3-pro-image:generateContent/.test(c.u));
    assert.equal(nano.length, 1, 'نداء نانو بنانا برو واحد');
    assert.equal(calls.filter((c) => /openai/.test(c.u)).length, 0, 'لا مولّد آخر لبطاقة الستايل');
    const body = nano[0].body;
    assert.deepEqual(body.generationConfig.imageConfig, { imageSize: '2K', aspectRatio: '2:3' });
    const prompt = body.contents[0].parts[0].text;
    assert.match(prompt, /CARD-ONLY-DESC/); assert.match(prompt, /CARD-ONLY-FRAME/); assert.match(prompt, /young Arab man/);
    assert.match(prompt, /Tack-sharp focus/); assert.match(prompt, /clean uncluttered composition/);
    const out = Buffer.from(r.body);
    assert.equal(out.slice(8, 12).toString('latin1'), 'WEBP', 'الناتج WebP');
    assert.equal(r.headers['Cache-Control'], 'public, max-age=31536000, immutable');
    // خارج الإنتاج (معاينة طلب السحب — نفس Redis): القديم لا يُحذف
    assert.equal(dels.length, 0, 'حُذف مفتاح خارج الإنتاج');
  } finally {
    for (const [m, k] of [[CARD_FIX.REV, 'r'], [CARD_FIX.DESC, 'd'], [CARD_FIX.FRAME, 'fr'], [CARD_FIX.SUBJECT, 's']]) { if (saved[k] === undefined) delete m[fk]; else m[fk] = saved[k]; }
  }
});

test('٦. الإنتاج يحذف المفتاح القديم مرّة؛ وفشل التوليد يعرض القديمة مؤقّتًا بلا تخزين', async () => {
  const f = 'age', v = Object.keys(MORE.STYLE_PROMPTS.age)[1], fk = f + ':' + v;
  const had = CARD_FIX.REV[fk];
  CARD_FIX.REV[fk] = 2;
  raw.clear(); calls.length = 0; dels.length = 0;
  const env = process.env.VERCEL_ENV;
  try {
    raw.set('studio:preview:v2:' + fk, Buffer.from('old').toString('base64'));
    nanoFails = true;
    const fail = await call({ feature: f, value: v, r: '2' });
    assert.equal(fail.code, 200, 'القديمة بدل البطاقة الفارغة');
    assert.equal(Buffer.from(fail.body).toString(), 'old');
    assert.equal(fail.headers['Cache-Control'], 'no-store', 'القديمة لا تُخزَّن سنة تحت الرابط الجديد');
    assert.ok(!raw.has('studio:preview:v2:' + fk + ':r2'));
    nanoFails = false;
    process.env.VERCEL_ENV = 'production';
    const ok = await call({ feature: f, value: v, r: '2' });
    assert.equal(ok.code, 200);
    await new Promise((z) => setImmediate(z));
    assert.deepEqual(dels.sort(), ['studio:preview:v2:' + fk, 'studio:preview:v2:' + fk + ':r1'].sort(), 'المفاتيح القديمة');
    await call({ feature: f, value: v, r: '2' });
    assert.equal(dels.length, 2, 'الحذف مرّة واحدة لكلّ نسخة');
    // غير المصحَّح كما كان: مفتاحه v2 بلا لاحقة، ولا حذف
    const plain = Object.keys(MORE.STYLE_PROMPTS.age)[2];
    if (!CARD_FIX.REV['age:' + plain]) {
      await call({ feature: 'age', value: plain });
      assert.ok(raw.has('studio:preview:v2:age:' + plain));
    }
  } finally {
    nanoFails = false;
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
    if (had === undefined) delete CARD_FIX.REV[fk]; else CARD_FIX.REV[fk] = had;
  }
});

test('٧. التصغير بمتوسّط المساحة: الأبعاد والحدّ بين لونين بلا ضباب عريض', async () => {
  const ic = require(rp('api/_lib/img-convert.js'));
  const big = { width: 8, height: 2, data: new Uint8Array(8 * 2 * 4) };
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { const p = (y * 8 + x) * 4; big.data[p] = x < 4 ? 255 : 0; big.data[p + 3] = 255; }
  const s = ic.__shrinkArea(big, 4, 1);
  assert.equal(s.width, 4); assert.equal(s.height, 1);
  assert.deepEqual([s.data[0], s.data[4], s.data[8], s.data[12]], [255, 255, 0, 0], 'الحافّة حادّة');
  const card = await ic.toCardWebp(TINY_PNG, 200, 88);
  assert.equal(card.width, 200); assert.equal(card.height, 300);
});

test('٨. البيانات: كلّ مفتاح خيار حقيقيّ، والواجهة مرآة REV نفسها، والصور الجاهزة الخاطئة موجودة', () => {
  const real = (k) => { const [f, v] = k.split(':'); return !!textOf(f, v); };
  for (const m of ['REV', 'DESC', 'FRAME', 'SUBJECT']) for (const k of Object.keys(CARD_FIX[m])) assert.ok(real(k), m + ': ' + k + ' ليس خيارًا');
  for (const k of Object.keys(CARD_FIX.DESC).concat(Object.keys(CARD_FIX.FRAME), Object.keys(CARD_FIX.SUBJECT))) assert.ok(CARD_FIX.REV[k] >= 1, k + ': تغيّرت بطاقته بلا رقم مراجعة (الكاش القديم يبقى)');
  for (const v of Object.values(CARD_FIX.SUBJECT)) assert.ok(v === 'm' || v === 'w');
  const app13 = read('js/app-13-stocks-init.js');
  const m = app13.match(/const STUDIO_CARD_REV = (\{[^}]*\});/);
  assert.ok(m, 'مرآة REV في الواجهة');
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')'))), JSON.parse(JSON.stringify(CARD_FIX.REV)), 'الواجهة والخادم مختلفان في أرقام المراجعة');
  const w = app13.match(/const STUDIO_STATIC_WRONG = new Set\(\[([^\]]*)\]\);/);
  for (const name of JSON.parse(JSON.stringify(vm.runInNewContext('[' + w[1] + ']')))) {
    assert.ok(fs.existsSync(path.join(root, 'assets/studio/options', name + '.webp')), name + ': ليست صورة جاهزة');
    assert.ok(CARD_FIX.REV[name.replace('-', ':')] >= 1, name + ': البديل المولّد بلا مراجعة');
  }
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes(m[0]), 'الحزمة لم تُبنَ بعد التعديل');
});

test('٩. الواجهة: رابط المراجعة، والصورة الجاهزة الخاطئة تذهب للمولّدة، وتبويبات الأظافر والبشرة والمكياج معاينة', () => {
  const src = read('js/app-13-stocks-init.js');
  const a = src.indexOf('const PREVIEW_API = ');
  const b = src.indexOf('const IS_MORE = ', a);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.f = optionImgs; this.P = PREVIEW_API; this.REV = STUDIO_CARD_REV; this.W = STUDIO_STATIC_WRONG; this.T = STUDIO_TAB_PREVIEW;', ctx);
  const revKeys = Object.keys(ctx.REV);
  if (revKeys.length) {
    const [f, v] = revKeys[0].split(':');
    assert.equal(ctx.P(f, v), '/api/studio-preview?feature=' + f + '&value=' + v + '&r=' + ctx.REV[revKeys[0]]);
  }
  assert.equal(ctx.P('hair', 'zzz'), '/api/studio-preview?feature=hair&value=zzz', 'غير المصحَّح بلا لاحقة');
  for (const name of ctx.W) {
    const [f, v] = [name.slice(0, name.indexOf('-')), name.slice(name.indexOf('-') + 1)];
    const r = ctx.f(f, v);
    assert.match(r.img, /^\/api\/studio-preview/, name + ': ما زالت الجاهزة الخاطئة');
    assert.equal(r.img2, '', name + ': الخاطئة احتياطًا');
  }
  assert.deepEqual([...ctx.T].sort(), ['makeup', 'nails', 'skin']);
  assert.match(src, /const staticTab = !STUDIO_TAB_PREVIEW\.has\(f\) && \(STUDIO_STATIC_FEATS\.has\(f\) \|\| !IS_MORE\(f\)\);/);
});
