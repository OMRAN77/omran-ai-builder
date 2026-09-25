// tests/image-honest.test.cjs — v-img-honest + v-img-mix (٢٣ سبتمبر ٢٠٢٦).
// لقطة المالك: «أنماط الصور» مع «غيّر جميع وجوه وأشكال الأشخاص…» ← رجعت الصورة نفسها وتحتها «تمّ تغيير جميع الوجوه».
// «أوّل شي يقولي شي والتنفيذ صفر… نفّذ المطلوب، وإذا تقدر خاصيّة دمج بين نانو وGPT — النتيجة ١».
// هنا يُشغَّل موجِّه maha-image الحقيقيّ والمحرّكات مزيّفة، والمصدر والناتج من لقطة المالك نفسها (tests/fixtures).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg')).toString('base64');
const SWAP = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-swapped.jpg')).toString('base64');
const diff = require(rp('api/_lib/image-diff.js'));
const verify = require(rp('api/_lib/image-verify.js'));

/* «إعادة رسم الصورة نفسها» كما يرجّعها المحرّك حين لا ينفّذ: دقّة أعلى، إزاحة بكسل، غاما خفيفة، ضجيج، PNG */
function rerender(b64) {
  const s = diff.decodeImage(b64);
  const W = Math.round(s.w * 1.6), H = Math.round(s.h * 1.6);
  const p = new PNG({ width: W, height: H });
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(s.w - 1, Math.floor((x + 2) * s.w / W)), sy = Math.min(s.h - 1, Math.floor((y + 1) * s.h / H));
    const i = (sy * s.w + sx) * 4, o = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) p.data[o + c] = Math.max(0, Math.min(255, 255 * Math.pow(s.data[i + c] / 255, 1.04) + 6 * rnd()));
    p.data[o + 3] = 255;
  }
  return PNG.sync.write(p).toString('base64');
}
function mirror(b64) {
  const s = diff.decodeImage(b64);
  const out = Buffer.alloc(s.w * s.h * 4);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const i = (y * s.w + x) * 4, o = (y * s.w + (s.w - 1 - x)) * 4;
    out[o] = s.data[i]; out[o + 1] = s.data[i + 1]; out[o + 2] = s.data[i + 2]; out[o + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ width: s.w, height: s.h, data: out }, 85).data).toString('base64');
}
const SAME = rerender(SRC);

test('١. القياس بالبكسل على لقطة المالك: التبديل الحقيقيّ «تغيّر»، وإعادة رسم الصورة نفسها «ثابت»', () => {
  const real = diff.compareImages(SRC, SWAP);
  assert.ok(real.ok && real.changedFrac > 0.3 && real.strongFrac > 0.15, JSON.stringify(real));
  assert.equal(diff.looksUnchanged(real, true), false);
  const same = diff.compareImages(SRC, SAME);
  assert.ok(same.ok && same.changedFrac < 0.03, JSON.stringify(same));
  assert.equal(diff.looksUnchanged(same, true), true, 'الصورة نفسها معادة الرسم بدقّة أعلى = لم يُنفَّذ');
  assert.equal(diff.looksUnchanged(same, false), false, 'التعديل الموضعيّ لا يُتّهم بالثبات بالبكسل وحده (حرف قد يمسّ ٠٫١٪)');
  assert.equal(diff.looksUnchanged(diff.compareImages(SRC, SRC), false), true, 'تطابق حرفيّ = ثابت لأيّ نيّة');
  assert.equal(diff.compareImages('not-an-image', SWAP).ok, false, 'ما لا يُفكّ = لا قياس (لا اتّهام)');
  assert.match(diff.describeChange(same), /practically identical/);
  const v = diff.visionCopy(SRC, 256);
  assert.ok(v && v.mime === 'image/jpeg' && Math.max(v.w, v.h) === 256, 'نسخة الرؤية مصغّرة');
});

test('٢. الحاكم: قاعدة «لا تفضّل الأقرب للمصدر»، تلميح التبديل، قراءة JSON بتسامح، والترتيب الحتميّ', () => {
  const parts = verify.buildVerifyParts({ request: 'غيّر جميع الوجوه', source: { b64: 'S' }, candidates: [{ b64: 'A', evidence: 'E1' }, { b64: 'B' }], intent: { personSwap: true } });
  const txt = parts.filter((p) => p.text).map((p) => p.text).join('\n');
  assert.match(txt, /NEVER prefer a result just because it is closer to the source/);
  assert.match(txt, /PERSON SWAP/); assert.match(txt, /RESULT A: E1/); assert.match(txt, /"scope": "big\|small"/);
  assert.match(txt, /هل أعجبتك؟ ولا أسوي لك … أو …؟/); assert.match(txt, /never claim it was done/);
  assert.equal(parts.filter((p) => p.inlineData).length, 3, 'المصدر + مرشّحان');
  const gen = verify.buildVerifyParts({ request: 'قطة', candidates: [{ b64: 'A' }] }).map((p) => p.text || '').join('\n');
  assert.match(gen, /📋 تفسير الفكرة/); assert.match(gen, /⚠️/); assert.doesNotMatch(gen, /scope/);
  const p = verify.parseVerdict('```json\n{"verdicts":["not_done","DONE"],"pick":1,"scope":"big","report":"غيّرت الوجوه"}\n```', 2);
  assert.deepEqual([p.verdicts, p.pick, p.scope, p.report], [['not_done', 'done'], 1, 'big', 'غيّرت الوجوه']);
  assert.equal(verify.parseVerdict('كلام بلا JSON', 1), null, 'ردّ غير مفهوم = لا حكم، لا «A» تلقائيًّا');
  assert.equal(verify.parseVerdict('{"verdicts":["done","not_done"],"pick":7}', 2).pick, 0, 'اختيار خارج المدى = الترتيب الحتميّ');
  assert.equal(verify.rankCandidates([{ unchanged: true, verdict: 'done' }, { verdict: 'partial' }]), 1, 'الثابت بالبكسل يخسر ولو قيل «done»');
  assert.equal(verify.rankCandidates([{ verdict: 'done' }, { verdict: 'done' }]), 0, 'التساوي للمسار الأساسيّ');
});

// ── الموجِّه الحقيقيّ بمحرّكات مزيّفة ──
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off';
delete process.env.IMAGE_VERIFY; delete process.env.IMAGE_CAPTION; delete process.env.IMAGE_EDIT_MODEL; delete process.env.IMAGE_CREATIVE_MODEL; delete process.env.IMAGE_PIPELINE; delete process.env.IMAGE_RAW_DEFAULT;
const ledger = [];
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true }) });
stub('api/_lib/points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ owner: 'omran', user: 'sara' })[t] || null,
  isOwnerUsername: (u) => u === 'omran',
  spendPoints: async (u, amt, why) => { ledger.push(['spend', u, amt, why]); return u === 'omran' ? { ok: true, owner: true } : { ok: true, points: 100 }; },
  refundPoints: async (u, amt) => { ledger.push(['refund', u, amt]); },
});
stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {} });
const handler = require(rp('api/_lib/maha-image.js'));

/* engines: { pro, nano, gptEdit, gptGen } كلّ واحد صورة b64 أو null (فشل)؛ judge(body, nCands) → كائن JSON للحاكم أو null (فشل HTTP) */
async function run(body, engines, judge) {
  const calls = [];
  let detects = 0;
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com/v1/images/edits')) {
      const prompt = init.body.get('prompt');
      const images = init.body.getAll('image').length + init.body.getAll('image[]').length;
      calls.push({ kind: 'gpt-edit', prompt, images });
      const out = typeof engines.gptEdit === 'function' ? engines.gptEdit(prompt) : engines.gptEdit;
      return out ? Response.json({ data: [{ b64_json: out }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    if (u.includes('api.openai.com/v1/images/generations')) {
      calls.push({ kind: 'gpt-gen', prompt: JSON.parse(init.body).prompt });
      return engines.gptGen ? Response.json({ data: [{ b64_json: engines.gptGen }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    const b = JSON.parse(init.body);
    if (u.includes('gemini-flash-latest')) {
      const parts = b.contents[0].parts;
      /* v-img-cards: كشف لوحة البطاقات للمالك قبل مساره — هنا «ليست لوحة» فيكمل المسار العاديّ كما كان */
      if (parts.some((p) => p.text && /made of several CARDS/.test(p.text))) { detects++; return Response.json({ candidates: [{ content: { parts: [{ text: '{"cards":[]}' }] } }] }); }
      const n = parts.filter((p) => p.text && /^RESULT [ABC]:/.test(p.text)).length;
      calls.push({ kind: 'judge', n, text: parts.filter((p) => p.text).map((p) => p.text).join('\n'), cfg: b.generationConfig });
      const j = judge ? judge(b, n) : null;
      return j ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(j) }] } }] }) : new Response('x', { status: 500 });
    }
    const model = (u.match(/models\/([^:]+):/) || [])[1];
    const isPro = model === 'gemini-3-pro-image';
    const img = isPro ? engines.pro : (/flash-image/.test(model) ? engines.nano : null);
    calls.push({ kind: isPro ? 'pro' : 'nano', model, text: (b.contents[b.contents.length - 1].parts.find((p) => p.text) || {}).text });
    if (!img) return Response.json({ error: { message: 'fail' } }, { status: 400 });
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img } }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  ledger.length = 0;
  try { await handler({ method: 'POST', headers: {}, body }, res); } finally { global.fetch = save; }
  return { status, json, calls, detects, ledger: ledger.slice() };
}
const SWAP_REQ = 'غيّر جميع وجوه وأشكال الأشخاص في الخيارات بدون تكرار';
const done = (report) => () => ({ verdicts: ['done'], pick: 0, scope: 'big', report: report || 'غيّرت كلّ الوجوه. هل أعجبتك؟ ولا أسوي لك … أو …؟' });

test('٣. لقطة المالك: برو يرجّع الصورة نفسها ← لا تقرير «تمّ» عليها، GPT مرّة واحدة بأمر التبديل، والمنفَّذ يُرسل', async () => {
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SAME, gptEdit: SWAP }, done());
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SWAP, 'الصورة المنفَّذة لا نسخة المصدر');
  assert.equal(r.json.verdict, 'done');
  assert.match(r.json.engine, /^openai\[nano-pro:same,openai:done\]$/);
  assert.deepEqual(r.calls.map((c) => c.kind), ['pro', 'gpt-edit', 'judge'], 'الثابت لا يُعرض على الحاكم أصلًا: برو ← GPT ← حكم واحد');
  assert.equal(r.calls[2].n, 1);
  assert.match(r.calls[0].text, /PEOPLE REPLACEMENT/, 'الطلب صار تبديل أشخاص لا تعديلًا أمينًا');
  assert.match(r.calls[1].prompt, /PEOPLE REPLACEMENT/, 'GPT يستلم أمر التبديل نفسه');
  assert.ok(!r.ledger.some((l) => l[0] === 'refund'), 'نُفّذ فلا ردّ');
});

test('٤. المحرّكان يرجّعان الصورة نفسها ← مصارحة ٤٢٢ وردّ النقاط، بلا نداء حكم وبلا صورة كاذبة', async () => {
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SAME, gptEdit: rerender(SRC) }, done());
  assert.equal(r.status, 422);
  assert.equal(r.json.error, 'image_unchanged');
  assert.equal(r.json.imageBase64, undefined);
  assert.match(r.json.__diag.tried, /nano-pro:same,openai:same/);
  assert.ok(!r.calls.some((c) => c.kind === 'judge'), 'لا حكم على صور ثابتة');
  assert.deepEqual(r.ledger.filter((l) => l[0] === 'refund'), [['refund', 'sara', 20]], 'النقاط رجعت');
});

test('٥. برو ينفّذ من أوّل مرّة ← نداء واحد + حكم واحد، بلا GPT (نتيجة قويّة بضربة وحدة كما كانت)', async () => {
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SWAP, gptEdit: SAME }, done('بدّلت الثمانية.'));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SWAP);
  assert.equal(r.json.caption, 'بدّلت الثمانية.');
  assert.equal(r.json.engine, 'nano-pro');
  assert.deepEqual(r.calls.map((c) => c.kind), ['pro', 'judge']);
  assert.match(r.calls[1].text, /\d+(\.\d)?% of the image area changed visibly/, 'القياس دليل أمام الحاكم');
  assert.equal(r.calls[1].cfg.thinkingConfig.thinkingBudget > 0, true, 'الحاكم يفكّر قليلًا (بلا تفكير صدّق الطلب)');
});

test('٦. طلب أفلت من كاشف النيّة (مسار أمين) والحاكم «كذب» بـdone ← القياس يغلبه، وGPT يستلم كلمات المستخدم بلا قالب «احفظ كلّ شخص»', async () => {
  const req = 'ابي ناس غير اللي بالصورة';
  const r = await run({ prompt: req, userText: req, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SAME, gptEdit: SWAP }, done('تمّ.'));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SWAP);
  assert.match(r.calls[0].text, /LOCALIZED EDIT/, 'برو أخذ القالب الأمين');
  const g = r.calls.find((c) => c.kind === 'gpt-edit');
  assert.match(g.prompt, /^Edit the attached image exactly as the user asks, in their own words: "ابي ناس غير اللي بالصورة"/);
  assert.doesNotMatch(g.prompt, /Every person must remain identical/);
  assert.match(r.json.engine, /nano-pro:same,openai:done/, 'البكسل غلب «done» الكاذب');
});

test('٧. «دمج نانو + GPT» للمالك (خيار «أ»): برو يرسم الوجوه ثمّ GPT يصلّح الكتابة وحدها على ناتجه، والحكم يختار صورة واحدة', async () => {
  const OWN = { prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', engineMix: true };
  const FIXED = mirror(SWAP); // «برو + تصحيح الكتابة» (صورة مختلفة عن المصدر كما يجب)
  const isPolish = (p) => /^You are given 2 images in this order: \(1\) the RESULT to fix/.test(p);
  // (أ) نُفّذ والكتابة مكسورة ← تلميع GPT بصورتين (ناتج برو + المصدر مرجعًا) ← حكم بين الاثنين ← المصحَّح
  const r = await run(OWN, { pro: SWAP, gptEdit: (p) => (isPolish(p) ? FIXED : null) },
    (b, n) => (n === 1 ? { verdicts: ['done'], pick: 0, scope: 'big', text: 'broken', report: 'x' } : { verdicts: ['partial', 'done'], pick: 1, scope: 'big', text: 'ok', report: 'بدّلت الوجوه وصحّحت «تهنئة».' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, FIXED);
  assert.equal(r.json.caption, 'بدّلت الوجوه وصحّحت «تهنئة».');
  assert.deepEqual(r.calls.map((c) => c.kind), ['pro', 'judge', 'gpt-edit', 'judge'], 'برو ← حكم ← GPT للكتابة ← حكم بين الاثنين');
  assert.equal(r.detects, 1, 'v-img-cards: تبديل المالك يُكشف أوّلًا هل الصورة لوحة بطاقات؛ ليست لوحة = هذا المسار كما كان');
  const pol = r.calls[2];
  assert.ok(isPolish(pol.prompt) && /Change NOTHING else in image 1/.test(pol.prompt) && pol.images === 2, 'التلميع: الكتابة وحدها، والمصدر مرجع الحروف');
  assert.equal(r.calls[3].n, 2);
  assert.match(r.json.engine, /^mix:nano-pro\+gpt-text\[mix:nano-pro:partial,mix:nano-pro\+gpt-text:done\]$/);
  // (ب) لا كتابة في الصورة ← لا تلميع
  const r2 = await run(OWN, { pro: SWAP, gptEdit: FIXED }, () => ({ verdicts: ['done'], pick: 0, scope: 'big', text: 'none', report: 'y' }));
  assert.deepEqual(r2.calls.map((c) => c.kind), ['pro', 'judge']);
  assert.equal(r2.json.engine, 'mix:nano-pro');
  // (ج) برو يرجّع الصورة نفسها ← GPT ينفّذ الطلب كاملًا (أمر التبديل)، ولا تلميع لناتج GPT
  const r3 = await run(OWN, { pro: SAME, gptEdit: (p) => (isPolish(p) ? FIXED : SWAP) }, () => ({ verdicts: ['done'], pick: 0, scope: 'big', text: 'broken', report: 'z' }));
  assert.equal(r3.json.imageBase64, SWAP);
  assert.deepEqual(r3.calls.map((c) => c.kind), ['pro', 'gpt-edit', 'judge']);
  assert.match(r3.calls[1].prompt, /PEOPLE REPLACEMENT/);
  // (د) التلميع أعاد وجوه المصدر ← يسقطه القياس بلا حكم، ويبقى ناتج برو
  const r4 = await run(OWN, { pro: SWAP, gptEdit: (p) => (isPolish(p) ? SAME : null) }, () => ({ verdicts: ['done'], pick: 0, scope: 'big', text: 'broken', report: 'w' }));
  assert.equal(r4.json.imageBase64, SWAP);
  assert.deepEqual(r4.calls.map((c) => c.kind), ['pro', 'judge', 'gpt-edit']);
  assert.match(r4.json.engine, /nano-pro\+gpt-text:same/);
  // (هـ) غير المالك لا يصله الوضع: برو وحده
  const r5 = await run({ ...OWN, token: 'user' }, { pro: SWAP, gptEdit: SWAP }, done());
  assert.deepEqual(r5.calls.map((c) => c.kind), ['pro', 'judge'], 'غير المالك = المسار العاديّ');
});

test('٨. الخام يبقى خامًا: «نانو خام» يرجّع الصورة نفسها ← تُرسل كما هي بتقرير صادق، بلا محرّك آخر ولا ٤٢٢', async () => {
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', forceEngine: 'nano' }, { nano: SAME, pro: SWAP, gptEdit: SWAP },
    () => ({ verdicts: ['not_done'], pick: 0, report: 'الصورة ما تغيّرت.' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SAME);
  assert.equal(r.json.caption, 'الصورة ما تغيّرت.');
  assert.deepEqual(r.calls.map((c) => c.kind), ['nano', 'judge']);
  assert.equal(r.calls[0].model, 'gemini-3.1-flash-image');
});

test('٩. التوليد: الحاكم «لم يُنفَّذ» ← GPT مرّة ويُختار المنفَّذ؛ والحاكم المعطّل لا يوقف الصورة ولا يستدعي محرّكًا آخر', async () => {
  const r = await run({ prompt: 'ارسم قطة على كرسي', token: 'user' }, { pro: SRC, gptGen: SWAP },
    (b, n) => (n === 1 ? { verdicts: ['not_done'], pick: 0, report: '⚠️ ما فيها قطة' } : { verdicts: ['not_done', 'done'], pick: 1, report: '📋 تفسير الفكرة\n• قطة' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SWAP);
  assert.deepEqual(r.calls.map((c) => c.kind), ['pro', 'judge', 'gpt-gen', 'judge']);
  const r2 = await run({ prompt: 'ارسم قطة على كرسي', token: 'user' }, { pro: SRC, gptGen: SWAP }, null);
  assert.equal(r2.status, 200);
  assert.equal(r2.json.imageBase64, SRC);
  assert.equal(r2.json.caption, undefined, 'فشل الحاكم = صورة بلا نصّ كما كان');
  assert.deepEqual(r2.calls.map((c) => c.kind), ['pro', 'judge']);
});

test('١٠. طلب نصّ ← GPT ضربة واحدة كما قرّر المالك؛ برو فقط إن لم يُنفّذ GPT', async () => {
  const req = 'احذف كلمة Hajj من الصورة';
  const r = await run({ prompt: req, userText: req, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SWAP, gptEdit: SWAP }, () => ({ verdicts: ['done'], pick: 0, scope: 'small', report: 'حذفتها.' }));
  assert.deepEqual(r.calls.map((c) => c.kind), ['gpt-edit', 'judge']);
  assert.equal(r.json.engine, 'openai');
  assert.match(r.calls[1].text, /TEXT edit/);
});

test('١١. ذاكرة التعديل: GPT يستلم أمر المهمّة لا سطر «Conversation context»', async () => {
  const hist = [{ text: 'قبل', resultBase64: SRC, resultMime: 'image/jpeg' }];
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user', history: hist }, { pro: SAME, gptEdit: SWAP }, done());
  const g = r.calls.find((c) => c.kind === 'gpt-edit');
  assert.doesNotMatch(g.prompt, /^Conversation context/);
  assert.match(g.prompt, /PEOPLE REPLACEMENT/);
});

test('١٢. كاشف التبديل: صيغ المالك بـ«جميع/كل» و«وجوه وأشكال» و«الوجوه» وحدها — والتعديلات العاديّة لا', () => {
  const { isPersonSwapRequest, buildPersonSwapPrompt } = require(rp('api/_lib/image-prompt.js'));
  for (const t of [SWAP_REQ, 'غير جميع وجوه الأشخاص بدون تكرار', 'غير كل الوجوه', 'غيّر الوجوه', 'غير الوجوه كلها بدون تكرار', 'بدل الوجوه', 'غير جميع الأشخاص بدون تكرار',
    'ابي تغير وجوه كل الأشخاص', 'غير جميع الوجوه وخل الأسماء نفسها', 'بدّل كل الوجوه بوجوه جديدة', 'غير وجهها', 'بدون تكرار الوجوه', 'سوي أشخاص جدد', 'change all the faces without repeating']) assert.equal(isPersonSwapRequest(t), true, t);
  for (const t of ['خل الرجل يبتسم', 'خلي البنت تضحك', 'غير خلفية الشخص', 'غير لون قميص الرجل', 'غير شكل الخط', 'غير كل الصور', 'غير الأشكال', 'اجعل الرجل أطول', 'بدون تكرار الألوان', 'change the background']) assert.equal(isPersonSwapRequest(t), false, t);
  const p = buildPersonSwapPrompt('x', SWAP_REQ);
  assert.match(p, /EVERY person in the image — every card, tile, frame and panel/);
  assert.match(p, /a child stays a child/);
  assert.match(p, /fictional person/);
  assert.match(p, /Returning the source unchanged, or with the same faces lightly retouched, is a FAILURE/);
});

test('١٣. العميل: وضع «دمج نانو + GPT» في «+» للمالك، يصل الخادم في التوليد والتعديل، و٤٢٢ برسالة صادقة بالـ١٤ لغة', () => {
  const modes = read('js/modes.js');
  assert.match(modes, /\{ id:'image_mix',\s+ar:'دمج نانو \+ GPT', en:'Nano \+ GPT merge', ic:'<svg[^']*', owner:true \}/);
  assert.match(read('css/redesign.css'), /\.omModeItem\[data-mode="image_mix"\]\{order:\d+;\}/);
  const a9 = read('js/app-09-attach.js');
  assert.match(a9, /else if\(__o === 'image_mix'\) __x\.engineMix = true;/, 'التوليد');
  assert.match(a9, /engineMix: \(window\.__omMode === 'image_mix'\) \|\| undefined/, 'التعديل');
  const t = read('js/app-02-tts.js');
  assert.match(t, /if\(err === 'image_unchanged'\)\{\n\s+return t\('imgUnchanged'\);/);
  const ar = read('js/app-03-i18n-data.js');
  assert.equal((ar.match(/imgUnchanged: "/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(read('i18n/' + l + '.js'), /"imgUnchanged": "⚠️ /, l);
  const tools = read('js/app-17-agent-tools.js');
  assert.match(tools, /ej\.verdict/, 'أداة الوكيل تنقل حكم التنفيذ للنموذج فلا يدّعي «تمّ»');
  assert.ok(read('js/app.bundle.js').includes("__x.engineMix = true;"), 'الحزمة مبنيّة');
});

test('١٤. مراجعة: النداءات الإضافيّة بميزانيّة ٣٠٠ث، فكّ الصور بسقف ٢٠ ميغابكسل، والدمج لا يعيد GPT بعد فشله', async () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /const __extraBudget = function \(\) \{ return 213000 - \(Date\.now\(\) - __t0\); \};/, '٣٠٠ث − الحكم ٢٢ث − التكبير ٦٠ث − هامش');
  assert.match(mi, /deadlineOk: function \(\) \{ return __extraBudget\(\) >= 25000; \}/);
  assert.match(mi, /maxAttempts: budget \? 1 : undefined, timeoutMs: budget \? Math\.max\(15000, budget\) : undefined,/, 'برو الاحتياطيّ: محاولة واحدة بما بقي');
  assert.match(mi, /function \(\) \{ return proCandidate\(__extraBudget\(\)\); \}/);
  assert.match(mi, /signal: AbortSignal\.timeout\(__to\(120000\)\),/);
  assert.match(mi, /return gptCandidate\(\(__faithfulLane && !extras\.length\) \? __retryPrompt : '', __extraBudget\(\)\);/);
  // صورة بأبعاد ضخمة (رأس PNG يدّعي ٨٠٠٠×٨٠٠٠، وJPEG رأسه ٨٠٠٠×٨٠٠٠) = لا قياس فورًا، لا فكّ بثوانٍ وغيغابايتات
  const big = PNG.sync.write(new PNG({ width: 4, height: 4 }));
  big.writeUInt32BE(8000, 16); big.writeUInt32BE(8000, 20);
  const t = Date.now();
  assert.equal(diff.decodeImage(big), null);
  const j = Buffer.from(diff.visionCopy(SRC, 64).b64, 'base64'); const sof = j.indexOf(Buffer.from([0xff, 0xc0]));
  j.writeUInt16BE(8000, sof + 5); j.writeUInt16BE(8000, sof + 7);
  assert.equal(diff.decodeImage(j), null);
  assert.ok(Date.now() - t < 500, 'رفض فوريّ');
  // الدمج: برو وGPT فشلا ← سلسلة الإنقاذ بلا نداء GPT ثانٍ
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', engineMix: true }, { pro: null, gptEdit: null, nano: null }, done());
  assert.equal(r.calls.filter((c) => c.kind === 'gpt-edit').length, 1, 'GPT مرّة واحدة فقط');
  assert.ok(r.status >= 500);
});

test('١٥. مراجعة: المختار الذي قلبه القياس «ثابتًا» لا يُرسل بتقرير «تمّ»، والشعار الشفّاف لا يُرى أسود متطابقًا', async () => {
  // الطلب أفلت من كاشف النيّة (قياس صارم)، والتلميع أعاد الصورة نفسها، والحاكم اختاره بـ«تمّ» وقال scope كبير
  let k = 0;
  const judge = (b, n) => { k++; return n === 2 ? { verdicts: ['done', 'done'], pick: 1, scope: 'big', text: 'ok', report: 'تمّ تغيير جميع الوجوه.' } : { verdicts: ['done'], pick: 0, scope: 'big', text: 'broken', report: 'حكم جديد ' + k }; };
  const req = 'ابي ناس غير اللي بالصورة';
  const r = await run({ prompt: req, userText: req, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', engineMix: true },
    { pro: SWAP, gptEdit: (p) => (/^You are given 2 images/.test(p) ? SAME : null) }, judge);
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SWAP, 'المنفَّذ لا النسخة الثابتة');
  assert.equal(r.json.caption, 'حكم جديد 3', 'تقرير من حكم جديد على المنفَّذ لا «تمّ» المختار الخطأ');
  assert.deepEqual(r.calls.map((c) => c.kind), ['pro', 'judge', 'gpt-edit', 'judge', 'judge']);
  // شعاران شفّافان بحبر أسود في مكانين مختلفين
  const logo = (x0) => { const p = new PNG({ width: 120, height: 60 }); for (let y = 20; y < 40; y++) for (let x = x0; x < x0 + 30; x++) { const i = (y * 120 + x) * 4; p.data[i + 3] = 255; } return PNG.sync.write(p).toString('base64'); };
  const c = diff.compareImages(logo(10), logo(80));
  assert.ok(c.ok && c.changedFrac > 0.05, JSON.stringify(c));
  assert.equal(diff.looksUnchanged(c, false), false, 'لا ٤٢٢ كاذب على الشعارات الشفّافة');
  const v = diff.decodeImage(Buffer.from(diff.visionCopy(logo(10), 120).b64, 'base64'));
  assert.ok(v.data[(5 * v.w + 5) * 4] > 100, 'الخلفيّة الشفّافة رماديّة لا سوداء أمام الحاكم');
});

test('١٦. مراجعة الكاشف: النفي لا يبدّل أحدًا، «غيّر وجهها لابتسامة» ليست تبديلًا، والشخص بعينه وحده يُبدَّل', async () => {
  const ip = require(rp('api/_lib/image-prompt.js'));
  for (const t of ['غير الخلفية ولا تغير الأشخاص', 'ما تغير الاشخاص', 'غير الملابس بدون ما تبدل الأشخاص', 'غير الإضاءة، لا تغير الوجوه', 'بدون تغيير الأشخاص', "don't change the people", 'keep the same faces',
    'غير وجهها لابتسامة', 'غير وجهه خله يبتسم', 'غير وجهها بمكياج خفيف', 'غير الوجه لوجه مبتسم', 'غير وجه الساعة للون ذهبي', 'غير وجه الكرت', 'بدل وجهه بوجهي', "change all the people's shirts to red"]) assert.equal(ip.isPersonSwapRequest(t), false, t);
  for (const t of ['لا تغير الخلفية، غير الأشخاص', 'ما غيرت الوجوه', 'ابي تغير وجوه كل الأشخاص', 'غير وجهها', 'بدّل كل الوجوه بوجوه جديدة']) assert.equal(ip.isPersonSwapRequest(t), true, t);
  for (const t of ['غير الرجل اللي على اليمين بس', 'بدل البنت اللي في النص بشخص ثاني', 'replace the man on the left with a different person']) assert.equal(ip.isTargetedPersonSwap(t), true, t);
  for (const t of [SWAP_REQ, 'غير الأشخاص بس خل الخلفية', 'change all the faces']) assert.equal(ip.isTargetedPersonSwap(t), false, t);
  assert.match(ip.buildPersonSwapPrompt('x', 'غير الرجل اللي على اليمين بس'), /Replace ONLY the person or people the request singles out[^\n]*everyone else stays exactly as in the source/);
  // الموجِّه: النفي يذهب للمسار الأمين (لا أمر تبديل)
  const req = 'غير الخلفية للون أبيض ولا تغير الأشخاص';
  const r = await run({ prompt: req, userText: req, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: SWAP }, () => ({ verdicts: ['done'], pick: 0, scope: 'small', text: 'ok', report: 'ok' }));
  assert.doesNotMatch(r.calls[0].text, /PEOPLE REPLACEMENT/);
  // شخص بعينه: تغيير صغير (بطاقة واحدة من ثمانٍ) ليس «ثابتًا»، والحاكم يرى تلميح الاستهداف
  const one = (() => { const s = diff.decodeImage(SRC), w = diff.decodeImage(SWAP); const o = Buffer.alloc(s.w * s.h * 4);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const i = (y * s.w + x) * 4, inCard = x > 250 && x < 360 && y > 10 && y < 150; const src = inCard ? w : s; const j = (y * src.w + x) * 4; o[i] = src.data[j]; o[i + 1] = src.data[j + 1]; o[i + 2] = src.data[j + 2]; o[i + 3] = 255; }
    return Buffer.from(jpeg.encode({ width: s.w, height: s.h, data: o }, 88).data).toString('base64'); })();
  const req2 = 'غير الرجل اللي على اليمين بس';
  const r2 = await run({ prompt: req2, userText: req2, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' }, { pro: one, gptEdit: SWAP }, () => ({ verdicts: ['done'], pick: 0, scope: 'small', text: 'ok', report: 'بدّلته وحده.' }));
  assert.equal(r2.status, 200); assert.equal(r2.json.imageBase64, one, 'لا ٤٢٢ ولا GPT يبدّل الجميع');
  assert.deepEqual(r2.calls.map((c) => c.kind), ['pro', 'judge']);
  assert.match(r2.calls[0].text, /Replace ONLY the person/);
  assert.match(r2.calls[1].text, /TARGETED PERSON SWAP/);
});

test('١٧. مراجعة العميل: متابعة الدمج تعدّل آخر نسخة، تشخيص ٤٢٢ يذكر ما جُرّب، سطر المحرّك في تبديل الحرف، وwebp يُعاد ترميزه', () => {
  const a9 = read('js/app-09-attach.js');
  assert.match(a9, /if\(!imageAttachments\.length && window\.__omMode === 'image_mix' && cur\.lastEditedImage && cur\.lastEditedImage\.b64 && cur\.lastMsgWasImageEdit && text && text\.length <= 300 && !__IMGF_NEW_RE\.test\(text\)\)\{/);
  assert.equal((a9.match(/__data\.__diag\.free \|\| __data\.__diag\.tried \|\| '\?'/g) || []).length, 2);
  assert.match(a9, /content:\(typeof __lsData\.caption === 'string' \? __lsData\.caption : ''\) \+ __imgEngineLine\(__lsData\.engine(, __lsData)?\)/); // v-media-plans: الوسم يمرّ معه
  assert.match(a9, /b64\.length < 2000000 && !\/webp\/i\.test\(String\(mime \|\| ''\)\)\)\) return/);
  assert.ok(read('js/app.bundle.js').includes("window.__omMode === 'image_mix' && cur.lastEditedImage"), 'الحزمة مبنيّة');
});
