'use strict';
/* v-select-mouse (تدقيق الإنتاج ١٨–١٩ أكتوبر، قائمة المحادثات): التحديد المتعدّد بالضغط المطوّل (js/delete-confirm.js) على الحاسوب بالفأرة —
   ضغط ٠٫٩ث يُظهر «1 عنصر محدد»، والإفلات يمحوه: الإفلات يولّد «click» على الصفّ، ومعالج النقر يعكس التحديد (toggle) ما دام فيه محدَّد.
   لمس الهاتف لا يولّد click بعد الضغط المطوّل فكان يعمل (محاكاة اللمس في Chromium تولّده، فانكسرت هناك أيضًا — والإصلاح يغطّيها).
   الإصلاح: المؤقّت يتذكّر صفّه، ونقرة الختام داخل الصفّ تُبتلع مرّة واحدة، وكلّ pointerdown يمسح الذكرى.
   الملفّ الحقيقيّ يُشغَّل في vm بصفحة مزيّفة صغيرة (على نمط cpu-status). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DC = fs.readFileSync(path.join(ROOT, 'js', 'delete-confirm.js'), 'utf8');

/* ── صفحة مزيّفة: ما يلزم delete-confirm.js وحده ── */
function matchesOne(el, s) {
  s = s.trim();
  let m;
  if ((m = /^\.([\w-]+)$/.exec(s))) return el.classList.contains(m[1]);
  if ((m = /^#([\w-]+)$/.exec(s))) return el.id === m[1];
  if ((m = /^\[([\w-]+)\]$/.exec(s))) return el.hasAttribute(m[1]);
  if ((m = /^\[([\w-]+)="([^"]*)"\]$/.exec(s))) return el.getAttribute(m[1]) === m[2];
  if ((m = /^\[([\w-]+)\*="([^"]*)"\]$/.exec(s))) return String(el.getAttribute(m[1]) || '').includes(m[2]);
  if (/^[a-z]+$/.test(s)) return el.tagName === s.toUpperCase();
  return false;
}
function makeEl(tag) {
  const cls = new Set();
  const attrs = new Map();
  const el = {
    tagName: String(tag).toUpperCase(), id: '', title: '', children: [], parentNode: null, dataset: {}, style: {}, isConnected: true, _text: '',
    classList: {
      add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; },
    },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => cls.add(x)); },
    get textContent() { return el._text + el.children.map((c) => c.textContent).join(''); },
    set textContent(v) { el._text = String(v); el.children = []; },
    set innerHTML(v) { el.children = []; for (const m of String(v).matchAll(/<(\w+) id="([\w-]+)"/g)) { const c = makeEl(m[1]); c.id = m[2]; el.appendChild(c); } },
    setAttribute: (k, v) => { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    appendChild: (c) => { c.parentNode = el; el.children.push(c); return c; },
    contains: (n) => { for (let x = n; x; x = x.parentNode) if (x === el) return true; return false; },
    matches: (sel) => sel.split(',').some((s) => matchesOne(el, s)),
    closest: (sel) => { for (let x = el; x && x.matches; x = x.parentNode) if (x.matches(sel)) return x; return null; },
    querySelectorAll: (sel) => { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); }); walk(el); return out; },
    querySelector: (sel) => {
      const sc = /^:scope > (.+)$/.exec(sel);
      if (sc) return el.children.find((c) => c.matches(sc[1])) || null;
      return el.querySelectorAll(sel)[0] || null;
    },
  };
  return el;
}

function boot({ lang = 'ar', dir = (lang === 'ar' || lang === 'ur') ? 'rtl' : 'ltr' } = {}) {
  const html = makeEl('html');
  html.lang = lang;
  html.dir = dir; /* كما يكتبه applyLanguage (app-04) لكلّ لغة */
  const head = html.appendChild(makeEl('head'));
  const body = html.appendChild(makeEl('body'));
  const history = body.appendChild(makeEl('div'));
  history.id = 'history';
  const rows = ['p1', 'p2'].map((pid) => {
    const row = history.appendChild(makeEl('div'));
    row.className = 'hist-item';
    row.dataset.pid = pid;
    const thumb = row.appendChild(makeEl('div')); thumb.className = 'hist-thumb';
    const title = row.appendChild(makeEl('span')); title.className = 'hist-title';
    const menu = row.appendChild(makeEl('button')); menu.className = 'hist-menu-btn';
    return { row, title, menu };
  });
  const other = body.appendChild(makeEl('button'));
  other.id = 'someButton';
  const listeners = {};
  const timers = [];
  let styleText = '';
  const document = {
    documentElement: html, head, body,
    getElementById: (id) => html.querySelectorAll('#' + id)[0] || null,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    createElement: (tag) => {
      const el = makeEl(tag);
      if (tag === 'style') Object.defineProperty(el, 'textContent', { set(v) { styleText = String(v); }, get() { return styleText; } });
      return el;
    },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const sb = {
    document, navigator: {}, console, CSS: { escape: (s) => s },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: (f) => { f(); return 1; },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(DC, sb);
  const fire = (type, target, extra = {}) => {
    const ev = { type, target, clientX: 10, clientY: 10, defaultPrevented: false, stopped: false, ...extra,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    (listeners[type] || []).forEach((fn) => { if (!ev.stopped) fn(ev); });
    return ev;
  };
  const runTimers = () => { for (let i = 0; i < timers.length; i++) { const f = timers[i]; timers[i] = null; if (f) f(); } };
  const bar = () => html.querySelectorAll('#omranSelectionBar')[0];
  return {
    html, rows, other, bar, styleText: () => styleText,
    /* ضغطة فأرة كاملة: نزول ← (مطوّل؟) ← صعود ← النقرة التي يولّدها المتصفّح */
    mouse(target, { hold = false } = {}) {
      fire('pointerdown', target, { pointerType: 'mouse' });
      if (hold) runTimers();
      fire('pointerup', target, { pointerType: 'mouse' });
      return fire('click', target, { detail: 1 });
    },
    /* لمس مطوّل: لا يولّد المتصفّح click بعده */
    touchHold(target) { fire('pointerdown', target, { pointerType: 'touch' }); runTimers(); fire('pointerup', target, { pointerType: 'touch' }); },
    click: (target) => fire('click', target, { detail: 0 }),
    selected: () => rows.map((r) => r.row.classList.contains('omran-selected')),
    count: () => bar() ? bar().querySelector('#omranSelectionCount').textContent : '',
  };
}

test('١. الحاسوب: ضغط مطوّل بالفأرة ثمّ إفلات — الصفّ يبقى محدَّدًا والشريط ظاهرًا، والنقرة لا تفتح المحادثة', () => {
  const b = boot();
  const ev = b.mouse(b.rows[0].title, { hold: true });
  assert.deepEqual(b.selected(), [true, false], 'نقرة الإفلات كانت تعكس التحديد فورًا');
  assert.equal(b.count(), '1 عنصر محدد');
  assert.ok(b.bar().classList.contains('show'));
  assert.ok(b.html.classList.contains('omran-selection-mode'));
  assert.ok(ev.stopped && ev.defaultPrevented, 'نقرة ختام الضغط المطوّل لا تصل onclick العنوان (فتح المحادثة)');
});

test('٢. بعده النقر العاديّ كما كان: نقرة تضيف صفًّا آخر، ونقرة على المحدَّد تزيله', () => {
  const b = boot();
  b.mouse(b.rows[0].title, { hold: true });
  b.mouse(b.rows[1].title);
  assert.deepEqual(b.selected(), [true, true], 'النقرة التالية لا تُبتلع');
  assert.equal(b.count(), '2 عناصر محددة');
  b.mouse(b.rows[0].title);
  assert.deepEqual(b.selected(), [false, true]);
  b.mouse(b.rows[1].title);
  assert.deepEqual(b.selected(), [false, false]);
  assert.ok(!b.bar().classList.contains('show'));
});

test('٣. ضغط مطوّل على صفّ ثانٍ وفيه تحديد: يُضاف ولا ينعكس — وعلى زرّ ⋮ داخل الصفّ كذلك', () => {
  const b = boot();
  b.mouse(b.rows[0].title, { hold: true });
  b.mouse(b.rows[1].menu, { hold: true });
  assert.deepEqual(b.selected(), [true, true]);
});

test('٤. الجوّال بلا تغيير: لمس مطوّل يحدّد، واللمسة التالية على صفّ آخر تعمل، ونقرة برمجيّة خارج الصفّ لا تُبتلع', () => {
  const b = boot();
  b.touchHold(b.rows[0].row);
  assert.deepEqual(b.selected(), [true, false]);
  const ev = b.click(b.other);
  assert.ok(!ev.stopped, 'ذكرى الضغط المطوّل لا تبتلع نقرة على عنصر آخر');
  b.mouse(b.rows[1].row); /* لمسة قصيرة: نزول وصعود ونقرة */
  assert.deepEqual(b.selected(), [true, true]);
});

test('٥. الجوّال: بعد لمس مطوّل بلا click، لمسة قصيرة على الصفّ نفسه تزيل تحديده (الضغطة الجديدة تمسح الذكرى فلا تُبتلع)', () => {
  const b = boot();
  b.touchHold(b.rows[0].row);
  assert.deepEqual(b.selected(), [true, false]);
  const ev = b.mouse(b.rows[0].title);
  assert.ok(ev.stopped, 'النقرة عولجت كتبديل تحديد');
  assert.deepEqual(b.selected(), [false, false]);
  assert.ok(!b.bar().classList.contains('show'));
});

test('٦. بلا تحديد: النقرة القصيرة على صفّ تمرّ (تفتح المحادثة) كما كانت', () => {
  const b = boot();
  const ev = b.mouse(b.rows[0].title);
  assert.ok(!ev.stopped && !ev.defaultPrevented);
  assert.deepEqual(b.selected(), [false, false]);
});

test('٧. وسم الكاش ارتفع: delete-confirm.js في ui-wiring، وui-wiring في index.html', () => {
  const uw = fs.readFileSync(path.join(ROOT, 'js', 'ui-wiring.js'), 'utf8');
  const m = /\/js\/delete-confirm\.js\?v=(\w+)'/.exec(uw);
  assert.ok(m && m[1] !== '20260929a', 'وسم delete-confirm.js');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const v = /\/js\/ui-wiring\.js\?v=(\d+)/.exec(html);
  assert.ok(v && Number(v[1]) >= 663, 'وسم ui-wiring.js');
});

/* ── v-select-mark-dir (تدقيق ١٨–١٩ أكتوبر، لقطة ١١٤ جوّال إنجليزيّ): دائرة ✓ تركب فوق أيقونة الملفّ في كلّ صفّ أثناء التحديد،
   وبالإنجليزيّ الشريط «selected item 1» بترتيب عربيّ (direction:rtl ثابت في CSS الشريط). ── */
const ruleOf = (css, sel) => { const i = css.indexOf(sel + '{'); if (i < 0) return null; return css.slice(i + sel.length + 1, css.indexOf('}', i)); };

test('٨. الشريط يتبع اتّجاه الصفحة: الإنجليزيّ ltr («1 selected item» و✕ في أوّله)، والعربيّ والأرديّ rtl — لا direction ثابت في CSS', () => {
  for (const [lang, want, text] of [['en', 'ltr', '1 selected item'], ['fr', 'ltr', '1 selected item'], ['ar', 'rtl', '1 عنصر محدد'], ['ur', 'rtl', '1 عنصر محدد']]) {
    const b = boot({ lang });
    b.mouse(b.rows[0].title, { hold: true });
    assert.equal(b.bar().dir, want, lang + ': اتّجاه الشريط');
    assert.equal(b.count(), text, lang);
    const rule = ruleOf(b.styleText(), '#omranSelectionBar');
    assert.ok(rule, 'قاعدة الشريط');
    assert.doesNotMatch(rule, /direction\s*:/, lang + ': direction ثابت يغلب سمة dir');
  }
});

test('٩. دائرة ✓ في صفّ المحادثة والدرس على طرف الصفّ الآخر (مكان ⋮ / 🗑 المخفيّين في وضع التحديد) لا فوق الأيقونة في أوّله', () => {
  const b = boot();
  b.mouse(b.rows[0].title, { hold: true });
  const css = b.styleText();
  const mark = ruleOf(css, '.hist-item>.omran-select-mark,.eduLessonRow>.omran-select-mark');
  assert.ok(mark, 'قاعدة موضع الدائرة في صفّي المحادثة والدرس');
  assert.match(mark, /inset-inline-start:auto/);
  assert.match(mark, /inset-inline-end:\d+px/);
  assert.match(mark, /top:50%/);
  assert.match(mark, /transform:translateY\(-50%\)/);
  // ⋮ و🗑 يختفيان في وضع التحديد فتأخذ الدائرة مكانهما (القاعدة القائمة)
  assert.ok(css.includes('.omran-selection-mode .hist-menu-btn,.omran-selection-mode .eduDelBtn{visibility:hidden!important}'));
  // صفوف لوحة المالك (data-omran-admin) بلا تغيير: زرّ حذفها ظاهر في طرفها
  assert.match(ruleOf(css, '.omran-select-mark'), /top:8px;inset-inline-start:8px/);
});

test('١٠. وسما الكاش ارتفعا: delete-confirm.js ‏20261019b، وui-wiring.js ‏664', () => {
  const uw = fs.readFileSync(path.join(ROOT, 'js', 'ui-wiring.js'), 'utf8');
  assert.ok(uw.includes("/js/delete-confirm.js?v=20261019b'"), 'وسم delete-confirm.js');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('/js/ui-wiring.js?v=664'), 'وسم ui-wiring.js');
});
