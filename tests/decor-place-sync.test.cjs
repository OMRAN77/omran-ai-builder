'use strict';
/* v-decor-place-sync (تدقيق ١٨ أكتوبر، الديكور؛ أمر المالك ٢٠ أكتوبر، الدفعة ٤ «الديكور يحذف الصورة بدون تنبيه»؛ من ed5d3053 في ten-a): نوع المكان صادق والصورة لا تسقط بلا تنبيه.
   ١) نقاط البوستر ورقائقه و«أعطني أفكارًا» كانت تكتب نوع المكان بلا حدث، وبطاقة «نوع المكان» لا تتحدّث إلّا من المعرض —
      فيولّد «صمم الغرفة» مجلسًا والبطاقة تقول «من صورتي». البطاقة الآن تتبع القائمة (مستمع change واحد في design-sels)،
      والنقاط تحدّثها مباشرة بلا change (فلا يُخفى مربّع الرفع لمجرّد التصفّح).
   ٢) رفع صورة بعد اختيار مكان يرجع «نوع المكان» إلى «من صورتي» (كان المكان يُسقط الصورة بلا تنبيه)، ويبقى ضمان v-tool-drop.
   ٣) و٤) كان اختيار المكان يخفي مربّع الرفع (مضمَّن مهمّ يغلب ‎.omUpArt{display:block !important}‎)؛ v-decor-upload-top (المالك ٢٤ أكتوبر:
      «اذا فتحت الأفكار خاصية التحميل ماتسكر») ألغى إخفاء المربّع (٤): مكان مختار يخفي المعاينة وحدها ويقول المربّع «لم يتم اختيار ملف»
      والمكان يُرسل، و«من صورتي» يعيدهما والصورة تُرسل (٥)؛ وصندوق الأفكار لا يكتب المكان وصورتك قيد الاستعمال (٧، ٨).
   ٩) اسم الملفّ يصمد لتبديل اللغة (v-decor-file-lang). ١٠) «قبل» في السحّاب صورة الطلب ولو رُفعت أخرى أثناءه (v-decor-before-pin).
   ١١) «ولّد ٤ تصاميم» في صندوق الأفكار يولّد ما تتصفّحه بلا صورتك، ٤ تصاميم (v-decor-ideas-ai).
   ٥) المعرض: عدد «… صورة» يتبع الصور الظاهرة بعد سقوط المكسورة، وصفر = «ما حصلت صورًا»، والصور بلا مُحيل.
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
  assert.equal(changes, 1, 'بحدث change فتتبعه البطاقة');
  assert.notEqual(E.dz.style.display, 'none');
  assert.equal(E.byId('designAiSourcePreview').style.display, 'block');
  const req = await E.generate();
  assert.equal(req.body.imageBase64, 'QUJD', 'صورتك هي ما يُرسل');
  assert.equal(req.body.place, '');
});

test('٤ (v-decor-upload-top) اختيار مكان من المعرض لا يخفي مربّع الرفع — لا display مضمَّن عليه، فيبقى ‎.omUpArt{display:block !important}‎', () => {
  const css = read('css/رفع-الصور.css');
  const rule = (css.match(/\.omUpArt\{([^}]*)\}/) || [])[1] || '';
  const decl = (rule.match(/display:([^;]*)/) || [])[1];
  assert.equal(decl, 'block !important', 'قاعدة v-upload-art كما هي');
  const E = decorEnv();
  for (const v of ['living', '', 'majlis']) {
    E.pick(v);
    assert.equal(E.dz.style.display || '', '', 'لا إخفاء مضمَّن مع «' + v + '»');
    assert.equal(cascade(decl, E.dz.style.display, E.dz.style.getPropertyPriority('display')), 'block', 'المربّع ظاهر مع «' + v + '»');
  }
});

test('٥ (v-decor-upload-top) رفع ← صالة ← «من صورتي»: المكان يخفي المعاينة وحدها ويقول المربّع «لم يتم اختيار ملف» ويُرسل المكان؛ والرجوع يعيد صورتك وتُرسل', async () => {
  const E = decorEnv();
  E.upload();
  const pv = E.byId('designAiSourcePreview');
  const fn = E.byId('designAiFileName');
  assert.equal(pv.style.display, 'block');
  assert.equal(fn.textContent, 'room.jpg');
  E.pick('living');
  assert.equal(pv.style.display, 'none', 'تصميم بلا صورة — المعاينة لا تكذب');
  assert.equal(fn.textContent, 'fileNoneChosen', 'المربّع يقول «لم يتم اختيار ملف» (مفتاح الترجمة القائم)');
  assert.equal(E.dz.style.display || '', '', 'والمربّع نفسه ظاهر');
  let req = await E.generate();
  assert.equal(req.body.place, 'living', 'المكان المعروض في البطاقة هو ما يُرسل');
  assert.equal(req.body.imageBase64, '');
  E.pick('');
  assert.equal(pv.style.display, 'block', 'المعاينة ترجع');
  assert.equal(fn.textContent, 'room.jpg', 'واسم الملفّ');
  req = await E.generate();
  assert.equal(req.body.place, '');
  assert.equal(req.body.imageBase64, 'QUJD', 'photoOn صحيح');
});

test('٦ المعرض: العدد يتبع الصور الظاهرة، وصفر = «ما حصلت صورًا» مع زرّ التوليد، والصور بلا مُحيل', async () => {
  const urls = Array.from({ length: 8 }, (_, i) => 'https://i.pinimg.com/736x/' + i + '.jpg');
  const E = decorEnv((u) => (u === '/api/design-ideas' ? new Response(JSON.stringify({ images: urls, count: 8 }), { status: 200 }) : null));
  E.hot('majlis').onclick();
  await tick(30);
  const imgs = E.created.filter((e) => e.tagName === 'IMG' && urls.includes(e.src));
  assert.equal(imgs.length, 8);
  for (const im of imgs) assert.equal(im.referrerPolicy, 'no-referrer', 'بلا مُحيل — مواقع تمنع الربط بالمُحيل');
  const st = E.byId('designAiIdeaStatus');
  assert.match(st.textContent, /^🖼️ 8 /);
  imgs.slice(0, 3).forEach((im) => im.onerror());
  assert.match(st.textContent, /^🖼️ 5 /, 'ثلاث مكسورة سقطت: ٥ لا ٨');
  imgs.slice(3).forEach((im) => im.onerror());
  assert.match(st.textContent, /ما حصلت صورًا/, 'كلّها سقطت');
  assert.equal(E.byId('designAiIdeaGallery').style.display, 'none');
  assert.equal(E.byId('designAiIdeaAI').style.display, '', 'زرّ التوليد ظاهر');
});

test('٧ (v-decor-upload-top) «إذا فتحت الأفكار خاصية التحميل ما تسكّر»: مع صورة مرفوعة نقطة البوستر و«أعطني أفكارًا» لا تكتبان المكان، وإعادة فتح النافذة لا تخفي شيئًا، وصورتك تُرسل', async () => {
  const E = decorEnv();
  E.upload();
  E.hot('majlis').onclick();
  assert.equal(E.place.value, '', 'البطاقة باقية «من صورتي» — صورتك ما يُصمَّم');
  E.byId('designAiIdeaText').value = 'مجلس فخم';
  E.byId('designAiIdeaGo').onclick();
  assert.equal(E.place.value, '');
  const ideasAsked = E.fetched.filter((f) => f.u === '/api/design-ideas').map((f) => f.body.place || f.body.q);
  assert.deepEqual(ideasAsked, ['majlis', 'مجلس فخم'], 'والأفكار تُجلب كما هي');
  E.byId('designAiCloseBtn').onclick();
  const open = E.byId('btnDesignAI');
  open.onclick();
  open.dispatchEvent(new E.ctx.Event('click'));
  await tick(30);
  assert.equal(E.dz.style.display || '', '', 'إعادة الفتح لا تخفي مربّع الرفع (كان syncPlace يخفيه بالمكان المكتوب من البوستر)');
  assert.equal(E.byId('designAiSourcePreview').style.display, 'block', 'ولا معاينة صورتك');
  assert.equal(E.byId('designAiFileName').textContent, 'room.jpg');
  const req = await E.generate();
  assert.equal(req.body.imageBase64, 'QUJD');
  assert.equal(req.body.place, '');
});

test('٨ (v-decor-upload-top) في وضع المكان (اختير من المعرض مع صورة) نقطة البوستر تبدّل المكان، و«أعطني أفكارًا» لا ترجع الصورة؛ وبلا صورة كما كانت', async () => {
  const E = decorEnv();
  E.upload();
  E.pick('living');
  E.hot('majlis').onclick();
  assert.equal(E.place.value, 'majlis', 'المكان المعروض يتبع النقطة');
  assert.equal(E.byId('designAiSourcePreview').style.display, 'none');
  E.byId('designAiIdeaText').value = 'مجلس فخم';
  E.byId('designAiIdeaGo').onclick();
  assert.equal(E.place.value, 'majlis', 'الأفكار لا تمسّ وضع الرفع');
  const req = await E.generate();
  assert.equal(req.body.place, 'majlis');
  assert.equal(req.body.imageBase64, '');
  const F = decorEnv();
  F.hot('kitchen').onclick();
  assert.equal(F.place.value, 'kitchen', 'بلا صورة: النقطة تكتب المكان كما كانت');
  assert.equal(F.byId('designAiSourcePreview').style.display, 'none');
  await tick();
});

test('٩ (v-decor-file-lang) اسم الملفّ يصمد لتبديل اللغة: بلا data-i18n ما دامت صورتك مستعمَلة، ومع المكان يعود المفتاح فيُترجم', () => {
  const E = decorEnv();
  const fn = E.byId('designAiFileName');
  fn.setAttribute('data-i18n', 'fileNoneChosen'); // كما في partials-core
  const relang = () => { if (fn.getAttribute('data-i18n') === 'fileNoneChosen') fn.textContent = 'No file chosen'; }; // ما يفعله applyLanguage
  E.upload();
  relang();
  assert.equal(fn.textContent, 'room.jpg', 'تبديل اللغة لا يمحو اسم صورتك');
  assert.equal(fn.getAttribute('data-i18n'), null);
  E.pick('living');
  assert.equal(fn.getAttribute('data-i18n'), 'fileNoneChosen', 'وضع المكان: «لم يتم اختيار ملف» يُترجم مع اللغة');
  relang();
  assert.equal(fn.textContent, 'No file chosen');
  E.pick('');
  relang();
  assert.equal(fn.textContent, 'room.jpg');
  assert.equal(fn.getAttribute('data-i18n'), null);
});

test('١٠ (v-decor-before-pin) صورة ثانية تُرفع أثناء التوليد: الطلب والسحّاب «قبل» للصورة الأولى', async () => {
  let release;
  const E = decorEnv((u) => (u === '/api/design-create' ? new Promise((r) => { release = () => r(new Response(JSON.stringify({ imageBase64: 'UkVT', mimeType: 'image/webp' }), { status: 200 })); }) : null));
  E.upload(); // QUJD
  const run = E.byId('designAiGenerateBtn').onclick();
  await tick();
  E.ctx.__compressImg = (file, cb) => cb('data:image/jpeg;base64,QkJC');
  E.upload(); // صورة ثانية أثناء التوليد
  release();
  await run;
  const req = E.fetched.find((f) => f.u === '/api/design-create');
  assert.equal(req.body.imageBase64, 'QUJD');
  assert.equal(E.byId('designBABefore').src, 'data:image/jpeg;base64,QUJD', '«قبل» صورة الطلب لا الصورة الجديدة');
  assert.equal(E.byId('designBAAfter').src, 'data:image/webp;base64,UkVT');
});

test('١١ (v-decor-ideas-ai) «ولّد ٤ تصاميم» يولّد ما تتصفّحه في الأفكار بلا صورتك (٤)، و«زوّدني مثله» على شبكته بالمكان نفسه، و«صمم الغرفة» يبقى لصورتك', async () => {
  const E = decorEnv((u) => (u === '/api/design-create' ? new Response(JSON.stringify({ images: [{ imageBase64: 'WDE=', mimeType: 'image/webp' }, { imageBase64: 'WDI=', mimeType: 'image/webp' }] }), { status: 200 }) : null));
  const creates = () => E.fetched.filter((f) => f.u === '/api/design-create').map((f) => f.body);
  E.upload();
  E.hot('majlis').onclick();
  await tick();
  assert.equal(E.place.value, '', 'البطاقة «من صورتي» (v-decor-upload-top)');
  const ai = E.byId('designAiIdeaAI');
  await ai.onclick();
  let b = creates().pop();
  assert.equal(b.place, 'majlis', 'المكان الذي تتصفّحه');
  assert.equal(b.imageBase64, '', 'بلا صورتك');
  assert.equal(b.count, 4, '٤ تصاميم كما يقول الزرّ (كان ١ لصورتك)');
  const vb = E.created.find((e) => e.tagName === 'BUTTON' && /زوّدني مثله/.test(e.textContent));
  assert.ok(vb, 'زرّ «زوّدني مثله» على الشبكة');
  await vb.click();
  b = creates().pop();
  assert.equal(b.variantOf, 'WDE=');
  assert.equal(b.place, 'majlis', 'المتغيّر بالمكان نفسه لا بصورتك');
  assert.equal(b.imageBase64, '');
  E.byId('designAiIdeaText').value = 'مجلس فخم';
  E.byId('designAiIdeaGo').onclick();
  await tick();
  await ai.onclick();
  b = creates().pop();
  assert.equal(b.place, 'custom');
  assert.match(b.notes, /^مجلس فخم\. /, 'الوصف المكتوب يُرسل');
  assert.equal(b.imageBase64, '');
  const req = await E.generate();
  assert.equal(req.body.imageBase64, 'QUJD', '«صمم الغرفة» لصورتك');
  assert.equal(req.body.count, 1);
  const F = decorEnv(() => null);
  F.hot('kitchen').onclick();
  await tick();
  await F.byId('designAiIdeaAI').onclick();
  const fb = F.fetched.filter((f) => f.u === '/api/design-create').pop().body;
  assert.equal(fb.place, 'kitchen'); assert.equal(fb.count, 4); assert.equal(fb.imageBase64, '');
});
