// tests/image-cards.test.cjs — v-img-cards (٢٤ سبتمبر ٢٠٢٦).
// المالك، خمس لقطات من «أنماط الصور» (٨ بطاقات في صورة واحدة): «غيّر جميع الوجوه بدون تكرار» ← بعضها تغيّر والباقي كما هو
// (partial في المحرّكين)، والوجه نفسه في بطاقتين، و«الأنماط بصور ثانية» أفقدت «الحجّ والعمرة» موضوعها — «مافي دمج بين الاثنين
// ولا شي جديد، الناتج صفر». هنا: كلّ بطاقة وحدها بشخص جديد لا يتكرّر وبموضوعها، والمحرّكان على كلّ بطاقة في الدمج، والكتابة من
// المصدر نفسه. المصدر لقطة المالك نفسها (tests/fixtures)، والمحرّكات مزيّفة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const SRC_BUF = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg'));
const SRC = SRC_BUF.toString('base64');
const diff = require(rp('api/_lib/image-diff.js'));
const cards = require(rp('api/_lib/image-cards.js'));
const IMG = diff.decodeImage(SRC_BUF);

/* حدود صور البطاقات الثماني في اللقطة (٤٨٠×٤٠٧) مقيسة بالبكسل: الصفّ الأعلى مقصوص بطرف الصورة، والعمودان الطرفيّان كذلك */
const TRUTH = [[0, 0, 114, 152], [123, 0, 235, 152], [245, 0, 359, 152], [368, 0, 480, 152], [0, 212, 114, 357], [123, 212, 235, 357], [245, 212, 359, 357], [368, 212, 480, 357]];
const META = [['الحج والعمرة', 'boy', 'boy in white ihram at the Kaaba'], ['وقت العائلة', 'woman', 'woman in black hijab in the Haram'], ['إضافة أو إزالة نظارة', 'man', 'man with sunglasses, black jacket'], ['تصحيح عين مغمضة', 'girl', 'girl with curly hair among flowers'],
  ['أول يوم دراسة', 'woman', 'young woman holding books, backpack'], ['ليلة حناء', 'woman', 'woman with henna, purple dress'], ['تهنئة مولود جديد', 'baby', 'sleeping newborn in white knit hat'], ['إطار عيد ميلاد', 'man', 'smiling man with birthday cake']];
const box = (t) => ({ x0: t[0], y0: t[1], x1: t[2], y1: t[3] });
let seed = 11;
const jitter = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return Math.round((seed / 0x7fffffff - 0.5) * 14); };
/* مربّعات «النموذج» بدقّة ±٧ بكسل (≈١٫٥٪) كما يعيدها كشف الرؤية */
const detected = () => TRUTH.map((t, i) => ({ box: { x0: t[0] + jitter(), y0: t[1] + jitter(), x1: t[2] + jitter(), y1: t[3] + jitter() }, title: META[i][0], subject: META[i][1], scene: META[i][2] }));

/* «محرّك» يعدّل القصاصة فعلًا: يقلب ألوانها ويعيدها بمقاس آخر ونسبة أخرى (GPT: 1024×1536) — و«ثابت» يعيدها كما هي */
function edited(cropB64, tint) {
  const s = diff.decodeImage(cropB64);
  const W = 300, H = 450, p = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(s.w - 1, Math.floor(x * s.w / W)), sy = Math.min(s.h - 1, Math.floor(y * s.h / H));
    const i = (sy * s.w + sx) * 4, o = (y * W + x) * 4;
    p.data[o] = 255 - s.data[i]; p.data[o + 1] = tint; p.data[o + 2] = 255 - s.data[i + 2]; p.data[o + 3] = 255;
  }
  return PNG.sync.write(p).toString('base64');
}
const same = (cropB64) => cropB64;
const meanDiffRows = (a, b, y0, y1) => {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < a.w; x++) { const i = (y * a.w + x) * 4; s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); n++; }
  return s / n;
};

test('١. ضبط الحدود بالبكسل: مربّعات النموذج (±٧ بكسل) تلتصق بحدود الصور الحقيقيّة (±٣) — ولا تقفز للبطاقة المجاورة ولا لسطر العنوان', () => {
  const bg = cards.backgroundColor(IMG);
  assert.ok(Array.isArray(bg) && bg.length >= 1 && bg[0][0] < 30 && bg[0][1] < 30 && bg[0][2] < 30, 'خلفيّة اللوحة الداكنة أوّلًا: ' + JSON.stringify(bg));
  let worst = 0;
  for (let r = 0; r < 30; r++) {
    const snapped = cards.alignGrid(detected().map((c) => cards.snapBox(IMG, c.box, bg)));
    snapped.forEach((b, i) => { worst = Math.max(worst, Math.abs(b.x0 - TRUTH[i][0]), Math.abs(b.y0 - TRUTH[i][1]), Math.abs(b.x1 - TRUTH[i][2]), Math.abs(b.y1 - TRUTH[i][3])); });
  }
  assert.ok(worst <= 3, 'أسوأ ضلع على ٣٠ جولة: ' + worst + ' بكسل (منها بطاقة الحجاب الأسود بلا حافّة سفليّة: قيمة النموذج لا أقرب حافّة)');
  assert.deepEqual(cards.consensus([152, 163, 167, 152]).v, 152, 'الاتّفاق لا الوسيط: خطآن لا يغلبان');
});

test('٢. قراءة ردّ الكشف: مربّعات 0–1000 إلى بكسل، والبطاقة بلا شخص أو المتراكبة أو الصورة الواحدة = ليست لوحة', () => {
  const norm = (t) => [Math.round(t[1] * 1000 / 407), Math.round(t[0] * 1000 / 480), Math.round(t[3] * 1000 / 407), Math.round(t[2] * 1000 / 480)];
  const json = { cards: TRUTH.map((t, i) => ({ box: norm(t), title: META[i][0], subject: META[i][1], scene: META[i][2] })) };
  const got = cards.parseCards('```json\n' + JSON.stringify(json) + '\n```', 480, 407);
  assert.equal(got.length, 8);
  assert.ok(Math.abs(got[4].box.y0 - 212) <= 1 && got[0].title === 'الحج والعمرة' && got[6].subject === 'baby');
  assert.deepEqual(cards.parseCards(JSON.stringify({ cards: [json.cards[0]] }), 480, 407), [], 'صورة واحدة = المسار العاديّ');
  assert.deepEqual(cards.parseCards(JSON.stringify({ cards: [json.cards[0], json.cards[0]] }), 480, 407), [], 'متراكبة = لا نثق');
  assert.equal(cards.parseCards(JSON.stringify({ cards: json.cards.map((c) => Object.assign({}, c, { subject: 'none' })) }), 480, 407).length, 0, 'بلا أشخاص = لا تبديل');
  assert.deepEqual(cards.parseCards('ليس JSON', 480, 407), []);
  assert.match(cards.detectPrompt(), /PHOTO area only \(never the text/);
});

test('٣. التركيب: الصور الجديدة داخل إطاراتها بالضبط، وكلّ بكسل خارجها (العناوين والكتابة) من المصدر حرفيًّا، والزوايا المستديرة تبقى', () => {
  const pl = TRUTH.map((t, i) => { const b = box(t); const tile = cards.cropRGBA(IMG, b); return { box: b, img: diff.decodeImage(edited(cards.encodePng(tile), i * 30)), guard: cards.cornerGuard(IMG, b) }; });
  const out = cards.composite(IMG, pl);
  let outside = 0, inChanged = 0, inAll = 0;
  for (let y = 0; y < IMG.h; y++) for (let x = 0; x < IMG.w; x++) {
    const inside = TRUTH.some((t) => x >= t[0] && x < t[2] && y >= t[1] && y < t[3]);
    const i = (y * IMG.w + x) * 4;
    const d = Math.abs(out.data[i] - IMG.data[i]) + Math.abs(out.data[i + 1] - IMG.data[i + 1]) + Math.abs(out.data[i + 2] - IMG.data[i + 2]);
    if (!inside) outside += d; else { inAll++; if (d > 30) inChanged++; }
  }
  assert.equal(outside, 0, 'الكتابة والإطارات لم يُمسّ منها بكسل');
  assert.ok(inChanged / inAll > 0.97, 'الصور تغيّرت: ' + (inChanged / inAll).toFixed(3));
  /* زاوية الصفّ الثاني العليا المستديرة: البكسل الملاصق للزاوية خلفيّة البطاقة من المصدر */
  const i0 = (212 * IMG.w + 123) * 4;
  assert.deepEqual([out.data[i0], out.data[i0 + 1], out.data[i0 + 2]], [IMG.data[i0], IMG.data[i0 + 1], IMG.data[i0 + 2]]);
  const fit = cards.fitCover({ w: 1024, h: 1536, data: Buffer.alloc(1024 * 1536 * 4, 200) }, 114, 145);
  assert.deepEqual([fit.w, fit.h], [114, 145], 'نسبة أخرى = قصّ من الوسط ثمّ تحجيم، بلا مطّ');
});

test('٤. أشخاص جدد لا يتكرّرون: كلّ بطاقة من نوعها بوصف مختلف، والأمر يحفظ موضوع البطاقة ويمنع الكتابة', () => {
  const cs = META.map((m) => ({ title: m[0], subject: m[1], scene: m[2] }));
  const ps = cards.assignPersonas(cs, 'غيّر الوجوه');
  const women = ps.filter((p, i) => META[i][1] === 'woman');
  assert.equal(new Set(women).size, 3, 'ثلاث نساء = ثلاثة أوصاف');
  assert.equal(new Set(ps.filter((p, i) => META[i][1] === 'man')).size, 2);
  assert.deepEqual(cards.assignPersonas(cs, 'غيّر الوجوه'), ps, 'الطلب نفسه = التوزيع نفسه');
  const sw = cards.cardPrompt('swap', cs[0], ps[0]);
  assert.match(sw, /card titled "الحج والعمرة"/); assert.match(sw, /completely different, new person/); assert.match(sw, /No text, letters, logos, borders or frames/);
  assert.match(sw, /including any head covering/);
  const rn = cards.cardPrompt('renew', cs[0], ps[0]);
  assert.match(rn, /brand-new photo/); assert.match(rn, /SAME theme: keep the theme's key elements exactly \(place, occasion/, '«صور ثانية» لا تُضيع «الحجّ والعمرة»');
});

/* runCards بمكوّنات مزيّفة: كشف، محرّكان، حكم */
async function runStub(o) {
  const calls = { pro: 0, gpt: 0, judge: 0, prompts: [] };
  const eng = (name, fn) => async (prompt, crop) => { calls[name]++; calls.prompts.push([name, prompt]); return { b64: fn(crop.b64, calls.prompts.length, prompt), mime: 'image/png' }; };
  const r = await cards.runCards({
    source: { b64: SRC, mime: 'image/jpeg' }, kind: o.kind || 'swap', mix: !!o.mix, request: 'غيّر جميع الوجوه بدون تكرار', deadline: Date.now() + 200000,
    detect: async () => ({ cards: o.detect || detected() }),
    engines: { pro: o.pro === null ? null : eng('pro', o.pro || ((b, k) => edited(b, k * 9))), gpt: o.gpt === null ? null : eng('gpt', o.gpt || ((b, k) => edited(b, 200 - k))) },
    judge: async (a) => { calls.judge++; return o.judge ? o.judge(a) : { c: a.cands.map(() => ({ newPerson: true, theme: true, quality: 8 })), pick: a.cands.length > 1 ? 1 : 0 }; },
  });
  return { r, calls };
}

test('٥. الدمج الحقيقيّ: المحرّكان على كلّ بطاقة، والحكم يختار الأفضل بطاقةً بطاقة — صورة واحدة من الاثنين والكتابة كما هي', async () => {
  const { r, calls } = await runStub({ mix: true, judge: (a) => ({ c: [{ newPerson: true, theme: true, quality: 6 }, { newPerson: true, theme: true, quality: 9 }], pick: a.card.subject === 'woman' ? 0 : 1 }) });
  assert.equal(r.ok, true);
  assert.deepEqual([calls.pro, calls.gpt, calls.judge], [8, 8, 8], 'المحرّكان على كلّ بطاقة وحكم لكلّ بطاقة');
  assert.equal(r.engine, 'cards[8/8 pro:3,gpt:5]', 'النساء من برو والباقي من GPT: دمج لا اختيار صورة كاملة');
  assert.equal(r.mime, 'image/jpeg');
  const out = diff.decodeImage(r.b64);
  assert.deepEqual([out.w, out.h], [480, 407]);
  assert.ok(meanDiffRows(out, IMG, 158, 208) < 4, 'عناوين الصفّ الأعلى كما هي (فرق ضغط JPEG فقط)');
  assert.ok(meanDiffRows(out, IMG, 362, 407) < 4, 'عناوين الصفّ الأسفل كما هي');
  assert.ok(diff.compareImages(IMG, out).changedFrac > 0.4, 'الصور تغيّرت');
  const women = calls.prompts.filter((p) => p[0] === 'pro' && /card titled "(وقت العائلة|أول يوم دراسة|ليلة حناء)"/.test(p[1])).map((p) => p[1].match(/new person: ([^.]+)\./)[1]);
  assert.equal(new Set(women).size, 3, 'لا تكرار للشخصيّات');
});

test('٦. الوضع العاديّ: برو لكلّ بطاقة، وGPT فقط للبطاقة التي لم تتغيّر أو رفضها الحكم', async () => {
  const seen = {};
  const { r, calls } = await runStub({
    pro: (b, k, p) => (/تهنئة مولود/.test(p) ? same(b) : edited(b, 40)),
    judge: (a) => { const first = !seen[a.card.title]; seen[a.card.title] = 1; return { c: a.cands.map(() => ({ newPerson: !(first && /عيد ميلاد/.test(a.card.title)), theme: true, quality: 7 })), pick: 0 }; },
  });
  assert.equal(r.ok, true);
  assert.deepEqual([calls.pro, calls.gpt], [8, 2], 'GPT للرضيع (برو أعاده كما هو) ولعيد الميلاد (الحكم: نفس الشخص) وحدهما');
  assert.equal(r.engine, 'cards[8/8 pro:6,gpt:2]');
  assert.deepEqual(calls.prompts.filter((p) => p[0] === 'gpt').map((p) => p[1].match(/card titled "([^"]+)"/)[1]).sort(), ['إطار عيد ميلاد', 'تهنئة مولود جديد']);
});

test('٧. حكم يرفض بطاقة (نفس الشخص) = تبقى كما هي ولا تُحسب؛ لا بطاقة تغيّرت = المسار العاديّ؛ ليست لوحة = المسار العاديّ', async () => {
  const { r } = await runStub({ mix: true, judge: (a) => ({ c: a.cands.map(() => ({ newPerson: a.card.subject !== 'baby', theme: true, quality: 8 })), pick: 0 }) });
  assert.equal(r.ok, true);
  assert.match(r.engine, /^cards\[7\/8 /, 'الرضيع: الحكم قال «نفس الشخص» فلا يُدّعى');
  const out = diff.decodeImage(r.b64);
  const t = TRUTH[6];
  let d = 0, n = 0;
  for (let y = t[1] + 3; y < t[3] - 3; y++) for (let x = t[0] + 3; x < t[2] - 3; x++) { const i = (y * IMG.w + x) * 4; d += Math.abs(out.data[i] - IMG.data[i]); n++; }
  assert.ok(d / n < 6, 'بطاقة الرضيع من المصدر');
  const none = await runStub({ mix: true, pro: same, gpt: same });
  assert.deepEqual([none.r.ok, none.r.reason], [false, 'no_card_changed'], 'المحرّكان أعادا الصور نفسها = لا لوحة كاذبة');
  const one = await runStub({ detect: [detected()[0]] });
  assert.equal(one.r.ok, false); assert.match(one.r.reason, /^not_cards/);
});

test('٨. المهلة: لا نداء محرّك بعد موعد اللوحة، ومحرّك معلّق لا يحبس الطلب', async () => {
  const late = await cards.runCards({ source: { b64: SRC, mime: 'image/jpeg' }, kind: 'swap', mix: true, request: 'x', deadline: Date.now() + 20000,
    detect: async () => ({ cards: detected() }), engines: { pro: async () => { throw new Error('should not run'); }, gpt: null }, judge: async () => null });
  assert.deepEqual([late.ok, late.reason], [false, 'no_card_changed'], 'أقلّ من ١٥ث للمحرّك = لا نداء');
  const t0 = Date.now();
  const hang = await cards.runCards({ source: { b64: SRC, mime: 'image/jpeg' }, kind: 'swap', mix: false, request: 'x', deadline: Date.now() + 1500, reserveMs: 100, minCallMs: 100, graceMs: 100,
    detect: async () => ({ cards: detected() }), engines: { pro: () => new Promise(() => {}), gpt: null }, judge: async () => null });
  assert.equal(hang.ok, false);
  assert.ok(Date.now() - t0 < 4000, 'انتهى بمهلته لا بالمحرّك المعلّق: ' + (Date.now() - t0) + 'ms');
});

// ── الموجِّه الحقيقيّ (maha-image) بمحرّكات مزيّفة ──
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off';
delete process.env.IMAGE_VERIFY; delete process.env.IMAGE_CAPTION; delete process.env.IMAGE_EDIT_MODEL; delete process.env.IMAGE_CREATIVE_MODEL; delete process.env.IMAGE_PIPELINE; delete process.env.IMAGE_RAW_DEFAULT; delete process.env.IMAGE_CARDS;
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true }) });
stub('api/_lib/points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ owner: 'omran', user: 'sara' })[t] || null,
  isOwnerUsername: (u) => u === 'omran',
  spendPoints: async (u) => (u === 'omran' ? { ok: true, owner: true } : { ok: true, points: 100 }),
  refundPoints: async () => {},
});
stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {} });
const handler = require(rp('api/_lib/maha-image.js'));
const norm = (t) => [Math.round(t[1] * 1000 / 407), Math.round(t[0] * 1000 / 480), Math.round(t[3] * 1000 / 407), Math.round(t[2] * 1000 / 480)];
const CARDS_JSON = { cards: TRUTH.map((t, i) => ({ box: norm(t), title: META[i][0], subject: META[i][1], scene: META[i][2] })) };

/* o: { cards: ردّ الكشف, pro(crop,prompt)→b64|null, gpt(crop,prompt)→b64|null } */
async function route(body, o) {
  const calls = [];
  const save = global.fetch;
  const txt = (j) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(j) }] } }] });
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com/v1/images/edits')) {
      const prompt = init.body.get('prompt');
      const blob = init.body.get('image') || init.body.getAll('image[]')[0];
      const crop = Buffer.from(await blob.arrayBuffer()).toString('base64');
      calls.push({ kind: 'gpt', prompt });
      const out = o.gpt ? o.gpt(crop, prompt) : null;
      return out ? Response.json({ data: [{ b64_json: out }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    const b = JSON.parse(init.body);
    const parts = b.contents[b.contents.length - 1].parts;
    const text = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (u.includes('gemini-flash-latest')) {
      if (/made of several CARDS/.test(text)) { calls.push({ kind: 'detect' }); return o.detectStatus ? Response.json({ error: { message: 'busy' } }, { status: o.detectStatus }) : txt(o.cards === undefined ? CARDS_JSON : o.cards); }
      if (/^Card: "/.test(text)) { calls.push({ kind: 'card-judge', text }); return txt({ c: parts.filter((p) => p.text && /^CANDIDATE/.test(p.text)).map(() => ({ new_person: true, theme: true, quality: 8 })), pick: 'A' }); }
      calls.push({ kind: 'judge', text });
      return txt({ verdicts: ['done'], pick: 0, scope: 'big', text: 'ok', report: 'بدّلت الأشخاص في البطاقات الثماني والعناوين كما هي. هل أعجبتك؟ ولا أسوي لك … أو …؟' });
    }
    const model = (u.match(/models\/([^:]+):/) || [])[1];
    const crop = (parts.find((p) => p.inlineData) || {}).inlineData;
    calls.push({ kind: 'pro', model, text, whole: crop && crop.data === body.editImageBase64 });
    const out = o.pro ? o.pro(crop ? crop.data : '', text) : null;
    return out ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: out } }] } }] }) : Response.json({ error: { message: 'fail' } }, { status: 400 });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', headers: {}, body }, res); } finally { global.fetch = save; }
  return { status, json, calls };
}
const REQ = 'عطني نفس الاسامي وغير الصور بدون تكرار الشخصيات';
const OWNER = (extra) => Object.assign({ prompt: REQ, userText: REQ, editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'owner' }, extra || {});
const kinds = (r) => r.calls.map((c) => c.kind).reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});

test('٩. لقطة المالك في وضع الدمج عبر الموجِّه الحقيقيّ: كشف واحد، برو وGPT على كلّ بطاقة، حكم لكلّ بطاقة، ثمّ حكم التقرير — صورة واحدة', async () => {
  const r = await route(OWNER({ engineMix: true }), { pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 200));
  assert.deepEqual(kinds(r), { detect: 1, pro: 8, gpt: 8, 'card-judge': 8, judge: 1 });
  assert.match(r.json.engine, /^mix:cards\[8\/8 pro:\d,gpt:\d\]$/);
  assert.equal(r.json.verdict, 'done');
  assert.match(r.json.caption, /البطاقات الثماني/);
  assert.equal(r.json.mimeType, 'image/jpeg');
  const out = diff.decodeImage(r.json.imageBase64);
  assert.deepEqual([out.w, out.h], [480, 407], 'مقاس اللقطة نفسها');
  assert.ok(meanDiffRows(out, IMG, 158, 208) < 4 && meanDiffRows(out, IMG, 362, 407) < 4, 'العناوين من المصدر');
  const pros = r.calls.filter((c) => c.kind === 'pro');
  assert.ok(pros.every((c) => c.model === 'gemini-3-pro-image' && !c.whole), 'برو يستلم قصاصة البطاقة لا اللوحة كاملة');
  assert.ok(META.every((m) => pros.some((c) => c.text.includes('card titled "' + m[0] + '"'))), 'كلّ بطاقة بعنوانها');
});

test('١٠. غير المالك لا يدخل مسار البطاقات (١٦ نداء = قرار مال)، وصورة ليست لوحة تكمل المسار العاديّ', async () => {
  const user = await route(Object.assign(OWNER(), { token: 'user' }), { pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(kinds(user).detect, undefined, 'لا كشف لغير المالك');
  assert.ok(user.calls.find((c) => c.kind === 'pro').whole, 'برو على الصورة كاملة كما كان');
  const plain = await route(OWNER({ engineMix: true }), { cards: { cards: [] }, pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(plain.status, 200);
  assert.equal(kinds(plain).detect, 1);
  assert.ok(plain.calls.filter((c) => c.kind === 'pro').every((c) => c.whole), 'ليست لوحة = دمج الصورة كاملة كما كان');
  assert.doesNotMatch(plain.json.engine, /cards/, 'ليست لوحة لا تُذكر للمالك');
});

test('١١. «غيرهم كلهم» بعد تبديل = تبديل على البطاقات، و«الأنماط بصور ثانية» = صور جديدة بموضوع كلّ بطاقة؛ والوضع العاديّ برو ثمّ GPT للمتعثّرة', async () => {
  const hist = [{ text: 'غيّر جميع وجوه وأشكال الأشخاص', resultBase64: 'R'.repeat(200), resultMime: 'image/png' }];
  const all = await route(OWNER({ prompt: 'غيرهم كلهم', userText: 'غيرهم كلهم', history: hist }), { pro: (c, p) => (/تهنئة مولود/.test(p) ? c : edited(c, 30)), gpt: (c) => edited(c, 220) });
  assert.equal(all.status, 200);
  assert.deepEqual([kinds(all).pro, kinds(all).gpt], [8, 1], 'GPT للرضيع وحده (برو أعاده كما هو)');
  assert.match(all.json.engine, /^cards\[8\/8 pro:7,gpt:1\]$/);
  assert.ok(all.calls.filter((c) => c.kind === 'pro').every((c) => /Replace the person in it with a completely different, new person/.test(c.text)));
  const renew = await route(OWNER({ prompt: 'الأنماط بصور ثانية', userText: 'الأنماط بصور ثانية', engineMix: true }), { pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(renew.status, 200);
  const hajj = renew.calls.find((c) => c.kind === 'pro' && /الحج والعمرة/.test(c.text));
  assert.match(hajj.text, /brand-new photo from a card titled "الحج والعمرة" \(boy in white ihram at the Kaaba\)/);
  assert.match(hajj.text, /keep the theme's key elements exactly/, 'الحجّ يبقى حجًّا');
});

test('١٢. واجهة: «دمج نانو + GPT» لا ينطفئ بمسح حرف في صندوق فارغ ويبقى بعد إعادة الفتح للمالك (بلا تركيز يفتح لوحة المفاتيح)', () => {
  const m = fs.readFileSync(path.join(root, 'js/modes.js'), 'utf8');
  assert.match(m, /e\.key === 'Backspace' && !ta\.value && window\.__omMode && window\.__omMode !== 'image_mix'/);
  assert.match(m, /if\(id === 'image_mix'\) localStorage\.setItem\('omStickyMode', 'image_mix\|' \+ Date\.now\(\)\); else localStorage\.removeItem\('omStickyMode'\);/);
  assert.match(m, /if\(on && !stickyTried\)\{ stickyTried = true; var sv = String\(localStorage\.getItem\('omStickyMode'\) \|\| ''\)\.split\('\|'\); if\(!window\.__omMode && sv\[0\] === 'image_mix' && Date\.now\(\) - \(\+sv\[1\] \|\| 0\) < 3 \* 3600000\) pick\('image_mix', true\); \}/, 'مرّة لكلّ تحميل وخلال ٣ ساعات');
  assert.match(m, /if\(ta && !quiet\)\{ ta\.focus\(\); \}/);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /js\/modes\.js\?v=m250925b/);
});

test('١٣. نيّة اللوحة: تبديل للكلّ، «غيرهم كلهم» بعد تبديل، و«صور ثانية/غيّر الصور» صور جديدة؛ وشخص بعينه أو طلب عاديّ = لا', () => {
  const H = [{ text: 'غيّر جميع وجوه وأشكال الأشخاص' }];
  assert.equal(cards.cardsKind('غيّر جميع الوجوه', { personSwap: true }), 'swap');
  assert.equal(cards.cardsKind('غيرهم كلهم', { history: H }), 'swap', 'متابعة بعد تبديل');
  assert.equal(cards.cardsKind('كملهم', { history: H }), 'swap');
  assert.equal(cards.cardsKind('غيرهم كلهم', { history: [{ text: 'خلها أفتح' }] }), '', 'بلا تبديل قبلها = ليست تبديلًا');
  for (const t of ['الأنماط بصور ثانية', 'غير الصور', 'حط صور جديدة للأنماط', 'ابي صور مختلفة', 'new photos please']) assert.equal(cards.cardsKind(t, {}), 'renew', t);
  assert.equal(cards.cardsKind('غير الصورة', {}), '', '«الصورة» مفردة = تعديل عاديّ');
  assert.equal(cards.cardsKind('خلّ الخلفية أفتح', {}), '');
});

/* ── مراجعة w6w18h18z: ما أثبته المراجِع بالتجربة، كلٌّ باختباره ── */

/* لوحة المالك مكبّرة k مرّة داخل لوحة أكبر بلون الصفحة، مزاحة (ox,oy) — لقطة جوّال كاملة (٢٠٤٨ طولًا) أو بهامش صفحة */
function placeGrid(k, W, H, ox, oy) {
  const q = (405 * IMG.w + 117) * 4, d = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = IMG.data[q]; d[i * 4 + 1] = IMG.data[q + 1]; d[i * 4 + 2] = IMG.data[q + 2]; d[i * 4 + 3] = 255; }
  for (let y = 0; y < IMG.h * k; y++) for (let x = 0; x < IMG.w * k; x++) {
    const a = (Math.floor(y / k) * IMG.w + Math.floor(x / k)) * 4, o = ((y + oy) * W + x + ox) * 4;
    d[o] = IMG.data[a]; d[o + 1] = IMG.data[a + 1]; d[o + 2] = IMG.data[a + 2];
  }
  return { img: { w: W, h: H, data: d }, T: TRUTH.map((t) => [t[0] * k + ox, t[1] * k + oy, t[2] * k + ox, t[3] * k + oy]) };
}
const worstOf = (out, T) => out.reduce((m, b, i) => Math.max(m, Math.abs(b.x0 - T[i][0]), Math.abs(b.y0 - T[i][1]), Math.abs(b.x1 - T[i][2]), Math.abs(b.y1 - T[i][3])), 0);

test('١٤. لقطة جوّال كاملة (٩٦٠×٢٠٤٨) وهامش صفحة: النافذة من مقاس البطاقة فلا قفز لعنوان البطاقة التي فوقها ولا طلاء للهامش؛ وترتيب النموذج لا يغيّر النتيجة', () => {
  for (const [k, W, H, ox, oy] of [[2, 960, 2048, 0, 600], [2, 1000, 2048, 20, 24], [1, 500, 427, 10, 10]]) {
    const { img, T } = placeGrid(k, W, H, ox, oy);
    const region = { x0: T[0][0] - 40 * k, y0: T[0][1] - 40 * k, x1: T[7][2] + 40 * k, y1: T[7][3] + 60 * k };
    const bg = cards.backgroundColor(img, region);
    const snap = (bs) => cards.alignGrid(bs.map((b) => cards.snapBox(img, b, bg)));
    const exact = snap(T.map((t) => box(t)));
    assert.ok(worstOf(exact, T) <= 2, W + '×' + H + ' مربّعات دقيقة تبقى دقيقة (كانت تقفز ٤٢–٤٤ بكسل): ' + worstOf(exact, T));
    let worst = 0;
    for (let r = 0; r < 20; r++) {
      const out = snap(T.map((t) => ({ x0: t[0] + jitter() * k, y0: t[1] + jitter() * k, x1: t[2] + jitter() * k, y1: t[3] + jitter() * k })));
      worst = Math.max(worst, worstOf(out, T));
      assert.ok(out.every((b) => b.x0 >= ox - 2 && b.y0 >= oy - 2), 'لا طلاء للهامش');
      assert.ok(out.slice(0, 4).every((b) => b.y1 < 161 * k + oy), 'صور الصفّ الأعلى لا تبلغ سطر العنوان');
      assert.ok(out.slice(4).every((b) => b.y0 > 208 * k + oy), 'صور الصفّ الثاني لا تصعد لعناوين الصفّ الأعلى');
    }
    assert.ok(worst <= 6 * k, W + '×' + H + ' أسوأ ضلع بمربّعات ±' + 7 * k + ': ' + worst);
  }
  const bg = cards.backgroundColor(IMG), ex = TRUTH.map((t) => box(t));
  for (const ord of [[0, 1, 2, 3], [1, 2, 0, 3], [2, 1, 3, 0], [3, 2, 1, 0]]) {
    assert.deepEqual(cards.alignGrid(ord.map((i) => cards.snapBox(IMG, ex[i], bg))).map((b) => b.y1), [152, 152, 152, 152], 'ترتيب ' + ord.join(''));
  }
});

test('١٥. لونا خلفيّة (صفحة داكنة وجسم بطاقة فاتح بحشوة): الحدّ حدّ الصورة لا حدّ البطاقة، ولا شفافيّة تصير سوداء', () => {
  const W = 200, H = 100, d = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, inCard = ((x >= 10 && x < 95) || (x >= 105 && x < 190)) && y >= 4 && y < 96;
    const inPhoto = inCard && y >= 10 && y < 60 && ((x >= 18 && x < 87) || (x >= 113 && x < 182));
    const c = inPhoto ? [(x * 37 + y * 91) % 256, (x * 13 + y * 7) % 256, (x * y) % 256] : inCard ? [240, 240, 238] : [30, 30, 34];
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  const img = { w: W, h: H, data: d }, bg = cards.backgroundColor(img);
  assert.equal(bg.length, 2, 'اللونان: ' + JSON.stringify(bg));
  const out = cards.alignGrid([{ x0: 14, y0: 6, x1: 91, y1: 64 }, { x0: 109, y0: 13, x1: 186, y1: 57 }].map((b) => cards.snapBox(img, b, bg)));
  assert.deepEqual(out, [{ x0: 18, y0: 10, x1: 87, y1: 60 }, { x0: 113, y0: 10, x1: 182, y1: 60 }]);
});

test('١٦. كلمات المالك تصل أمر كلّ بطاقة وحكمها؛ وتعديل ليس تبديلًا («لكرتون»، «مكان بعض»، «والكتابة…»، ستايل/تحسين/نصّ) لا يدخل اللوحة؛ ولا تكرار بعد نفاد الأوصاف', () => {
  const c = { title: 'ليلة حناء', subject: 'woman', scene: 'woman with henna' };
  const req = 'خلهم كلهم رجال لوجوه خليجية';
  assert.match(cards.cardPrompt('swap', c, 'a woman', req), /overrides the suggested description[^"]*"خلهم كلهم رجال لوجوه خليجية"/);
  assert.match(cards.cardPrompt('renew', c, 'a woman', req), /^The user's own request/);
  assert.doesNotMatch(cards.cardPrompt('swap', c, 'a woman', ''), /user's own request/, 'بلا طلب = الأمر كما كان');
  const jp = cards.judgeParts('swap', c, { b64: 'A', mime: 'image/png' }, [{ b64: 'B', mime: 'image/png' }], req);
  assert.match(jp[0].text, /The user asked, verbatim: "خلهم كلهم رجال لوجوه خليجية"/);
  for (const t of ['غير الصور لكرتون', 'بدل الصور مكان بعض', 'غير الصور والكتابة للانجليزي', 'غير الصور لأبيض وأسود', 'غير الصور لستايل انمي']) assert.equal(cards.cardsKind(t, {}), '', t);
  assert.equal(cards.cardsKind('غير الصور كلها', {}), 'renew');
  assert.equal(cards.cardsKind('غيّر جميع الوجوه', { personSwap: true, other: true }), '', 'ستايل/تحسين/نصّ = المسار العاديّ');
  const many = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, subject: 'woman', scene: 's' }));
  assert.equal(new Set(cards.assignPersonas(many, 'x')).size, 12, '١٢ امرأة = ١٢ وصفًا');
  const m = fs.readFileSync(path.join(root, 'api/_lib/maha-image.js'), 'utf8');
  assert.match(m, /other: isRestyle \|\| isElevate \|\| isSceneUpgrade \|\| isTextSwap \|\| isTextRemove \|\| isBroadEdit/);
});

test('١٧. الموجِّه: فشل البطاقات متأخّرًا = ٤٢٢ صادقة بسبب كلّ محرّك (لا مسار كامل يتخطّى ٣٠٠ث)؛ فشل الكشف يُذكر للمالك؛ و٤K لا تدخل اللوحة', async () => {
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  let late;
  try {
    late = await route(OWNER(), { pro: (c, p) => { if (p.includes('card titled')) skew = 90000; return c; }, gpt: () => null });
  } finally { Date.now = realNow; }
  assert.equal(late.status, 422, JSON.stringify(late.json).slice(0, 200));
  assert.equal(late.json.error, 'image_unchanged');
  assert.match(late.json.__diag.cards, /^no_card_changed .*pro=same/, 'السبب لكلّ محرّك: ' + late.json.__diag.cards);
  assert.match(late.json.__diag.cards, /gpt=/);
  assert.equal(late.calls.filter((c) => c.kind === 'pro' && c.whole).length, 0, 'لا نداء للصورة كاملة بعد ٩٠ث من البطاقات');
  const det = await route(OWNER(), { detectStatus: 503, pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(det.status, 200);
  assert.match(det.json.engine, /\(cards:not_cards:http_503\)/, 'فشل الكشف لا يُخفى');
  const k4 = await route(OWNER({ prompt: REQ + ' 4k', userText: REQ + ' 4k' }), { pro: (c) => edited(c, 30), gpt: (c) => edited(c, 220) });
  assert.equal(kinds(k4).detect, undefined, '٤K = الصورة كاملة بدقّتها لا لوحة ٤٨٠ بكسل');
  const m = fs.readFileSync(path.join(root, 'api/_lib/maha-image.js'), 'utf8');
  assert.match(m, /fetchImageWithRetry\(\{ maxAttempts: 1, timeoutMs: Math\.max\(15000, budget\)/, 'محاولة برو واحدة لكلّ بطاقة: لا نداء يتيم');
});
