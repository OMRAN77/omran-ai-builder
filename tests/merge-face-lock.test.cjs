// tests/merge-face-lock.test.cjs — v-merge-face-lock (لقطة المالك ٧ نوفمبر: صورتان لرجلين ونتيجة «دمج صور» في مجلس — «شوف الملامح
// فرق بين السماء والارض»، ثمّ «ابدأ الاثنين»).
// (أ) الإطار: الدمج كان بنسبة الصورة الأولى (طوليّة) بلا ذكر للّقطة، فرسم برو الشخصين بالجسم كاملًا والوجه صغيرًا يُعاد رسمه. الآن سطر
//     «من الخصر وفوق بوجوه كبيرة» (ويحفظ المشهد الذي يصفه المستخدم) ونسبة ٤:٣ ما لم يسمِّ المستخدم نسبة بكلمته.
// (ب) قفل الوجه: بعد الدمج face-swap.lockFaces (بوّابة MERGE_FACE_SWAP: on افتراضيًّا · owner · وما سواهما مطفأ)، لصورة الشخص الواحد
//     وحدها (صورة الاثنين تُتجنَّب)، ولا قفل حين يطلب الوصف شكلًا جديدًا، وأيّ عطب = صورة الدمج نفسها. enabled:true يتخطّى TREND_FACE_SWAP
//     والمفتاح شرط، والسقف المستنفد لا يدفع نداء الربط. (المراجعة العدائيّة: ٤ عيوب مؤكّدة، كلّها هنا.)
// المعالج الحقيقيّ بـKV في الذاكرة وfetch مزيّف — لا شبكة ولا مفاتيح حقيقيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'merge-face-lock-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'gm-test';
for (const k of ['MERGE_FACE_CROPS', 'FAL_KEY', 'FAL_BACKUP', 'FAL_BACKUP_TEST_UNTIL', 'TREND_FACE_SWAP', 'MERGE_FACE_SWAP', 'FACE_SWAP_CAP_CENTS', 'OWNER_USERNAMES', 'OWNER_USERNAME', 'IMAGE_DUO', 'OPENAI_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];

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
const A = png(64, 96, [200, 40, 40]), B = png(64, 96, [40, 200, 40]);
const B_SMALL = png(400, 600, [40, 200, 40]); // وجه صغير في صورة كبيرة = لقطة مقرّبة من faceCrops
const GEN = png(120, 90, [128, 128, 128]), OAI = png(80, 60, [10, 10, 10]), SWAPPED = png(120, 90, [1, 2, 3]);
// كشف الوجوه في faceCrops بترتيب الصور: لكلّ صورة صناديق [ymin,xmin,ymax,xmax] من ٠–١٠٠٠
const ONE_BIG = [[80, 100, 900, 900]], ONE_SMALL = [[100, 400, 300, 560]], TWO = [[150, 100, 450, 400], [150, 600, 450, 900]];

/* ── البوّابة في الوحدة الحقيقيّة — تُحمَّل قبل استبدالها ── */
const FS = require(rp('api/_lib/face-swap.js'));

/* ── face-swap مستبدَل: يسجّل النداء ويرجع ما يحدّده الاختبار ── */
let lockMode = 'swap';
const lockCalls = [];
stub('api/_lib/face-swap.js', {
  lockFaces: async (frame, refs, o) => {
    lockCalls.push({ frame, refs, o, at: Date.now() });
    if (lockMode === 'throw') throw new Error('boom');
    return lockMode === 'swap' ? { b64: SWAPPED, mime: 'image/jpeg', swapped: 2 } : { b64: frame.b64, mime: frame.mime, swapped: 0, reason: 'locate-parse' };
  },
});

let image = 'ok', detect = [ONE_BIG, ONE_BIG], detectN = 0;
const calls = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ u, body });
  if (/gemini-flash-latest:generateContent/.test(u)) {
    const boxes = detect[detectN++] || [];
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: boxes.map((b) => ({ box_2d: b })) }) }] } }] });
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

function reset(o) {
  store.clear(); calls.length = 0; lockCalls.length = 0; detectN = 0;
  lockMode = (o && o.lock) || 'swap'; image = (o && o.image) || 'ok'; detect = (o && o.detect) || [ONE_BIG, ONE_BIG];
}
async function merge(user, extra) {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { done({ code: this.code, body: b }); return this; }, end(b) { done({ code: this.code, raw: b }); return this; } };
  const t0 = Date.now();
  const [out] = await Promise.all([sent, studioCreate({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user), feature: 'merge', imageBase64: A, mimeType: 'image/png', imageBase64B: B, mimeTypeB: 'image/png' }, extra || {}) }, res)]);
  return Object.assign(out, { t0 });
}
const proCall = () => calls.find((c) => /gemini-3-pro-image/.test(c.u));
const promptOf = (c) => c.body.contents[0].parts.filter((p) => p.text).map((p) => p.text).join('\n');

test('١. الإطار: سطر «من الخصر وفوق» يحفظ مشهد المستخدم، ونسبة ٤:٣ بلا نسبة منه (لا نسبة الصورة الأولى الطوليّة)', async () => {
  reset();
  const r = await merge('user1');
  assert.equal(r.code, 200);
  const p = promptOf(proCall());
  assert.ok(p.includes('Place the people/subjects from both photos together naturally in one consistent, photorealistic scene.' + studioCreate.__MERGE_FRAMING));
  assert.match(studioCreate.__MERGE_FRAMING, /frame them from the waist up \(a medium shot\) unless the task above asks for a full-body or wide view; keep any scene the task describes around them/);
  assert.match(studioCreate.__MERGE_FRAMING, /never shrink the people so far that their faces become small/);
  assert.equal(proCall().body.generationConfig.imageConfig.aspectRatio, '4:3');
  assert.equal(proCall().body.generationConfig.temperature, 0.15);
});

test('٢. نسبة سمّاها المستخدم تغلب (طولي ← ٣:٤، ١٦:٩، ستوري ← ٩:١٦)، ووصفه هو المهمّة مع سطر الإطار', async () => {
  for (const [d, ar] of [['خلهم في مجلس طولي', '3:4'], ['في البر 16:9', '16:9'], ['ستوري للعيد', '9:16']]) {
    reset();
    await merge('user1', { description: d });
    assert.equal(proCall().body.generationConfig.imageConfig.aspectRatio, ar, d);
    assert.ok(promptOf(proCall()).includes('TASK: "' + d + studioCreate.__MERGE_FRAMING), d);
  }
  const mi = require(rp('api/_lib/merge-identity.js'));
  assert.equal(mi.explicitAspect(studioCreate.__MERGE_FRAMING), '', 'سطر الإطار لا يحمل كلمة نسبة');
  assert.equal(mi.explicitAspect('في مجلس'), '');
  assert.equal(mi.mergeAspect({ data: A }, ''), '2:3', 'mergeAspect القديم كما هو لمن يناديه (مها)');
});

test('٣. قفل الوجه افتراضيًّا: صورتا شخص واحد ← lockFaces بالصورتين بالترتيب وonly [0,1] وenabled:true ومهلة ٢٨٠ ث، والردّ صورته', async () => {
  reset();
  const r = await merge('user1');
  assert.equal(r.code, 200);
  assert.equal(lockCalls.length, 1);
  const c = lockCalls[0];
  assert.equal(c.frame.b64, GEN);
  assert.deepEqual(c.refs.map((x) => x.data), [A, B], 'وجه يملأ صورته = الصورة كاملة مرجعًا');
  assert.deepEqual(c.o.only, [0, 1]);
  assert.equal(c.o.enabled, true);
  assert.equal(c.o.apiKey, 'gm-test');
  assert.ok(c.o.until >= r.t0 + 280000 && c.o.until <= c.at + 280000, 'المهلة من بداية الدمج');
  assert.equal(r.body.imageBase64, SWAPPED);
  assert.equal(r.body.mimeType, 'image/jpeg');
});

test('٤. وجه صغير في صورته ← لقطته المقرّبة مرجعًا (face:true)؛ صورة فيها شخصان ← تُتجنَّب (خارج only)؛ لا صورة شخص واحد ← لا نداء', async () => {
  reset({ detect: [ONE_BIG, ONE_SMALL] });
  await merge('user1', { imageBase64B: B_SMALL });
  assert.equal(lockCalls.length, 1);
  assert.equal(lockCalls[0].refs[0].data, A);
  assert.equal(lockCalls[0].refs[1].face, true, 'اللقطة المقرّبة من faceCrops');
  assert.notEqual(lockCalls[0].refs[1].data, B_SMALL);
  reset({ detect: [TWO, ONE_BIG] });
  await merge('user1');
  assert.equal(lockCalls.length, 1);
  assert.deepEqual(lockCalls[0].o.only, [1], 'صورة الشخصين لا يُلصق منها وجه — تُتجنَّب');
  for (const det of [[TWO, TWO], [[], []]]) { /* صورتا شخصين، أو لا وجه (دمج شعار ومكان) */
    reset({ detect: det });
    const r = await merge('user1');
    assert.equal(lockCalls.length, 0, JSON.stringify(det));
    assert.equal(r.body.imageBase64, GEN);
  }
  process.env.MERGE_FACE_CROPS = 'off';
  try { reset(); await merge('user1'); assert.equal(lockCalls.length, 0, 'بلا كشف = لا عدد = لا قفل'); } finally { delete process.env.MERGE_FACE_CROPS; }
});

test('٥. وصف يطلب شكلًا جديدًا (لحية، عمر، نظّارة، مكياج، غطاء وجه، أسلوب فنّيّ) ← لا قفل؛ ووصف المشهد وحده يُقفل', async () => {
  for (const d of ['خلنا بلحية في مجلس', 'خلنا شيّاب', 'حط لنا نظارات شمسية', 'بستايل بيكسار', 'لوحة زيتية لنا', 'make us older', 'with sunglasses', 'وهي بنقاب']) {
    reset();
    const r = await merge('user1', { description: d });
    assert.equal(lockCalls.length, 0, d);
    assert.equal(r.body.imageBase64, GEN, d);
  }
  for (const d of ['في مجلس', 'على البحر وقت الغروب', 'في عرس']) {
    reset();
    await merge('user1', { description: d });
    assert.equal(lockCalls.length, 1, d);
    assert.equal(studioCreate.__mergeWantsNewLook(d), false, d);
  }
});

test('٦. القفل لم يبدّل شيئًا (لبس، عطب، رمى) ← صورة الدمج نفسها، والطلب ينجح', async () => {
  for (const m of ['none', 'throw']) {
    reset({ lock: m });
    const r = await merge('user1');
    assert.equal(r.code, 200, m);
    assert.equal(r.body.imageBase64, GEN, m);
    assert.equal(r.body.mimeType, 'image/png', m);
  }
});

test('٧. MERGE_FACE_SWAP: غير مضبوط/on للجميع، owner للمالك وحده، وأيّ قيمة أخرى (off، false، 0) مطفأ', async () => {
  try {
    for (const v of ['off', 'false', '0', 'no']) {
      process.env.MERGE_FACE_SWAP = v;
      reset(); const r = await merge('omran');
      assert.equal(lockCalls.length, 0, v); assert.equal(r.body.imageBase64, GEN, v);
    }
    process.env.MERGE_FACE_SWAP = 'owner';
    reset(); let r = await merge('user1');
    assert.equal(lockCalls.length, 0, 'غير المالك'); assert.equal(r.body.imageBase64, GEN);
    reset(); r = await merge('omran');
    assert.equal(lockCalls.length, 1, 'المالك'); assert.equal(r.body.imageBase64, SWAPPED);
    process.env.MERGE_FACE_SWAP = 'ON';
    reset(); await merge('user1');
    assert.equal(lockCalls.length, 1);
  } finally { delete process.env.MERGE_FACE_SWAP; }
});

test('٨. مسار الإنقاذ (برو بلا صورة ← gpt-image) يُقفل وجهه أيضًا', async () => {
  process.env.OPENAI_API_KEY = 'oa-test';
  try {
    reset({ image: 'none' });
    const r = await merge('user1');
    assert.equal(r.code, 200);
    assert.equal(r.body.engine, 'openai');
    assert.equal(lockCalls.length, 1);
    assert.equal(lockCalls[0].frame.b64, OAI);
    assert.equal(r.body.imageBase64, SWAPPED);
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٩. face-swap: enabled:true يتخطّى TREND_FACE_SWAP المطفأ والمفتاح شرط؛ والسقف المستنفد لا يدفع نداء الربط', async () => {
  const frame = { b64: png(256, 256, [128, 128, 128]), mime: 'image/png' };
  const refs = [{ data: A, mime: 'image/png' }, { data: B, mime: 'image/png' }];
  const flash = [];
  const fetchImpl = async (url) => { flash.push(String(url)); return Response.json({ candidates: [{ content: { parts: [{ text: '{"faces":[],"others":[]}' }] } }] }); };
  const day = new Date().toISOString().slice(0, 10);
  const kvOk = { kvGetRaw: async () => '0' };
  delete process.env.TREND_FACE_SWAP;
  delete process.env.FAL_KEY;
  let r = await FS.lockFaces(frame, refs, { apiKey: 'gm-test', enabled: true, fetchImpl, kv: kvOk });
  assert.equal(r.reason, 'no-key'); assert.equal(r.swapped, 0); assert.equal(flash.length, 0);
  process.env.FAL_KEY = 'fal-test-key';
  try {
    r = await FS.lockFaces(frame, refs, { apiKey: 'gm-test', fetchImpl, kv: kvOk });
    assert.equal(r.reason, 'off', 'بلا enabled: بوّابة الترندات المطفأة كما هي'); assert.equal(flash.length, 0);
    r = await FS.lockFaces(frame, refs, { apiKey: 'gm-test', enabled: true, fetchImpl, kv: kvOk });
    assert.equal(flash.length, 1, 'enabled:true وصل نداء الربط'); assert.equal(r.swapped, 0);
    assert.equal(r.b64, frame.b64, 'لا وجوه = الإطار نفسه');
    // السقف: المصروف + ٥ لكلّ وجه مطلوب يتجاوز ٣٠٠ ← 'cap' قبل نداء الربط؛ و٠ يغلق
    flash.length = 0;
    r = await FS.lockFaces(frame, refs, { apiKey: 'gm-test', enabled: true, fetchImpl, kv: { kvGetRaw: async (k) => (k === FS.spentKey(day) ? '295' : null) } });
    assert.equal(r.reason, 'cap'); assert.equal(flash.length, 0, 'لا نداء ربط مدفوع والسقف مستنفد');
    process.env.FACE_SWAP_CAP_CENTS = '0';
    r = await FS.lockFaces(frame, refs, { apiKey: 'gm-test', enabled: true, fetchImpl, kv: kvOk });
    assert.equal(r.reason, 'cap'); assert.equal(flash.length, 0);
  } finally { delete process.env.FAL_KEY; delete process.env.FACE_SWAP_CAP_CENTS; }
});
