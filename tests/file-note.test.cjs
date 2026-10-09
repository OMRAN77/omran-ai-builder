// tests/file-note.test.cjs — v-file-note (٩ أكتوبر ٢٠٢٦): ملاحظة الملف الصغيرة بدل الورقة الكبيرة.
// العرض: لقطة المالك — لوحة «الملف جاهز» الكبيرة (عرض الشاشة، ثلاثة أزرار برموز) على الكمبيوتر المثبّت؛
// «عطني شي بسيط»، «رسمي مش مال أطفال»، «صغير ومرتب وليس هذي تغطي»، ثمّ «نفّذ في الهواتف بعد».
// الجذر: omranLikelyApp() يعدّ نافذة PWA المثبّتة على الحاسوب «غلافًا» فيرفع الملف للخادم ويفتح الورقة.
// يشغّل الكود الحقيقيّ من js/app-05-ui.js (من أوّله إلى نهاية openMsgMoreMenu) في vm بـDOM مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const UI = read('js/app-05-ui.js');
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/u;
const KEYS = ['fileNoteDownloaded', 'fileNoteReady', 'fileNoteDownload', 'fileNoteShare', 'fileNoteOpen', 'fileNoteShareUnavailable'];
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];

/* المصدر من أوّل الملفّ حتّى نهاية openMsgMoreMenu (مطابقة الأقواس) */
function uiHead() {
  const i = UI.indexOf('function openMsgMoreMenu(');
  assert.ok(i > 0, 'openMsgMoreMenu موجودة');
  let k = UI.indexOf('{', i), depth = 0;
  for (; k < UI.length; k++) {
    if (UI[k] === '{') depth++;
    else if (UI[k] === '}') { depth--; if (depth === 0) break; }
  }
  return UI.slice(0, k + 1);
}

/* ───── DOM مزيّف بما يكفي: شجرة، closest/querySelector بسيطان، getElementById، أبعاد ───── */
class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase(); this.ownerDocument = doc;
    this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {};
    this.style = { cssText: '' }; this.textContent = ''; this.innerHTML = ''; this.disabled = false;
    this.offsetWidth = 150; this.offsetHeight = 24; this.rect = null; this.clicks = 0;
    const cls = new Set();
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), _s: cls };
  }
  get className() { return Array.from(this.classList._s).join(' '); }
  set className(v) { this.classList._s.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList._s.add(c)); }
  get id() { return this.attrs.id || ''; }
  set title(v) { this.attrs.title = String(v); }
  get title() { return this.attrs.title || ''; }
  set id(v) { this.attrs.id = String(v); }
  setAttribute(k, v) { if (k === 'class') this.className = v; else this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.remove();
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  matches(sel) {
    return String(sel).split(',').some((s) => {
      s = s.trim();
      if (s[0] === '#') return this.id === s.slice(1);
      if (s[0] === '.') return this.classList.contains(s.slice(1));
      if (s === '[role=button]') return this.attrs.role === 'button';
      if (s === 'button:not(:disabled)') return this.tagName === 'BUTTON' && !this.disabled;
      return this.tagName === s.toUpperCase();
    });
  }
  closest(sel) { let n = this; while (n && n.matches) { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  all() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  focus() {}
  click() { this.clicks++; if (this.onclick) this.onclick({ preventDefault() {}, stopPropagation() {} }); }
  get text() { return [this.textContent].concat(this.children.map((c) => c.text)).join(' '); }
}

function makeEnv(o = {}) {
  const timers = [];
  const log = { fetch: [], shares: [], listeners: {} };
  const doc = { listeners: [], referrer: o.referrer || '' };
  doc.createElement = (t) => new El(t, doc);
  doc.documentElement = new El('html', doc);
  doc.head = doc.documentElement.appendChild(new El('head', doc));
  doc.body = doc.documentElement.appendChild(new El('body', doc));
  doc.getElementById = (id) => doc.documentElement.all().find((e) => e.id === id) || null;
  doc.addEventListener = (type, fn, cap) => doc.listeners.push({ type, fn, cap });
  doc.removeEventListener = () => {};
  const store = Object.assign({}, o.local || {});
  const sess = Object.assign({}, o.session || {});
  const nav = { userAgent: o.mobile ? 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36', maxTouchPoints: 0, platform: o.mobile ? 'Linux armv8l' : 'Win32' };
  if (o.canShare) {
    nav.canShare = (d) => !!(d && d.files);
    nav.share = async (d) => { log.shares.push(d.files[0].name); const e = new Error('x'); e.name = o.shareErr || 'NotAllowedError'; throw e; };
  }
  const ctx = {
    console, Blob, File, Date, Math, JSON, Promise, Error, String, Number, Array, Object, Buffer,
    document: doc, navigator: nav, lang: o.lang || 'ar',
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); } },
    matchMedia: (q) => ({ matches: !!(o.standalone && /display-mode: standalone/.test(q)) }),
    innerWidth: o.mobile ? 390 : 1280, innerHeight: o.mobile ? 844 : 800,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    URL: { createObjectURL: () => 'blob:local', revokeObjectURL() {} },
    __swallow: () => {},
    t: (k) => k,
    FileReader: class { readAsDataURL(b) { b.arrayBuffer().then((ab) => { this.result = 'data:' + (b.type || '') + ';base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); } },
    fetch: async (url, init) => { log.fetch.push(String(url)); const pdf = /action=pdf/.test(url); return { ok: true, status: 200, json: async () => ({ id: 'abc', url: (pdf ? '/p/' : '/f/') + 'abc' }) }; },
  };
  if (o.capacitor) ctx.Capacitor = { isNativePlatform: () => true };
  if (o.webkitBridge) ctx.webkit = { messageHandlers: { omranShare: { postMessage() {} } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(uiHead() + '\n;this.__api = { omranDesktopStandalone: typeof omranDesktopStandalone === "function" ? omranDesktopStandalone : null, omranLikelyApp, msgSaveExport, omranSaveBlob, omranPdfReadySheet, openMsgMoreMenu };', ctx);
  return { ctx, api: ctx.__api, doc, timers, log };
}
const flush = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 12; i++) await flush(); }
const note = (doc) => doc.getElementById('omranFileNote');
const fixedFullWidth = (doc) => doc.documentElement.all().filter((e) => /left:\s*0;\s*right:\s*0/.test(e.style.cssText || '') || e.id === 'omranPdfSheet');

/* صفّ أزرار ردّ كما يبنيه renderMessages: نسخ · استماع · إعادة | ⋮ */
function replyRow(doc) {
  const msg = doc.body.appendChild(doc.createElement('div'));
  const bar = msg.appendChild(doc.createElement('div'));
  bar.className = 'msgActionBar msgReplyActions';
  for (const n of ['copy', 'speak', 'retry']) { const b = bar.appendChild(doc.createElement('button')); b.attrs.title = n; }
  const more = bar.appendChild(doc.createElement('button'));
  more.className = 'msgMoreTrigger';
  more.rect = { left: 900, top: 500, right: 920, bottom: 520, width: 20, height: 20 };
  return { bar, more };
}

test('١. كشف الحاسوب المثبّت: PWA على ويندوز نعم؛ الجوّال والأغلفة الحقيقيّة لا — وomranLikelyApp كما كان', () => {
  const desk = makeEnv({ standalone: true });
  assert.equal(typeof desk.api.omranDesktopStandalone, 'function', 'omranDesktopStandalone موجودة');
  assert.equal(desk.api.omranDesktopStandalone(), true);
  assert.equal(desk.api.omranLikelyApp(), true, 'دلالة omranLikelyApp للأغلفة لم تتغيّر');
  assert.equal(makeEnv({ standalone: false }).api.omranDesktopStandalone(), false, 'متصفّح حاسوب عاديّ');
  assert.equal(makeEnv({ standalone: true, mobile: true }).api.omranDesktopStandalone(), false, 'PWA على الجوّال');
  assert.equal(makeEnv({ standalone: true, local: { aiapp_twa: '1' } }).api.omranDesktopStandalone(), false, 'TWA');
  assert.equal(makeEnv({ standalone: true, local: { aiapp_store: 'huawei' } }).api.omranDesktopStandalone(), false, 'المتجر');
  assert.equal(makeEnv({ standalone: true, session: { aiapp_store: 'huawei' } }).api.omranDesktopStandalone(), false, 'المتجر (جلسة)');
  assert.equal(makeEnv({ standalone: true, referrer: 'android-app://com.omran' }).api.omranDesktopStandalone(), false, 'مرجع android-app');
  assert.equal(makeEnv({ standalone: true, capacitor: true }).api.omranDesktopStandalone(), false, 'كاباسيتور');
  assert.equal(makeEnv({ standalone: true, webkitBridge: true }).api.omranDesktopStandalone(), false, 'جسر الآيفون');
});

test('٢. الحاسوب المثبّت: Word وPDF ينزلان مباشرة — لا رفع إلى /api/media ولا مشاركة ولا ورقة، ثمّ «تمّ تنزيل الملف»', async () => {
  const e = makeEnv({ standalone: true, canShare: true });
  e.api.msgSaveExport(new Blob(['x'], { type: 'application/msword' }), 'omran-ai-reply.doc');
  await settle();
  assert.deepEqual(e.log.fetch, [], 'لا رفع للخادم (Redis ممتلئ أصلًا)');
  assert.equal(fixedFullWidth(e.doc).length, 0);
  let n = note(e.doc);
  assert.ok(n, 'الملاحظة ظهرت');
  assert.match(n.text, /تمّ تنزيل الملف/);
  assert.ok(e.timers.some((t) => t.ms === 3000), 'تختفي بعد ٣ ثوانٍ');
  const p = makeEnv({ standalone: true, canShare: true });
  await p.api.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
  assert.deepEqual(p.log.fetch, []);
  assert.deepEqual(p.log.shares, [], 'لا لوحة مشاركة النظام');
  n = note(p.doc);
  assert.ok(n && /تمّ تنزيل الملف/.test(n.text));
});

test('٣. تصدير من ⋮ الردّ: الملاحظة داخل صفّ أزرار ذلك الردّ بعد ⋮ مباشرة — لا عنصر ثابت فوق المحتوى', async () => {
  const e = makeEnv({});
  const { bar, more } = replyRow(e.doc);
  e.api.openMsgMoreMenu(more, 'ملخّص الاجتماع', []);
  const menu = e.doc.body.querySelector('.msgReplyMoreMenu');
  assert.ok(menu, 'القائمة فُتحت');
  const items = menu.querySelectorAll('button');
  const word = items.find((b) => b.attrs.title === 'convertToWord');
  assert.ok(word, 'بند Word');
  word.click();
  await settle();
  const n = note(e.doc);
  assert.ok(n, 'الملاحظة ظهرت');
  assert.equal(n.parentNode, bar, 'داخل صفّ أزرار الردّ');
  assert.equal(more.nextSibling, n, 'بعد ⋮ مباشرة');
  assert.match(n.text, /تمّ تنزيل الملف/);
  assert.ok(!n.classList.contains('omranFileNoteChip'), 'نصّ داخل الصفّ لا شريحة طافية');
  assert.equal(fixedFullWidth(e.doc).length, 0);
  // ملاحظة واحدة فقط: تصدير ثانٍ يستبدل الأولى
  e.api.openMsgMoreMenu(more, 'ملخّص الاجتماع', []);
  e.doc.body.querySelector('.msgReplyMoreMenu').querySelectorAll('button').find((b) => b.attrs.title === 'downloadTxt').click();
  await settle();
  assert.equal(e.doc.documentElement.all().filter((x) => x.id === 'omranFileNote').length, 1);
});

test('٤. الجوّال/الغلاف: الملفّ عبر رابط الخادم — «الملف جاهز · تنزيل · فتح» (مشاركة فقط حين canShare)، والتنزيل الصامت باقٍ', async () => {
  // بلا مشاركة
  const e = makeEnv({ mobile: true });
  const { bar, more } = replyRow(e.doc);
  e.api.openMsgMoreMenu(more, 'نصّ', []);
  e.doc.body.querySelector('.msgReplyMoreMenu').querySelectorAll('button').find((b) => b.attrs.title === 'convertToWord').click();
  await settle();
  assert.deepEqual(e.log.fetch, ['/api/media?action=file']);
  let n = note(e.doc);
  assert.ok(n, 'الملاحظة ظهرت');
  assert.equal(n.parentNode, bar, 'في صفّ الردّ على الجوّال أيضًا');
  assert.match(n.text, /الملف جاهز/);
  const dl = n.querySelector('.omranFileNoteDl');
  assert.ok(dl && dl.tagName === 'A', 'رابط «تنزيل» حقيقيّ');
  assert.equal(dl.href, '/f/abc');
  assert.equal(dl.getAttribute('download'), 'omran-ai-reply.doc');
  assert.equal(dl.dataset.nativeDownload, '1');
  assert.equal(n.querySelector('.omranFileNoteShare'), null, 'لا «مشاركة» بلا canShare');
  const op = n.querySelector('.omranFileNoteOpen');
  assert.ok(op && op.href === '/f/abc' && op.target === '_blank');
  assert.ok(e.timers.some((t) => t.ms === 120000), 'تبقى دقيقتين (لا تغطّي شيئًا)');
  assert.ok(e.doc.body.querySelectorAll('iframe').some((f) => f.src === '/f/abc'), 'محاولة التنزيل التلقائيّ الصامتة باقية');
  assert.equal(fixedFullWidth(e.doc).length, 0, 'لا ورقة بعرض الشاشة');
  // مع canShare (المشاركة الأولى رُفضت لانتهاء اللمسة) → «مشاركة» بلمسة جديدة
  const s = makeEnv({ mobile: true, canShare: true });
  await s.api.omranSaveBlob(new Blob(['%PDF-1.3'], { type: 'application/pdf' }), 'omran-ai.pdf');
  n = note(s.doc);
  assert.ok(n && n.querySelector('.omranFileNoteShare'), '«مشاركة» حين canShare');
  assert.equal(n.querySelector('.omranFileNoteDl').href, '/p/abc');
  // بلا مرسى: شريحة صغيرة فوق خانة الكتابة، لا عرض كامل
  assert.ok(n.classList.contains('omranFileNoteChip'));
  assert.match(n.style.bottom, /90px/);
  assert.equal(n.style.left, '50%');
  assert.doesNotMatch(n.style.cssText + (n.style.right || ''), /right:\s*0/);
});

test('٥. مرسى غير الردّ: الشريحة فوق آخر زرّ لمسه المستخدم، داخل حدود الشاشة', () => {
  const e = makeEnv({ mobile: true });
  const cap = e.doc.listeners.find((l) => l.type === 'click' && l.cap === true);
  assert.ok(cap, 'مستمع التقاط لآخر لمسة');
  const btn = e.doc.body.appendChild(e.doc.createElement('button'));
  btn.rect = { left: 300, top: 400, right: 380, bottom: 440, width: 80, height: 40 };
  cap.fn({ target: btn });
  assert.equal(e.api.omranPdfReadySheet('/i/x.jpg?dl=1', null, 'x.jpg', 'image', '/i/x.jpg'), true, 'العائد كما كان');
  const n = note(e.doc);
  assert.ok(n.classList.contains('omranFileNoteChip'));
  const top = parseInt(n.style.top, 10), left = parseInt(n.style.left, 10);
  assert.ok(top < 400 && top >= 8, 'فوق الزرّ: ' + top);
  assert.ok(left >= 8 && left + n.offsetWidth <= 390 - 8, 'داخل الشاشة: ' + left);
  assert.equal(n.querySelector('.omranFileNoteOpen').href, '/i/x.jpg', 'فتح = openUrl');
  // بلا لمسة: فوق شريط الكتابة في منتصف عموده
  const d = makeEnv({});
  const ib = d.doc.body.appendChild(d.doc.createElement('div'));
  ib.id = 'inputbar';
  ib.rect = { left: 600, top: 760, right: 1000, bottom: 840, width: 400, height: 80 };
  d.api.omranPdfReadySheet('/p/a', null, 'a.pdf', 'pdf');
  const c = note(d.doc);
  assert.ok(parseInt(c.style.top, 10) < 760, 'فوق شريط الكتابة لا عليه');
  assert.equal(parseInt(c.style.left, 10), 800 - c.offsetWidth / 2, 'في منتصف عمود المحادثة');
});

test('٦. لا رموز تعبيريّة في الملاحظة، ولا بقايا الورقة القديمة في المصدر', () => {
  const src = UI.slice(UI.indexOf('function omranFileNote('), UI.indexOf('function omranFileNoteDownloaded('));
  const strs = src.match(/'[^'\n]*'/g) || [];
  assert.deepEqual(strs.filter((s) => EMOJI.test(s)), []);
  assert.doesNotMatch(UI, /omranPdfSheet/, 'لا ورقة #omranPdfSheet');
  assert.doesNotMatch(UI, /✅ ملف PDF جاهز/, 'لا شريط «✅ ملف PDF جاهز»');
  assert.doesNotMatch(read('js/app-05-save-media.js'), /ورقة ثابتة بأزرار/);
});

test('٧. المفاتيح الستّة بالـ١٤ لغة بلا رموز، ووسم اللغات مرفوع', () => {
  const data = read('js/app-03-i18n-data.js');
  for (const k of KEYS) {
    const vals = Array.from(data.matchAll(new RegExp(k + ': "([^"]+)"', 'g'))).map((m) => m[1]);
    assert.equal(vals.length, 2, k + ': عربي + إنجليزي');
    for (const v of vals) assert.doesNotMatch(v, EMOJI, k);
  }
  assert.match(data, /fileNoteDownloaded: "تمّ تنزيل الملف"/);
  for (const l of LANGS) {
    const f = read('i18n/' + l + '.js');
    for (const k of KEYS) {
      const m = f.match(new RegExp('"?' + k + '"?: "([^"]+)"'));
      assert.ok(m, l + ': ' + k);
      assert.doesNotMatch(m[1], EMOJI, l + ': ' + k);
    }
  }
  assert.match(read('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=727'/);
});

test('٨. حافظ الوسائط والصور: الحاسوب المثبّت تنزيل مباشر بلا رفع ولا ورقة', async () => {
  // omranSaveMedia
  const calls = { sheet: 0, fetch: [], clicks: 0, notes: 0 };
  const doc = { addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ dataset: {}, click() { calls.clicks++; }, remove() {} }) };
  const ctx = {
    location: { href: 'https://app.example/', origin: 'https://app.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128', maxTouchPoints: 0, platform: 'Win32' },
    document: doc, URL: Object.assign(function (u, b) { return new URL(u, b); }, { createObjectURL: () => 'blob:local', revokeObjectURL() {} }),
    Blob, File, atob, setTimeout: () => 0, encodeURIComponent, Number, String, Date, Error, JSON, Uint8Array, console,
    fetch: async (u) => { calls.fetch.push(String(u)); return { ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }), json: async () => ({ id: 'z' }) }; },
    omranLikelyApp: () => true, omranDesktopStandalone: () => true,
    omranPdfReadySheet: () => { calls.sheet++; return true; },
    omranFileNoteDownloaded: () => { calls.notes++; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-save-media.js'), ctx);
  assert.equal(await ctx.omranSaveMedia('data:image/png;base64,AAAA', 'a.png'), true);
  assert.equal(calls.sheet, 0, 'لا ورقة');
  assert.ok(!calls.fetch.some((u) => /api\/media/.test(u)), 'لا رفع');
  assert.equal(calls.clicks, 1, 'تنزيل مباشر');
  assert.equal(calls.notes, 1, '«تمّ تنزيل الملف»');
  // omranSaveImage (صور الاستوديو)
  const posts = [];
  let plain = 0, notes = 0;
  const c2 = {
    location: { origin: 'https://app.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128' },
    document: { createElement: () => ({ dataset: {}, style: {}, click() { plain++; }, remove() {}, setAttribute() {}, appendChild() {} }), getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { appendChild() {} } },
    fetch: async (u, init) => { posts.push(u); return { ok: true, status: 200, json: async () => ({ id: 'img1' }) }; },
    localStorage: { getItem: () => 'ar' }, Blob, File, URL, atob, setTimeout: () => 0, String, Number, Math, Date, Error, JSON, Uint8Array, Promise, console,
    omranLikelyApp: () => true, omranDesktopStandalone: () => true, omranMobileUA: () => false, omranNativeBridge: () => null,
    omranFileNoteDownloaded: () => { notes++; },
  };
  c2.window = c2;
  vm.createContext(c2);
  vm.runInContext(read('js/app-05-img-save.js'), c2);
  assert.equal(await c2.omranSaveImage(new Blob(['png'], { type: 'image/png' }), 'a.png', 'save'), true);
  assert.deepEqual(posts, [], 'لا رفع للصورة');
  assert.equal(plain, 1, 'تنزيل مباشر');
  assert.equal(notes, 1);
});

test('٩. الجوّال الساقط إلى المسار العامّ لا يدّعي «تمّ تنزيل الملف» — بل «الملف جاهز» برابط بلمسته', async () => {
  const calls = { sheet: [], fetch: 0, clicks: 0, notes: 0 };
  const doc = { addEventListener() {}, body: { appendChild() {} }, createElement: () => ({ dataset: {}, click() { calls.clicks++; }, remove() {} }) };
  const ctx = {
    location: { href: 'https://app.example/', origin: 'https://app.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 12; HUAWEI) AppleWebKit/537.36 Chrome/99 Mobile Safari/537.36', maxTouchPoints: 5, platform: 'Linux armv8l' },
    document: doc, URL: Object.assign(function (u, b) { return new URL(u, b); }, { createObjectURL: () => 'blob:local', revokeObjectURL() {} }),
    Blob, File, atob, setTimeout: () => 0, encodeURIComponent, Number, String, Date, Error, JSON, Uint8Array, console,
    /* أوّل جلب (فرع الجوّال) يفشل عابرًا، والثاني (المسار العامّ) ينجح */
    fetch: async () => { calls.fetch++; if (calls.fetch === 1) throw new Error('net'); return { ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) }; },
    omranLikelyApp: () => true, omranDesktopStandalone: () => false,
    omranPdfReadySheet: (u, f, n, k) => { calls.sheet.push([u, n, k]); return true; },
    omranFileNoteDownloaded: () => { calls.notes++; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-save-media.js'), ctx);
  assert.equal(await ctx.omranSaveMedia('/media/a.png', 'a.png'), true);
  assert.equal(calls.notes, 0, 'لا «تمّ تنزيل الملف» داخل الغلاف');
  assert.deepEqual(calls.sheet, [['blob:local', 'a.png', 'image']], '«الملف جاهز» برابط التنزيل');
});

test('١٠. ⋮ خارج الشاشة → شريحة لا صفّ لا يُرى؛ والثيمات الفاتحة بذهب داكن مقروء', async () => {
  const e = makeEnv({ mobile: true, capacitor: true });
  const { more } = replyRow(e.doc);
  more.rect = { left: 300, top: -400, right: 320, bottom: -380, width: 20, height: 20 };
  e.ctx.omranFileNoteMarkExport(more);
  e.api.omranPdfReadySheet('/p/a', null, 'a.pdf', 'pdf');
  const n = note(e.doc);
  assert.ok(n.classList.contains('omranFileNoteChip'), 'شريحة');
  assert.notEqual(n.parentNode, more.parentNode);
  e.ctx.omranFileNoteCss();
  const css = e.doc.getElementById('omranFileNoteCss').textContent;
  for (const s of ['kids', 'cuisine', 'beach', 'winter']) assert.match(css, new RegExp('html\\.skin-' + s + ' \\.omranFileNote[,{][^}]*#8a6a14|html\\.skin-' + s + ' \\.omranFileNote,'), s);
});
