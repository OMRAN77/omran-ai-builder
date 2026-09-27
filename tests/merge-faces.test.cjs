// tests/merge-faces.test.cjs — v-merge-faces (٢٧ سبتمبر ٢٠٢٦).
// المالك: «في تحسن عند دمج الصور فيه تغير الملامح» — بعد v-merge-identity-lock-v3 لم يعد الشخص يتبدّل كلّه، لكنّ
// الملامح تنحرف. هنا يُشغَّل موجِّه maha-image الحقيقيّ بمحرّكات مزيّفة وصورتين حقيقيّتين (JPEG) ويُفحص ما يصل النموذج.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* صورة JPEG اصطناعيّة: خلفيّة متدرّجة ومستطيل «وجه» فاتح في المكان المعطى (نسبيًّا) */
function photo(w, h, face, seed) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inFace = face && x >= face[0] * w && x < face[2] * w && y >= face[1] * h && y < face[3] * h;
    data[o] = inFace ? 230 : (x * 7 + seed * 40) % 256; data[o + 1] = inFace ? 190 : (y * 5) % 256; data[o + 2] = inFace ? 160 : (seed * 90) % 256; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
/* الشخص أ في الصورة الأولى التي رفعها المستخدم، والشخص ب في الثانية (الأخيرة = editImageBase64 كما يرسلها العميل) */
const PHOTO_A = photo(600, 800, [0.40, 0.18, 0.56, 0.30], 1);
const PHOTO_B = photo(640, 480, [0.20, 0.25, 0.32, 0.41], 2);
const RESULT = photo(480, 640, null, 3);
const faceBox = (b64) => (b64 === PHOTO_A ? [180, 400, 300, 560] : (b64 === PHOTO_B ? [250, 200, 410, 320] : null));

process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off';
for (const k of ['IMAGE_VERIFY', 'IMAGE_CAPTION', 'IMAGE_EDIT_MODEL', 'IMAGE_CREATIVE_MODEL', 'IMAGE_PIPELINE', 'IMAGE_RAW_DEFAULT', 'MERGE_FACE_CROPS']) delete process.env[k];
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

const inlineOf = (parts) => parts.filter((p) => p.inlineData).map((p) => p.inlineData.data);
async function run(body, engines, judge) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com/v1/images/edits')) {
      const imgs = init.body.getAll('image').concat(init.body.getAll('image[]'));
      calls.push({ kind: 'gpt-edit', prompt: init.body.get('prompt'), images: imgs.length, field: init.body.getAll('image[]').length ? 'image[]' : 'image' });
      return engines.gptEdit ? Response.json({ data: [{ b64_json: engines.gptEdit }] }) : Response.json({ error: { message: 'boom' } }, { status: 500 });
    }
    const b = JSON.parse(init.body);
    const parts = b.contents[b.contents.length - 1].parts;
    const texts = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (u.includes('gemini-flash-latest')) {
      if (/made of several CARDS/.test(texts)) return Response.json({ candidates: [{ content: { parts: [{ text: '{"cards":[]}' }] } }] });
      if (/every human face/i.test(texts)) {
        const src = inlineOf(parts)[0];
        calls.push({ kind: 'detect', dims: src ? require(rp('api/_lib/face-composite.js')).decode(Buffer.from(src, 'base64')) : null });
        /* الكاشف يرى نسخة مصغّرة؛ الصندوق نسبيّ فيبقى صحيحًا — نعرف الصورة من نسبة أبعادها */
        const d = calls[calls.length - 1].dims;
        const box = d && Math.abs(d.w / d.h - 0.75) < 0.02 ? faceBox(PHOTO_A) : faceBox(PHOTO_B);
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: [{ box_2d: box }] }) }] } }] });
      }
      calls.push({ kind: 'judge', text: texts, images: inlineOf(parts).length });
      const j = judge ? judge(b) : null;
      return j ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(j) }] } }] }) : new Response('x', { status: 500 });
    }
    const model = (u.match(/models\/([^:]+):/) || [])[1];
    const isPro = model === 'gemini-3-pro-image';
    calls.push({ kind: isPro ? 'pro' : 'nano', model, parts, cfg: b.generationConfig });
    const img = isPro ? engines.pro : (/flash-image/.test(model) ? engines.nano : null);
    if (!img) return Response.json({ error: { message: 'fail' } }, { status: 400 });
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img } }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', headers: {}, body }, res); } finally { global.fetch = save; }
  return { status, json, calls };
}
const MERGE = (text, extra) => Object.assign({ prompt: text, userText: text, editImageBase64: PHOTO_B, editMimeType: 'image/jpeg', extraImages: [{ data: PHOTO_A, mime: 'image/jpeg' }], token: 'user' }, extra || {});
const DONE = () => ({ verdicts: ['done'], pick: 0, scope: 'big', text: 'none', report: 'دمجتهم. هل أعجبتك؟ ولا أسوي لك … أو …؟' });

test('١. الصورتان بترتيب رفع المستخدم وكلّ واحدة بعنوانها، ولكلّ وجه لقطة مقرّبة مرجعًا للهويّة، والأمر كاملًا في الآخر', async () => {
  const r = await run(MERGE('ادمج الصورتين'), { pro: RESULT }, DONE);
  assert.equal(r.status, 200);
  const pro = r.calls.find((c) => c.kind === 'pro');
  const imgs = inlineOf(pro.parts);
  assert.equal(imgs[0], PHOTO_A, 'الصورة الأولى = أوّل صورة رفعها المستخدم (كانت الأخيرة تُرسل أوّلًا)');
  assert.equal(imgs[1], PHOTO_B);
  assert.equal(imgs.length, 4, 'صورتان + لقطتا وجه مقرّبتان');
  const labels = pro.parts.filter((p) => p.text).map((p) => p.text);
  assert.match(labels[0], /^Photo 1 of 2/);
  assert.ok(pro.parts[1].inlineData, 'العنوان قبل صورته مباشرة');
  assert.ok(labels.some((t) => /^Close-up 1 — the face of the person in Photo 1\b/.test(t)), 'اللقطة تُنسب لصورتها');
  assert.ok(labels.some((t) => /^Close-up 2 — the face of the person in Photo 2\b/.test(t)));
  const last = pro.parts[pro.parts.length - 1];
  assert.ok(last.text, 'الأمر الكامل آخر جزء (كأمثلة جوجل الرسميّة، ويستلمه GPT نفسه)');
  assert.match(last.text, /separate reference images, attached in this exact order/);
  assert.match(last.text, /TASK: "ادمج الصورتين"/);
  assert.match(last.text, /never add a close-up as another person/);
  const crop = require(rp('api/_lib/face-composite.js')).decode(Buffer.from(imgs[2], 'base64'));
  assert.ok(crop && crop.w === 144 && crop.h === 144, 'مربّع ١٫٥× الوجه (٩٦ بكسل) بدقّة الأصل — لا تكبير');
  assert.equal(r.calls.filter((c) => c.kind === 'detect').length, 2, 'كشف واحد لكلّ صورة');
  assert.equal(pro.cfg.imageConfig.aspectRatio, '4:3', 'نسبة أبعاد صريحة من الصورة الأساسيّة (٦٤٠×٤٨٠) — لا تتبع لقطة الوجه الأخيرة');
});

test('٢. «ادمجهم في صورة وحدة واقعية/أجمل» تبقى على حرارة منخفضة — كانت تُحذف فيعيد النموذج تخيّل الوجوه', async () => {
  for (const [text, t] of [['ادمجهم في صورة وحدة واقعية', 0.15], ['ادمجهم في صورة وحدة أجمل', 0.15], ['ادمج الصورتين وخلها احترافية', 0.15], ['ادمج الصورتين ستايل كرتون', 0.6]]) {
    const r = await run(MERGE(text), { pro: RESULT }, DONE);
    const pro = r.calls.find((c) => c.kind === 'pro');
    assert.equal(pro.cfg.temperature, t, text);
  }
});

test('٣. الحاكم يرى صورة كلّ شخص كما أرسلها المستخدم ويقارن الملامح — لا صورة واحدة فقط', async () => {
  const r = await run(MERGE('ادمج الصورتين'), { pro: RESULT }, DONE);
  const j = r.calls.find((c) => c.kind === 'judge');
  assert.match(j.text, /REFERENCE PHOTO 1/);
  assert.match(j.text, /REFERENCE PHOTO 2/);
  assert.doesNotMatch(j.text, /SOURCE \(the picture the user sent\)/);
  assert.equal(j.images, 3, 'مرجعان + ناتج');
  assert.match(j.text, /eyes, nose, mouth/);
});

test('٤. برو مشغول ← نانو الإنقاذ بالحرارة نفسها والصور نفسها، ثمّ GPT بالترتيب نفسه وبالأمر الكامل', async () => {
  const r = await run(MERGE('ادمج الصورتين'), { pro: null, nano: RESULT }, DONE);
  const nano = r.calls.find((c) => c.kind === 'nano');
  assert.ok(nano, 'نانو أنقذ');
  assert.equal(nano.cfg.temperature, 0.15);
  assert.equal(inlineOf(nano.parts)[0], PHOTO_A);
  const g = await run(MERGE('ادمج الصورتين'), { pro: null, nano: null, gptEdit: RESULT }, DONE);
  const gpt = g.calls.find((c) => c.kind === 'gpt-edit');
  assert.ok(gpt, 'GPT أنقذ');
  assert.equal(gpt.images, 4, 'الصورتان ولقطتا الوجه بالترتيب الذي يذكره الأمر');
  assert.equal(gpt.field, 'image[]');
  assert.match(gpt.prompt, /Close-up 1 = the face of the person in Photo 1/);
});

test('٥. كشف الوجوه فشل أو أُطفئ ← الدمج يكمل بالصورتين وعناوينهما بلا لقطات، بلا خطأ', async () => {
  process.env.MERGE_FACE_CROPS = 'off';
  try {
    const r = await run(MERGE('ادمج الصورتين'), { pro: RESULT }, DONE);
    assert.equal(r.status, 200);
    const pro = r.calls.find((c) => c.kind === 'pro');
    assert.equal(inlineOf(pro.parts).length, 2);
    assert.equal(r.calls.filter((c) => c.kind === 'detect').length, 0);
    assert.doesNotMatch(pro.parts[pro.parts.length - 1].text, /close-up/i);
  } finally { delete process.env.MERGE_FACE_CROPS; }
});

test('٦. وضع المالك «دمج نانو + GPT»: لا تلميع كتابة على ناتج الدمج — التلميع يرسل الناتج وحده لـGPT فيعيد رسم الوجوه', async () => {
  const r = await run(MERGE('ادمج الصورتين', { token: 'owner', engineMix: true }), { pro: RESULT, gptEdit: RESULT }, () => ({ verdicts: ['done', 'done'], pick: 0, scope: 'big', text: 'ok', report: 'تمّ' }));
  assert.equal(r.status, 200);
  assert.ok(!r.calls.some((c) => c.kind === 'gpt-edit' && /Fix ONLY the written text/.test(c.prompt)), 'لا نداء تلميع');
});

test('٧. «دمج صور» في الاستوديو و«دمج شخصين/ستايل عائلي» في أنماط الصور على قالب الهويّة نفسه وحرارة منخفضة', () => {
  const studio = read('api/_lib/studio-create.js');
  const portrait = read('api/_lib/portrait-style.js');
  assert.doesNotMatch(studio, /blend them naturally together/, '«امزجهم» كانت دعوة صريحة لخلط الوجوه');
  assert.match(studio, /mergeIdentity\.mergeParts\(/);
  assert.match(portrait, /mergeIdentity\.mergeParts\(/);
  assert.match(portrait, /temperature: \(isLocalizedEdit \|\| isMultiSourceComposition\) \? 0\.15 : 0\.65/);
});

test('٨. الوحدة: حصّة اللقطات ضمن ٥ مراجع بشر، الوجه الكبير والصغير جدًّا بلا لقطة، وعطب الكشف لا يرمي', async () => {
  const mi = require(rp('api/_lib/merge-identity.js'));
  const reply = (box) => async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: box ? [{ box_2d: box }] : [] }) }] } }] });
  const P = { data: PHOTO_A, mime: 'image/jpeg' };
  assert.equal((await mi.faceCrops('k', [P, P], { fetchImpl: reply([180, 400, 300, 560]) })).length, 2);
  assert.equal((await mi.faceCrops('k', [P, P, P, P], { fetchImpl: reply([180, 400, 300, 560]) })).length, 1, '٤ صور + لقطة واحدة = ٥');
  assert.equal((await mi.faceCrops('k', [P, P, P, P, P], { fetchImpl: reply([180, 400, 300, 560]) })).length, 0, 'لا كشف أصلًا حين لا حصّة');
  assert.equal((await mi.faceCrops('k', [P, P], { fetchImpl: reply([50, 100, 900, 900]) })).length, 0, 'وجه يملأ الصورة يُرى جيّدًا أصلًا');
  assert.equal((await mi.faceCrops('k', [P, P], { fetchImpl: reply([500, 500, 520, 515]) })).length, 0, 'وجه أصغر من ٣٢ بكسل بلا تفاصيل تُنقذ');
  assert.deepEqual(await mi.faceCrops('k', [P, P], { fetchImpl: async () => new Response('x', { status: 503 }) }), []);
  assert.deepEqual(await mi.faceCrops('k', [P, P], { fetchImpl: async () => { throw new Error('net'); } }), []);
  assert.deepEqual(await mi.faceCrops('k', [{ data: 'bm90IGFuIGltYWdl', mime: 'image/jpeg' }, P], { fetchImpl: reply(null) }), [], 'صورة لا تُفكّ = بلا لقطة');
  const r = mi.headRect({ w: 600, h: 800 }, [0.9, 0.02, 0.99, 0.1]);
  assert.ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= 600 && r.y1 <= 800 && r.x1 - r.x0 === r.y1 - r.y0, 'مربّع الرأس داخل الصورة عند الحافّة');
});

test('٩. الوحدة: الحرارة ونسبة الأبعاد', () => {
  const mi = require(rp('api/_lib/merge-identity.js'));
  assert.equal(mi.mergeTemperature(true, 'ادمجهم في صورة واقعية'), 0.15, '«واقعي» ليس أسلوبًا فنّيًّا');
  assert.equal(mi.mergeTemperature(true, 'ادمجهم ستايل أنمي'), 0.6);
  assert.equal(mi.mergeTemperature(false, 'ادمجهم في مكان فخم'), 0.15);
  assert.equal(mi.mergeAspect({ data: PHOTO_B }, 'ادمجهم'), '4:3');
  assert.equal(mi.mergeAspect({ data: PHOTO_A }, 'ادمجهم'), '3:4');
  assert.equal(mi.mergeAspect({ data: PHOTO_A }, 'ادمجهم بصورة عرضية'), '16:9');
  assert.equal(mi.mergeAspect({ data: '' }, ''), '3:4', 'بلا أبعاد = الطوليّ الافتراضيّ');
  const parts = mi.mergeParts([{ data: PHOTO_A }, { data: PHOTO_B }], [], 'حطهم مع بعض');
  assert.equal(parts[1].inlineData.mimeType, 'image/jpeg', 'النوع من البايتات حين لا يُعطى');
  assert.match(parts[parts.length - 1].text, /When the task says "the first\/second photo", it means Photo 1\/Photo 2/);
});

test('١٠. الوحدة: صورة جماعيّة (٣ وجوه فأكثر) بلا لقطات — وجه الجار يدخل اللقطة فتلتبس؛ وجهان يُسمّيان يسارًا ويمينًا', async () => {
  const mi = require(rp('api/_lib/merge-identity.js'));
  const reply = (boxes) => async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: boxes.map((b) => ({ box_2d: b })) }) }] } }] });
  const P = { data: PHOTO_A, mime: 'image/jpeg' };
  const three = [[300, 100, 400, 200], [300, 400, 400, 500], [300, 700, 400, 800]];
  assert.deepEqual(await mi.faceCrops('k', [P, P], { fetchImpl: reply(three) }), []);
  const two = await mi.faceCrops('k', [P], { fetchImpl: reply([[300, 100, 400, 200], [300, 700, 400, 800]]) });
  assert.deepEqual(two.map((c) => c.who).sort(), ['the person on the left', 'the person on the right']);
});
