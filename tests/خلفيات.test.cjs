'use strict';
/* v-bg-images — خلفيّات الشاشة: الفهرس والمصغّرات مطابقة للمجلّد، لا لقطة شاشة بقيت، الربط في index.html
   والإعدادات والـ14 لغة، وسلوك التطبيق (تطبيق/إزالة/استرجاع/إطفاء الثلاثيّة) بتشغيل الجزء الحقيقيّ في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DIR = path.join(root, 'assets', 'خلفيات');
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

// أبعاد JPEG من علامة SOF بلا فكّ ترميز
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xC0 || m === 0xC1 || m === 0xC2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const manifest = () => JSON.parse(rd('assets/خلفيات/فهرس.json'));
const images = () => fs.readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f)).sort((a, b) => a.localeCompare(b, 'ar'));

test('١. الفهرس مطابق للمجلّد: كلّ صورة فيه بمقاسها الحقيقيّ ولونها ومصغّرها (٣٦٠ عرضًا)', () => {
  const m = manifest();
  const files = images();
  assert.ok(files.length >= 16, 'توقّعت ١٦ خلفيّة على الأقلّ');
  assert.deepEqual(m.صور.map((s) => s.ملف), files, 'الفهرس لا يطابق الملفّات — شغّل node scripts/خلفيات.mjs');
  // الترتيب حرفيّ: ثلاث خانات لكلّ رقم وإلّا سبق 100 الرقم 93
  for (const f of files) assert.match(f, /^\d{3}-/, f + ' — الاسم يبدأ برقم من ثلاث خانات');
  const nums = files.map((f) => Number(f.slice(0, 3)));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'ترتيب الفهرس ليس رقميًّا');
  for (const s of m.صور) {
    const dim = jpegSize(path.join(DIR, s.ملف));
    assert.ok(dim, s.ملف + ' ليست JPEG صالحة');
    assert.equal(s.عرض, dim.w, s.ملف + ' عرض');
    assert.equal(s.ارتفاع, dim.h, s.ملف + ' ارتفاع');
    assert.match(s.لون, /^#[0-9a-f]{6}$/, s.ملف + ' لون');
    assert.equal(typeof s.فاتحة, 'boolean', s.ملف + ' فاتحة');
    const th = path.join(DIR, 'مصغّرات', s.ملف);
    assert.ok(fs.existsSync(th), s.ملف + ' بلا مصغّر');
    assert.equal(jpegSize(th).w, 360, s.ملف + ' مصغّر ليس ٣٦٠');
    assert.ok(fs.statSync(th).size < 80 * 1024, s.ملف + ' مصغّر ثقيل');
  }
  const orphans = fs.readdirSync(path.join(DIR, 'مصغّرات')).filter((f) => !files.includes(f));
  assert.deepEqual(orphans, [], 'مصغّرات يتيمة');
});

test('٢. لا لقطة شاشة إنستغرام بقيت: لا صورة بمقاس اللقطة الخام، وكلّ صورة ≥ ٧٠٠ بكسل عرضًا', () => {
  const RAW = new Set(['2210x2416', '1230x1483']); // مقاسات اللقطات الخام التي وصلت من المالك
  for (const f of images()) {
    const d = jpegSize(path.join(DIR, f));
    assert.ok(!RAW.has(d.w + 'x' + d.h), f + ' ما زالت لقطة شاشة كاملة — شغّل node scripts/خلفيات.mjs --قص');
    assert.ok(d.w >= 700, f + ' أضيق من ٧٠٠');
  }
});

test('٣. الربط: index.html والإعدادات والحزمة وapplyBg3D، والملفّات القديمة زالت', () => {
  const html = rd('index.html');
  assert.match(html, /<link rel="stylesheet" href="css\/خلفيات\.css\?v=2">/, 'CSS الخلفيّات');
  assert.doesNotMatch(html, /partials-خلفيات-قسم/, 'الواجهة القديمة ما زالت مربوطة');
  assert.match(html, /partials-settings\.js\?v=677/, 'وسم الإعدادات ارتفع');
  assert.match(rd('js/app-04-i18n-state.js'), /\.js\?v=700'/, 'وسم اللغات ارتفع');
  for (const old of ['js/app-25-خلفيات-مدير.js', 'js/partials-خلفيات-قسم.js']) assert.ok(!fs.existsSync(path.join(root, old)), old + ' يجب أن يُحذف');

  const settings = rd('js/partials-settings.js');
  assert.match(settings, /toggleSubRow\('bgImgSub'\); if\(window\.خلفيات\) window\.خلفيات\.افتح\(\);/, 'الصفّ يفتح الشبكة');
  assert.match(settings, /data-i18n="bgImgSectionLabel"/, 'عنوان الصفّ مترجَم');
  assert.match(settings, /id="bgImgSubContent"[\s\S]*?id="bgImgGrid" class="bgImgGrid"/, 'حاوية الشبكة');
  assert.doesNotMatch(settings, /backgroundsSub|خلفيات-قسم/, 'بقايا الصفّ القديم');

  assert.match(rd('js/app.bundle.js'), /window\.خلفيات = \{ افتح: افتح, طبّق: طبّق, استرجع: استرجع \};/, 'الجزء داخل الحزمة');
  const ui = rd('js/app-05-ui.js');
  const at = ui.indexOf('async function applyBg3D(');
  assert.ok(at > 0 && ui.slice(at, at + 900).includes("window.خلفيات.طبّق(null)"), 'اختيار ثلاثيّة يزيل صورة الشاشة');

  const css = rd('css/خلفيات.css');
  for (const sel of ['#bgImgLayer', 'html.bgimg body', 'html.bgimg-dark', 'html.bgimg-light', '.bgImgGrid', '.bgImgOpt.active', '.bgImgNone']) assert.ok(css.includes(sel), 'CSS: ' + sel);
});

test('٤. الترجمة: المفتاحان في العربيّة والإنجليزيّة و١٢ ملفّ لغة', () => {
  const data = rd('js/app-03-i18n-data.js');
  for (const k of ['bgImgSectionLabel', 'bgImgNone']) {
    assert.equal((data.match(new RegExp('\\b' + k + ': ', 'g')) || []).length, 2, k + ' في ar+en');
    for (const lg of LANGS) assert.match(rd('i18n/' + lg + '.js'), new RegExp('"?' + k + '"?: "'), k + ' في ' + lg);
  }
});

// ── بيئة DOM مصغّرة تكفي الجزء الحقيقيّ ──
function makeEnv({ storage = {}, list, fetchFails = false } = {}) {
  const els = {};
  const mk = (tag) => {
    const set = new Set();
    const e = {
      tag, id: '', dataset: {}, children: [], innerHTML: '', textContent: '', onclick: null,
      style: { setProperty(k, v) { this[k] = v; } },
      classList: {
        add: (...a) => a.forEach((c) => set.add(c)),
        remove: (...a) => a.forEach((c) => set.delete(c)),
        toggle: (c, f) => { if (f === undefined) f = !set.has(c); if (f) set.add(c); else set.delete(c); return f; },
        contains: (c) => set.has(c),
      },
      appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; },
      insertBefore(c) { this.children.unshift(c); if (c.id) els[c.id] = c; return c; },
      querySelectorAll(sel) { return this.children.filter((c) => c.classList.contains(sel.replace('.', ''))); },
      get firstChild() { return this.children[0] || null; },
    };
    Object.defineProperty(e, 'className', {
      get() { return [...set].join(' '); },
      set(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => set.add(c)); },
    });
    return e;
  };
  const html = mk('html'), body = mk('body'), grid = mk('div');
  grid.id = 'bgImgGrid'; els.bgImgGrid = grid;
  const store = new Map(Object.entries(storage));
  const calls = { applyBg3D: [], buildBg3DPicker: 0, swallow: [], fetch: 0 };
  const ctx = {
    document: { documentElement: html, body, readyState: 'complete', getElementById: (id) => els[id] || null, createElement: mk, addEventListener() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    fetch: () => { calls.fetch++; return fetchFails ? Promise.reject(new Error('down')) : Promise.resolve({ ok: true, json: async () => ({ نسخة: 1, صور: list }) }); },
    __swallow: (e, ctxName) => calls.swallow.push(ctxName),
    applyBg3D: (id) => { calls.applyBg3D.push(id); store.set('aiapp_bg3d', id); },
    buildBg3DPicker: () => { calls.buildBg3DPicker++; },
    t: (k) => (k === 'bgImgNone' ? 'بلا خلفيّة (مترجَم)' : k),
    encodeURIComponent, JSON, Promise, Error, String,
  };
  ctx.window = ctx;
  vm.runInNewContext(rd('js/app-25-خلفيات.js'), ctx);
  return { ctx, html, body, grid, store, calls };
}
const LIST = [
  { ملف: '01-مدينة.jpg', عرض: 1000, ارتفاع: 1000, لون: '#1c2123', فاتحة: false },
  { ملف: '02-ثلج.jpg', عرض: 1000, ارتفاع: 1000, لون: '#e8e8ea', فاتحة: true },
];

test('٥. الشبكة: «بلا خلفيّة» ثمّ مصغّر لكلّ صورة بلا أيّ اسم، والاختيار يطبّق الصورة الكاملة ويلوّن الكتابة ويحفظ', async () => {
  const { ctx, html, body, grid, store, calls } = makeEnv({ list: LIST });
  assert.ok(!html.classList.contains('bgimg'), 'لا خلفيّة قبل الاختيار');
  await ctx.window.خلفيات.افتح();
  assert.equal(grid.children.length, 3);
  const [none, b1] = grid.children;
  assert.equal(none.textContent, 'بلا خلفيّة (مترجَم)');
  assert.ok(none.classList.contains('active'), '«بلا خلفيّة» مختارة افتراضيًّا');
  assert.equal(b1.textContent, '', 'المصغّر بلا اسم');
  assert.ok(b1.style.backgroundImage.includes(encodeURIComponent('مصغّرات') + '/' + encodeURIComponent('01-مدينة.jpg')), 'المصغّر من مجلّد المصغّرات');

  b1.onclick();
  assert.ok(html.classList.contains('bgimg') && html.classList.contains('bgimg-dark') && !html.classList.contains('bgimg-light'));
  const layer = body.children[0];
  assert.equal(layer.id, 'bgImgLayer');
  assert.ok(layer.style.backgroundImage.includes('/assets/' + encodeURIComponent('خلفيات') + '/' + encodeURIComponent('01-مدينة.jpg')) && !layer.style.backgroundImage.includes(encodeURIComponent('مصغّرات')), 'الطبقة تأخذ الصورة الكاملة');
  assert.equal(html.style['--bgimg-tint'], '#1c2123');
  assert.deepEqual(JSON.parse(store.get('aiapp_bgimg')), { ملف: '01-مدينة.jpg', لون: '#1c2123', فاتحة: false });
  assert.ok(b1.classList.contains('active') && !none.classList.contains('active'), 'العلامة انتقلت');
  assert.deepEqual(calls.applyBg3D, [], 'لا نداء للثلاثيّة وهي مطفأة أصلًا');
  assert.deepEqual(calls.swallow, []);

  grid.children[2].onclick();
  assert.ok(html.classList.contains('bgimg-light') && !html.classList.contains('bgimg-dark'), 'صورة فاتحة → كتابة داكنة');

  await ctx.window.خلفيات.افتح();
  assert.equal(grid.children.length, 3, 'فتح ثانٍ لا يكرّر البناء');
  assert.equal(calls.fetch, 1, 'الفهرس يُجلب مرّة واحدة');
});

test('٦. خلفيّة واحدة: اختيار صورة يطفئ الثلاثيّة ويعيد بناء منتقيها؛ و«بلا خلفيّة» تزيل كلّ شيء', async () => {
  const { ctx, html, body, grid, store, calls } = makeEnv({ list: LIST, storage: { aiapp_bg3d: 'galaxy' } });
  await ctx.window.خلفيات.افتح();
  grid.children[1].onclick();
  assert.deepEqual(calls.applyBg3D, ['none']);
  assert.equal(calls.buildBg3DPicker, 1);
  grid.children[0].onclick();
  assert.ok(!html.classList.contains('bgimg') && !html.classList.contains('bgimg-dark'));
  assert.equal(body.children[0].style.backgroundImage, '');
  assert.equal(store.has('aiapp_bgimg'), false);
  assert.ok(grid.children[0].classList.contains('active') && !grid.children[1].classList.contains('active'));
});

test('٧. الاسترجاع عند الإقلاع من المحفوظ بلا جلب الفهرس، وفشل الجلب لا يكسر الإعدادات', async () => {
  const saved = JSON.stringify({ ملف: '02-ثلج.jpg', لون: '#e8e8ea', فاتحة: true });
  const a = makeEnv({ list: LIST, storage: { aiapp_bgimg: saved } });
  assert.ok(a.html.classList.contains('bgimg') && a.html.classList.contains('bgimg-light'));
  assert.ok(a.body.children[0].style.backgroundImage.includes(encodeURIComponent('02-ثلج.jpg')));
  assert.equal(a.calls.fetch, 0, 'الاسترجاع من المحفوظ لا يحتاج الفهرس');
  assert.equal(a.store.get('aiapp_bgimg'), saved, 'الاسترجاع لا يعيد الحفظ');

  const b = makeEnv({ list: LIST, fetchFails: true });
  await b.ctx.window.خلفيات.افتح();
  assert.equal(b.grid.children.length, 0);
  assert.equal(b.grid.dataset.ready, '', 'يمكن المحاولة ثانية');
  assert.deepEqual(b.calls.swallow, ['bgimg:index']);
});
