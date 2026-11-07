// tests/studio-celeb.test.cjs — v-celeb-style (طلب المالك ٧ نوفمبر ٢٠٢٦: «خاصية تصور مع مشاهير العالم كلهم، المشاهير القدماء والجدد،
// وتكون في الاستايل»، ثمّ «الحينه فقط لي المالك فقط لا تنشره»، واختار «شيلها عنّي» لموانع السياسيّين والحكّام والأسر الحاكمة والمشايخ).
// المعالج الحقيقيّ (studio-create) بـKV في الذاكرة وfetch مزيّف — لا شبكة ولا مفاتيح حقيقيّة:
//   غير المالك لا يصل الميزة أصلًا؛ الاسم يُنظَّف؛ ألقاب الأنبياء والصحابة وآل البيت تُحجب قبل أيّ نداء ولو بتشكيل؛ الفحص (بمخطّط)
//   يحجب للجميع الأنبياء والصحابة وآل البيت والقُصّر والنصّ الذي فيه غير الاسم والخياليّ وغير المعروف، ويرفع موانع السياسيّين والحكّام
//   والأسر الحاكمة والمشايخ عن المالك وحده؛ تعذّر الفحص أو نوع خارج القائمة = لا توليد؛ الاسم المكتوب لا يدخل أمر الصورة أبدًا؛
//   رفض المولّد (أو الاحتياط) = ٤٢٢ بلا إنقاذ بمحرّك آخر؛ الواجهة: التبويب للمالك وحده بثمانية مشاهد مطابقة للخادم بالـ١٤ لغة،
//   والنصوص الثمانية في كلّ ملفّات اللغات. (المراجعة العدائيّة: ١٥ عيبًا مؤكّدًا، كلّها هنا.)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.AUTH_SECRET = 'studio-celeb-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MERGE_FACE_CROPS = 'off';
for (const k of ['FAL_KEY', 'FAL_BACKUP', 'FAL_BACKUP_TEST_UNTIL', 'FAL_BACKUP_CAP_CENTS', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'IMAGE_DUO', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];
process.env.OPENAI_API_KEY = 'oa-test'; // موجود عمدًا: الرفض لا يذهب إليه

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

const IMG = Buffer.from('celeb-result').toString('base64');
const SRC = Buffer.from('user-photo').toString('base64');
// verdict: جواب الفحص المزيّف | 'down' ؛ image: 'ok' | 'refuse' | 'busy' | 'depleted' ؛ fal: رمز ردّ الاحتياط
let verdict = null, image = 'ok', falStatus = 422;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ u, body });
  if (/gemini-flash-latest:generateContent/.test(u)) {
    if (verdict === 'down') return Response.json({ error: { message: 'boom' } }, { status: 500 });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] });
  }
  if (/gemini-3-pro-image:generateContent/.test(u)) {
    if (image === 'busy') return Response.json({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' } }, { status: 429 });
    if (image === 'depleted') return Response.json({ error: { code: 429, message: 'Your prepayment credits are depleted.' } }, { status: 429 });
    if (image === 'refuse') return Response.json({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [{ text: 'I can\'t create that.' }] } }] });
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: IMG } }] } }] });
  }
  if (/^https:\/\/fal\.run\//.test(u)) return new Response('{"detail":[{"msg":"content policy","type":"content_policy_violation"}]}', { status: falStatus });
  if (/api\.openai\.com/.test(u)) return Response.json({ data: [{ b64_json: IMG }] });
  throw new Error('نداء يفلت من المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

const auth = require(rp('api/_lib/auth.js'));
const studioCreate = require(rp('api/_lib/studio-create.js'));
const falBackup = require(rp('api/_lib/fal-fallback.js'));
const celeb = studioCreate.celeb;

const V = (o) => Object.assign({ only_name: true, real: true, known: true, name: 'Lionel Messi', sacred: false, kind: 'athlete', minor: false, photographed: true }, o);
function reset(o) { store.clear(); calls.length = 0; verdict = (o && 'verdict' in o) ? o.verdict : V(); image = (o && o.image) || 'ok'; }
async function post(user, body) {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b }); return this; }, end(b) { done({ code: this.code, raw: b }); return this; } };
  const [out] = await Promise.all([sent, studioCreate({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user), feature: 'celeb', style: 'redcarpet', celebName: 'ميسي', imageBase64: SRC, mimeType: 'image/jpeg' }, body) }, res)]);
  return out;
}
const imageCalls = () => calls.filter((c) => /gemini-3-pro-image/.test(c.u));
const checkCalls = () => calls.filter((c) => /gemini-flash-latest/.test(c.u));
const oaiCalls = () => calls.filter((c) => /api\.openai\.com/.test(c.u));
const falCalls = () => calls.filter((c) => /fal\.run/.test(c.u));
const promptOf = (c) => c.body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');

test('١. غير المالك: الميزة غير موجودة — ٤٠٠ بلا أيّ نداء (لا فحص ولا توليد ولا حجز)', async () => {
  reset();
  const r = await post('someone', {});
  assert.equal(r.code, 400);
  assert.equal(r.body.error, 'Unknown feature');
  assert.equal(calls.length, 0);
  reset();
  const r2 = await post('someone', { token: '' });
  assert.equal(r2.code, 400);
  assert.equal(calls.length, 0);
});

test('٢. المالك: اسم فارغ ← celeb_name_required، ومكتوب لكن غير صالح ← celeb_name_only، ومشهد مجهول ← ٤٠٠ — قبل أيّ نداء', async () => {
  for (const n of ['', '   ']) {
    reset();
    const r = await post('omran', { celebName: n });
    assert.equal(r.code, 400, JSON.stringify(n));
    assert.equal(r.body.error, 'celeb_name_required');
  }
  for (const n of ['a', '"<>"', 'http://x.y/z', 'Muhammad bin Rashid bin Saeed bin Maktoum bin Hasher Al Maktoum']) {
    reset();
    const r = await post('omran', { celebName: n });
    assert.equal(r.code, 400, JSON.stringify(n));
    assert.equal(r.body.error, 'celeb_name_only', n);
    assert.equal(calls.length, 0);
  }
  reset();
  const r = await post('omran', { style: 'bedroom' });
  assert.equal(r.code, 400);
  assert.equal(calls.length, 0);
});

test('٣. ألقاب الأنبياء والصحابة وآل البيت تُحجب محلّيًّا قبل الفحص — ولو بتشكيل أو تطويل أو محارف خفيّة؛ والأسماء المجرّدة تمرّ', async () => {
  const BLOCK = ['النبي محمد', 'النَّبِيّ محمد', 'والنبي', 'عيسى عليه السلام', 'عيسى عليهِ السّلام', 'أبو بكر رضي الله عنه', 'أبو بكر رضيَ اللهُ عنه',
    'أبو بكر (رض)', 'رسول الله', 'رسـول الله', 'أم المؤمنين خديجة', 'سيدنا علي', 'الإمام الحسين', 'يسوع', 'مريم العذراء',
    'Prophet Muhammad', 'Muhammad pbuh', 'Hz. Ali', 'Ali (as)', 'Hazrat Umar', 'Jesus Christ', 'رسول​ الله'];
  for (const n of BLOCK) {
    reset();
    const r = await post('omran', { celebName: n });
    assert.equal(r.code, 422, n);
    assert.equal(r.body.error, 'celeb_blocked', n);
    assert.equal(calls.length, 0, n + ': لا نداء');
  }
  for (const n of ['محمد صلاح', 'عمر الشريف', 'محمد عبده', 'حسين الجسمي', 'رسول خان', 'نبيل شعيل', 'الإمام عبدالرحمن السديس',
    'Allah Rakha', 'Christopher Nolan', 'Gabriel Jesus', 'Moses Malone']) {
    assert.equal(celeb.sacredName(n), false, n + ': اسم مجرّد — الفحص يحسمه');
  }
});

test('٤. الفحص يحجب للجميع: نبيّ/صحابيّ/آل البيت (ولو صُنّف حاكمًا أو عالمًا)، قاصر، نصّ فيه غير الاسم، خياليّ، غير معروف — بلا توليد', async () => {
  const cases = [
    [{ sacred: true, kind: 'sacred', name: 'Prophet Muhammad' }, 'celeb_blocked'],
    [{ sacred: true, kind: 'head_of_state', name: 'Ali ibn Abi Talib' }, 'celeb_blocked'],
    [{ sacred: false, kind: 'sacred' }, 'celeb_blocked'],
    [{ minor: true }, 'celeb_blocked'],
    [{ only_name: false }, 'celeb_name_only'],
    [{ real: false, name: 'Batman', kind: 'other' }, 'celeb_unknown'],
    [{ known: false }, 'celeb_unknown'],
    [{ name: '' }, 'celeb_unknown'],
  ];
  for (const [v, code] of cases) {
    reset({ verdict: V(v) });
    const r = await post('omran', { celebName: 'محمد' });
    assert.equal(r.code, 422, JSON.stringify(v));
    assert.equal(r.body.error, code, JSON.stringify(v));
    assert.equal(checkCalls().length, 1);
    assert.equal(imageCalls().length, 0, JSON.stringify(v));
  }
  // الفحص بمخطّط: النوع من القائمة والحقول إلزاميّة، وتعريف القاصر يشمل من عُرف طفلًا ومن مات قبل الثامنة عشرة
  reset();
  await post('omran', {});
  const cfg = checkCalls()[0].body.generationConfig;
  assert.deepEqual(cfg.responseSchema.properties.kind.enum, celeb.KINDS);
  assert.deepEqual(cfg.responseSchema.required.slice().sort(), ['kind', 'known', 'minor', 'name', 'only_name', 'photographed', 'real', 'sacred']);
  const cp = promptOf(checkCalls()[0]);
  assert.match(cp, /died before turning 18, or is known mainly from photos taken when they were under 18/);
  assert.match(cp, /true even if they were also a caliph, ruler, commander, imam or scholar/);
  assert.match(cp, /the Twelve Imams/);
});

test('٥. «شيلها عنّي»: السياسيّون والحكّام والأسر الحاكمة والمشايخ مفتوحة للمالك — ومحجوبة لغيره حين تُفتح الميزة', async () => {
  for (const kind of celeb.PUBLIC_BLOCK) {
    reset({ verdict: V({ kind, name: 'Some Figure' }) });
    const r = await post('omran', { celebName: 'شخصية عامة' });
    assert.equal(r.code, 200, kind);
    assert.equal(imageCalls().length, 1, kind);
    assert.equal(celeb.blockReason(V({ kind }), { owner: true }), '', kind);
    assert.equal(celeb.blockReason(V({ kind }), { owner: false }), 'celeb_blocked', kind);
  }
  assert.deepEqual(celeb.PUBLIC_BLOCK.slice().sort(), ['head_of_state', 'politician', 'religious_scholar', 'royal']);
  assert.equal(celeb.blockReason(V({ sacred: true }), { owner: true }), 'celeb_blocked');
  assert.equal(celeb.blockReason(V({ minor: true }), { owner: true }), 'celeb_blocked');
});

test('٦. تعذّر الفحص (عطل، حقل ناقص، نوع خارج القائمة) ← ٥٠٣ unavailable بلا توليد؛ والنوع بمسافة أو شرطة يُطبَّع', async () => {
  for (const v of ['down', { real: 'yes' }, V({ kind: 'prophet' }), V({ only_name: undefined }), V({ sacred: 'no' })]) {
    reset({ verdict: v });
    const r = await post('omran', {});
    assert.equal(r.code, 503, JSON.stringify(v));
    assert.equal(r.body.error, 'unavailable');
    assert.equal(imageCalls().length, 0);
  }
  assert.equal(celeb.parseCheck(JSON.stringify(V({ kind: 'Head of State' }))).kind, 'head_of_state');
  assert.equal(celeb.parseCheck(JSON.stringify(V({ kind: 'religious-scholar' }))).kind, 'religious_scholar');
  assert.equal(celeb.parseCheck(JSON.stringify(V({ kind: 'wizard' }))), null);
  assert.equal(celeb.parseCheck(JSON.stringify(V({ name: 'A "B" (C) <d>' }))).name, 'A B C d');
});

test('٧. النجاح: صورة المستخدم وحدها + الاسم الشائع من الفحص (لا المكتوب) + المشهد + منع التلامس والنصوص، بقالب هويّة الدمج و٠٫١٥ و2K', async () => {
  reset();
  const r = await post('omran', {});
  assert.equal(r.code, 200);
  assert.equal(r.body.imageBase64, IMG);
  assert.equal(oaiCalls().length, 0);
  assert.equal(checkCalls()[0].body.generationConfig.thinkingConfig.thinkingBudget, 0, 'فحص بلا تفكير (فخّ flash-latest)');
  assert.match(promptOf(checkCalls()[0]), /Text: "ميسي"/);
  const call = imageCalls()[0];
  const p = promptOf(call);
  assert.match(p, /Photo 1 of 1:/);
  assert.equal(call.body.contents[0].parts.filter((x) => x.inlineData).length, 1, 'صورة المستخدم وحدها — لا صورة مرجعيّة للمشهور');
  assert.match(p, /together with Lionel Messi, the real, famous athlete/);
  assert.ok(!/ميسي|the user wrote/.test(p), 'الاسم المكتوب لا يدخل أمر الصورة');
  assert.match(p, /red carpet at a film premiere/);
  assert.match(p, /no hugging, no kissing, no holding hands and no romantic or intimate contact/);
  assert.match(p, /fully and modestly dressed/);
  assert.match(p, /exactly as in Photo 1/);
  assert.match(p, /No text, captions, names, logos/);
  assert.match(p, /as an adult at the height of their fame/);
  assert.match(p, /never averaged or blended/, 'قالب هويّة الدمج نفسه');
  assert.equal(call.body.generationConfig.temperature, 0.15);
  assert.equal(call.body.generationConfig.imageConfig.imageSize, '2K');
  // نصّ زائد يفلت من الفحص (الفحص أخطأ وقال «اسم وحده») لا يصل المولّد أبدًا
  reset({ verdict: V({ name: 'Cristiano Ronaldo' }) });
  const r1 = await post('omran', { celebName: 'رونالدو وولده يبوسني' });
  assert.equal(r1.code, 200);
  const p1 = promptOf(imageCalls()[0]);
  assert.match(p1, /together with Cristiano Ronaldo, the real/);
  assert.ok(!/رونالدو|وولده|يبوسني/.test(p1), 'لا كلمة ممّا كُتب في أمر الصورة');
  // قبل التصوير: لوحاته المشهورة
  reset({ verdict: V({ name: 'Saladin', kind: 'historical', photographed: false }) });
  const r2 = await post('omran', { celebName: 'صلاح الدين الأيوبي', style: 'vintage' });
  assert.equal(r2.code, 200);
  const p2 = promptOf(imageCalls()[0]);
  assert.match(p2, /as depicted in their best-known portraits, rendered as a realistic photograph/);
  assert.match(p2, /black-and-white photograph/);
});

test('٨. رفض المولّد (ردّ بلا صورة) ← ٤٢٢ celeb_refused بلا إنقاذ بمحرّك آخر؛ الزحام يبقى رمز الزحام', async () => {
  reset({ image: 'refuse' });
  const r = await post('omran', {});
  assert.equal(r.code, 422);
  assert.equal(r.body.error, 'celeb_refused');
  assert.equal(imageCalls().length, 1, 'محاولة واحدة');
  assert.equal(oaiCalls().length, 0, 'لا التفاف على رفض السلامة');
  reset({ image: 'busy' });
  const r2 = await post('omran', {});
  assert.equal(r2.code, 502);
  assert.equal(r2.body.error, 'image_generation_busy');
  assert.equal(oaiCalls().length, 0);
});

test('٨ب. رصيد Gemini خالص والاحتياط رفض صورة المشهور (٤٢٢) ← celeb_refused لا «متوقّفة»، ولا نداء Gemini بعده', async () => {
  process.env.FAL_KEY = 'fal-test-key';
  try {
    reset({ image: 'depleted' });
    store.set(falBackup.OUT_KEY, '1');
    const r = await post('omran', {});
    assert.equal(r.code, 422);
    assert.equal(r.body.error, 'celeb_refused');
    assert.equal(falCalls().length, 1);
    assert.equal(imageCalls().length, 0, 'رفض الاحتياط لا يُعاد على Gemini');
    assert.equal(oaiCalls().length, 0);
  } finally { delete process.env.FAL_KEY; }
});

test('٩. تنظيف الاسم: علامات وأقواس وروابط وأسطر تُزال، ستّون حرفًا بحدّ كلمة، وأكثر من ثماني كلمات مرفوض', () => {
  assert.equal(celeb.sanitizeName('  "ميسي"\n<b>  '), 'ميسي b');
  assert.equal(celeb.sanitizeName('رونالدو (وولده)'), 'رونالدو وولده');
  assert.equal(celeb.sanitizeName('Messi https://x.com/a'), 'Messi');
  assert.equal(celeb.sanitizeName('أم‏كلثوم'), 'أم كلثوم');
  const long = 'Joannes Chrysostomus Wolfgangus Theophilus Mozart Salzburgensis';
  assert.ok(long.length > 60);
  assert.equal(celeb.sanitizeName(long), 'Joannes Chrysostomus Wolfgangus Theophilus Mozart', 'القصّ عند حدّ كلمة');
  assert.equal(celeb.sanitizeName('a b c d e f g h i j'), '');
  assert.equal(celeb.sanitizeName(null), '');
  // المصدر بلا محارف خفيّة حرفيّة (هروب \u صريح)
  assert.ok(!/[​-‏‪-‮⁦-⁩]/.test(read('api/_lib/studio-create.js')), 'محرف خفيّ حرفيّ في المصدر');
});

test('١٠. الواجهة: التبويب للمالك وحده، ثمانية مشاهد مطابقة للخادم بالـ١٤ لغة وبطاقات لونيّة، والاسم في الطلب، ولا سلّة ولا وصف ولا مقارنة ولا قبل/بعد', () => {
  const src = read('js/app-13-stocks-init.js');
  const m = src.match(/STUDIO_OPTIONS\.celeb = (\[[\s\S]*?\n  \]);/);
  assert.ok(m, 'خيارات المشاهد');
  const opts = Function('return ' + m[1])();
  assert.deepEqual(opts.map((o) => o.value).sort(), Object.keys(celeb.SCENES).sort());
  const LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  for (const o of opts) {
    for (const lg of LANGS) assert.ok(String(o[lg] || '').trim(), o.value + ':' + lg);
    assert.match(String(o.bg || ''), /^radial-gradient\(/, o.value + ': بطاقة بلون المشهد');
  }
  assert.match(src, /function ensureCelebTab\(\)\{[\s\S]*?if\(!celebOwner\(\)\)\{[\s\S]*?b\.remove\(\);/);
  assert.match(src, /const celebOwner = \(\) => \{ try\{ return typeof omranOwnerUi === 'function' && !!omranOwnerUi\(\); \}/);
  assert.match(src, /ensureCelebTab\(\); \/\* v-celeb-style: المالك دخل بعد الإقلاع، أو خرج \*\/\n    setFeature\(feature\);/);
  assert.match(src, /if\(celebRun\)\{ payload\.celebName = celebNameEl\.value\.trim\(\); delete payload\.description; payload\.multiAngle = false; \}/);
  assert.match(src, /addBtn\.disabled = inB \|\| feature === 'merge' \|\| feature === 'celeb';/);
  assert.match(src, /display:' \+ \(feature === 'celeb' \? 'none' : 'flex'\)/, 'صندوق السلّة مخفيّ');
  assert.match(src, /const n = feature === 'celeb' \? 0 : studioBasket\.length;/, 'زرّ التوليد لا يعد بالسلّة');
  assert.match(src, /if\(studioBasket\.length && feature !== 'merge' && !celebRun\)\{/);
  assert.match(src, /if\(feature === 'merge' \|\| feature === 'celeb' \|\| !selectedBase64A\)\{/);
  assert.match(src, /const dataUrl = celebRun \? await celebStamp\(rawUrl\) : rawUrl;/);
  assert.match(src, /if\(f === 'celeb'\)\{[^\n]*\n[^\n]*STUDIO_OPTIONS\.celeb[^\n]*\n\s*return \{ img: '', img2: '', bg: \(sc && sc\.bg\) \|\| '' \};/, 'لا طلب معاينة مولّدة لمشهد');
  assert.match(src, /const more = \$\('#studioAiMore'\); if\(more\) more\.style\.display = isCeleb \? 'none' : '';/);
  assert.match(src, /cmpTitle\.style\.visibility = isCeleb \? 'hidden' : '';/);
  assert.match(src, /celeb_name_only: 'studioCelebNameOnly'/);
  assert.match(src, /if\(celebRun && data\.error === 'Unknown feature'\)\{ setStatus\(t\('studioAiNeedLogin'\)\); return; \}/);
  assert.ok(!/CHAIN_ORDER = \[[^\]]*'celeb'/.test(src), 'خارج السلسلة');
  // الخادم: الميزة لا تمرّ بالمسار العامّ (قفل الوجه والحارس) ولا بخريطة المعاينات
  assert.equal(studioCreate.STYLE_TEXT.celeb, undefined);
  assert.equal(studioCreate.FEATURE_INSTRUCTIONS.celeb, undefined);
});

test('١١. النصوص الثمانية في ملفّات اللغات كلّها (العربيّة والإنجليزيّة في القاموس + ١٢ ملفًّا)، بلا اسم مزوّد، والوسم ≥ ٧٨٥ بسببه', () => {
  const KEYS = ['studioAiTabCeleb', 'studioCelebLabel', 'studioCelebPlaceholder', 'studioCelebNeedName', 'studioCelebNameOnly', 'studioCelebBlocked', 'studioCelebUnknown', 'studioCelebRefused'];
  const PROVIDER = /gemini|google|openai|gpt|claude|anthropic|groq|fal\b|nano/i;
  const files = [['js/app-03-i18n-data.js', 2]].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => ['i18n/' + l + '.js', 1]));
  for (const [f, n] of files) {
    const s = read(f);
    for (const k of KEYS) {
      const re = new RegExp('^\\s*"?' + k + '"?\\s*:\\s*([\'"])(.*)\\1,\\s*$', 'gm');
      const hits = [...s.matchAll(re)];
      assert.equal(hits.length, n, f + ': ' + k);
      for (const h of hits) assert.ok(!PROVIDER.test(h[2]), f + ': ' + k + ' فيه اسم مزوّد');
    }
  }
  const st = read('js/app-04-i18n-state.js');
  const tag = Number((/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(st) || [])[1]);
  assert.ok(tag >= 785, 'وسم ملفّات اللغات ارتفع مع النصوص الجديدة');
  assert.match(st, /v-celeb-style \(785\): ثمانية نصوص لتبويب «صورة مع مشهور»/);
});
