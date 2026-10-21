'use strict';
/* tests/version-label.test.cjs — v-ver-label (تدقيق ١٨ أكتوبر، لقطتا ٠٢٣ و٠٤٦).
   العرض: سطر النسخة للمالك في «عن البرنامج» عناوينه عربيّة في الإنجليزيّ (بندل/سحب/رفع/سيرفر/محلي/دمج)، وهو نصّ واحد
   يقلبه اتّجاه الفقرة و«رفع:» تنفصل عن قيمتها عند الالتفاف.
   هنا: updateVersionLabel الحقيقيّة من app-13 في vm بدوم مصغّر وقاموس اللغة الحقيقيّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, tFor, AR_RE } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');

function label(lang, user) {
  const { document } = makeDom();
  const el = document.createElement('div'); el.id = 'appVersionLabel'; document.body.appendChild(el);
  const sc = document.createElement('script'); sc.setAttribute('src', 'js/app.bundle.js?' + 'v=2a7218c6'); document.body.appendChild(sc); // مقسوم كي لا يُعدّ تثبيت وسم (arch-ratchet)
  document.querySelector = (sel) => (/app\.bundle\.js/.test(sel) ? sc : null);
  document.createTextNode = (s) => { const n = document.createElement('#text'); n.textContent = String(s); n.nodeType = 3; return n; };
  const ctx = {
    document, state: { projects: [1, 2, 3] }, __swallow() {},
    authGet: () => user || 'omran', setInterval: () => 1,
    localStorage: { getItem: () => null },
  };
  ctx.window = Object.assign(ctx, { t: tFor(lang), __chatsLastPull: Date.UTC(2026, 9, 19, 2, 40, 26), __chatsLastPush: Date.UTC(2026, 9, 19, 2, 40, 26), __chatsServerCount: 12, __chatsMergeResult: 'no-change', __verLabelTimer: 1 });
  const src = read('js/app-13-stocks-init.js');
  const a = src.indexOf('window.updateVersionLabel = function(){');
  assert.ok(a > 0, 'الدالّة موجودة');
  vm.createContext(ctx);
  vm.runInContext(src.slice(a), ctx); // آخر ما في الملفّ
  ctx.window.updateVersionLabel();
  return el;
}
const text = (el) => (el.children.length ? el.children.map(text).join('') : (el.textContent || ''));

test('١. كلّ زوج «عنوان: قيمة» span لا يلتفّ ومعزول، والقيمة <bdi dir="ltr">', () => {
  const el = label('ar');
  const spans = el.children.filter((c) => c.tagName === 'SPAN');
  assert.equal(spans.length, 7, 'الاسم والنسخة + ستّة أزواج');
  for (const s of spans) {
    assert.match(String(s.style.cssText || ''), /white-space:nowrap/);
    assert.match(String(s.style.cssText || ''), /unicode-bidi:isolate/);
    const b = s.children.find((c) => c.tagName === 'BDI');
    assert.ok(b && b.getAttribute('dir') === 'ltr', 'القيمة في bdi dir=ltr');
  }
  const t = text(el);
  assert.match(t, /^Omran AI Builder — v461 · بندل: 2a7218c6 · سحب: \d\d:\d\d:\d\d · رفع: \d\d:\d\d:\d\d · سيرفر: 12 · محلي: 3 · دمج: no-change$/);
});

test('٢. بالإنجليزيّة والروسيّة: العناوين بلغة الواجهة بلا حرف عربيّ', () => {
  const en = text(label('en'));
  assert.ok(!AR_RE.test(en), en);
  assert.match(en, /· Bundle: 2a7218c6 · Pull: [\d:]+ · Push: [\d:]+ · Server: 12 · Local: 3 · Merge: no-change$/);
  const ru = text(label('ru'));
  assert.ok(!AR_RE.test(ru), ru);
  assert.match(ru, /Сборка: 2a7218c6/);
});

test('٣. غير المالك: السطر فارغ ومخفيّ كما كان', () => {
  const el = label('en', 'ali');
  assert.equal(el.children.length, 0);
  assert.equal(el.textContent, '');
  assert.equal(el.style.display, 'none');
});
