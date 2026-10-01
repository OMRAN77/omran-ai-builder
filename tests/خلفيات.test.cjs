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
  assert.match(html, /<link rel="stylesheet" href="css\/خلفيات\.css\?v=3">/, 'CSS الخلفيّات (٢←٣ مع v-bg-custom-rotate)');
  assert.doesNotMatch(html, /partials-خلفيات-قسم/, 'الواجهة القديمة ما زالت مربوطة');
  assert.match(html, /partials-settings\.js\?v=679/, 'وسم الإعدادات ارتفع');
  assert.match(rd('js/app-04-i18n-state.js'), /\.js\?v=708'/, 'وسم اللغات ارتفع');
  for (const old of ['js/app-25-خلفيات-مدير.js', 'js/partials-خلفيات-قسم.js']) assert.ok(!fs.existsSync(path.join(root, old)), old + ' يجب أن يُحذف');

  const settings = rd('js/partials-settings.js');
  // v-bg-images-row: صفّ مستقلّ في قائمة الإعدادات (مجموعة المظهر) لا مطويّ داخل «تخصيص الألوان»
  assert.match(settings, /<div id="bgImgSection" class="settingsPageSection"/, 'قسم مستقلّ');
  assert.match(settings, /toggleSettingsSection\('bgImgSection'\); if\(window\.خلفيات\) window\.خلفيات\.افتح\(\);/, 'نقر الرأس يفتح الشبكة');
  assert.match(settings, /<h3[^>]*data-i18n="bgImgSectionLabel">خلفيّات الشاشة<\/h3>/, 'العنوان بلا إيموجي');
  assert.match(settings, /id="bgImgSectionContent"[\s\S]*?id="bgImgGrid" class="bgImgGrid"/, 'حاوية الشبكة');
  assert.doesNotMatch(settings, /bgImgSub|backgroundsSub|خلفيات-قسم/, 'بقايا الصفّ المطويّ القديم');
  // v-bg-custom-rotate: صفّ التبديل التلقائيّ (٤ مدد) قبل الشبكة، ومدخل الملفّ المخفيّ
  assert.match(settings, /id="bgImgRotateOpts"[\s\S]*?data-min="0" data-i18n="bgImgRotateOff"[\s\S]*?data-min="10" data-i18n="bgImgEvery10"[\s\S]*?data-min="30" data-i18n="bgImgEvery30"[\s\S]*?data-min="60" data-i18n="bgImgEvery60"[\s\S]*?id="bgImgGrid"/, 'أزرار التبديل: إيقاف/١٠/٣٠/٦٠ قبل الشبكة');
  assert.match(settings, /<input type="file" id="bgImgFile" accept="image\/\*" hidden>/, 'مدخل صورة الجهاز');
  const themeBlock = settings.slice(settings.indexOf('<div id="themeSection"'), settings.indexOf('<div id="bgImgSection"'));
  assert.ok(!themeBlock.includes('bgImgGrid'), 'الشبكة لم تعد داخل قسم المظهر');
  const app05 = rd('js/app-05-ui.js');
  assert.match(app05, /const SETTINGS_NAV_IDS = \[[^\]]*'themeSection','bgImgSection','fontFamilySection'/, 'مسجَّل في قائمة الأقسام بعد المظهر');
  assert.match(app05, /\['setGrpAppearance', \['themeSection', 'bgImgSection', 'fontFamilySection'/, 'في مجموعة المظهر بعد «تخصيص الألوان»');
  assert.match(app05, /bgImgSection: `<svg [^`]*<rect x="3" y="3" width="18" height="18" rx="2" ry="2"><\/rect><circle cx="8\.5" cy="8\.5" r="1\.5"><\/circle><polyline points="21 15 16 10 5 21"><\/polyline><\/svg>`/, 'أيقونة SVG رسميّة (صورة) لا إيموجي');
  assert.match(app05, /if\(sid === 'bgImgSection' && window\.خلفيات\) window\.خلفيات\.افتح\(\);/, 'فتح الصفحة من القائمة يبني الشبكة');

  assert.match(rd('js/app.bundle.js'), /window\.خلفيات = \{ افتح: افتح, طبّق: طبّق, استرجع: استرجع, أضف: أضف, احذف: احذف, دوّر: دوّر, التالي: التالي \};/, 'الجزء داخل الحزمة');
  const ui = rd('js/app-05-ui.js');
  const at = ui.indexOf('async function applyBg3D(');
  assert.ok(at > 0 && ui.slice(at, at + 900).includes("window.خلفيات.طبّق(null)"), 'اختيار ثلاثيّة يزيل صورة الشاشة');

  const css = rd('css/خلفيات.css');
  for (const sel of ['#bgImgLayer', 'html.bgimg body', 'html.bgimg-dark', 'html.bgimg-light', '.bgImgGrid', '.bgImgOpt.active', '.bgImgNone', '.bgImgAdd', '.bgImgDel', '.bgImgRotOpt.active']) assert.ok(css.includes(sel), 'CSS: ' + sel);
});

test('٤. الترجمة: المفاتيح (الصفّ، بلا خلفيّة، صورة الجهاز، التبديل) في العربيّة والإنجليزيّة و١٢ ملفّ لغة', () => {
  const data = rd('js/app-03-i18n-data.js');
  for (const k of ['bgImgSectionLabel', 'bgImgNone', 'bgImgAdd', 'bgImgDelete', 'bgImgFull', 'bgImgBad', 'bgImgRotate', 'bgImgRotateOff', 'bgImgEvery10', 'bgImgEvery30', 'bgImgEvery60']) {
    assert.equal((data.match(new RegExp('\\b' + k + ': ', 'g')) || []).length, 2, k + ' في ar+en');
    for (const lg of LANGS) assert.match(rd('i18n/' + lg + '.js'), new RegExp('"?' + k + '"?: "'), k + ' في ' + lg);
  }
  // v-bg-images-row: عنوان الصفّ بلا إيموجي في الـ14 لغة (الأيقونة SVG في القائمة)
  assert.match(data, /bgImgSectionLabel: 'خلفيّات الشاشة'/, 'العربيّة بلا إيموجي');
  assert.match(data, /bgImgSectionLabel: 'Screen wallpapers'/, 'الإنجليزيّة بلا إيموجي');
  for (const f of ['js/app-03-i18n-data.js', ...LANGS.map((lg) => 'i18n/' + lg + '.js')]) {
    for (const m of rd(f).match(/bgImgSectionLabel"?:\s*["'][^"']*["']/g) || []) assert.doesNotMatch(m, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u, f + ': ' + m);
  }
});

// ── بيئة DOM مصغّرة تكفي الجزء الحقيقيّ ──
function makeEnv({ storage = {}, list, fetchFails = false, now = 1_000_000 } = {}) {
  const els = {};
  const mk = (tag) => {
    const set = new Set();
    const e = {
      tag, id: '', dataset: {}, children: [], textContent: '', onclick: null, title: '',
      set innerHTML(v) { if (v === '') this.children.length = 0; }, get innerHTML() { return ''; },
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
  const html = mk('html'), body = mk('body'), grid = mk('div'), rot = mk('div');
  grid.id = 'bgImgGrid'; els.bgImgGrid = grid;
  rot.id = 'bgImgRotateOpts'; els.bgImgRotateOpts = rot;
  for (const m of [0, 10, 30, 60]) { const b = mk('button'); b.className = 'bgImgRotOpt'; b.dataset.min = String(m); rot.appendChild(b); }
  const store = new Map(Object.entries(storage));
  const calls = { applyBg3D: [], buildBg3DPicker: 0, swallow: [], fetch: 0, alerts: [] };
  // ساعة ومؤقّت مزيّفان: timers[{at, fn}] وclock.tick(ms) يشغّل ما حان
  const clock = { now, timers: [], tick(ms) { clock.now += ms; const due = clock.timers.filter((t) => t.at <= clock.now); clock.timers = clock.timers.filter((t) => t.at > clock.now); due.forEach((t) => t.fn()); } };
  let tid = 0;
  const ctx = {
    setTimeout: (fn, ms) => { const id = ++tid; clock.timers.push({ id, at: clock.now + ms, fn }); return id; },
    clearTimeout: (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); },
    Date: { now: () => clock.now },
    alert: (m) => calls.alerts.push(m), parseInt, Math, Array, Object,
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
  const tick = () => new Promise((r) => setImmediate(r));
  return { ctx, html, body, grid, rot, store, calls, clock, tick };
}
const LIST = [
  { ملف: '01-مدينة.jpg', عرض: 1000, ارتفاع: 1000, لون: '#1c2123', فاتحة: false },
  { ملف: '02-ثلج.jpg', عرض: 1000, ارتفاع: 1000, لون: '#e8e8ea', فاتحة: true },
];

test('٥. الشبكة: «بلا خلفيّة» ثمّ مصغّر لكلّ صورة بلا أيّ اسم، والاختيار يطبّق الصورة الكاملة ويلوّن الكتابة ويحفظ', async () => {
  const { ctx, html, body, grid, store, calls } = makeEnv({ list: LIST });
  assert.ok(!html.classList.contains('bgimg'), 'لا خلفيّة قبل الاختيار');
  await ctx.window.خلفيات.افتح();
  assert.equal(grid.children.length, 4, 'بلا خلفيّة + صورة من جهازك + صورتان');
  const [none, add, b1] = grid.children;
  assert.equal(none.textContent, 'بلا خلفيّة (مترجَم)');
  assert.ok(none.classList.contains('active'), '«بلا خلفيّة» مختارة افتراضيًّا');
  assert.ok(add.classList.contains('bgImgAdd') && !add.classList.contains('active') && add.dataset.file === undefined, 'زرّ الإضافة لا يُعلَّم');
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

  grid.children[3].onclick();
  assert.ok(html.classList.contains('bgimg-light') && !html.classList.contains('bgimg-dark'), 'صورة فاتحة → كتابة داكنة');
  assert.ok(!add.classList.contains('active'), 'زرّ الإضافة لا يُعلَّم بعد الاختيار');

  await ctx.window.خلفيات.افتح();
  assert.equal(grid.children.length, 4, 'فتح ثانٍ لا يكرّر البناء');
  assert.equal(calls.fetch, 1, 'الفهرس يُجلب مرّة واحدة');
});

test('٦. خلفيّة واحدة: اختيار صورة يطفئ الثلاثيّة ويعيد بناء منتقيها؛ و«بلا خلفيّة» تزيل كلّ شيء', async () => {
  const { ctx, html, body, grid, store, calls } = makeEnv({ list: LIST, storage: { aiapp_bg3d: 'galaxy' } });
  await ctx.window.خلفيات.افتح();
  grid.children[2].onclick();
  assert.deepEqual(calls.applyBg3D, ['none']);
  assert.equal(calls.buildBg3DPicker, 1);
  grid.children[0].onclick();
  assert.ok(!html.classList.contains('bgimg') && !html.classList.contains('bgimg-dark'));
  assert.equal(body.children[0].style.backgroundImage, '');
  assert.equal(store.has('aiapp_bgimg'), false);
  assert.ok(grid.children[0].classList.contains('active') && !grid.children[2].classList.contains('active'));
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

// v-bg-custom-rotate
const PIC = { id: '1700', data: 'data:image/jpeg;base64,AAAA', لون: '#a0a0a0', فاتحة: true };

test('٨. صورة من الجهاز: تُحفظ على الجهاز بمعرّف custom وتظهر أوّل الشبكة مع × وتُطبَّق فورًا، وحذفها وهي الحاليّة يزيل الخلفيّة', async () => {
  const { ctx, html, body, grid, store, calls } = makeEnv({ list: LIST });
  await ctx.window.خلفيات.افتح();
  assert.equal(ctx.window.خلفيات.أضف(PIC), true);
  assert.deepEqual(JSON.parse(store.get('aiapp_bgimg_custom')), [PIC]);
  assert.equal(grid.children.length, 5, 'أُعيد بناء الشبكة بصورة الجهاز');
  const c = grid.children[2];
  assert.ok(c.classList.contains('bgImgCustom') && c.classList.contains('active') && c.dataset.file === 'custom:1700');
  assert.ok(c.style.backgroundImage.includes(PIC.data), 'مصغّر صورة الجهاز من بياناتها');
  assert.equal(c.children[0].className, 'bgImgDel');
  assert.equal(c.children[0].textContent, '×');
  assert.ok(body.children[0].style.backgroundImage.includes(PIC.data) && html.classList.contains('bgimg-light'), 'طُبّقت بلونها');
  assert.deepEqual(JSON.parse(store.get('aiapp_bgimg')), { ملف: 'custom:1700', لون: '#a0a0a0', فاتحة: true });

  // الاسترجاع عند الإقلاع من صورة الجهاز بلا جلب
  const b = makeEnv({ list: LIST, storage: { aiapp_bgimg: store.get('aiapp_bgimg'), aiapp_bgimg_custom: store.get('aiapp_bgimg_custom') } });
  assert.ok(b.body.children[0].style.backgroundImage.includes(PIC.data) && b.calls.fetch === 0);

  // × يحذف ولا يختار (stopPropagation)، والحاليّة تزول
  let stopped = 0;
  c.children[0].onclick({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  assert.deepEqual(JSON.parse(store.get('aiapp_bgimg_custom')), []);
  assert.equal(grid.children.length, 4);
  assert.ok(!html.classList.contains('bgimg') && !store.has('aiapp_bgimg'), 'حذف الحاليّة = بلا خلفيّة');

  // امتلاء التخزين: تنبيه مترجَم ولا تطبيق
  const full = makeEnv({ list: LIST });
  await full.ctx.window.خلفيات.افتح();
  full.ctx.localStorage.setItem = (k) => { if (k === 'aiapp_bgimg_custom') throw new Error('QuotaExceededError'); };
  assert.equal(full.ctx.window.خلفيات.أضف(PIC), false);
  assert.deepEqual(full.calls.alerts, ['bgImgFull']);
  assert.ok(!full.html.classList.contains('bgimg'));
  assert.deepEqual(calls.swallow, []);
});

test('٩. التبديل التلقائيّ: المدّة تُحفظ وتُعلَّم، ويُطبَّق التالي (صور الجهاز ثمّ المجلّد) كلّ مدّة، و«بلا خلفيّة» تطفئه، والعدّ يُكمل بعد إعادة الفتح', async () => {
  const { ctx, html, grid, rot, store, calls, clock, tick } = makeEnv({ list: LIST });
  await ctx.window.خلفيات.افتح();
  assert.ok(rot.children[0].classList.contains('active'), 'إيقاف مختار افتراضيًّا');
  assert.equal(clock.timers.length, 0, 'لا مؤقّت والتبديل مطفأ');

  rot.children[1].onclick(); // ١٠ دقائق بلا خلفيّة → أوّل صورة فورًا
  await tick();
  assert.equal(store.get('aiapp_bgimg_rotate'), '10');
  assert.equal(store.get('aiapp_bgimg_rotate_at'), String(clock.now));
  assert.ok(rot.children[1].classList.contains('active') && !rot.children[0].classList.contains('active'));
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '01-مدينة.jpg', 'بدأ بأوّل صورة');
  assert.equal(clock.timers.length, 1);

  clock.tick(9 * 60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '01-مدينة.jpg', 'لم تحن');
  clock.tick(60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '02-ثلج.jpg', 'بعد ١٠ دقائق: التالية');
  assert.ok(html.classList.contains('bgimg-light'));
  assert.equal(store.get('aiapp_bgimg_rotate_at'), String(clock.now));
  assert.equal(clock.timers.length, 1, 'أُعيدت الجدولة');
  clock.tick(10 * 60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '01-مدينة.jpg', 'يدور من جديد');

  // صور الجهاز تدخل الدورة قبل المجلّد (الإضافة تطبّقها فورًا ثمّ تستمرّ الدورة منها)
  ctx.window.خلفيات.أضف(PIC);
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, 'custom:1700');
  clock.tick(10 * 60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '01-مدينة.jpg', 'بعد صورة الجهاز تأتي 01');
  clock.tick(10 * 60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, '02-ثلج.jpg');
  clock.tick(10 * 60000); await tick();
  assert.equal(JSON.parse(store.get('aiapp_bgimg')).ملف, 'custom:1700', 'ثمّ صورة الجهاز أوّل الدورة');

  // اختيار يدويّ لا يطفئ التبديل؛ «بلا خلفيّة» تطفئه
  grid.children[3].onclick();
  assert.equal(store.get('aiapp_bgimg_rotate'), '10');
  grid.children[0].onclick();
  assert.equal(store.has('aiapp_bgimg_rotate'), false);
  assert.equal(clock.timers.length, 0, 'المؤقّت أُلغي');
  assert.ok(rot.children[0].classList.contains('active'));
  assert.deepEqual(calls.swallow, []);

  // إعادة الفتح بعد ٤٠ دقيقة من آخر تبديل على مدّة ساعة: يبقى ٢٠ دقيقة لا ساعة كاملة
  const saved = JSON.stringify({ ملف: '01-مدينة.jpg', لون: '#1c2123', فاتحة: false });
  const b = makeEnv({ list: LIST, now: 5_000_000, storage: { aiapp_bgimg: saved, aiapp_bgimg_rotate: '60', aiapp_bgimg_rotate_at: String(5_000_000 - 40 * 60000) } });
  assert.equal(b.clock.timers.length, 1);
  assert.equal(b.clock.timers[0].at - b.clock.now, 20 * 60000);
  b.clock.tick(20 * 60000); await b.tick();
  assert.equal(JSON.parse(b.store.get('aiapp_bgimg')).ملف, '02-ثلج.jpg');
  assert.equal(b.calls.fetch, 1, 'الفهرس يُجلب عند أوّل تبديل');
  // فتح الإعدادات بعدها يعلّم «ساعة»
  await b.ctx.window.خلفيات.افتح();
  assert.ok(b.rot.children[3].classList.contains('active'));
});
