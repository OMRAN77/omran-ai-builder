// v-fav-quota: من tests/favorites-quota.test.cjs في حزمة a11 بفرع ten-a — حالات الحفظ والامتلاء وحدها (الدفعة ٣).
// tests/favorites-quota.test.cjs — v-fav-quota + v-fav-near (تدقيق ١٨ أكتوبر، g08 style-favorites وg09 fashion-favorites-profile):
// - مفضّلة «ستايل AI» تخزّن النتيجة كاملة (~٢٫٤ م.ب dataURL) في localStorage بلا حارس، فالحفظ الثالث يرمي QuotaExceededError
//   والزرّ لا يقول شيئًا؛ وفي الأزياء الحفظ الثاني. اللوحة تعرض مصغّرة ٥٠×٥٠ فقط.
// - المفضّلة تكتب «hair · أومبري» (مفتاح الميزة الخامّ) و«casual» (قيمة النمط الخامّ).
// - لوحة مفضّلة الأزياء تُفتح آخر النافذة بعيدًا عن زرّها، و«تم حفظ ملفك» تُكتب في سطر الحالة عند زرّ «صمم» خارج الشاشة.
// الآن: الصورة تُصغَّر JPEG بضلع ٧٦٨ قبل الحفظ، والحفظ داخل try/catch يرجع نجح/فشل، والفشل يظهر على الزرّ وstorageFullWarning
// في سطر الحالة — ولا حذف تلقائيّ لمفضّلة قائمة (قرار القائد: باب بيانات المستخدم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A12 = read('js/app-12-studios.js');
const A13 = read('js/app-13-stocks-init.js');
const cut = (s, a, b, from) => {
  const i = s.indexOf(a, from || 0); assert.ok(i >= 0, 'مقطع مفقود: ' + a);
  const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b);
  return s.slice(i, j);
};
const tick = () => new Promise((r) => setImmediate(r));

/* localStorage بحدّ: يرمي QuotaExceededError كالمتصفّح حين يتجاوز المجموع LIMIT حرفًا */
function makeStorage(limit) {
  const m = {}; const attempts = [];
  const size = () => Object.keys(m).reduce((n, k) => n + k.length + m[k].length, 0);
  return {
    m, attempts, always: false,
    getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) {
      v = String(v); attempts.push({ k, v });
      const next = size() - (m[k] ? m[k].length : 0) + v.length;
      if (this.always || next > limit) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      m[k] = v;
    },
    removeItem(k) { throw new Error('removeItem غير متوقَّع: ' + k); },
  };
}
/* صورة وكانفس وهميّان: الصورة ١٥٣٦×٢٠٤٨، والكانفس يرجع JPEG بحجم يتناسب مع مساحته */
class FakeImage {
  constructor() { this.naturalWidth = 1536; this.naturalHeight = 2048; }
  set src(v) { this._src = v; Promise.resolve().then(() => (String(v).startsWith('data:') ? this.onload() : this.onerror())); }
  get src() { return this._src; }
}
function makeCard() {
  const kids = [];
  return {
    style: {}, children: kids,
    set innerHTML(h) {
      kids.length = 0;
      for (const m of String(h).matchAll(/<(img|span|button)\b([^>]*)>/g)) {
        const k = { tag: m[1], attrs: m[2], textContent: '', style: {} };
        const close = String(h).indexOf('</' + m[1] + '>', m.index);
        if (m[1] !== 'img' && close > 0) k.textContent = String(h).slice(m.index + m[0].length, close).replace(/<[^>]*>/g, '');
        kids.push(k);
      }
    },
    querySelector(t) { return kids.find((k) => k.tag === t) || null; },
  };
}
function makeDocument() {
  return {
    createElement(tag) {
      if (tag === 'canvas') {
        const c = { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
        c.toDataURL = (type, q) => { c.type = type; c.q = q; return 'data:' + type + ';base64,' + 'B'.repeat(Math.round(c.width * c.height * 0.25)); };
        return c;
      }
      return makeCard();
    },
  };
}
function makePanel() {
  return { style: { display: 'none' }, cards: [], _html: '', scrolled: 0,
    set innerHTML(h) { this._html = String(h); this.cards = []; }, get innerHTML() { return this._html; },
    appendChild(c) { this.cards.push(c); return c; }, scrollIntoView() { this.scrolled++; } };
}
const T = (k) => 'T:' + k;
const BIG = 'data:image/png;base64,' + 'A'.repeat(2400000);
const HELPERS = () => cut(A12, '/* v-fav-quota', 'async function __safeJson(res){');

function bootStudio(storage) {
  const timers = [];
  const statusEl = { style: {}, textContent: '' };
  const hairTab = { textContent: ' 💇 الشعر ' };
  const ctx = {
    localStorage: storage, Image: FakeImage, document: makeDocument(), JSON, Date, Math, Array, Object, String, Promise,
    __swallow: () => {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    favoritesPanel: makePanel(), favoritesBtn: {}, favSaveBtn: { textContent: '' }, resultEl: { src: BIG },
    styleEl: { value: 'ombre', querySelector: (s) => (s === 'option[value="ombre"]' ? { textContent: '🎨 أومبري' } : null) },
    tabsWrap: { querySelector: (s) => (s === '.studioAiTabBtn[data-feature="hair"]' ? hairTab : null) },
    feature: 'hair', t2: T, statusEl,
    setStatus(text) { statusEl.style.display = text ? 'block' : 'none'; statusEl.textContent = text || ''; },
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS() + cut(A13, '  /* ---- ❤️ favorites ---- */', '  /* ---- 🔄 before/after slider ----')
    + cut(A13, '  function featureTitle(){', '  function openStudioPicker(){') + '\nthis.render = renderFavorites;', ctx);
  return { ctx, timers, statusEl };
}

test('١. ستايل AI: ثلاث حفظات لنتيجة ٢٫٤ م.ب تنجح، وكلّ مخزَّن مصغّرة JPEG أقلّ من ٣٠٠ ك.ب، ولا شيء يرمي', async () => {
  const st = makeStorage(1000000);
  const { ctx, statusEl } = bootStudio(st);
  for (let i = 1; i <= 3; i++) {
    ctx.favSaveBtn.onclick();
    await tick(); await tick();
    const favs = JSON.parse(st.getItem('aiapp_studio_favorites'));
    assert.equal(favs.length, i, 'الحفظ رقم ' + i);
    assert.equal(ctx.favSaveBtn.textContent, 'T:studioFavoriteSaved', 'الزرّ يقول «تم الحفظ»');
  }
  const favs = JSON.parse(st.getItem('aiapp_studio_favorites'));
  for (const f of favs) {
    assert.match(f.img, /^data:image\/jpeg;base64,/, 'مصغّرة JPEG');
    assert.ok(f.img.length < 300000, 'أقلّ من ٣٠٠ ك.ب: ' + f.img.length);
  }
  assert.equal(statusEl.textContent, '', 'لا تحذير');
});

test('٢. ستايل AI: امتلاء دائم يظهر على الزرّ وstorageFullWarning في سطر الحالة، ولا تُحذف أيّ مفضّلة قائمة', async () => {
  const st = makeStorage(1e9);
  const old = [{ img: 'data:image/jpeg;base64,AAA', feature: '💇 الشعر', style: 'أسود', ts: 1 }, { img: 'data:image/jpeg;base64,BBB', feature: '👓 نظارات', style: 'دائرية', ts: 2 }];
  st.m.aiapp_studio_favorites = JSON.stringify(old);
  st.always = true;
  const { ctx, timers, statusEl } = bootStudio(st);
  assert.doesNotThrow(() => ctx.favSaveBtn.onclick());
  await tick(); await tick();
  assert.equal(ctx.favSaveBtn.textContent, 'T:memorySaveError', 'الزرّ يقول إنّ الحفظ تعذّر');
  assert.equal(statusEl.textContent, 'T:storageFullWarning');
  assert.equal(statusEl.style.display, 'block');
  assert.equal(st.m.aiapp_studio_favorites, JSON.stringify(old), 'المخزَّن كما هو');
  for (const a of st.attempts) {
    const arr = JSON.parse(a.v);
    for (const o of old) assert.ok(arr.some((x) => x.ts === o.ts), 'كلّ محاولة تحمل المفضّلات القديمة كلّها — لا إخلاء');
  }
  timers.forEach((x) => x.fn());
  assert.equal(ctx.favSaveBtn.textContent, 'T:studioFavoriteSaveBtn', 'يعود الزرّ لنصّه');
});

function bootFashion(storage) {
  const timers = [];
  const statusEl = { style: {}, textContent: '' };
  const headerRow = { inserted: [], insertAdjacentElement(pos, el) { this.inserted.push([pos, el]); return el; } };
  const favoritesBtn = { parentElement: headerRow };
  const opts = [{ value: 'casual', textContent: 'كاجوال' }, { value: 'evening', textContent: 'سهرة' }];
  const inp = (v) => ({ value: v });
  const ctx = {
    localStorage: storage, Image: FakeImage, document: makeDocument(), JSON, Date, Math, Array, Object, String, Promise,
    __swallow: () => {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    favoritesPanel: makePanel(), favoritesBtn, favSaveBtn: { textContent: '' }, resultEl: { src: BIG },
    styleEl: { value: 'casual', options: opts },
    profileHeightEl: inp('170'), profileWeightEl: inp('60'), profileSkinEl: inp(''), profileHairEl: inp(''),
    profileSaveBtn: { textContent: 'T:fashionProfileSave' },
    optLabel: (o) => (o ? o.textContent : ''), t: T, statusEl,
    setStatus(text) { statusEl.style.display = text ? 'block' : 'none'; statusEl.textContent = text || ''; },
  };
  vm.createContext(ctx);
  vm.runInContext(HELPERS() + cut(A12, '  function fashionOptFor(v){', '  function openFashionPicker(){')
    + cut(A12, '  /* ---- 👤 saved measurements profile ---- */', '  /* ---- 🔄 before/after slider ----') + '\nthis.render = renderFavorites;', ctx);
  return { ctx, timers, statusEl, headerRow };
}

test('٤. الأزياء: الحفظ الثاني والثالث ينجحان بالمصغّرة، والامتلاء الدائم يظهر على الزرّ بلا حذف', async () => {
  const st = makeStorage(1000000);
  const { ctx } = bootFashion(st);
  for (let i = 1; i <= 3; i++) {
    ctx.favSaveBtn.onclick();
    await tick(); await tick();
    assert.equal(JSON.parse(st.getItem('aiapp_fashion_favorites')).length, i, 'الحفظ رقم ' + i);
    assert.equal(ctx.favSaveBtn.textContent, 'T:fashionFavoriteSaved');
  }
  const st2 = makeStorage(1e9);
  st2.m.aiapp_fashion_favorites = JSON.stringify([{ img: 'data:a', style: 'evening', ts: 7 }]);
  st2.always = true;
  const b = bootFashion(st2);
  assert.doesNotThrow(() => b.ctx.favSaveBtn.onclick());
  await tick(); await tick();
  assert.equal(b.ctx.favSaveBtn.textContent, 'T:memorySaveError', 'الزرّ يعرض نتيجته');
  assert.equal(b.statusEl.textContent, 'T:storageFullWarning');
  assert.equal(st2.m.aiapp_fashion_favorites, JSON.stringify([{ img: 'data:a', style: 'evening', ts: 7 }]), 'لا حذف تلقائيّ');
  b.timers.forEach((x) => x.fn());
  assert.equal(b.ctx.favSaveBtn.textContent, 'T:fashionFavoriteSaveBtn');
});

test('٧. الحزمة: لا setItem مكشوف للمفضّلة في النطاقين', () => {
  const fx = cut(A12, '  /* ---- ❤️ favorites ---- */', '  /* ---- 🔄 before/after slider ----', A12.indexOf("const FAV_KEY = 'aiapp_fashion_favorites'") - 200);
  const stu = cut(A13, '  /* ---- ❤️ favorites ---- */', '  /* ---- 🔄 before/after slider ----');
  for (const s of [fx, stu]) assert.doesNotMatch(s, /localStorage\.setItem\(FAV_KEY/, 'الحفظ يمرّ بالحارس');
});
