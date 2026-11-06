// tests/tools-exit.test.cjs — v-tools-exit (المالك ٦ نوفمبر: «اذا ادخل في الأدوات مايرجعني المحادثه يعلق في الادوات»).
// المسبار (Chromium بهويّة آيفون، .shots خارج المستودع): بعد فتح الأدوات من الشريط السفليّ ✕ مخفيّة (قرار السحب v-swipe-back)
// والشريط تحت الشاشة (z:70 تحت z:940) — لا مخرج ظاهر، والسحب لليسار (رجوع الآيفون العربيّ) لا يفعل شيئًا.
// هنا شريط التنقّل نفسه (js/ui-wiring.js، القسم ١٠) في vm بمستند مزيّف: «الأدوات» تبديل، وأيّ تبويب آخر يخرج من الأدوات،
// والنقرة المكرّرة لا تعكس التبديل، وارتفاع الشريط في --omNavH؛ والقاعدة التي توقف الشاشة فوقه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/ui-wiring.js');
const CODE = SRC.slice(SRC.indexOf('/* ---------- 10) شريط التنقل السفلي ---------- */'), SRC.indexOf('/* ---------- 11)'));

function world(opts) {
  opts = opts || {};
  let now = 1000000;
  const timers = [];
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; } }; };
  const el = (id) => ({ id, classList: cls(), attrs: {}, hasAttribute(k) { return k in this.attrs; } });
  const els = { sectionsToolsOverlay: el('sectionsToolsOverlay'), sidebar: el('sidebar'), workarea: el('workarea'), settingsDialog: el('settingsDialog'), omranBottomNav: el('omranBottomNav') };
  let navH = opts.navH === undefined ? 51 : opts.navH;
  els.omranBottomNav.getBoundingClientRect = () => ({ height: navH });
  const btn = (k) => {
    const b = { k, classList: cls(), _ls: {}, getAttribute: (a) => (a === 'data-omnav' ? k : null), addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); } };
    b.click = () => (b._ls.click || []).forEach((f) => f.call(b, { type: 'click' }));
    b.touchend = () => (b._ls.touchend || []).forEach((f) => f.call(b, { type: 'touchend' }));
    return b;
  };
  const btns = ['tools', 'chats', 'files', 'settings'].map(btn);
  const vars = {};
  const taps = [];
  let ro = null;
  const ctx = {
    Date: { now: () => now },
    setTimeout: (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; },
    __swallow() {},
    window: { addEventListener() {} },
    ResizeObserver: function (cb) { ro = cb; this.observe = () => {}; },
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: (sel) => (sel === '.omNavBtn' ? btns : []),
      documentElement: { style: { setProperty: (k, v) => { vars[k] = v; } } },
    },
    tap: (sel) => {
      taps.push(sel);
      if (sel === '#btnToggleProjects') els.sidebar.classList.toggle('open');
      if (sel === '#btnToggleHistory') els.workarea.classList.toggle('open');
      if (sel === '#btnSettings') els.settingsDialog.attrs.open = '';
    },
    closeDrawers: () => { els.sidebar.classList.remove('open'); els.workarea.classList.remove('open'); },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const by = (k) => btns.find((b) => b.k === k);
  return {
    els, vars, taps, by,
    tools: () => els.sectionsToolsOverlay.classList.contains('show'),
    tick(ms) { now += ms; timers.filter((t) => !t.done && t.at <= now).forEach((t) => { t.done = true; t.f(); }); },
    resizeNav(h) { navH = h; ro && ro(); },
  };
}

test('١. «الأدوات» يفتح الشاشة، وضغطه وهي مفتوحة يرجع للمحادثة (كان يبقيها مفتوحة)', () => {
  const w = world();
  w.by('tools').click();
  assert.equal(w.tools(), true, 'تفتح');
  assert.equal(w.by('tools').classList.contains('active'), true, 'التبويب مضيء وهي ظاهرة');
  w.tick(800);
  w.by('tools').click();
  assert.equal(w.tools(), false, 'الضغطة الثانية = رجوع للمحادثة');
  assert.equal(w.by('tools').classList.contains('active'), false);
});

test('٢. أيّ تبويب آخر يخرج من الأدوات — «المحادثات» لا يفتح الدرج فوقها فتبقى بعد اختيار محادثة', () => {
  for (const k of ['chats', 'files', 'settings']) {
    const w = world();
    w.by('tools').click();
    w.tick(800);
    w.by(k).click();
    assert.equal(w.tools(), false, k + ': الأدوات أُغلقت');
  }
  const w = world();
  w.by('tools').click(); w.tick(800);
  w.by('chats').click();
  assert.equal(w.els.sidebar.classList.contains('open'), true, 'درج المحادثات يفتح كما كان');
  w.els.sidebar.classList.remove('open'); // اختيار محادثة يغلق الدرج
  assert.equal(w.tools(), false, 'المحادثة هي الظاهرة، لا الأدوات');
});

test('٣. لا فتح ثمّ إغلاق: نقرة أصليّة متأخّرة بعد بديل اللمس تُحسب مرّة، وضغطتا المستخدم الحقيقيّتان تُحسبان كلتاهما', () => {
  const w = world();
  // بديل iOS: لمس بلا click خلال ٤٥٠ م‌ث ← نطلقها نحن، ثمّ تصل النقرة الأصليّة متأخّرة
  w.by('tools').touchend();
  w.tick(460);
  assert.equal(w.tools(), true, 'البديل فتحها');
  w.tick(100);
  w.by('tools').click();
  assert.equal(w.tools(), true, 'النقرة المتأخّرة لا تغلقها');
  w.tick(800);
  w.by('tools').click();
  assert.equal(w.tools(), false, 'بعد المهلة: الضغطة رجوع للمحادثة');
  const w2 = world();
  w2.by('tools').click(); w2.tick(150); w2.by('tools').click();
  assert.equal(w2.tools(), false, 'فتح ثمّ رجوع سريع بيد المستخدم = يُحسبان');
  // نقرة عاديّة: البديل لا يكرّرها
  const w3 = world();
  w3.by('tools').touchend(); w3.by('tools').click(); w3.tick(500);
  assert.equal(w3.tools(), true, 'البديل يسكت حين تصل النقرة');
});

test('٤. ارتفاع الشريط الظاهر في --omNavH، وصفر حين يختفي (الحاسوب، لوحة المفاتيح)', () => {
  const w = world({ navH: 51 });
  assert.equal(w.vars['--omNavH'], '51px');
  w.resizeNav(85); // آيفون بحافّة آمنة
  assert.equal(w.vars['--omNavH'], '85px');
  w.resizeNav(0); // display:none
  assert.equal(w.vars['--omNavH'], '0px');
  assert.equal(world({ navH: 0 }).vars['--omNavH'], '0px', 'الحاسوب: الشريط مخفيّ');
});

test('٥. الشاشة تقف فوق الشريط (لا تغطّيه)، بلا ✕ جديدة — قرار السحب باقٍ — والوسوم مرفوعة', () => {
  const css = read('css/redesign.css');
  assert.ok(css.includes('#sectionsToolsOverlay{bottom:var(--omNavH, 0px);}'), 'القاعدة');
  const i = css.indexOf('#sectionsToolsOverlay{bottom:var(--omNavH, 0px);}');
  const pre = css.slice(0, i);
  assert.equal((pre.match(/\{/g) || []).length, (pre.match(/\}/g) || []).length, 'خارج أيّ @media: تعمل في كلّ مقاس، والحاسوب صفر');
  const html = read('index.html');
  const tag = (re) => { const m = re.exec(html); return m ? { at: m.index, v: Number(m[1]) } : { at: -1, v: 0 }; };
  const tok = tag(/css\/tokens\.css\?v=(\d+)/), red = tag(/css\/redesign\.css\?v=(\d+)/), wir = tag(/\/js\/ui-wiring\.js\?v=(\d+)/);
  assert.ok(tok.at >= 0 && tok.at < red.at, 'redesign بعد tokens فيغلب inset:0 بالخصوصيّة نفسها');
  assert.ok(red.v >= 699 && wir.v >= 669, 'وسما الكاش مرفوعان (v-tools-exit: ٦٩٨←٦٩٩ و٦٦٨←٦٦٩)');
  for (const f of ['css/tokens.css', 'css/modules.css', 'css/tool-card-images.css']) {
    assert.ok(!/#sectionsToolsOverlay[^{]*\{[^}]*\b(bottom|inset)\s*:/.test(read(f).replace('#sectionsToolsOverlay{display:none; position:fixed; inset:0;', '')), f + ': لا قاعدة لاحقة تعيد التغطية');
  }
  const sb = read('js/app-05-swipe-back.js');
  assert.ok(sb.includes("sectionsToolsOverlay: 'stpCloseBtn'"), 'السحب والرجوع وEsc كما هي و✕ مخفيّة');
});
