'use strict';
/* v-owner-img-why (لقطة المالك ١٣ أكتوبر، بعد #1039: GPT-6 Astra حاول رسم بدائل بطاقات الأزياء فرجعت أداته «image_generation_busy» مرّتين،
   فكتب «العائق الحين توليد الصور البديلة» بلا سبب): السبب الحقيقيّ كان في __diag من الخادم (نصّ محرّك GPT Image) ويُرمى في العميل،
   ومسار GPT المفروض لا يُسجَّل في سجلّ الأخطاء. الآن نتيجة الأداة تحمله للمالك وحده (بلا مفاتيح)، والخادم يسجّله.
   أداة العميل الحقيقيّة (app-17) في vm بـfetch مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function tools(owner, reply) {
  const calls = [];
  const ctx = {
    console, JSON, Object, Array, String, Number, Math, Date, Promise, RegExp, Error, encodeURIComponent,
    setTimeout: (f) => setTimeout(f, 0), clearTimeout,
    localStorage: { getItem: (k) => (k === 'aiapp_provider' ? 'openai' : null), setItem() {} },
    document: { createElement: () => ({ style: {}, setAttribute() {}, remove() {} }), body: { appendChild() {} } },
    omranOwnerUi: () => owner,
    fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: false, status: 502, json: async () => reply }; },
  };
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  vm.runInNewContext(read('js/app-17-agent-tools.js'), ctx);
  return { run: (n, a) => ctx.window.omranAgentTools.run(n, a), calls };
}
const BUSY = { error: 'image_generation_busy', retryable: true, __diag: { forced: 'gpt', openai: 'openai gen gpt-image-2 status=403 Your organization must be verified to use the model. Key sk-proj-AbCdEf123456789' } };

test('١. المالك: نتيجة generate_image تحمل سبب المحرّك الحقيقيّ بلا مفتاح، وتنهاه عن «مشغول» والإعادة', async () => {
  const t = tools(true, BUSY);
  const out = await t.run('generate_image', { prompt: 'Omani man in dishdasha', userText: 'غيّر الصور' });
  assert.equal(t.calls[0].body.forceEngine, 'gpt', 'محرّك المزوّد نفسه كما كان');
  assert.match(out, /^تعذّر رسم الصورة: image_generation_busy — السبب من المحرّك: openai gen gpt-image-2 status=403 Your organization must be verified/);
  assert.ok(!/AbCdEf123456789/.test(out) && /sk-…/.test(out), 'لا مفتاح: ' + out);
  assert.match(out, /فلا تسمّه «مشغول» ولا تعِد المحاولة/);
});

test('٢. غير المالك كما كان حرفيًّا: لا اسم محرّك ولا سبب', async () => {
  const t = tools(false, BUSY);
  const out = await t.run('generate_image', { prompt: 'x', userText: 'ارسم' });
  assert.equal(out, 'تعذّر رسم الصورة: image_generation_busy. لا تخترع رابط صورة — استعمل خلفية CSS بدلها.');
});

test('٣. بلا __diag (الخادم أطفأه) الرسالة كما كانت للمالك أيضًا', async () => {
  const t = tools(true, { error: 'image_generation_busy', retryable: true });
  const out = await t.run('generate_image', { prompt: 'x', userText: 'ارسم' });
  assert.equal(out, 'تعذّر رسم الصورة: image_generation_busy. لا تخترع رابط صورة — استعمل خلفية CSS بدلها.');
});

test('٤. الخادم: فشل GPT المفروض يُسجَّل بسببه (بلا مفتاح) كفشل المسار العاديّ، وتعديل الصورة يحمل السبب أيضًا، والحزمة مبنيّة', () => {
  const mi = read('api/_lib/maha-image.js');
  const at = mi.indexOf("if (__optForceEngine === 'gpt') {");
  const blk = mi.slice(at, mi.indexOf('return;\n    }', at));
  assert.ok(blk.includes("logErrorAndFlush('maha-image:gpt-forced-failed', new Error('image_generation_busy'), { openai: (lastRescueErr || 'no-rescue').replace(/sk-[A-Za-z0-9_*\\-]{6,}/g, 'sk-…')"), blk);
  const src = read('js/app-17-agent-tools.js');
  assert.ok(src.includes("return 'تعذّر تعديل الصورة: ' + (((ej && ej.error) || ('HTTP ' + er.status)) + '').slice(0, 120) + engineWhy(ej);"));
  assert.ok(read('js/app.bundle.js').includes('function engineWhy(j) {'));
});
