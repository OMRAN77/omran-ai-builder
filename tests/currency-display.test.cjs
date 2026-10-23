'use strict';
/* tests/currency-display.test.cjs — v-cur-display (تدقيق ١٨ أكتوبر، pricing-section «رمز العملة يطلع عربي د.إ وجنب الأسعار في الإنجليزي» وcurrency-select
   «سعر الدولار ينكتب 10 $ بدل $10»؛ موافقة المالك ٢١ أكتوبر: «عرض فقط بدون تغيير الأسعار»، «لا تصرف»).
   خارج العربيّة رمز ISO بدل الرمز العربيّ، وبالإنجليزيّة الرمز قبل الرقم؛ الأرقام وأسعار الصرف والتقريب كما هي. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('js/currency.js');

function el(cls, data) {
  const set = new Set(cls);
  return { textContent: '', dataset: data || {}, classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c); }, contains: (c) => set.has(c) } };
}
function load(lang) {
  const nums = [el(['pnum'], { usd: '10' }), el(['pn'], { usd: '4.99' })];
  const syms = [el(['pcur', 'cursym']), el(['cursym'])];
  const doc = {
    querySelectorAll: (q) => (q === '[data-usd]' ? nums : q === '.cursym' ? syms : []),
    querySelector: (q) => (q === '.cursym' ? syms[0] : null),
  };
  const win = {};
  const ctx = { window: win, document: doc, lang, localStorage: { getItem: () => lang }, Intl, Math, parseFloat, isFinite, String };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { cur: win.OmranCur, nums, syms, win };
}

test('١. بالإنجليزيّة: AED بدل «د.إ» وSAR بدل «ر.س» (وسم curCode)، والدولار $ كما هو، والأرقام وسعر الصرف كما كانت', () => {
  const w = load('en');
  w.cur.set('AE'); w.cur.render();
  assert.equal(w.syms[0].textContent, 'AED');
  assert.ok(w.syms[0].classList.contains('curCode'));
  assert.equal(w.nums[0].textContent, '37.5', '10$ × 3.6725 بتقريب pretty كما كان');
  w.cur.set('SA'); w.cur.render();
  assert.equal(w.syms[1].textContent, 'SAR');
  w.cur.set('BI'); w.cur.render();
  assert.equal(w.syms[0].textContent, '$');
  assert.ok(!w.syms[0].classList.contains('curCode'));
  assert.equal(w.nums[0].textContent, '10');
  assert.equal(w.cur.list.find((x) => x.c === 'AE').r, 3.6725, 'سعر الصرف لم يتغيّر');
});

test('٢. بالعربيّة الرمز العربيّ كما كان، وبالفرنسيّة والأردو رمز ISO', () => {
  const ar = load('ar'); ar.cur.set('AE'); ar.cur.render();
  assert.equal(ar.syms[0].textContent, 'د.إ');
  for (const lg of ['fr', 'ur']) { const w = load(lg); w.cur.set('KW'); w.cur.render(); assert.equal(w.syms[0].textContent, 'KWD', lg); }
});

test('٣. تبديل اللغة يعيد الرمز (__curRelabel يرسم)، والترتيب «$10» بالإنجليزيّة وحدها في الباقات وحزم النقاط', () => {
  assert.match(SRC, /window\.__curRelabel = function\(\)\{[\s\S]*?if \(document\.querySelector\('\.cursym'\)\) render\(document\);/);
  const ps = read('js/partials-settings.js');
  for (const rule of ['html[lang="en"] .pcard .pcur{order:-1;}', 'html[lang="en"] .pcard .pcur.curCode{margin-inline-end:5px;}',
    'html[lang="en"] .pointsPackBtn span:has(> .cursym){display:inline-flex; align-items:baseline; gap:1px;}', 'html[lang="en"] .pointsPackBtn .cursym{order:-1;}']) {
    assert.ok(ps.includes(rule), rule);
  }
  const tag = Number((ps.match(new RegExp("sc\\.src = '/js/currency\\.js\\?v" + "=(\\d+)'")) || [])[1]);
  assert.ok(tag >= 3, 'وسم currency.js رُفع (كان ٢): ' + tag); // يُقرأ من الملفّ لا يُثبَّت (سقّاطة V_PIN)
});
