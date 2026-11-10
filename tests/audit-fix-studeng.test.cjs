// v-audit-studeng (تدقيق ٢٦ أكتوبر، مجموعة «محرّك الاستوديو»): خمسة أعطال مثبتة بالمعالج الحقيقيّ.
//   srv-studios-1-1: نتيجة التعديل بالقناع (قفل الوجه، ١٦ ميزة من ٢٣) لا تمرّ على الحارس — صورة «لم يتغيّر فيها شيء» تُسلَّم وتُخصم.
//   srv-studios-1-2: الإنقاذ بالمحرّك البديل يسلّم صورة رفضها حارس الهويّة (المحاولة الثانية بلا فحص، و`second || first`).
//   srv-studios-1-3: أخطاء الاستوديو نصّ عربيّ ثابت لكلّ اللغات، ونفاد رصيد المزوّد «جرّب مرة أخرى»، ونصّ المزوّد الخامّ في الردّ.
//   srv-studios-1-4: «اقترح لي ستايل» بالعربيّة لسبع لغات من الأربع عشرة.
//   srv-images-1:    استرجاع الوجه يصغّر الرأس ~٩٪ ويدخل وضع «الإزاحة» بلا حركة (هامش ٨٪ للمصدر و٣٪ للوجهة).
// المعالجات الحقيقيّة + _dailyQuota الحقيقيّ + التوقيع الحقيقيّ؛ KV في الذاكرة وfetch محاكى، وأجزاء العميل في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { PNG } = require('pngjs');

process.env.AUTH_SECRET = 'audit-studeng-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
for (const k of ['IMAGE_DUO', 'IMAGE_GUARD_FREE', 'IMAGE_UNCHANGED_FREE', 'OWNER_USERNAMES', 'MERGE_FACE_CROPS']) delete process.env[k];

const store = new Map();
const tick = () => new Promise((r) => setImmediate(r));
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { await tick(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
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
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
stub('api/_lib/_vip.js', { isVip: async () => false });

function png(shift, w, h) {
  const W = w || 96, H = h || 128;
  const p = new PNG({ width: W, height: H });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % W * 2 + shift) % 256; p.data[i + 1] = (shift * 3) % 256; p.data[i + 2] = 150; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
// المصدر، وناتج Gemini (الأوّل والمحاولة الثانية)، وناتج القناع، وناتج الإنقاذ (الأوّل والثاني) — كلّ واحد مميَّز ليعرف الحارس المحاكى ما يفحص
const MINE = png(0), GEM = png(140), GEM2 = png(60), OAIM = png(200), OAI = png(30), OAI2 = png(110);
const TAGS = [['GEM2', GEM2], ['GEM', GEM], ['OAIM', OAIM], ['OAI2', OAI2], ['OAI', OAI]];
const tagOf = (body) => (TAGS.find(([, b]) => body.includes(b)) || ['other'])[0];

const auth = require(rp('api/_lib/auth.js'));
const studio = require(rp('api/_lib/studio-create.js'));
const studioSuggest = require(rp('api/_lib/studio-suggest.js'));
const faceLock = require(rp('api/_lib/face-lock.js'));
const FC = require(rp('api/_lib/face-composite.js'));

const PASS = { sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true, requestedChangeApplied: true };
const NOCHANGE = Object.assign({}, PASS, { requestedChangeApplied: false });
const IDFAIL = Object.assign({}, PASS, { identityPreserved: false });
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const LEAK = /AI Studio|ai\.studio|google|gemini|openai|prepay|billing|credits|depleted|boom|IMAGE_SAFETY|https?:|[؀-ۿ]/i;

// mode.gem / mode.oai: 'ok' | 'text' | 'safety' | { status, message } أو دالّة (retry, masked) تعيد أحدها.
// verdict(tag, body) = حكم الحارس على الناتج المسمّى. boxesFor(body) = صندوقا الوجه والرأس لطلب «Locate the main person».
let mode, verdict, boxesFor, guardTags, guardReqs, suggestPrompts, oaiPrompts, paid;
const BOX = { face: [300, 300, 600, 600], head: [200, 250, 650, 700] };
function reset() {
  store.clear();
  mode = { gem: 'ok', oai: 'ok' }; verdict = () => PASS; boxesFor = () => BOX;
  guardTags = []; guardReqs = []; suggestPrompts = []; oaiPrompts = []; paid = 0;
  delete process.env.IMAGE_DUO; delete process.env.MERGE_FACE_CROPS;
  process.env.GEMINI_API_KEY = 'test-gemini';
}
const pick = (m, retry, masked) => (typeof m === 'function' ? m(retry, masked) : m);
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  const u = String(url);
  await tick();
  const body = init && typeof init.body === 'string' ? init.body : '';
  if (u.includes('gemini-flash-latest')) {
    const ok = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    if (/Locate the main person/.test(body)) return ok(JSON.stringify(boxesFor(body)));
    if (/Answer with exactly one letter/.test(body)) return ok('A');
    if (/strict quality gate/.test(body)) {
      const tag = tagOf(body);
      guardTags.push(tag);
      const instr = JSON.parse(body).contents[0].parts.map((p) => p.text || '').join('\n');
      guardReqs.push((instr.match(/USER REQUEST: (.*)/) || [])[1] || '');
      return ok(JSON.stringify(verdict(tag, body)));
    }
    if (/professional hair\/makeup\/beauty stylist/.test(body)) { suggestPrompts.push(JSON.parse(body).contents[0].parts[0].text); return ok('[]'); }
    return ok('{}');
  }
  if (u.includes('gemini-3-pro-image')) {
    const retry = /SECOND ATTEMPT/.test(body);
    const m = pick(mode.gem, retry, false);
    if (m && m.status) return Response.json({ error: { message: m.message } }, { status: m.status });
    if (m === 'text') return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] });
    if (m === 'safety') return Response.json({ candidates: [{ content: { parts: [] }, finishReason: 'IMAGE_SAFETY' }] });
    paid++;
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: retry ? GEM2 : GEM } }] } }] });
  }
  if (u.includes('api.openai.com')) {
    const fd = init.body;
    const prompt = String(fd.get('prompt'));
    const masked = !!fd.get('mask');
    const retry = /SECOND ATTEMPT/.test(prompt);
    oaiPrompts.push({ masked, retry });
    const m = pick(mode.oai, retry, masked);
    if (m && m.status) return Response.json({ error: { message: m.message } }, { status: m.status });
    paid++;
    return Response.json({ data: [{ b64_json: masked ? OAIM : (retry ? OAI2 : OAI) }] });
  }
  throw new Error('نداء خارج المحاكاة: ' + u);
};
test.after(() => { global.fetch = realFetch; });

function fakeRes() {
  let done; const sent = new Promise((r) => { done = r; });
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { done({ code: this.code, body: b }); return this; }, end() { done({ code: this.code }); return this; } };
  return { res, sent };
}
async function call(handler, user, body) {
  const { res, sent } = fakeRes();
  const [out] = await Promise.all([sent, handler({ method: 'POST', headers: {}, query: {}, body: Object.assign({ token: auth.makeToken(user) }, body) }, res)]);
  const b = out.body || {};
  return { code: out.code, body: b, error: b.error, engine: b.engine, image: b.imageBase64 };
}
const day = new Date().toISOString().slice(0, 10);
const tally = (u) => Number(store.get('db/studio-usage/tally/' + encodeURIComponent(u) + '/' + day) || 0);

const HAIR = { feature: 'hair', style: Object.keys(studio.STYLE_TEXT.hair)[0], imageBase64: MINE, mimeType: 'image/png' };
const MAKEUP = { feature: 'makeup', style: Object.keys(studio.STYLE_TEXT.makeup)[0], imageBase64: MINE, mimeType: 'image/png' };
assert.equal(faceLock.protectLevel('hair'), 'face', 'الشعر يقفل الوجه (مسار القناع)');
assert.equal(faceLock.protectLevel('makeup'), 'none', 'المكياج بلا قفل (مسار Gemini)');

/* ───── srv-studios-1-1 ───── */
test('srv-studios-1-1 — قفل الوجه (الشعر): نتيجة القناع «بلا تغيير» ⇒ ٤٢٢ image_edit_no_change والعدّاد ٠، بالمحرّكين معًا وبـIMAGE_DUO=off (كان ٢٠٠ والعدّاد ١)', async () => {
  reset(); verdict = () => NOCHANGE;
  const a = await call(studio, 'nc1', HAIR);
  assert.equal(a.code, 422, 'المحرّكان معًا: ' + a.code + ' ' + a.engine);
  assert.equal(a.error, 'image_edit_no_change');
  assert.equal(tally('nc1'), 0, 'الرفض الأوّل لا يُحتسب (keepGuardCharge)');
  assert.ok(guardTags.includes('OAIM'), 'الحارس سُئل عن نتيجة القناع: ' + guardTags.join(','));

  reset(); verdict = () => NOCHANGE; process.env.IMAGE_DUO = 'off';
  const b = await call(studio, 'nc2', HAIR);
  assert.equal(b.code, 422, 'IMAGE_DUO=off: ' + b.code + ' ' + b.engine);
  assert.equal(b.error, 'image_edit_no_change');
  assert.equal(tally('nc2'), 0);
  assert.ok(guardTags.includes('OAIM'), 'بلا المحرّك الموازي أيضًا: ' + guardTags.join(','));
});

test('srv-studios-1-1 — القناع يمرّ بالحارس: يمرّ ⇒ ٢٠٠ كما كان؛ يُرفض ومرشّح Gemini يمرّ ⇒ Gemini؛ يُرفضان والمحاولة الثانية تمرّ ⇒ gemini+retry؛ والرفض الثالث يُحتسب', async () => {
  reset();
  const ok = await call(studio, 'mk1', HAIR);
  assert.equal(ok.code, 200);
  assert.match(ok.engine, /^openai-lock\+judge/);
  assert.ok(guardTags.includes('OAIM') && guardTags.includes('GEM'), 'المرشّحان فُحصا: ' + guardTags.join(','));
  assert.equal(tally('mk1'), 1);

  reset(); verdict = (tag) => (tag === 'OAIM' ? NOCHANGE : PASS);
  const g = await call(studio, 'mk2', HAIR);
  assert.equal(g.code, 200);
  assert.match(g.engine, /^gemini/, 'القناع المرفوض لا يُسلَّم: ' + g.engine);

  reset(); verdict = (tag) => (tag === 'GEM2' ? PASS : NOCHANGE);
  const rt = await call(studio, 'mk3', HAIR);
  assert.equal(rt.code, 200);
  assert.match(rt.engine, /^gemini\+retry/);

  reset(); verdict = (tag) => (tag === 'OAIM' ? NOCHANGE : PASS); process.env.IMAGE_DUO = 'off';
  const off = await call(studio, 'mk4', HAIR);
  assert.equal(off.code, 200);
  assert.match(off.engine, /^gemini\+retry/, 'بلا المحرّك الموازي: المحاولة الثانية ثمّ الحارس');

  reset(); verdict = () => NOCHANGE;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call(studio, 'mk5', HAIR)).code);
  assert.deepEqual(codes, [422, 422, 422]);
  assert.equal(tally('mk5'), 1, 'الرفض الثالث في اليوم يُحتسب كمسار Gemini (v-guard-cap)');
});

/* ───── srv-studios-1-2 ───── */
test('srv-studios-1-2 — الإنقاذ: Gemini بلا صورة والحارس يرفض الهويّة في المحاولتين ⇒ ٤٢٢ image_edit_identity_mismatch والعدّاد ٠ (كان ٢٠٠ والعدّاد ١)', async () => {
  reset(); mode.gem = 'text'; verdict = () => IDFAIL;
  const r = await call(studio, 'rs1', MAKEUP);
  assert.equal(r.code, 422, r.code + ' ' + r.engine);
  assert.equal(r.error, 'image_edit_identity_mismatch');
  assert.equal(tally('rs1'), 0);
  assert.deepEqual(oaiPrompts.map((p) => p.retry), [false, true], 'محاولتان للإنقاذ');
  assert.deepEqual(guardTags, ['OAI', 'OAI2'], 'المحاولة الثانية فُحصت أيضًا');
});

test('srv-studios-1-2 — الإنقاذ: الثانية تمرّ ⇒ تُسلَّم هي؛ الثانية تفشل ⇒ ٤٢٢ لا الأولى المرفوضة؛ الأولى تمرّ ⇒ كما كان؛ والحارس نفسه (المجمّع في طلبه)', async () => {
  reset(); mode.gem = 'text'; verdict = (tag) => (tag === 'OAI' ? IDFAIL : PASS);
  const a = await call(studio, 'rs2', MAKEUP);
  assert.equal(a.code, 200);
  assert.equal(a.engine, 'openai');
  assert.equal(a.image, OAI2, 'الصورة المسلَّمة هي الثانية التي مرّت');

  reset(); mode.gem = 'text'; mode.oai = (retry) => (retry ? { status: 500, message: 'x' } : 'ok'); verdict = () => IDFAIL;
  const b = await call(studio, 'rs3', MAKEUP);
  assert.equal(b.code, 422, 'كانت `second || first` تسلّم الأولى المرفوضة');
  assert.equal(b.error, 'image_edit_identity_mismatch');

  reset(); mode.gem = 'text';
  const c = await call(studio, 'rs4', MAKEUP);
  assert.equal(c.code, 200);
  assert.equal(c.image, OAI);
  assert.equal(tally('rs4'), 1);

  // عرض الزوايا (بلا قفل بكسل): طلب حارس الإنقاذ يحمل سطر المجمّع كحارس Gemini — وإلّا رأى ثلاث لوحات «لم يطلبها أحد»
  reset(); mode.gem = 'text';
  const d = await call(studio, 'rs5', Object.assign({}, HAIR, { multiAngle: true }));
  assert.equal(d.code, 200);
  assert.ok(guardReqs.length >= 1 && guardReqs.every((q) => /3-panel collage/.test(q)), 'طلب الحارس: ' + (guardReqs[0] || '').slice(0, 120));
});

/* ───── srv-studios-1-3 ───── */
test('srv-studios-1-3 — رموز لا نصوص: نفاد الرصيد ⇒ ٥٠٣ unavailable، والزحام image_generation_busy، والرفض image_generation_failed، وبلا detail ولا upstream ولا نصّ المزوّد', async () => {
  const cases = [
    [{ status: 429, message: DEPLETED }, { status: 429, message: 'You exceeded your current quota, please check your plan and billing details.' }, 503, 'unavailable'],
    [{ status: 403, message: 'API key not valid' }, { status: 401, message: 'Incorrect API key provided' }, 503, 'unavailable'],
    [{ status: 500, message: 'boom' }, { status: 500, message: 'boom' }, 502, 'image_generation_busy'],
    [{ status: 429, message: 'Resource has been exhausted (e.g. check quota).' }, { status: 503, message: 'boom' }, 502, 'image_generation_busy'],
    [{ status: 400, message: 'Invalid argument' }, { status: 400, message: 'boom' }, 502, 'image_generation_failed'],
    ['safety', { status: 400, message: 'boom' }, 500, 'image_generation_failed'],
  ];
  for (const [gem, oai, code, err] of cases) {
    reset(); mode.gem = gem; mode.oai = oai;
    const r = await call(studio, 'e1', MAKEUP);
    assert.equal(r.code, code, JSON.stringify(gem));
    assert.deepEqual(r.body, { error: err }, JSON.stringify(gem) + ' ⇒ ' + JSON.stringify(r.body));
    assert.ok(!LEAK.test(JSON.stringify(r.body)), 'لا نصّ مزوّد ولا عربيّ ثابت: ' + JSON.stringify(r.body));
    assert.equal(tally('e1'), 0, 'لا صورة = لا خصم');
  }
  // الدمج (بلا لقطات وجوه) بالمحرّكين معطّلين
  reset(); process.env.MERGE_FACE_CROPS = 'off'; mode.gem = { status: 429, message: DEPLETED }; mode.oai = { status: 429, message: DEPLETED };
  const m = await call(studio, 'e2', { feature: 'merge', imageBase64: MINE, mimeType: 'image/png', imageBase64B: GEM, mimeTypeB: 'image/png' });
  assert.equal(m.code, 503);
  assert.deepEqual(m.body, { error: 'unavailable' });
  // بلا مفتاح المزوّد على الخادم
  reset(); delete process.env.GEMINI_API_KEY;
  const k = await call(studio, 'e3', MAKEUP);
  process.env.GEMINI_API_KEY = 'test-gemini';
  assert.equal(k.code, 503);
  assert.deepEqual(k.body, { error: 'unavailable' });
  // والاستثناء العامّ رمز كذلك
  const src = read('api/_lib/studio-create.js');
  assert.ok(!/json\(\{ error: '[^']*[؀-ۿ]/.test(src), 'لا ردّ بنصّ عربيّ ثابت في studio-create');
  assert.ok(!/payload\.detail/.test(src), 'نصّ المزوّد لا يصل الردّ');
});

test('srv-studios-1-3 — الواجهة: imgErrFriendly يترجم image_generation_failed/busy بمفاتيح الـ١٤ لغة (والعربيّ/الإنجليزيّ احتياطًا)، وخلايا المقارنة تمرّ على studioErrText', async () => {
  const S = read('js/app-02-tts.js');
  const a = S.indexOf('function imgErrFriendly(');
  const b = S.indexOf('\n// Detects the spoken-language', a);
  assert.ok(a >= 0 && b > a);
  const load = (dict) => {
    const ctx = { t: (k) => (dict[k] !== undefined ? dict[k] : k), setTimeout() {}, window: {}, __swallow() {}, console };
    vm.runInNewContext(S.slice(a, b) + '\nthis.f = imgErrFriendly;', ctx);
    return ctx.f;
  };
  const fr = load({ axStudengImgFailed: 'FR échec', axStudengImgBusy: 'FR occupé', svcPaused: 'FR en pause' });
  assert.equal(fr('image_generation_failed', true), 'FR échec', 'الفرنسيّ يرى نصّ لغته لا العربيّ');
  assert.equal(fr('image_generation_busy', true), 'FR occupé');
  assert.equal(fr('unavailable', true), 'FR en pause');
  const bare = load({});
  assert.match(bare('image_generation_failed', true), /تعذّر إنشاء الصورة/, 'قبل دمج المفتاح: العربيّ القائم');
  assert.match(bare('image_generation_busy', false), /busy/i, 'والإنجليزيّ القائم');

  const C = read('js/app-13-stocks-init.js');
  const c0 = C.indexOf('  /* ---- 📊 compare 2-3 styles ---- */');
  const c1 = C.indexOf('\n})();', c0);
  assert.ok(c0 > 0 && c1 > c0, 'معالجا المقارنة');
  const mk = (tag) => ({ tag, style: {}, children: [], innerHTML: '', textContent: '', appendChild(x) { this.children.push(x); return x; } });
  const resultsA = mk('div'), resultsB = mk('div');
  const ctx = {
    compareBtn: { disabled: false }, heritageCompareBtn: { disabled: false },
    compareChecksEl: { querySelectorAll: () => [{ value: 's1' }, { value: 's2' }] },
    compareStatusEl: { style: {} }, heritageCompareStatusEl: { style: {} },
    compareResultsEl: resultsA, heritageCompareResultsEl: resultsB,
    styleEl: { value: 's1', querySelector: () => null }, descriptionEl: { value: '' },
    selectedBase64A: 'QUJD', selectedMimeA: 'image/jpeg', feature: 'hair', authGet: () => 'tok',
    t: (k) => k, t2: (k) => k, setStatus() {}, nextVariant: () => 1,
    studioErrText: (e) => 'TXT:' + (e && e.message),
    fetch: async () => new Response(JSON.stringify({ error: 'image_generation_failed' }), { status: 502 }),
    document: { createElement: mk }, console, Promise, Array, JSON,
  };
  vm.runInNewContext(C.slice(c0, c1), ctx);
  await ctx.compareBtn.onclick();
  await ctx.heritageCompareBtn.onclick();
  for (const [name, box] of [['المقارنة', resultsA], ['التراثي', resultsB]]) {
    assert.equal(box.children.length, 2, name);
    for (const cell of box.children) {
      const text = cell.innerHTML + cell.children.map((x) => x.textContent).join('');
      assert.ok(!/❌ image_generation_failed/.test(text), name + ': الرمز الخامّ ظهر: ' + text);
      assert.match(text, /TXT:image_generation_failed/, name + ': لم يمرّ على studioErrText: ' + text);
    }
  }
});

/* ───── srv-studios-1-4 ───── */
test('srv-studios-1-4 — «اقترح لي ستايل» بلغة الواجهة لكلّ اللغات الأربع عشرة (والعربيّة لـar وحدها)', async () => {
  const want = { ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', id: 'Indonesian', fil: 'Filipino', tr: 'Turkish', zh: 'Simplified Chinese', ru: 'Russian', es: 'Spanish', ml: 'Malayalam' };
  for (const [lang, name] of Object.entries(want)) {
    reset();
    const r = await call(studioSuggest, 'sg_' + lang, { imageBase64: MINE, mimeType: 'image/png', feature: 'hair', occasion: 'daily', lang });
    assert.equal(r.code, 200, lang);
    assert.equal(suggestPrompts.length, 1, lang);
    assert.match(suggestPrompts[0], new RegExp('Respond in ' + name + '\\. '), lang + ' ⇒ ' + (suggestPrompts[0].match(/Respond in [^.]*/) || [])[0]);
  }
});

/* ───── srv-images-1 ───── */
// صورة ٥٠٠×٥٠٠ فيها مربّع أحمر ٢٠٠ بكسل عند (x0,y0)؛ الخلفيّة مختلفة بين الأصل والناتج كي يُرى ما لُصق
function squareImg(x0, y0, bg) {
  const p = new PNG({ width: 500, height: 500 });
  for (let y = 0; y < 500; y++) for (let x = 0; x < 500; x++) {
    const i = (y * 500 + x) * 4;
    const red = x >= x0 && x < x0 + 200 && y >= y0 && y < y0 + 200;
    p.data[i] = red ? 230 : bg[0]; p.data[i + 1] = red ? 20 : bg[1]; p.data[i + 2] = red ? 20 : bg[2]; p.data[i + 3] = 255;
  }
  return PNG.sync.write(p).toString('base64');
}
const redWidth = (b64, y) => {
  const img = FC.decode(Buffer.from(b64, 'base64'));
  let n = 0;
  for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * 4; if (img.data[i] > 170 && img.data[i + 1] < 100 && img.data[i + 2] < 100) n++; }
  return n;
};
test('srv-images-1 — restoreProtected: بلا حركة يبقى rect/above والرأس بحجمه (كان map بنسبة ٠٫٨٤ والرأس ١٨٢ بكسل)، والمنزاح يُلصق بمقياس ١', async () => {
  const ORIG = squareImg(150, 150, [250, 250, 250]);
  const SAME = squareImg(150, 150, [40, 90, 200]);
  const MOVED = squareImg(200, 150, [40, 90, 200]); // +٥٠ بكسل = ٠٫١ من العرض
  const B0 = [300, 300, 700, 700], B1 = [300, 400, 700, 800]; // [ymin,xmin,ymax,xmax] 0..1000 — المربّع نفسه
  const seen = [];
  const realComposite = FC.compositeProtected;
  FC.compositeProtected = (o) => { seen.push(o.zones); return realComposite(o); };
  try {
    for (const level of ['face', 'head', 'body']) {
      reset();
      boxesFor = (body) => (body.includes(MOVED) ? { face: B1, head: B1 } : { face: B0, head: B0 });
      const prep = await faceLock.prepare({ geminiKey: 'k', imageBase64: ORIG, mimeType: 'image/png', level });
      assert.ok(prep, level + ': التحضير');
      seen.length = 0;
      const same = await faceLock.restoreProtected(prep, ORIG, SAME, 'k', 'image/png');
      assert.ok(same && same.b64, level);
      assert.equal(seen[0][0].kind, level === 'body' ? 'above' : 'rect', level + ' بلا حركة: ' + JSON.stringify(seen[0]));
      assert.equal(seen[0].length, 1);
      assert.ok(Math.abs(redWidth(same.b64, 250) - 200) <= 3, level + ' بلا حركة: عرض الرأس ' + redWidth(same.b64, 250));

      seen.length = 0;
      const moved = await faceLock.restoreProtected(prep, ORIG, MOVED, 'k', 'image/png');
      assert.ok(moved && moved.b64, level);
      const z = seen[0].find((x) => x.kind === 'map');
      assert.ok(z, level + ' منزاح: وضع الإزاحة');
      const sw = z.src.x1 - z.src.x0, dw = z.dst.x1 - z.dst.x0, sh = z.src.y1 - z.src.y0, dh = z.dst.y1 - z.dst.y0;
      assert.ok(Math.abs(dw / sw - 1) < 1e-9 && Math.abs(dh / sh - 1) < 1e-9, level + ' منزاح: المقياس ' + (dw / sw).toFixed(3));
      assert.ok(Math.abs(redWidth(moved.b64, 250) - 200) <= 3, level + ' منزاح: عرض الرأس ' + redWidth(moved.b64, 250));
    }
  } finally { FC.compositeProtected = realComposite; }
});
