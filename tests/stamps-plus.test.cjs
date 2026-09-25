'use strict';
/* v-stamps-plus (طلب عمران ٢٥ سبتمبر «الطوابع المدرسية… مافيها مميزات — صورة وحدة ولا صورتين… وتحط الرسوم المتحركة المشهورة»):
   الخادم يقبل حتّى ٣ صور بأسمائها، وعدد الطوابع ٦/١٢/٢٤، والشكل، والوجه الكرتونيّ، وثيمات الكرتون المشهورة؛
   والافتراضيّ هو السلوك القديم. والعميل: لوحة الخيارات، ومجموعة الكرتون، وإرسال الصور والخيارات.
   ومعه v-img-write-modes: «صورة 4K» و«صورة بنصّ دقيق» خرجا من «+» ويُفعَّلان بالكتابة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true }) });
stub('api/_lib/points.js', { verifyPointsToken: (t) => (t === 'tok' ? 'sara' : null) });
const handler = require(rp('api/_lib/stamps.js'));
const IMG = 'A'.repeat(200);

async function call(body) {
  process.env.OPENAI_API_KEY = 'test';
  const sent = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    sent.push({ url, prompt: init.body.get('prompt'), images: init.body.getAll('image[]').length, model: init.body.get('model') });
    return Response.json({ data: [{ b64_json: 'OUT' }] });
  };
  let status = 0, out = '';
  const res = { setHeader() {}, status(s) { status = s; return this; }, end(x) { out = x; return this; } };
  try { await handler({ method: 'POST', body: Object.assign({ token: 'tok' }, body) }, res); } finally { global.fetch = save; }
  return { status, json: JSON.parse(out || '{}'), sent };
}

test('١. الافتراضيّ = السلوك القديم: صورة وحدة، ١٢ طابعًا بأطر مختلفة، والوجه كما هو', async () => {
  const r = await call({ imageBase64: IMG, mimeType: 'image/jpeg', name: 'أحمد', hint: 'فضاء' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.options, { count: 12, shape: 'mixed', style: 'real', photos: 1 });
  assert.equal(r.sent[0].images, 1);
  assert.equal(r.sent[0].model, 'gpt-image-2');
  assert.match(r.sent[0].prompt, /12 small stickers/);
  assert.match(r.sent[0].prompt, /all 12 frames must be visibly different/);
  assert.match(r.sent[0].prompt, /must stay EXACTLY as photographed/);
  assert.match(r.sent[0].prompt, /OUTER SPACE/);
  assert.match(r.sent[0].prompt, /"أحمد"/);
});

test('٢. صورتان بأسمائهما، ٦ كبيرة، دائريّة، ووجه كرتونيّ', async () => {
  const r = await call({ images: [{ b64: IMG, mime: 'image/png' }, { b64: IMG, mime: 'image/jpeg' }], names: ['أحمد', 'سارة'], name: 'أحمد وسارة', count: 6, shape: 'circle', style: 'cartoon', hint: 'ديناصور' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.options, { count: 6, shape: 'circle', style: 'cartoon', photos: 2 });
  const p = r.sent[0].prompt;
  assert.equal(r.sent[0].images, 2, 'الصورتان تصلان المحرّك');
  assert.match(p, /2 provided images are REAL photos of 2 different children/);
  assert.match(p, /6 LARGE stickers/);
  assert.match(p, /SAME outer shape: a perfect CIRCLE/);
  assert.match(p, /CARTOON character/);
  assert.doesNotMatch(p, /must stay EXACTLY as photographed/);
  assert.match(p, /child 1 = "أحمد", child 2 = "سارة"/);
});

test('٣. قيم غير صالحة = الافتراضيّ، والصور ثلاث كحدّ، وبلا صورة = ٤٠٠', async () => {
  const r = await call({ images: [1, 2, 3, 4].map(() => ({ b64: IMG })), count: 99, shape: 'triangle', style: 'x', hint: 'روبوت' });
  assert.deepEqual(r.json.options, { count: 12, shape: 'mixed', style: 'real', photos: 3 });
  assert.equal(r.sent[0].images, 3);
  assert.match(r.sent[0].prompt, /12 small stickers/, 'عدد غير صالح = ١٢');
  const none = await call({ hint: 'فضاء' });
  assert.equal(none.status, 400);
  assert.equal(none.sent.length, 0);
});

test('٤. ثيمات الكرتون المشهورة تُلتقط من الكتابة، و٢٤ صغيرة بشكل قلب', async () => {
  for (const [hint, re] of [['سبونج بوب', /SPONGEBOB/], ['فروزن', /FROZEN/], ['سبايدرمان', /SPIDER HERO/], ['باو باترول', /PAW PATROL/], ['ماريو', /SUPER MARIO/], ['كارز', /RACING CARS/]]) {
    const r = await call({ imageBase64: IMG, hint, count: 24, shape: 'heart' });
    assert.match(r.sent[0].prompt, re, hint);
    assert.match(r.sent[0].prompt, /24 SMALL stickers/);
    assert.match(r.sent[0].prompt, /a HEART/);
  }
});

test('٥. العميل: لوحة الخيارات، ومجموعة الكرتون بصور اختياريّة، والصور والخيارات تُرسل — والحزمة محدَّثة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("{ t:'⭐ شخصيات كرتون', th:["), f + ': مجموعة الكرتون');
    assert.ok(s.includes("{k:'سبونج بوب',e:'🧽'}"), f);
    assert.ok(s.includes("(t.img ? '<img src=\"'+t.img+'\""), f + ': صورة البطاقة متى أُضيفت');
    assert.ok(s.includes("row('عدد الطوابع', 'count', [[6,'6 كبيرة'],[12,'12'],[24,'24 صغيرة']])"), f);
    assert.ok(s.includes("row('الوجه', 'style', [['real','📷 حقيقي'],['cartoon','🎨 كرتوني']])"), f);
    assert.ok(s.includes("imageAttachments.filter(function(a){ return a && a.dataUrl; }).slice(-3)"), f + ': حتّى ٣ صور');
    assert.ok(s.includes("images:__stImgs, count:window.__stOpts.count, shape:window.__stOpts.shape, style:window.__stOpts.style"), f);
    assert.ok(s.includes("localStorage.setItem('omStampOpts'"), f + ': الاختيار يُحفظ');
  }
});

test('٦. «صورة 4K» و«صورة بنصّ دقيق» خرجا من «+» ويُفعَّلان بالكتابة', () => {
  const modes = read('js/modes.js');
  assert.ok(!modes.includes("id:'image_hd'") && !modes.includes("id:'image_text'"));
  assert.ok(modes.includes("id:'image_nano'") && modes.includes("id:'image_gpt'") && modes.includes("id:'image_mix'"), 'بقيّة أوضاع الصورة باقية');
  const mi = read('api/_lib/maha-image.js');
  assert.ok(mi.includes("body.textFaithful === true || /(?:نصّ?|كتابه?ة?|خط)\\s*(?:دقيق[هة]?|صحيح[هة]?|مضبوط[هة]?)/.test(userText + ' ' + String(prompt || ''))"));
  const re = /(?:نصّ?|كتابه?ة?|خط)\s*(?:دقيق[هة]?|صحيح[هة]?|مضبوط[هة]?)/;
  assert.ok(re.test('سو دعوة بنص دقيق') && re.test('بكتابة صحيحة') && !re.test('ارسم قطة'));
  assert.ok(/4k|للطباعة/.test(mi.match(/const __want4K = [^\n]+/)[0]), '4K من الكتابة كان قائمًا في الخادم');
  assert.ok(read('index.html').includes('js/modes.js?v=m250925b'), 'وسم كاش modes رُفع');
});
