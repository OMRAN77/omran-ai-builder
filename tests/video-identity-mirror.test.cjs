'use strict';
/* v-video-identity-mirror (المالك ٤ نوفمبر «شوف الملامح كيف»: صورتها بفستان أمام مرآة في ترند «دخلة سلو موشن» ← امرأة أخرى بملامح أخرى):
   ١) ترند الشخص الواحد: انعكاس المرآة (وجه ≥ نصف وجهها) كان يصير «شخصين» — تسقط لقطة وجهها ويأخذ المحرّك الصورة كلّها مرجعًا
      (وجهها ١٫٤٪ منها). الآن الوجه الأكبر وحده لقطةً ومرجعًا.
   ٢) قالب الترند كان يطلب «dramatically serious, intense face» ويقرّب الوجه حتّى «the foreground» — تعبير جديد ووجه أكبر بأربع مرّات من
      وجهها في الصورة = وجه يُخترع. الآن ملامحها وتعبيرها كما في الصورة، وتقف وسط الإطار من الركبتين.
   ٣) عطب كشف الوجوه يُسجَّل (كان صامتًا). */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jpeg = require('jpeg-js');
const root = path.resolve(__dirname, '..');
const TP = require(path.join(root, 'api/_lib/trend-people.js'));
const MI = require(path.join(root, 'api/_lib/merge-identity.js'));
const VT = require(path.join(root, 'api/_lib/video-trends.js'));

/* صورة كاملة الطول ٧٢٠×١٢٨٠: وجهها صغير يسارًا، وانعكاسها في المرآة يمينًا بنصف الحجم تقريبًا */
function photo() {
  const w = 720, h = 1280, data = Buffer.alloc(w * h * 4);
  const inBox = (x, y, b) => x >= b[1] * w / 1000 && x < b[3] * w / 1000 && y >= b[0] * h / 1000 && y < b[2] * h / 1000;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, f = inBox(x, y, FACE) || inBox(x, y, MIRROR);
    data[o] = f ? 225 : (x * 3) % 256; data[o + 1] = f ? 185 : (y * 2) % 256; data[o + 2] = f ? 160 : 120; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const FACE = [120, 200, 220, 330], MIRROR = [150, 640, 205, 710]; // [ymin, xmin, ymax, xmax] / 1000 — عرض الانعكاس ٧٠ ≥ نصف ١٣٠
const P = { data: photo(), mime: 'image/jpeg' };
const reply = (boxes) => async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: boxes.map((b) => ({ box_2d: b })) }) }] } }] });

test('١. faceCrops يُرجع حجم كلّ وجه، وعطب الكشف يُسجَّل بحالته', async () => {
  const crops = await MI.faceCrops('k', [P], { fetchImpl: reply([FACE, MIRROR]) });
  assert.equal(crops.length, 2, 'الانعكاس يُكشف وجهًا ثانيًا (≥ نصف الأكبر)');
  assert.ok(crops.every((c) => Number(c.size) > 0), 'size لكلّ لقطة');
  assert.ok(crops.find((c) => c.who === 'the person on the left').size > crops.find((c) => c.who === 'the person on the right').size, 'وجهها أكبر من انعكاسها');
  const warned = [], warn = console.warn;
  console.warn = (m) => warned.push(String(m));
  try { assert.deepEqual(await MI.faceCrops('k', [P], { fetchImpl: async () => new Response('x', { status: 429 }) }), []); } finally { console.warn = warn; }
  assert.ok(warned.some((m) => /face detect 429/.test(m)), warned.join(' | '));
});

test('٢. ترند الشخص الواحد: وجهها وانعكاسها = لقطة وجهها وحدها مرجعًا (لا «شخصان»)؛ ترند عاديّ كما كان', async () => {
  const crops = await MI.faceCrops('k', [P], { fetchImpl: reply([MIRROR, FACE]) }); // الانعكاس أوّلًا في ردّ الكشف
  const her = crops.find((c) => c.who === 'the person on the left');
  const run = async (single) => {
    let parts = null;
    const r = await TP.soloFirstFrame('K', { data: P.data + (single ? '' : ' '), mime: 'image/jpeg' }, 'a person walks across a parking lot', '720:1280',
      { single, detail: true, budgetMs: 90000, faceCrops: async () => crops, callImage: async (k, p) => { parts = p; return { b64: 'FRAME', mime: 'image/png' }; } });
    return { r, text: parts.map((x) => x.text || '').join('\n'), imgs: parts.filter((x) => x.inlineData).map((x) => x.inlineData.data) };
  };
  const one = await run(true);
  assert.equal(one.r.people, 1);
  assert.deepEqual(one.r.ref, { data: her.data, mime: her.mime }, 'مرجع المحرّك لقطة وجهها لا الصورة كلّها');
  assert.ok(one.text.includes(TP.SOLO_CLOSEUP_LABEL), 'لقطة الوجه الواحد');
  assert.doesNotMatch(one.text, /Close-up 1|2 different real people|the person on the right/);
  assert.deepEqual(one.imgs, [P.data, her.data], 'الصورة ولقطة وجهها فقط');
  /* مراجعة: مهمّة الإطار بشخص واحد صراحةً — لا «if Photo 1 shows several people, all of them» (لقطة لأحد وجهين تسحب ملامحه للآخر) */
  assert.match(one.text, /Show only the one real person whose close-up face is attached \(a mirror reflection, poster, screen or any other face in Photo 1 is not a second person — never add it\)/);
  assert.doesNotMatch(one.text, /all of them/);
  /* الانعكاس كُشف لكنّ قصّه سقط (صغير): لقطة واحدة بعنوان «يسار» — وجهها لقطةً ومرجعًا في ترند الشخص الواحد (كانت تسقط) */
  let p1 = null;
  const lone = await TP.soloFirstFrame('K', { data: P.data + '  ', mime: 'image/jpeg' }, 'a person walks across a parking lot', '720:1280',
    { single: true, detail: true, budgetMs: 90000, faceCrops: async () => [her], callImage: async (k, p) => { p1 = p; return { b64: 'FRAME', mime: 'image/png' }; } });
  assert.deepEqual(lone.ref, { data: her.data, mime: her.mime });
  assert.ok(p1.some((x) => x.text === TP.SOLO_CLOSEUP_LABEL));
  const two = await run(false);
  assert.equal(two.r.people, 2, 'ترند بلا single كما كان');
  assert.equal(two.r.ref, null);
  assert.match(two.text, /Close-up 1/);
  assert.match(two.text, /if Photo 1 shows several people, all of them/, 'المهمّة العاديّة كما كانت');
});

test('٣. veo-create يمرّر single لترندات الشخص الواحد (SINGLE_SUBJECT_TRENDS)، ودخلة سلو موشن منها', () => {
  const src = fs.readFileSync(path.join(root, 'api/_lib/veo-create.js'), 'utf8');
  assert.match(src, /ageShift: omniTrend && tp\.AGE_SHIFT_TRENDS\.has\(trendId\), single: singleSubject,/);
  assert.ok(TP.SINGLE_SUBJECT_TRENDS.has('slowmoentry'));
});

test('٤. قالب «دخلة سلو موشن»: ملامحها وتعبيرها كما في الصورة، وتقف وسط الإطار من الركبتين — لا «وجه جادّ حادّ» ولا «المقدّمة»', () => {
  const p = VT.buildTrendPrompt('slowmoentry').prompt;
  assert.match(p, /their face and natural expression exactly as in the photo/);
  assert.match(p, /until they stand in the middle of the frame, seen from the knees up/);
  assert.match(p, /slow-motion entrance/);
  assert.doesNotMatch(TP.trendScene(p), /intense|serious|foreground/i);
  assert.doesNotMatch(VT.TRENDS.slowmoentry.preview.frame, /serious|intense/i);
  /* البطاقة بالـ١٤ لغة لا تَعِد بملامح جادّة لم يعد القالب يطلبها */
  const data = fs.readFileSync(path.join(root, 'js/app-11-video-trends-data.js'), 'utf8');
  const card = data.slice(data.indexOf('"key":"slowmoentry"'), data.indexOf('"maxPeople"', data.indexOf('"key":"slowmoentry"')));
  const sub = JSON.parse(card.slice(card.indexOf('"sub":') + 6, card.indexOf(',"scenes"')));
  assert.equal(Object.keys(sub).length, 14);
  assert.doesNotMatch(Object.values(sub).join(' | '), /جادّة|serious|sérieuse|seria|ciddi|Серьёзный|गंभीर|गम्भीर|سنجیدہ|গম্ভীর|Seryoso|serius|一本正经|ഗൗരവ/i);
  assert.equal(sub.ar, 'تدخل الكادر بتصوير بطيء كأنها افتتاحيّة فيلم');
});

console.log('✓ video-identity-mirror: انعكاس المرآة ليس شخصًا ثانيًا، والقالب لا يطلب وجهًا جديدًا، وعطب الكشف يُسجَّل');
