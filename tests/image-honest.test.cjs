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
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com/v1/images/edits')) {
      const prompt = init.body.get('prompt');
      calls.push({ kind: 'gpt-edit', prompt });
      return engines.gptEdit ? Response.json({ data: [{ b64_json: engines.gptEdit }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    if (u.includes('api.openai.com/v1/images/generations')) {
      calls.push({ kind: 'gpt-gen', prompt: JSON.parse(init.body).prompt });
      return engines.gptGen ? Response.json({ data: [{ b64_json: engines.gptGen }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    const b = JSON.parse(init.body);
    if (u.includes('gemini-flash-latest')) {
      const parts = b.contents[0].parts;
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
  return { status, json, calls, ledger: ledger.slice() };
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

test('٧. وضع «دمج نانو + GPT» للمالك: المحرّكان بالتوازي، حكم واحد على الاثنين، وصورة واحدة', async () => {
  const B = mirror(SWAP);
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', engineMix: true }, { pro: SWAP, gptEdit: B },
    (b, n) => ({ verdicts: n === 2 ? ['partial', 'done'] : ['done'], pick: n === 2 ? 1 : 0, scope: 'big', report: 'اخترت نسخة GPT.' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, B, 'المختار = المنفَّذ كاملًا');
  assert.equal(r.json.caption, 'اخترت نسخة GPT.');
  assert.match(r.json.engine, /^mix:openai\[mix:nano-pro:partial,mix:openai:done\]$/);
  assert.equal(r.calls.filter((c) => c.kind === 'judge').length, 1);
  assert.equal(r.calls.find((c) => c.kind === 'judge').n, 2);
  assert.match(r.calls.find((c) => c.kind === 'judge').text, /NEVER prefer a result just because it is closer to the source/);
  // وأحدهما رجّع الصورة نفسها ← لا يُعرض على الحاكم، والآخر يُرسل
  const r2 = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', engineMix: true }, { pro: SAME, gptEdit: SWAP }, done());
  assert.equal(r2.json.imageBase64, SWAP);
  assert.equal(r2.calls.find((c) => c.kind === 'judge').n, 1);
  // غير المالك لا يصله الوضع: نداء برو وحده
  const r3 = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user', engineMix: true }, { pro: SWAP, gptEdit: SWAP }, done());
  assert.deepEqual(r3.calls.map((c) => c.kind), ['pro', 'judge'], 'غير المالك = المسار العاديّ');
});

test('٨. الخام يبقى خامًا: «نانو خام» يرجّع الصورة نفسها ← تُرسل كما هي بتقرير صادق، بلا محرّك آخر ولا ٤٢٢', async () => {
  const r = await run({ prompt: SWAP_REQ, userText: SWAP_REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner', forceEngine: 'nano' }, { nano: SAME, pro: SWAP, gptEdit: SWAP },
    () => ({ verdicts: ['not_done'], pick: 0, report: 'الصورة ما تغيّرت.' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.imageBase64, SAME);
  assert.equal(r.json.caption, 'الصورة ما تغيّرت.');
  assert.deepEqual(r.calls.map((c) => c.kind), ['nano', 'judge']);
  assert.equal(r.calls[0].model, 'gemini-2.5-flash-image');
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
