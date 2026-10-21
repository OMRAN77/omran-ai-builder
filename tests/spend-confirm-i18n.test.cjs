// tests/spend-confirm-i18n.test.cjs — v-spend-confirm-i18n (تدقيق ١٨–١٩ أكتوبر، g05 chat-video-request): مربّع تأكيد صرف النقاط
// (ردّ 428 confirm_required) عربيّ في الواجهة الإنجليزيّة: postWithConfirm يعرض q.message_ar لكلّ اللغات، وفحص اللغة فيه
// يستدعي AL() غير المعرّفة في الحزمة فيبقى عربيًّا دائمًا (سُجّل «باقيًا» في DECISIONS).
// في الحزمة أربع نسخ من postWithConfirm تصريحات عُليا، والأخيرة (app-09) هي التي تعمل — تُختبر هي من الحزمة نفسها.
// الآن: العربيّة كما كانت حرفًا (message_ar ثمّ «أكمل؟»)، وكلّ لغة أخرى بمفتاح spendConfirm وعدد النقاط من الخادم.
// تدفّق المال كما هو: الطلب الأوّل، ثمّ إعادة الطلب نفسه بـconfirmed:true بعد الموافقة وحدها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
const SIG = 'async function postWithConfirm(';

function dicts() {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const out = { ar: I.ar, en: I.en };
  for (const l of LANGS) out[l] = Object.assign({}, I.en, I[l]);
  return out;
}
const D = dicts();
const fnText = (src, at) => { const e = src.indexOf('\n}\n', at); return src.slice(at, e + 2); };

// النسخة التي تعمل: آخر تصريح في الحزمة، وهو نصّ app-09 نفسه
function winner() {
  const bundle = read('js/app.bundle.js');
  const w = fnText(bundle, bundle.lastIndexOf(SIG));
  const a9 = read('js/app-09-attach.js');
  assert.equal(w, fnText(a9, a9.indexOf(SIG)), 'آخر postWithConfirm في الحزمة = نسخة app-09');
  return w;
}
const QUOTE = { error: 'confirm_required', needsConfirmation: true, cost: 55, label: 'فيديو بالذكاء الاصطناعي', message_ar: 'هذه العملية تخصم 55 نقطة (فيديو بالذكاء الاصطناعي). أكّد للمتابعة.' };

async function run(l, answer, quote) {
  const sent = []; const asked = [];
  const ctx = {
    lang: l, t: (k) => (D[l][k] !== undefined ? D[l][k] : k), JSON, Object, Promise, console: { warn() {} },
    confirm: (m) => { asked.push(m); return answer; },
    fetch: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return sent.length === 1 ? { status: 428, json: async () => quote || QUOTE } : { status: 200, json: async () => ({ ok: true }) }; },
  };
  vm.createContext(ctx);
  vm.runInContext(winner(), ctx);
  const res = await ctx.postWithConfirm('/api/video-create', { prompt: 'cat' });
  return { res, sent, asked };
}

test('١. الإنجليزيّة والفرنسيّة وكلّ لغة غير العربيّة: نصّ التأكيد بلغتها وفيه عدد النقاط، بلا عربيّ', async () => {
  for (const l of ['en'].concat(LANGS)) {
    const { asked } = await run(l, false);
    assert.equal(asked.length, 1, l);
    assert.equal(asked[0], D[l].spendConfirm.replace('{n}', '55'), l);
    assert.match(asked[0], /55/, l);
    if (l !== 'ur') assert.doesNotMatch(asked[0], /[؀-ۿ]/, l + ': لا عربيّ');
  }
});

test('٢. العربيّة كما كانت حرفًا: message_ar ثمّ «أكمل؟»، وبلا message_ar النصّ القديم بالتسمية', async () => {
  let r = await run('ar', false);
  assert.deepEqual(r.asked, [QUOTE.message_ar + '\nأكمل؟']);
  r = await run('ar', false, { cost: 20, label: 'صورة' });
  assert.deepEqual(r.asked, ['هذه العملية تخصم 20 نقطة (صورة).\nأكمل؟']);
});

test('٣. تدفّق الخصم لم يتغيّر: الرفض لا يرسل شيئًا ثانيًا، والموافقة تعيد الطلب نفسه بـconfirmed:true', async () => {
  let r = await run('en', false);
  assert.equal(r.sent.length, 1);
  assert.equal(r.res.status, 428);
  r = await run('en', true);
  assert.equal(r.sent.length, 2);
  assert.deepEqual(r.sent[1].body, { prompt: 'cat', confirmed: true });
  assert.equal(r.res.status, 200);
  assert.doesNotMatch(winner(), /\bAL\(\)/, 'لا AL() غير المعرّفة');
});
