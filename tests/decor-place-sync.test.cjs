'use strict';
/* v-decor-place-sync (تدقيق ١٨ أكتوبر، الديكور؛ أمر المالك ٢٠ أكتوبر، الدفعة ٤ «الديكور يحذف الصورة بدون تنبيه»؛ من ed5d3053 في ten-a): نوع المكان صادق والصورة لا تسقط بلا تنبيه.
   ١) نقاط البوستر ورقائقه و«أعطني أفكارًا» كانت تكتب نوع المكان بلا حدث، وبطاقة «نوع المكان» لا تتحدّث إلّا من المعرض —
      فيولّد «صمم الغرفة» مجلسًا والبطاقة تقول «من صورتي». البطاقة الآن تتبع القائمة (مستمع change واحد في design-sels)،
      والنقاط تحدّثها مباشرة بلا change (فلا يُخفى مربّع الرفع لمجرّد التصفّح).
   ٢) رفع صورة بعد اختيار مكان يرجع «نوع المكان» إلى «من صورتي» (كان المكان يُسقط الصورة بلا تنبيه)، ويبقى ضمان v-tool-drop.
   ٣) ‎.omUpArt{display:block !important}‎ (v-upload-art) كان يغلب إخفاء مربّع الرفع المضمَّن — الإخفاء الآن مضمَّن مهمّ.
   ٤) الرجوع إلى «من صورتي» يعيد معاينة الصورة المرفوعة (كانت تبقى مخفيّة والصورة تُرسل).
   الكود الحقيقيّ (IIFE الديكور من app-12 وselTrigger من design-sels) في vm بـDOM مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const ST = read('js/app-12-studios.js');
const DECOR = ST.slice(0, ST.indexOf('/* v-tools-i18n-full'));
const DS = read('js/design-sels.js');
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 15));

function mkStyle() {
  const s = { cssText: '' };
  const prio = {};
  Object.defineProperty(s, 'setProperty', { value: (k, v, p) => { s[k] = v; prio[k] = p || ''; } });
  Object.defineProperty(s, 'removeProperty', { value: (k) => { s[k] = ''; delete prio[k]; } });
  Object.defineProperty(s, 'getPropertyPriority', { value: (k) => prio[k] || '' });
  return s;
}
function mkEl(tag, id) {
  const ls = {};
  const cls = new Set();
  let html = '';
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: id || '', style: mkStyle(), dataset: {}, children: [], parentElement: null, parentNode: null,
    value: '', textContent: '', className: '', disabled: false, files: null, options: [], attrs: {}, listeners: ls,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } },
    addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
    removeEventListener() {},
    dispatchEvent(ev) { (ls[ev.type] || []).slice().forEach((f) => f.call(el, ev)); return true; },
    appendChild(c) { c.parentElement = el; c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c) { return el.appendChild(c); },
    insertAdjacentElement(pos, c) { return c; },
    remove() { el.removed = true; const p = el.parentElement; if (p) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    removeAttribute(k) { delete el.attrs[k]; }, hasAttribute(k) { return k in el.attrs; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    scrollIntoView() {}, focus() {}, setPointerCapture() {}, getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0 }; },
    click() { if (typeof el.onclick === 'function') return el.onclick({ preventDefault() {}, stopPropagation() {} }); },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); el.children = []; } });
  return el;
}

/* بيئة الديكور: الأماكن «من صورتي/صالة/مجلس/مطبخ»، مربّع الرفع ‎.dzArea‎ داخل النافذة، والضغط بديل محدَّد */
function decorEnv(reply) {
  const els = {};
  const byId = (id) => els[id] || (els[id] = mkEl('div', id));
  const created = [];
  const fetched = [];
  const place = byId('designAiPlace');
  place.options = [['', 'من صورتي'], ['living', 'صالة'], ['majlis', 'مجلس'], ['kitchen', 'مطبخ']].map(([value, textContent]) => ({ value, textContent }));
  const dz = mkEl('div'); dz.className = 'dzArea omUpArt omUpDecor';
  byId('designAiModal').querySelector = (q) => (q === '.dzArea' ? dz : null);
  byId('designAiStyle').value = 'modern';
  const ctx = {
    console, Promise, JSON, Math, Array, Object, String, Number, Error, Date, RegExp, setTimeout, clearTimeout, Response,
    $: (s) => byId(String(s).replace(/^#/, '')),
    document: { getElementById: (id) => byId(id), createElement: (t) => { const e = mkEl(t); created.push(e); return e; }, documentElement: mkEl('html') },
    window: { addEventListener() {}, innerHeight: 900 },
    localStorage: { getItem: (k) => (k === 'aiapp_lang' ? 'ar' : null), setItem() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    Event: class { constructor(type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); } },
    __swallow() {}, authGet: () => 'tok', closeHeaderMenu() {},
    fetch: async (u, o) => {
      fetched.push({ u: String(u), body: o && o.body ? JSON.parse(o.body) : null });
      if (reply) { const r = reply(String(u)); if (r) return r; }
      return new Response(JSON.stringify({ error: 'x' }), { status: 500 });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(DECOR, ctx);
  ctx.__compressImg = (file, cb) => cb('data:image/jpeg;base64,QUJD'); // الضغط الحقيقيّ مختبَر في tool-drop ١٠
  const refreshes = [];
  place.__tr = { refresh() { refreshes.push(place.value); } }; // ما يضعه selTrigger في design-sels
  const hot = (v) => byId('designAiIdeaChips').children[0].children.find((b) => b.dataset && b.dataset.place === v);
  const upload = () => { const fi = byId('designAiFileInput'); fi.files = [{ name: 'room.jpg', type: 'image/jpeg' }]; fi.onchange(); };
  const pick = (v) => { place.value = v; place.dispatchEvent(new ctx.Event('change', { bubbles: true })); };
  const generate = async () => { const n = fetched.length; await byId('designAiGenerateBtn').onclick(); return fetched.slice(n).find((f) => f.u === '/api/design-create'); };
  return { ctx, els, byId, dz, place, created, fetched, refreshes, hot, upload, pick, generate };
}

/* محرّك تتالٍ صغير لخاصّيّة واحدة: المضمَّن المهمّ > ورقة الأنماط المهمّة > المضمَّن > ورقة الأنماط */
function cascade(sheetDecl, inlineVal, inlinePrio) {
  const sheetImp = /!important/.test(sheetDecl);
  const sheetVal = sheetDecl.replace(/!important/, '').trim();
  if (inlineVal && inlinePrio === 'important') return inlineVal;
  if (sheetImp) return sheetVal;
  return inlineVal || sheetVal;
}

test('١ design-sels: بطاقة «نوع المكان» تتبع القائمة — مستمع change واحد ولو أُعيد بناؤها، والاسم اسم المختار', () => {
  const one = (name) => { const l = DS.split('\n').find((x) => x.startsWith('  function ' + name + '(')); assert.ok(l, name); return l; };
  const i = DS.indexOf('  function selTrigger(s){');
  const selTrigger = DS.slice(i, DS.indexOf('\n  }\n', i) + 4);
  const made = [];
  const ctx = {
    window: { omranPicker: { trigger(get) { const tr = { get, el: { classList: { add() {} } }, n: 0, refresh() { tr.n++; } }; made.push(tr); return tr; } } },
    document: { documentElement: { lang: 'ar' } },
    selImg: () => '', roomBg: () => '', palSub: () => '', openCfg: () => ({}),
  };
  vm.createContext(ctx);
  vm.runInContext(one('optTxt') + '\n' + one('curOpt') + '\n' + selTrigger + '\nthis.selTrigger = selTrigger;', ctx);
  const s = mkEl('select', 'designAiPlace');
  s.options = [{ value: '', textContent: 'من صورتي' }, { value: 'majlis', textContent: 'مجلس' }];
  ctx.selTrigger(s);
  assert.equal(s.__tr, made[0], 'البطاقة محفوظة على القائمة');
  s.value = 'majlis'; s.dispatchEvent({ type: 'change' });
  assert.equal(made[0].n, 1, 'تغيّر القائمة يحدّث البطاقة');
  assert.equal(made[0].get().name, 'مجلس');
  ctx.selTrigger(s); // تبديل اللغة يعيد البناء
  s.dispatchEvent({ type: 'change' });
  assert.equal(s.__tr, made[1]);
  assert.equal(made[1].n, 1, 'البطاقة الجديدة تتحدّث');
  assert.equal(made[0].n, 1, 'مستمع واحد لا اثنان (علم data-trhook)');
  assert.equal((s.listeners.change || []).length, 1);
});

test('٢ نقطة البوستر تحدّث البطاقة بلا change (مربّع الرفع باقٍ)، و«أعطني أفكارًا» يفرّغها ويحدّثها', async () => {
  const E = decorEnv();
  E.hot('majlis').onclick();
  assert.equal(E.place.value, 'majlis');
  assert.deepEqual(E.refreshes, ['majlis'], 'البطاقة تقول «مجلس»');
  assert.notEqual(E.dz.style.display, 'none', 'تصفّح الأفكار لا يخفي مربّع الرفع');
  E.byId('designAiIdeaText').value = 'مجلس فخم';
  E.byId('designAiIdeaGo').onclick();
  assert.equal(E.place.value, '');
  assert.deepEqual(E.refreshes, ['majlis', ''], 'والرجوع إلى «من صورتي» يظهر في البطاقة');
  await tick();
});

test('٣ رفع صورة بعد اختيار مكان يرجع «من صورتي» بحدث change: المربّع والمعاينة ظاهران والصورة تُرسل', async () => {
  const E = decorEnv();
  E.pick('living');
  let changes = 0; E.place.addEventListener('change', () => { changes++; });
  E.upload();
  assert.equal(E.place.value, '', 'المكان يرجع «من صورتي»');
  assert.equal(changes, 1, 'بحدث change فتتبعه البطاقة وsyncPlace');
  assert.notEqual(E.dz.style.display, 'none');
  assert.equal(E.byId('designAiSourcePreview').style.display, 'block');
  const req = await E.generate();
  assert.equal(req.body.imageBase64, 'QUJD', 'صورتك هي ما يُرسل');
  assert.equal(req.body.place, '');
});

test('٤ اختيار مكان يخفي مربّع الرفع فعلًا رغم ‎.omUpArt{display:block !important}‎، والرجوع يعيده', () => {
  const css = read('css/رفع-الصور.css');
  const rule = (css.match(/\.omUpArt\{([^}]*)\}/) || [])[1] || '';
  const decl = (rule.match(/display:([^;]*)/) || [])[1];
  assert.equal(decl, 'block !important', 'قاعدة v-upload-art كما هي');
  const E = decorEnv();
  E.pick('living');
  assert.equal(cascade(decl, E.dz.style.display, E.dz.style.getPropertyPriority('display')), 'none', 'المضمَّن المهمّ يغلب');
  E.pick('');
  assert.equal(cascade(decl, E.dz.style.display, E.dz.style.getPropertyPriority('display')), 'block', 'والرجوع يعيد المربّع');
});

test('٥ رفع ← صالة ← «من صورتي»: المكان يرسل المكان وحده، والرجوع يعيد المعاينة وتُرسل الصورة', async () => {
  const E = decorEnv();
  E.upload();
  const pv = E.byId('designAiSourcePreview');
  assert.equal(pv.style.display, 'block');
  E.pick('living');
  assert.equal(pv.style.display, 'none');
  let req = await E.generate();
  assert.equal(req.body.place, 'living');
  assert.equal(req.body.imageBase64, '');
  E.pick('');
  assert.equal(pv.style.display, 'block', 'المعاينة ترجع');
  req = await E.generate();
  assert.equal(req.body.place, '');
  assert.equal(req.body.imageBase64, 'QUJD', 'photoOn صحيح');
});
