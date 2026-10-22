'use strict';
/* v-code-review-limit (تدقيق ١٨ أكتوبر، g06/code-review):
   ١) عند حدّ المجّانيّ يرسل الخادم {tier:'free-limit'} ثمّ نصّ الحدّ delta (api/_lib/chat.js)، وpump في app-24 يتجاهل tier
      فيصير نصّ الحدّ «ناتج النموذج» وتقول النافذة «لم يقترح النموذج أيّ تعديل» مع النصّ الخامّ، بلا زرّ اشتراك.
      وحدّ المشترك {error, limit:true} يظهر «تعذّر التحليل: …» بلا زرّ الباقات.
   ٢) خانة الطلب بخطّ 'font:13px/1.7 inherit' (غير صالح فيُسقَط كلّه) فتأخذ خطّ المتصفّح أحاديّ المسافة وتتفرّق الحروف العربيّة.
   ٣) بعد «لا تعديل» أو الخطأ لا زرّ رجوع، وإعادة فتح النافذة تمسح الطلب.
   القرار: pump يرمي خطأً يحمل planLimit وtier؛ run().catch يرسم سطر الحدّ المترجَم وزرّ الباقات (omranOpenPlans('limit','chat')،
   والضيف إلى التسجيل عبره) مع «رجوع». الخطّ font:inherit؛ والطلب يُحفظ في S.ask وتعيده شاشة الاختيار. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeDom, sseResponse } = require('./_mini-dom.cjs');

const ROOT = path.join(__dirname, '..');
const A24 = fs.readFileSync(path.join(ROOT, 'js/app-24-codefix.js'), 'utf8');
const EN = { chatFreeLimitMsg: 'FREE-LIMIT-LINE', chatGuestLimitMsg: 'GUEST-LIMIT-LINE', plansWhyLimit: 'PLAN-LIMIT-LINE',
  tierUpgradeBtn: 'Upgrade to Pro', tierSignupBtn: 'Sign up free', pricingSectionTitle: 'Plans & Points', back: 'Back',
  cfxNoPatch: 'No edits were suggested.', cfxError: 'Analysis failed: {msg}' };
const LIMIT_TEXT = 'انتهت رسائلك المجانية لليوم. اشترك لترفع حدّك اليوميّ.';
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

function load(events, extra = {}) {
  const { document } = makeDom();
  const plans = [];
  const ctx = {
    document, lang: 'en', t: (k) => (EN[k] !== undefined ? EN[k] : k), console,
    sessionStorage: { getItem: () => '' }, localStorage: { getItem: () => '' },
    fetch: () => Promise.resolve(sseResponse(typeof events === 'function' ? events() : events)),
    TextDecoder, TextEncoder, Intl, setTimeout, clearTimeout, setInterval, clearInterval,
    getCurrent: () => null, omranOpenPlans: (r, tab) => { plans.push([r, tab]); return true; },
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(A24, ctx);
  ctx.plans = plans;
  return ctx;
}
async function runWith(events, ask = 'fix it', extra) {
  const c = load(events, extra);
  c.omranCodeFixOpenWith('app.js', 'var a = 1;\n', ask);
  c.document.getElementById('cfxGo').click();
  await settle();
  return c;
}
const body = (c) => c.document.getElementById('cfxBody');

test('١. حدّ المجّانيّ: سطر الحدّ المترجَم وزرّ الاشتراك يفتح الباقات — لا «لم يقترح» ولا نصّ الحدّ الخامّ', async () => {
  const c = await runWith([{ tier: 'free-limit' }, { delta: LIMIT_TEXT }, { done: true }]);
  const h = body(c).innerHTML;
  assert.ok(h.includes('FREE-LIMIT-LINE'), 'سطر الحدّ: ' + h);
  assert.ok(!h.includes('No edits were suggested') && !h.includes('لم يقترح') && !h.includes(LIMIT_TEXT), 'لا يُعامَل الحدّ ناتجًا');
  const btn = c.document.getElementById('cfxPlans');
  assert.ok(btn && btn.textContent === 'Upgrade to Pro', 'زرّ الاشتراك');
  assert.ok(c.document.getElementById('cfxBack'), 'ورجوع');
  btn.click();
  assert.deepEqual(c.plans, [['limit', 'chat']], 'يفتح الباقات من سبب الحدّ');
  assert.equal(c.document.getElementById('cfxOverlay'), null, 'والنافذة تُغلق تحتها');
});

test('٢. حدّ الضيف: سطر التسجيل وزرّ «سجّل مجانًا» (omranOpenPlans تأخذ الضيف إلى التسجيل)', async () => {
  const c = await runWith([{ tier: 'guest-limit' }, { delta: LIMIT_TEXT }, { done: true }]);
  assert.ok(body(c).innerHTML.includes('GUEST-LIMIT-LINE'));
  const btn = c.document.getElementById('cfxPlans');
  assert.equal(btn.textContent, 'Sign up free');
  btn.click();
  assert.deepEqual(c.plans, [['limit', 'chat']]);
});

test('٣. حدّ الباقة للمشترك ({error, limit:true}): «وصلت حدّ باقتك» وزرّ الباقات — لا «تعذّر التحليل»', async () => {
  const c = await runWith([{ error: 'وصلت للحد اليومي (200 رسالة). انتظر الغد.', limit: true }]);
  const h = body(c).innerHTML;
  assert.ok(h.includes('PLAN-LIMIT-LINE') && !h.includes('Analysis failed'), h);
  assert.equal(c.document.getElementById('cfxPlans').textContent, 'Plans & Points');
});

test('٤. ردّ مجّانيّ عاديّ ({tier:"free"}) ليس حدًّا: تُعرض الرقع كالمعتاد', async () => {
  const patch = '@@PATCH\n@@WHY w\n@@OLD\nvar a = 1;\n@@NEW\nvar a = 2;\n@@END';
  const c = await runWith([{ tier: 'free' }, { delta: patch }, { done: true }]);
  assert.ok(c.document.getElementById('cfxApply'), 'شاشة الرقع');
  assert.equal(c.document.getElementById('cfxPlans'), null);
});

test('٥. «لا تعديل» (@@NONE) والخطأ لهما «رجوع» يعيد الطلب السابق في الخانة', async () => {
  const c = await runWith([{ delta: '@@NONE nothing' }, { done: true }], 'make it faster');
  assert.ok(body(c).innerHTML.includes('No edits were suggested.'));
  const back = c.document.getElementById('cfxBack');
  assert.ok(back && back.textContent === 'Back', 'زرّ رجوع بعد «لا تعديل»');
  back.click();
  assert.equal(c.document.getElementById('cfxAsk').value, 'make it faster', 'الطلب يعود');

  const e = await runWith([{ error: 'boom' }], 'rename vars');
  assert.ok(body(e).innerHTML.includes('Analysis failed: boom'));
  e.document.getElementById('cfxBack').click();
  assert.equal(e.document.getElementById('cfxAsk').value, 'rename vars', 'الطلب يعود بعد الخطأ');
});

test('٦. إغلاق النافذة ثمّ فتحها من القائمة يُبقي الطلب', async () => {
  const c = await runWith([{ delta: '@@NONE x' }, { done: true }], 'keep me');
  c.document.getElementById('cfxX').click();
  assert.equal(c.document.getElementById('cfxOverlay'), null);
  c.omranCodeFixOpen();
  assert.equal(c.document.getElementById('cfxAsk').value, 'keep me');
  /* وما يكتبه ثمّ يغلق بلا تحليل يبقى أيضًا */
  const ta = c.document.getElementById('cfxAsk');
  ta.value = 'typed only';
  if (typeof ta.oninput === 'function') ta.oninput.call(ta, { target: ta });
  c.document.getElementById('cfxX').click();
  c.omranCodeFixOpen();
  assert.equal(c.document.getElementById('cfxAsk').value, 'typed only');
});

test('٧. حالة الخادم تُترجَم بـtStatus (مفتاح k) كبقيّة المحادثة', async () => {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const c = load([], {});
  c.tStatus = (ev) => (ev.k === 'stReading' ? 'Reading your question…' : ev.status);
  const enc = new TextEncoder();
  let step = 0;
  c.fetch = () => Promise.resolve({ ok: true, status: 200, body: { getReader() { return { read() {
    step++;
    if (step === 1) return Promise.resolve({ done: false, value: enc.encode('data: {"status":"💭 يقرأ سؤالك…","k":"stReading"}\n\n') });
    if (step === 2) return gate.then(() => ({ done: false, value: enc.encode('data: {"delta":"@@NONE x"}\n\n') }));
    return Promise.resolve({ done: true });
  } }; } } });
  c.omranCodeFixOpenWith('app.js', 'var a = 1;\n', 'fix');
  c.document.getElementById('cfxGo').click();
  await settle();
  seen.push(c.document.getElementById('cfxProg').textContent);
  release();
  await settle();
  assert.equal(seen[0], 'Reading your question…');
});

test('٨. خطّ خانة الطلب صالح (font:inherit) — لا الاختزال غير الصالح الذي يُسقَط فيتفرّق العربيّ', () => {
  assert.ok(!A24.includes('font:13px/1.7 inherit'), 'الاختزال غير الصالح باقٍ');
  const i = A24.indexOf('id="cfxAsk"');
  const tag = A24.slice(i, A24.indexOf('</textarea>', i));
  assert.ok(/font:inherit;font-size:13px;line-height:1\.7/.test(tag), 'خطّ الخانة: ' + tag.slice(0, 300));
});
