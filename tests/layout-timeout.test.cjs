// tests/layout-timeout.test.cjs — v-layout-timeout (لقطة مستخدم ١٥ أكتوبر على الجوّال): صورة + «اكتب تحت الله يشفيج 🤍» بقيت إطار تحميل
// فارغًا وزرّ الإيقاف باقيًا. الكتابة محلّيّة بالكانفس، لكنّ الدور ينتظر نداء كشف الوجوه (/api/maha-image layoutOnly) بلا مهلة في العميل
// ولا في الخادم (Gemini Flash بتفكيره الافتراضيّ)، والإيقاف كان يرجّع قائمة فارغة فتُكمل الكتابة بصمت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TD = require('../api/_lib/text-design.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const PNG = 'iVBORw0KGgo' + 'A'.repeat(400);

// fetch لا يجيب أبدًا إلّا إن أُلغيت إشارته — مثل خادم معلّق
const hang = (seen) => (url, init) => new Promise((resolve, reject) => {
  if (seen) seen.push(init);
  const sig = init && init.signal;
  if (sig && sig.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); // كما fetch الحقيقيّ
  if (sig) sig.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
});

test('الخادم: كشف الوجوه بلا تفكير وبمهلة — خادم معلّق لا يعلّق الدور', async () => {
  const seen = [];
  const t0 = Date.now();
  const keep = setTimeout(() => {}, 5000); // مؤقّت AbortSignal.timeout لا يُبقي الحلقة حيّة في node
  try { await assert.rejects(TD.detectTextLayout('k', { imageBase64: PNG, imageMime: 'image/png', fetchImpl: hang(seen), timeoutMs: 60 })); } finally { clearTimeout(keep); }
  assert.ok(Date.now() - t0 < 2000, 'انتهى بالمهلة');
  const body = JSON.parse(seen[0].body);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 }, 'كقرار v-flash-nothink على الموديل نفسه');
  assert.ok(seen[0].signal, 'للنداء إشارة');
});

test('الخادم: التأليف لا يُمسّ — بلا thinkingConfig ولا مهلة جديدة', async () => {
  const seen = [];
  const ok = (url, init) => { seen.push(init); return Promise.resolve({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"title":"شفاء","lines":["الله يشفيك"],"topicLabel":"دعاء"}' }] } }] }) }); };
  await TD.authorTextDesign('k', 'اكتب دعاء شفاء', { kind: 'prayer', fetchImpl: ok }).catch(() => null);
  assert.ok(seen.length >= 1);
  assert.equal(JSON.parse(seen[0].body).generationConfig.thinkingConfig, undefined);
  assert.equal(seen[0].signal, undefined);
});

function client(fetchImpl) {
  const W = { fetch: fetchImpl, AbortController, setTimeout, clearTimeout, JSON, __swallow: () => {} };
  const i = SRC.indexOf('const OMRAN_LAYOUT_MS = '), j = SRC.indexOf('/* v-chat-img-budget (لقطة مستخدم ١٥ أكتوبر', i);
  vm.runInNewContext(SRC.slice(i, j) + '\nthis.go = omranLayoutFetch;', W);
  return W.go;
}

test('العميل: نداء الصناديق ينتهي بمهلته حتّى لو لم يجب الخادم، والإيقاف يلغيه فورًا', async () => {
  const go = client(hang());
  const t0 = Date.now();
  await assert.rejects(go(null, { layoutOnly: true }, 60), /aborted/);
  assert.ok(Date.now() - t0 < 2000);
  const run = new AbortController();
  const p = go(run.signal, { layoutOnly: true }, 60000);
  run.abort();
  await assert.rejects(p, /aborted/);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(go(pre.signal, { layoutOnly: true }, 60000), /aborted/, 'إشارة ملغاة من قبل');
  const fine = client(async (u, init) => ({ json: async () => ({ avoid: [{ box: [0, 0, 1, 1], label: 'face' }], body: init.body }) }));
  const d = await fine(new AbortController().signal, { layoutOnly: true, imageBase64: 'x' }, 60000);
  assert.equal(d.avoid.length, 1);
  assert.equal(JSON.parse(d.body).layoutOnly, true, 'الجسم كما كان');
});

test('العميل: الدور يستعمل النداء ذا المهلة، والإيقاف بعد الانتظار يوقف الكتابة لا يكملها بصمت', () => {
  assert.ok(SRC.includes("const __layoutFetch = () => omranLayoutFetch(__runCtl.signal, { layoutOnly:true,"));
  const i = SRC.indexOf("try{ const __av = await __avoidP; if(!__avoid) __avoid = __av; }catch(e){ __swallow(e, 'img:design-layout-wait'); }");
  assert.ok(i > 0);
  assert.ok(SRC.slice(i, i + 260).includes('if(__runCtl.signal.aborted){ __imgAbortNote(cur); renderAll(); saveState(); return; }'));
  assert.ok(i < SRC.indexOf('overlayTextOnImage(__wb64, __wmime, __resolvedText', i), 'قبل الكتابة على الصورة');
});
