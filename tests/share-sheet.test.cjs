'use strict';
/* v-share-sheet (لقطة المالك ٧ نوفمبر: نافذة يوتيوب «نفس هذي في كل التطبيق»، و«الصور لا ترسمه — الصور الرسميّة»):
   نافذة مشاركة واحدة (js/share-sheet.js — ملفّ مستقلّ تحمّله index.html قبل الحزمة واستوديو الإعلانات) لكلّ أزرار المشاركة. الجذر: تطبيق متجر ويندوز يُعدّ «تطبيقًا» فكانت المسارات تفتح
   لوحة ويندوز المعلّقة. ١–٦ النافذة نفسها في بيئة DOM مزيّفة (حاسوب/هاتف/نصّ/رابط مؤجَّل/حوار/ملفّ بلا رابط)، ٧ الشعارات الرسميّة،
   ٨ كلّ مسار مشاركة يمرّ بها أوّلًا، ٩ النصوص بالـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/share-sheet.js');

function makeDom() {
  const all = [];
  const mk = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], parentNode: null, className: '', textContent: '', innerHTML: '', style: {}, dataset: {},
      attrs: {}, listeners: {}, disabled: false, hidden: false, readOnly: false, value: '', type: '', id: '', dir: '',
      scrollWidth: 300, clientWidth: 600, scrollLeft: 0,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { if (this.onclick) this.onclick({ stopPropagation() {} }); (this.listeners.click || []).forEach((f) => f({ target: this, stopPropagation() {} })); },
      select() {}, scrollBy() {},
      get isConnected() { let p = this; while (p) { if (p === doc.body || p.isDialog) return true; p = p.parentNode; } return false; },
    };
    all.push(n);
    return n;
  };
  const doc = {
    createElement: mk, head: mk('head'), body: mk('body'), documentElement: { dir: 'rtl', lang: 'ar' }, dialogs: [],
    getElementById: (id) => all.find((n) => n.id === id && n.isConnected) || null,
    querySelector: (sel) => (sel === '.omShOv' ? all.find((n) => n.className === 'omShOv' && n.isConnected) || null : null),
    querySelectorAll: (sel) => (sel === 'dialog[open]' ? doc.dialogs : []),
    addEventListener() {}, removeEventListener() {},
  };
  return doc;
}
function load(o) {
  const opts = o || {};
  const opened = [];
  const ctx = {
    console, Promise, Object, Array, String, Number, Math, JSON, encodeURIComponent, setTimeout: (f) => { f(); return 0; },
    navigator: Object.assign({ userAgent: opts.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', clipboard: { writeText: async () => {} } }, opts.nav || {}),
    location: { set href(u) { opened.push(u); } },
    getComputedStyle: () => ({ direction: 'rtl' }),
    __swallow: () => {},
    t: (k) => k,
  };
  ctx.window = ctx; ctx.document = makeDom();
  ctx.window.open = (u) => { opened.push(u); };
  Object.assign(ctx, opts.globals || {});
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'share-sheet.js' });
  // فتح الروابط في الكود بنقر <a target=_blank> — نلتقطه من الشجرة
  const realCreate = ctx.document.createElement;
  ctx.document.createElement = (tag) => { const n = realCreate(tag); if (String(tag) === 'a') n.click = function () { opened.push(this.href); }; return n; };
  ctx.opened = opened;
  return ctx;
}
const walk = (n, out) => { out.push(n); (n.children || []).forEach((c) => walk(c, out)); return out; };
const sheet = (c) => c.document.querySelector('.omShOv');
const items = (c) => walk(sheet(c), []).filter((n) => n.className === 'omShIt');
const labels = (c) => items(c).map((b) => b.children[1].textContent);
const byLabel = (c, l) => items(c).find((b) => b.children[1].textContent === l);
const input = (c) => walk(sheet(c), []).find((n) => n.tagName === 'INPUT');
const tick = () => new Promise((r) => setImmediate(r));

test('١. الحاسوب (ومنه تطبيق متجر ويندوز): ستّ دوائر بلا «المزيد» ولا «الرسائل» ولو وُجدت مشاركة النظام — لا لوحة ويندوز أبدًا', () => {
  const c = load({ nav: { share: async () => {} }, globals: { omranMobileUA: () => false } });
  c.omranShareSheet({ url: 'https://omran.app/i/abc.jpg' });
  assert.deepEqual(labels(c), ['WhatsApp', 'Telegram', 'Facebook', 'X', 'Snapchat', 'البريد']);
  assert.equal(input(c).value, 'https://omran.app/i/abc.jpg');
  byLabel(c, 'WhatsApp').click(); byLabel(c, 'Facebook').click(); byLabel(c, 'Snapchat').click(); byLabel(c, 'X').click();
  assert.deepEqual(c.opened, [
    'https://wa.me/?text=' + encodeURIComponent('https://omran.app/i/abc.jpg'),
    'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://omran.app/i/abc.jpg'),
    'https://www.snapchat.com/scan?attachmentUrl=' + encodeURIComponent('https://omran.app/i/abc.jpg'),
    'https://x.com/intent/tweet?text=&url=' + encodeURIComponent('https://omran.app/i/abc.jpg'),
  ]);
});

test('٢. الهاتف: الرسائل و«المزيد» يظهران؛ «المزيد» في غلاف المتجر جسرُه بالملفّ نفسه، وفي المتصفّح ورقة الهاتف بالملفّ', async () => {
  const sent = [];
  const file = { name: 'x.png', size: 3 };
  const c = load({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile', globals: { omranMobileUA: () => true, omranNativeBridge: (n) => (n === 'omranShare' ? {} : null), msgDownloadBlob: (b, nm) => sent.push(nm) } });
  c.omranShareSheet({ url: 'https://omran.app/i/abc.jpg', file });
  assert.deepEqual(labels(c), ['WhatsApp', 'Telegram', 'Facebook', 'X', 'Snapchat', 'الرسائل', 'البريد', 'المزيد']);
  byLabel(c, 'المزيد').click();
  assert.deepEqual(sent, ['x.png']);
  assert.equal(sheet(c), null, 'تُغلق بعد التسليم للجسر');
  const shared = [];
  const c2 = load({ ua: 'Mozilla/5.0 (iPhone) Mobile', nav: { share: async (d) => { shared.push(d); }, canShare: () => true }, globals: { omranMobileUA: () => true } });
  c2.omranShareSheet({ url: 'https://omran.app/i/abc.jpg', file });
  byLabel(c2, 'المزيد').click(); await tick();
  assert.equal(shared[0].files.length, 1); assert.equal(shared[0].files[0], file, 'الملفّ نفسه لا رابطه');
});

test('٣. نصّ وحده (ردّ المحادثة): فيسبوك وسناب يختفيان (لا يقبلان نصًّا)، وواتساب بالنصّ، وخانة النسخ نصّ عربيّ من اليمين', () => {
  const c = load({ globals: { omranMobileUA: () => false } });
  c.omranShareSheet({ text: 'السلام عليكم', title: 'مشاركة الردّ' });
  assert.deepEqual(labels(c), ['WhatsApp', 'Telegram', 'X', 'البريد']);
  byLabel(c, 'WhatsApp').click();
  assert.equal(c.opened[0], 'https://wa.me/?text=' + encodeURIComponent('السلام عليكم'));
  assert.equal(input(c).value, 'السلام عليكم'); assert.equal(input(c).style.direction, 'rtl');
});

test('٤. الرابط المؤجَّل (رفع الصورة عند الفتح): أزرار الرابط معطّلة حتّى يصل، والفشل سطر واضح لا صمت', async () => {
  let resolve;
  const c = load({ globals: { omranMobileUA: () => false } });
  c.omranShareSheet({ getUrl: () => new Promise((r) => { resolve = r; }) });
  assert.equal(input(c).value, 'جارٍ تجهيز الرابط…', 'الخانة تقول إنّه يُجهَّز');
  assert.ok(items(c).filter((b) => b.disabled).length >= 5, 'كلّها تنتظر الرابط');
  await tick();
  resolve('https://omran.app/i/z.jpg'); await tick(); await tick();
  assert.equal(input(c).value, 'https://omran.app/i/z.jpg');
  assert.equal(items(c).filter((b) => b.disabled).length, 0);
  const c2 = load({ globals: { omranMobileUA: () => false } });
  c2.omranShareSheet({ getUrl: () => Promise.reject(new Error('429')) });
  await tick(); await tick();
  const note = walk(sheet(c2), []).find((n) => n.className === 'omShNote');
  assert.match(note.textContent, /تعذّر تجهيز الرابط/);
});

test('٥. داخل حوار مفتوح (الإعدادات) تُلحق النافذة بالحوار — وإلّا رُسمت خلف طبقته العليا', () => {
  const c = load({ globals: { omranMobileUA: () => false } });
  const dlg = c.document.createElement('dialog'); dlg.isDialog = true; c.document.dialogs.push(dlg);
  c.omranShareSheet({ url: 'https://omran.app/app', text: 'جرّب' });
  assert.equal(sheet(c).parentNode, dlg);
});

test('٦. ملفّ بلا رابط ولا نصّ على الحاسوب: لا دوائر برسائل فارغة — الإضافات وحدها', () => {
  let dl = 0;
  const c = load({ globals: { omranMobileUA: () => false } });
  c.omranShareSheet({ file: { name: 'a.png' }, extras: [{ label: 'تحميل', icon: 'download', onClick: () => { dl++; } }] });
  assert.deepEqual(labels(c), ['تحميل']);
  byLabel(c, 'تحميل').click(); assert.equal(dl, 1);
});

test('٧. الشعارات رسميّة (مسارات Simple Icons CC0) بألوان العلامات، وإنستغرام غائب (لا يقبل المشاركة من المواقع)', () => {
  assert.ok(SRC.includes('"whatsapp": "M17.472 14.382'), 'واتساب الرسميّ');
  assert.ok(SRC.includes('"facebook": "M9.101 23.691'), 'فيسبوك الرسميّ');
  assert.ok(SRC.includes('"x": "M14.234 10.162'), 'X الرسميّ');
  assert.ok(SRC.includes('"telegram": "M11.944 0A12 12'), 'تيليجرام الرسميّ');
  assert.ok(SRC.includes('"snapchat": "M12.206.793'), 'سناب الرسميّ');
  for (const hex of ['#25D366', '#26A5E4', '#0866FF', '#FFFC00', '#1A73E8']) assert.ok(SRC.includes(hex), hex);
  assert.ok(!/instagram/i.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'لا زرّ إنستغرام');
});

test('٨. كلّ مسار مشاركة يمرّ بالنافذة أوّلًا (والقديم احتياط إن لم يُحمَّل الجزء)', () => {
  const first = (src, anchor, why) => { const i = src.indexOf(anchor); assert.ok(i >= 0, why + ': المرساة'); return src.slice(i, i + 5000); };
  assert.match(first(read('js/app-05-share-text.js'), 'window.omranShareText = function', 'الردّ'), /omranShareSheet\(\{ text: text/);
  const img = first(read('js/app-05-img-save.js'), 'window.omranSaveImage = async function', 'الصور');
  assert.ok(img.indexOf("mode === 'share' && typeof window.omranShareSheet") < img.indexOf("omranNativeBridge('omranShare')"), 'الصور: النافذة قبل الجسر ولوحة النظام');
  assert.match(read('js/app-05-ui.js'), /if\(typeof window\.omranShareSheet === 'function'\)\{ if\(canLink\) buttons\.push\(sheetBtn\(\)\); \}/);
  assert.match(read('js/app-05-ui.js'), /if \(typeof window\.omranShareSheet === 'function'\) \{ window\.omranShareSheet\(\{ url: shareUrl, text: t\('acctShareText'\) \}\); return; \}/);
  assert.match(read('js/partials-settings.js'), /if \(typeof window\.omranShareSheet === 'function'\) \{ window\.omranShareSheet\(\{ url: shareUrl, text: tt\('acctShareText'\) \}\); return; \}/);
  assert.match(read('js/app-10-features.js'), /window\.omranShareSheet\(\{ url: shareUrl, text: shareText \}\); return;/);
  assert.match(read('js/app-20-signature.js'), /window\.omranSaveImage\(blob, 'omran-signature\.png', 'share'\); return;/);
  const a09 = first(read('js/app-09-attach.js'), "b.type = 'button'; b.className = 'oSendOut';", 'صورة المحادثة');
  assert.ok(a09.indexOf('window.omranShareSheet({') >= 0 && a09.indexOf('window.omranShareSheet({') < a09.indexOf('nativeBridgeShare()'), 'صورة المحادثة: النافذة قبل الجسر');
  // v-share-next: ملفّ مستقلّ تحمّله index.html قبل الحزمة (أزرار «مشاركة» من أوّل رسم) ويُنشر — لا نسخة ثانية في الحزمة
  const html = read('index.html');
  const iS = html.indexOf('<script defer src="/js/share-sheet.js?v='), iB = html.indexOf('<script defer src="/js/app.bundle.js?v=');
  assert.ok(iS > 0 && iS < iB, 'index.html: قبل الحزمة');
  assert.ok(!read('js/app.bundle.js').includes('window.omranShareSheet = function'), 'لا نسخة في الحزمة');
  assert.ok(!fs.existsSync(path.join(root, 'js/app-45-share-sheet.js')), 'الجزء القديم لا يعود للحزمة');
  assert.ok(!read('.vercelignore').split('\n').some((l) => /share-sheet/.test(l)), 'يُنشر');
});

test('٩. نصوص النافذة بالـ١٤ لغة', () => {
  const keys = ['shareSheetTitle', 'shareCopy', 'shareSheetCopied', 'shareMore', 'shareMessages', 'shareEmail', 'shareFail', 'sharePreparing', 'shareLinkFail'];
  const data = read('js/app-03-i18n-data.js');
  // لا تصادم مع مفتاح قائم بأيّ علامة اقتباس — المكرّر في الكائن يظلّل أحدهما، وObject.assign في آخر ملفّ اللغة يغيّر نصّ الميزة القديمة
  for (const k of keys) assert.equal((data.match(new RegExp('[\\s{,"\']' + k + '["\']?\\s*:', 'g')) || []).length, 2, 'ar+en مرّة لكلّ لغة: ' + k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) { const f = read('i18n/' + lg + '.js'); for (const k of keys) assert.equal((f.match(new RegExp('[\\s{,"\']' + k + '["\']?\\s*:', 'g')) || []).length, 1, lg + ' مرّة واحدة: ' + k); }
  const ctx = { I18N: {} }; ctx.window = ctx; vm.createContext(ctx);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    ctx.I18N[lg] = {};
    vm.runInContext(read('i18n/' + lg + '.js'), ctx);
    for (const k of keys) assert.ok(typeof ctx.I18N[lg][k] === 'string' && ctx.I18N[lg][k], lg + ': ' + k);
  }
});

// ── v-share-next / v-desktop-app (المالك ٧ نوفمبر: «مافي اي شي — فقط تحميل في التطبيق كامل في الهاتف والكمبيوتر») ─────────────
function makeDom2() {
  const all = [];
  const observers = [];
  const style = () => ({ cssText: '', display: '', visibility: '', width: '', boxSizing: '', removeProperty(p) { if (p === 'display') this.display = ''; } });
  const mk = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], parentNode: null, className: '', textContent: '', innerHTML: '', style: style(), dataset: {},
      attrs: {}, listeners: {}, hidden: false, disabled: false, type: '', id: '', value: '', readOnly: false, dir: '', scrollWidth: 0, clientWidth: 0, scrollLeft: 0,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      insertBefore(c, ref) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
      get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; },
      remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { if (this.onclick) this.onclick({ stopPropagation() {}, preventDefault() {} }); (this.listeners.click || []).forEach((f) => f({ target: this, stopPropagation() {}, preventDefault() {} })); },
      select() {}, scrollBy() {},
      get isConnected() { let p = this; while (p) { if (p === doc.body) return true; p = p.parentNode; } return false; },
    };
    all.push(n);
    return n;
  };
  const doc = {
    createElement: mk, head: null, body: null, documentElement: { dir: 'rtl', lang: 'ar' },
    getElementById: () => null,
    querySelector: (sel) => (sel === '.omShOv' ? all.find((n) => n.className === 'omShOv' && n.isConnected) || null : null),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  doc.head = mk('head'); doc.body = mk('body');
  class MO { constructor(cb) { this.cb = cb; } observe(t) { this.t = t; observers.push(this); } disconnect() {} }
  return { doc, MO, fire: (t) => observers.filter((o) => o.t === t).forEach((o) => o.cb([])) };
}
function load2(o) {
  const opts = o || {};
  const d = makeDom2();
  const fetches = [];
  const ctx = {
    console, Promise, Object, Array, String, Number, Math, JSON, encodeURIComponent, Date, setTimeout: (f) => { f(); return 0; },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', clipboard: { writeText: async () => {} } },
    location: { origin: 'https://omran.app', set href(u) { /* mailto/sms */ } },
    getComputedStyle: (el) => ({ display: (el && el.style && el.style.display) || 'block', visibility: (el && el.style && el.style.visibility) || 'visible', direction: 'rtl' }),
    MutationObserver: d.MO, __swallow: () => {}, t: (k) => k, omranMobileUA: () => false,
    FileReader: class { readAsDataURL(b) { this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,QUJD'; setImmediate(() => this.onload && this.onload()); } },
    fetch: async (url, init) => { fetches.push({ url: String(url), body: init && init.body }); return { ok: true, status: 200, json: async () => ({ url: /action=pdf/.test(String(url)) ? '/p/abc123' : '/f/def456' }) }; },
  };
  ctx.window = ctx; ctx.document = d.doc; ctx.window.open = () => {};
  Object.assign(ctx, opts.globals || {});
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'share-sheet.js' });
  ctx.fire = d.fire; ctx.fetches = fetches;
  return ctx;
}
const sheetOf = (c) => c.document.querySelector('.omShOv');
const inputOf = (c) => walk(sheetOf(c), []).find((n) => n.tagName === 'INPUT');
const noteOf = (c) => walk(sheetOf(c), []).find((n) => n.className === 'omShNote');
const labelsOf = (c) => walk(sheetOf(c), []).filter((n) => n.className === 'omShIt').map((b) => b.children[1].textContent);

test('١٠. omranShareMedia: الصورة لمسار الصور (رابط /i/)، والفيديو برابطه https، والـPDF الصغير يُرفع رابطًا أسبوعيًّا، والملفّ الكبير سطر واضح', async () => {
  const saved = [];
  const c = load2({ globals: { omranSaveImage: (src, nm, mode) => { saved.push([src, nm, mode]); return true; } } });
  c.omranShareMedia({ src: 'data:image/png;base64,QQ==', name: 'omran-studio-ai.png' });
  assert.deepEqual(saved, [['data:image/png;base64,QQ==', 'omran-studio-ai.png', 'share']]);
  c.omranShareMedia({ src: 'https://cdn.example/v/abc.mp4', name: 'omran-ai-video.mp4' });
  assert.equal(inputOf(c).value, 'https://cdn.example/v/abc.mp4');
  assert.ok(labelsOf(c).includes('تحميل'), 'التحميل دائرة إضافيّة');
  c.omranShareMedia({ src: { size: 900, type: 'application/pdf' }, name: 'report.pdf' });
  await tick(); await tick(); await tick(); await tick();
  assert.equal(c.fetches.length, 1); assert.match(c.fetches[0].url, /\/api\/media\?action=pdf$/);
  assert.ok(!/"purpose"/.test(c.fetches[0].body), 'رابط مشاركة أسبوعيّ لا تنزيل ساعة');
  assert.equal(inputOf(c).value, 'https://omran.app/p/abc123');
  c.omranShareMedia({ src: { size: 40 * 1024 * 1024, type: 'video/mp4' }, name: 'big.mp4' });
  await tick(); await tick(); await tick();
  assert.match(noteOf(c).textContent, /أكبر من حدّ رابط المشاركة/);
  assert.equal(c.fetches.length, 1, 'الكبير لا يُرفع أصلًا');
});

test('١١. omranAddShareNextTo: زرّ «مشاركة» بعد زرّ التحميل بصنفه، يختفي ويظهر معه، والضغط يشارك رابط التحميل نفسه — ومرّة واحدة', () => {
  const saved = [];
  const c = load2({ globals: { omranSaveImage: (src, nm, mode) => { saved.push([src, nm, mode]); return true; } } });
  const wrap = c.document.createElement('div'); c.document.body.appendChild(wrap);
  const dl = c.document.createElement('a'); dl.className = 'btn primary'; dl.style.display = 'none';
  dl.setAttribute('href', 'data:image/png;base64,QQ=='); dl.setAttribute('download', 'omran-studio-ai.png');
  const fav = c.document.createElement('button'); wrap.appendChild(dl); wrap.appendChild(fav);
  const b = c.omranAddShareNextTo(dl, { className: 'btn' });
  assert.deepEqual(wrap.children.map((x) => x === dl ? 'dl' : (x === b ? 'share' : 'fav')), ['dl', 'share', 'fav'], 'بين التحميل والمفضّلة');
  assert.equal(b.className, 'btn omShareNext'); assert.equal(b.getAttribute('data-i18n'), 'shareNextBtn');
  assert.equal(b.style.display, 'none', 'زرّ التحميل مخفيّ = المشاركة مخفيّة');
  dl.style.display = 'block'; c.fire(dl);
  assert.equal(b.style.display, 'block'); assert.equal(b.style.width, '100%');
  b.click();
  assert.deepEqual(saved, [['data:image/png;base64,QQ==', 'omran-studio-ai.png', 'share']]);
  assert.equal(c.omranAddShareNextTo(dl, { className: 'btn' }), b, 'لا زرّ ثانٍ');
  assert.equal(wrap.children.length, 3);
});

test('١٢. قائمة أزرار التحميل المعروفة: الاستوديو والأزياء والديكور والمقاولات الخمسة وصانع الفيديو — والصور الشخصيّة لها زرّها القائم', () => {
  const c = load2();
  const sels = c.omranShareNextList.map((r) => r.sel);
  for (const id of ['#studioAiDownloadLink', '#fashionAiDownloadLink', '#designAiDownloadLink', '#constructionDownloadLink', '#constructionPhotoDownloadLink',
    '#constructionInteriorDownloadLink', '#constructionAngleDownloadLink', '#constructionRoomDownloadLink', '#videoMakerDownloadLink']) assert.ok(sels.includes(id), id);
  assert.ok(!sels.includes('#portraitStyleDownloadLink'), 'الصور الشخصيّة: زرّ «مشاركة (واتساب/ستوري)» قائم');
  const tpl = read('js/partials-core.js') + read('js/video.js'); // قوالب الأدوات وقالب صانع الفيديو
  for (const s of sels) assert.ok(tpl.includes('id="' + s.slice(1) + '"'), 'العنصر موجود في القالب: ' + s);
});

function fnSource(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
test('١٣. تطبيق متجر ويندوز/ماك «حاسوب» في الحفظ والمشاركة (omranDesktopApp) — والهواتف وأغلفة أندرويد/آيفون كما كانت؛ ومسارات الحفظ تسأله', () => {
  const UI = read('js/app-05-ui.js');
  const run = (ua, likely, mobile, extra) => {
    const ctx = Object.assign({ navigator: { userAgent: ua }, __swallow: () => {}, omranMobileUA: () => mobile, omranLikelyApp: () => likely, omranNativeBridge: () => null, omranHwWebView: () => false }, extra || {});
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fnSource(UI, 'omranDesktopApp') + ';this.r = omranDesktopApp();', ctx); return ctx.r;
  };
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
  // التطبيق المثبّت = standalone نفسه (بعد v-desk-pwa-save في main لا يعدّه omranLikelyApp على الحاسوب)
  const SA = { matchMedia: (q) => ({ matches: /standalone/.test(q) }) };
  assert.equal(run(WIN, false, false, SA), true, 'تطبيق ويندوز المثبّت (متجر مايكروسوفت بلا علم)');
  assert.equal(run('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605', false, false, SA), true, 'تطبيق ماك');
  assert.equal(run(WIN, false, false), false, 'متصفّح ويندوز عاديّ (ليس تطبيقًا) — المسار الحاسوبيّ القائم');
  assert.equal(run(WIN, true, false), false, 'علم متجر/TWA في متصفّح الحاسوب يبقى «تطبيقًا» (قرار main: desk-pwa-save ٣)');
  assert.equal(run('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile', true, true, SA), false, 'هاتف أندرويد/TWA');
  assert.equal(run(WIN, true, false, Object.assign({ omranNativeBridge: () => ({}) }, SA)), false, 'غلاف بجسر مشاركة');
  assert.equal(run(WIN, true, false, Object.assign({ OmranAndroidShare: { share() {} } }, SA)), false);
  // مسارات الحفظ تسأله قبل أن تعامل «التطبيق» هاتفًا (navigator.share = لوحة ويندوز المعلّقة)
  assert.match(fnSource(read('js/app-05-img-save.js'), 'appish'), /omranDesktopApp\(\)\) return false;/);
  assert.match(read('js/app-05-save-media.js'), /function isMobile\(\)\{\s*try\{\s*if\(typeof omranDesktopApp === 'function' && omranDesktopApp\(\)\) return false;/);
  const GD = "!(typeof omranDesktopApp === 'function' && omranDesktopApp())"; // مُحاط بـtypeof: اختبارات تنسخ دالّة وحدها في بيئة معزولة
  assert.ok(UI.includes('const mobileish = (omranLikelyApp() && ' + GD + ') || omranMobileUA();'), 'omranSaveBlob');
  assert.ok(UI.includes("viaSheet = !!(omranNativeBridge('omranShare') || (omranLikelyApp() && " + GD + ') || omranMobileUA());'), 'msgSaveExport');
  assert.ok(UI.includes("omranLikelyApp() && " + GD + '); /* v-desktop-app: تطبيق ويندوز حاسوب */'), 'بطاقة «الملفّ جاهز»');
});

test('١٤. محرّر الفيديو ونافذة «شارك المشروع برابط عامّ» يمرّان بالنافذة الموحّدة (لا لوحة ويندوز ولا صندوق نسخ وحده)', () => {
  const ve = read('js/video-edit.js');
  const so = fnSource(ve, 'shareOut');
  assert.ok(so.indexOf('window.omranShareMedia({ src: st.outBlob') >= 0 && so.indexOf('window.omranShareMedia(') < so.indexOf('navigator.share('), 'الفيديو: النافذة قبل navigator.share');
  assert.match(ve, /K\('share'\)\.hidden = !\(typeof window\.omranShareMedia === 'function' \|\|/);
  assert.match(read('index.html'), /js\/video-edit\.js\?v=(\d+)/);
  assert.ok(Number(/js\/video-edit\.js\?v=(\d+)/.exec(read('index.html'))[1]) > 9, 'وسم محرّر الفيديو مرفوع');
  const a10 = read('js/app-10-features.js');
  assert.match(a10, /const __ttl0 = String\(shareModalProject\.title \|\| ''\); closeModal\(\); window\.omranShareSheet\(\{ url: __shareOld\.url, text: __ttl0 \}\); return;/);
  assert.match(a10, /const __ttl = String\(\(shareModalProject && shareModalProject\.title\) \|\| ''\); closeModal\(\); window\.omranShareSheet\(\{ url: fullUrl, text: __ttl \}\); return;/);
});

test('١٥. زرّ أُنشئ قبل إلحاقه بالصفحة (فقاعة رسالة تُبنى ثمّ تُلحق) لا يُعدّ مخفيًّا، والنصّ الخاصّ والأسلوب المستعار يُطبّقان', () => {
  const c = load2({ globals: { omranSaveImage: () => true } });
  const cell = c.document.createElement('div'); // ليس في الصفحة بعد
  const dl = c.document.createElement('a'); dl.className = 'file-chip'; dl.setAttribute('href', 'https://cdn.example/v.mp4'); cell.appendChild(dl);
  const b = c.omranAddShareNextTo(dl, { kind: 'video', label: '↗️ مشهد 2', style: 'padding:6px 12px;' });
  assert.notEqual(b.style.display, 'none', 'ظاهر');
  assert.equal(b.textContent, '↗️ مشهد 2'); assert.equal(b.getAttribute('data-i18n'), null, 'النصّ الخاصّ لا يُستبدل بمفتاح عند تبديل اللغة');
  assert.equal(b.style.cssText, 'padding:6px 12px;');
});

test('١٦. كلّ موضع تحميل يُبنى بالكود يضيف «مشاركة» بجانبه (فيديو المحادثة، الترند، مشاهد الصانع، تصاميم الديكور، أنماط الاستوديو، بوستر التعليم، كرت Office) ومخرج التطبيق وتنظيف الفيديو في القائمة', () => {
  const has = (f, re, why) => assert.match(read(f), re, why);
  has('js/app-04-i18n-state.js', /window\.omranAddShareNextTo\(dl, \{ kind: 'video', className: 'file-chip'/, 'فيديو المحادثة');
  has('js/app-11-video-trends.js', /window\.omranAddShareNextTo\(dl, \{ kind: 'video', className: 'btn', getSrc: function\(\)\{ return u; \} \}\)/, 'الترند');
  assert.equal((read('js/app-11-video.js').match(/window\.omranAddShareNextTo\(a, \{ kind: 'video', style: a\.style\.cssText \+ 'border:0;cursor:pointer;font-family:inherit;', getSrc:/g) || []).length, 2, 'مشاهد الصانع (المساران) — «مشاركة» بمفتاحها لا «مشهد N» ثانية (v-share-visible)');
  has('js/app-12-studios.js', /window\.omranAddShareNextTo\(a, \{ kind: 'image', after: vb, className: 'btn'/, 'تصاميم الديكور المتعدّدة');
  has('js/app-13-stocks-init.js', /window\.omranAddShareNextTo\(a, \{ kind: 'image', style:/, 'أنماط الاستوديو');
  has('js/edu-plus.js', /window\.omranAddShareNextTo\(a, \{ kind: 'image', className: 'eduPrimary'/, 'بوستر التعليم');
  has('js/app-44-office.js', /window\.omranShareMedia\(\{ src: blob, name: name, kind: 'file'/, 'كرت Office');
  assert.ok(Number(/js\/edu-plus\.js\?v=(\d+)/.exec(read('index.html'))[1]) > 6, 'وسم edu-plus مرفوع');
  const c = load2();
  const sels = c.omranShareNextList.map((r) => r.sel);
  assert.ok(sels.includes('#vdDl') && sels.includes('#vmkClDl'), 'video.js: مخرج التطبيق وتنظيف الفيديو');
  const vjs = read('js/video.js');
  assert.ok(vjs.includes('id="vdDl"') && vjs.includes('id="vmkClDl"'));
});

// ── تكملة v-share-next بعد مراجعة مستقلّة (١٥ ملاحظة) ─────────────────────────────────────────────────────────────
const itemOf = (c, l) => walk(sheetOf(c), []).find((n) => n.className === 'omShIt' && n.children[1].textContent === l);

test('١٧. الروابط: البروكسي يُفكّ لأصله، والرابط الداخليّ يكتمل بلا رفع، و«تحميل» عبر الحافظ الموحّد؛ والصورة في صفحة بلا مسار الصور ترفع /i/ برمز الجلسة', async () => {
  const saves = [];
  const c = load2({ globals: { URL, location: { origin: 'https://omran.app', href: 'https://omran.app/' }, omranSaveMedia: (s, n) => { saves.push([s, n]); } } });
  c.omranShareMedia({ src: '/api/video-download?url=' + encodeURIComponent('https://cdn.example/v/a.mp4') + '&name=a.mp4', name: 'a.mp4', kind: 'video' });
  assert.equal(inputOf(c).value, 'https://cdn.example/v/a.mp4', 'البروكسي يطلب جلسة — يُشارَك الأصل');
  c.omranShareMedia({ src: '/api/video?action=veo-download&id=7', name: 'b.mp4', kind: 'video' });
  assert.equal(inputOf(c).value, 'https://omran.app/api/video?action=veo-download&id=7', 'رابط داخل التطبيق جاهز — لا يُنزَّل ليُرفع');
  assert.equal(c.fetches.length, 0, 'لا رفع لرابط قائم');
  itemOf(c, 'تحميل').click();
  assert.deepEqual(saves, [['/api/video?action=veo-download&id=7', 'b.mp4']], 'الحافظ الموحّد لا <a download> يستبدل التطبيق بالملفّ');
  // صفحة مستقلّة (استوديو الإعلانات): لا omranSaveImage ولا authGet
  const posts = [];
  const c2 = load2({ globals: {
    URL, Blob, File, atob, location: { origin: 'https://omran.app', href: 'https://omran.app/ad-studio.html' },
    localStorage: { getItem: (k) => (k === 'aiapp_auth_token' ? 'tok-123' : null) },
    fetch: async (url, init) => { posts.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ id: 'abc123def4567890' }) }; },
  } });
  assert.equal(typeof c2.omranSaveImage, 'undefined');
  c2.omranShareMedia({ src: 'data:image/png;base64,QUJD', name: 'ad-neon.png', kind: 'image' });
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(posts.length, 1); assert.equal(posts[0].url, '/api/media?action=img', 'مسار الصور لا /f/ (يُنزَّل ملفًّا ولا يظهر صورة)');
  assert.equal(posts[0].body.token, 'tok-123', 'رمز الجلسة من التخزين المحلّيّ');
  assert.equal(posts[0].body.mime, 'image/png'); assert.equal(posts[0].body.data, 'QUJD');
  assert.equal(inputOf(c2).value, 'https://omran.app/i/abc123def4567890.png');
  assert.ok(labelsOf(c2).includes('تحميل') && !labelsOf(c2).some((l) => /⬇/.test(l)), 'دائرة التحميل بلا سهم ثانٍ في التسمية');
});

test('١٨. زرّ المشاركة يتبع إخفاء انتظار التوليد (data-genw-hide) ويلحق زرّ التحميل إن نُقل — كانت مشاركة الاستوديو لا تظهر أبدًا', () => {
  const gcs = (el) => ({ display: (el && el.attrs && el.attrs['data-genw-hide'] != null) ? 'none' : ((el && el.style && el.style.display) || 'block'), visibility: 'visible', direction: 'rtl' });
  const c = load2({ globals: { getComputedStyle: gcs, omranSaveImage: () => true } });
  const wrap = c.document.createElement('div'); c.document.body.appendChild(wrap);
  const dl = c.document.createElement('a'); dl.className = 'btn';
  dl.setAttribute('href', 'data:image/png;base64,QQ=='); dl.setAttribute('data-genw-hide', '1'); wrap.appendChild(dl);
  const b = c.omranAddShareNextTo(dl, { className: 'btn' });
  assert.equal(b.style.display, 'none', 'أثناء الانتظار مخفيّ مع زرّ التحميل');
  delete dl.attrs['data-genw-hide']; c.fire(dl);
  assert.equal(b.style.display, 'block', 'انتهى التوليد = يظهر');
  assert.match(SRC, /observe\(dl, \{ attributes: true, attributeFilter: \['style', 'hidden', 'class', 'href', 'src', 'data-genw-hide'\] \}\)/, 'المراقب يسمع السمة نفسها');
  const col = c.document.createElement('div'); c.document.body.appendChild(col);
  dl.remove(); col.appendChild(dl); c.fire(dl);
  assert.equal(b.parentNode, col, 'لحق زرّ التحميل إلى حاويته الجديدة (صانع الفيديو)'); assert.equal(dl.nextSibling, b);
});

test('١٩. «المزيد» في غلاف المتجر لملفّ blob: يُجهَّز بعد الفتح (filePromise) فيُسلَّم الملفّ نفسه للجسر — والحاسوب بلا «المزيد» ولو وُجد الجسر', async () => {
  const sent = [];
  const blob = new Blob(['x'], { type: 'video/mp4' });
  const mk = (mobile) => load2({ globals: { File, URL, omranMobileUA: () => mobile, omranNativeBridge: (n) => (n === 'omranShare' ? {} : null), msgDownloadBlob: (bl, nm) => sent.push([bl, nm]),
    fetch: async () => ({ ok: true, status: 200, blob: async () => blob, json: async () => ({ url: '/f/abc' }) }) } });
  const c = mk(true);
  c.omranShareMedia({ src: 'blob:https://omran.app/xyz', name: 'clip.mp4', kind: 'video' });
  assert.ok(labelsOf(c).includes('المزيد'), 'الهاتف: «المزيد»');
  itemOf(c, 'المزيد').click();
  for (let i = 0; i < 8; i++) await tick();
  assert.equal(sent.length, 1); assert.equal(sent[0][1], 'clip.mp4'); assert.equal(sent[0][0].size, 1, 'الملفّ نفسه للجسر');
  const d = mk(false);
  d.omranShareMedia({ src: 'blob:https://omran.app/xyz', name: 'clip.mp4', kind: 'video' });
  assert.ok(!labelsOf(d).includes('المزيد'), 'الحاسوب: لا لوحة نظام');
});

test('٢٠. رابط الملفّ (/f/) يحفظ اسم ملفّ Office بلغة المستخدم (RFC 5987 بجانب اسم لاتينيّ آمن)، والاسم اللاتينيّ كما كان، ولا حقن ترويسة', async () => {
  const store = new Map();
  const kvPath = require.resolve(path.join(root, 'api/_lib/kv.js'));
  const fsPath = require.resolve(path.join(root, 'api/_lib/file-share.js'));
  const gatePath = require.resolve(path.join(root, 'api/_lib/share-gate.js'));
  const savedKv = require.cache[kvPath], savedGate = require.cache[gatePath];
  delete require.cache[fsPath];
  require.cache[gatePath] = { id: gatePath, filename: gatePath, loaded: true, exports: { gateShare: async () => 'tester', refundShare: async () => {}, uploadPlan: (b, bucket, limit, ttlSec) => ({ bucket, limit, ttlSec }) } };
  require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
    kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, v); return true; },
    kvGetRaw: async (k) => store.get(k) || null,
  } };
  try {
    const handler = require(fsPath);
    const call = async (req) => {
      const res = { headers: {}, code: 0, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
      await handler(req, res); return res;
    };
    const disp = async (name) => {
      const up = await call({ method: 'POST', body: { data: Buffer.from('x').toString('base64'), name, mime: 'application/octet-stream' } });
      assert.equal(up.code, 200, name);
      return (await call({ method: 'GET', query: { id: up.body.id } })).headers['content-disposition'];
    };
    assert.equal(await disp('جدول الحضور.xlsx'), 'attachment; filename="---- ------.xlsx"; filename*=UTF-8\'\'' + encodeURIComponent('جدول الحضور.xlsx'));
    assert.equal(await disp('omran-ai-reply.txt'), 'attachment; filename="omran-ai-reply.txt"', 'اللاتينيّ حرفيًّا كما كان');
    assert.equal(await disp('a"b\r\nSet-Cookie: x/../c.pdf'), 'attachment; filename="a-b--Set-Cookie- x-..-c.pdf"', 'لا سطر جديد ولا اقتباس ولا مسار');
  } finally {
    if (savedKv) require.cache[kvPath] = savedKv; else delete require.cache[kvPath];
    if (savedGate) require.cache[gatePath] = savedGate; else delete require.cache[gatePath];
    delete require.cache[fsPath];
  }
});

test('٢١. بقيّة مواضع التحميل: الأفاتار المتحرّك ملفًّا، ودرس الفيديو القديم، ومدينة الإلهام، ودفع ويندوز الضيّق، واستوديو الإعلانات (الصورة المولَّدة والتصاميم العشرة واللوحات الثلاث) بالـ١٤ لغة', () => {
  const st = read('js/app-12-studios.js');
  assert.ok(st.includes("if(nm === 'omran-avatar.gif' && typeof window.omranShareMedia === 'function'){ window.omranShareMedia({ src: (downloadEl && downloadEl.getAttribute('href')) || src, name: nm, kind: 'file' }); return; }"), 'الـGIF ملفًّا (مسار الصور يحوّله JPEG ثابتًا)');
  assert.ok(st.includes("if(shareBtn2) shareBtn2.style.display = 'block'; /* v-share-next"), 'زرّ مشاركة الأفاتار ظاهر');
  assert.ok(read('js/app-06-checkout.js').includes("const isMobile = document.documentElement.classList.contains('mobile-ui') && !(typeof omranDesktopApp === 'function' && omranDesktopApp());"), 'تطبيق ويندوز في نافذة ضيّقة حاسوب');
  const edu = read('edu-old/index.html');
  assert.ok(edu.includes('<button id="shareLink" type="button">'), 'درس الفيديو: الزرّ');
  assert.equal((edu.match(/download:'⬇️[^']*', share:'↗️ [^']+'/g) || []).length, 14, 'درس الفيديو: النصّ بالـ١٤ لغة');
  assert.ok(edu.includes("window.parent.omranShareMedia({ src: lastLessonBlob, name: 'lesson.mp4', kind: 'video' })"));
  assert.ok(read('inspire/real3d.html').includes("parent.omranShareMedia({ src: $('aiSave').href, name: 'city.jpg', kind: 'image' })"), 'مدينة الإلهام');
  const ad = read('ad-studio.html');
  assert.ok(ad.includes('<script defer src="/js/share-sheet.js?v='), 'الاستوديو يحمّل نافذة التطبيق نفسها');
  assert.ok(ad.includes('window.t=k=>T(k);'), 'نصوص النافذة من قاموس الصفحة');
  assert.ok(ad.includes(`<button type="button" class="genSh">'+shl()+'</button>`), 'الصورة المولَّدة');
  assert.ok(ad.includes(`<button class="shB">'+shl()+'</button>`), 'التصاميم العشرة');
  assert.ok(ad.includes(`<button class="shB" data-csh="'+i+'">'+shl()+'</button>`), 'اللوحات الثلاث');
  assert.equal((ad.match(/window\.omranShareMedia\(\{src:/g) || []).length, 3, 'الثلاثة تشارك الصورة نفسها التي تُنزَّل');
  assert.ok(Number(/\/i18n\/ad-studio\.js\?v=(\d+)/.exec(ad)[1]) > 608, 'وسم القاموس مرفوع');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(read('i18n/ad-studio.js'), ctx);
  const A = ctx.window.ADI18N;
  assert.equal(Object.keys(A).length, 14);
  for (const lg of Object.keys(A)) for (const k of ['shareSheetTitle', 'closeTitle', 'shareMessages', 'shareEmail', 'shareMore', 'sharePreparing', 'shareFail', 'shareCopy', 'shareSheetCopied', 'sheetCopyFail', 'shareLinkFail', 'shareFileBig', 'imgDlBtn', 'shareNextBtn'])
    assert.ok(typeof A[lg][k] === 'string' && A[lg][k], lg + ': ' + k);
});

// ── v-share-visible (المالك ٧ نوفمبر بعد الدمج: «شغلك مافي اي شي» + فحص المتصفّح الحقيقيّ لكلّ موضع تحميل) ─────────────────────
test('٢٢. زرّ المشاركة يلحق أسلوب زرّ التحميل بعد الربط — الاستوديو والأزياء يضيفان max-width:760px بعد أن تنفَّذ الحزمة فكان بعرض النافذة؛ والأسلوب الصريح لا يُستبدل', () => {
  const c = load2();
  const wrap = c.document.createElement('div'); c.document.body.appendChild(wrap);
  const dl = c.document.createElement('a'); dl.className = 'btn'; dl.setAttribute('href', 'data:image/png;base64,QQ==');
  dl.style.cssText = 'display:none; margin-top:8px; text-align:center;'; dl.style.display = 'none'; wrap.appendChild(dl);
  const b = c.omranAddShareNextTo(dl, { kind: 'image', className: 'btn' }); // كما يربطه SHARE_NEXT من القالب قبل الحزمة
  assert.equal(b.style.display, 'none', 'مخفيّ مع التحميل');
  // الحزمة (٤٫٧ م.ب) تنفَّذ بعد الملفّ: ST_RESULT_STYLE ثمّ تظهر النتيجة
  dl.style.cssText = 'display:block; margin-top:8px; text-align:center; max-width: 760px; margin-inline: auto;'; dl.style.display = 'block';
  c.fire(dl);
  assert.equal(b.style.cssText, dl.style.cssText, 'أسلوب التحميل الآن لا لحظة الربط');
  assert.equal(b.style.display, 'block'); assert.equal(b.style.width, '100%');
  // مزامنة بلا تغيّر في أسلوب التحميل لا تُسند cssText (الإسناد ولو بالنصّ نفسه طفرة style توقظ app-41 كلّ ٦٠ م.ث أثناء البثّ)
  let writes = 0, css = b.style.cssText;
  Object.defineProperty(b.style, 'cssText', { configurable: true, get() { return css; }, set(v) { writes++; css = v; } });
  c.fire(dl); c.fire(dl); c.fire(wrap);
  assert.equal(writes, 0, 'لا إسناد بلا تغيير');
  dl.style.cssText = 'display:block; margin-top:12px; max-width: 760px; margin-inline: auto;'; c.fire(dl);
  assert.equal(writes, 1); assert.equal(css, dl.style.cssText, 'ويلحق التغيير نفسه');
  const dl2 = c.document.createElement('a'); dl2.setAttribute('href', 'https://cdn.example/s.mp4'); wrap.appendChild(dl2);
  const b2 = c.omranAddShareNextTo(dl2, { kind: 'video', style: 'padding:6px 12px;' });
  dl2.style.cssText = 'padding:1px;'; c.fire(dl2);
  assert.equal(b2.style.cssText, 'padding:6px 12px;', 'الأسلوب الصريح (مشاهد الصانع، أنماط الاستوديو) يبقى');
  assert.match(SRC, /if\(o\.style == null && dl\.style\.cssText !== lastCss\)\{ lastCss = dl\.style\.cssText; b\.style\.cssText = lastCss; \}/);
  assert.ok(Number(/\/js\/share-sheet\.js\?v=(\d+)/.exec(read('index.html'))[1]) >= 2, 'وسم الملفّ مرفوع في التطبيق');
  assert.ok(Number(/\/js\/share-sheet\.js\?v=(\d+)/.exec(read('ad-studio.html'))[1]) >= 2, 'وفي استوديو الإعلانات');
});

test('٢٣. تنظيف الفيديو: «مشاركة» بلا أسلوب مضمَّن يمحو الذهبيّ ويُبقي النصّ الداكن على الأسود (١٫١٤:١) — مقروء في الوضعين وملاصق للتحميل في كلّ عرض', () => {
  const c = load2();
  const r = c.omranShareNextList.find((x) => x.sel === '#vmkClDl');
  assert.equal(r.className, 'vmk-cl-dl'); assert.equal(r.style, '', 'لا background:transparent مضمَّن');
  const wrap = c.document.createElement('div'); c.document.body.appendChild(wrap);
  const dl = c.document.createElement('a'); dl.className = 'vmk-cl-dl'; dl.setAttribute('href', 'blob:x'); wrap.appendChild(dl);
  const b = c.omranAddShareNextTo(dl, { kind: r.kind, className: r.className, style: r.style });
  assert.equal(b.style.cssText, ''); assert.equal(b.className, 'vmk-cl-dl omShareNext');
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-cl-dl.omShareNext{background:rgba(255,255,255,.04);border:1.5px solid rgba(232,194,122,.6);color:#f0dcb0;cursor:pointer;font-family:inherit}'), 'نصّ ذهبيّ فاتح بتعبئة «قبل» الداكنة');
  assert.ok(css.includes('html[data-mode="light"] #videoMakerModal .vmk-cl-dl.omShareNext{background:#fff;color:#8a5a12}'), 'وبنّيّ على الأبيض في الفاتح');
  const row = css.match(/#videoMakerModal \.vmk-cl-done\{[^}]*\}/)[0];
  assert.ok(row.includes('justify-content:flex-start') && !row.includes('space-between'), 'الصفّ لا يدفع الزرّ الثالث إلى الطرف الآخر');
  assert.ok(css.includes('#videoMakerModal .vmk-cl-done .vmk-cl-ab{flex-basis:100%}'), '«قبل/بعد» سطرها دائمًا والتحميل والمشاركة معًا تحتها');
  assert.ok(!/vmk-cl-ab\{margin-inline-end:auto\}|@media \(max-width:560px\)\{#videoMakerModal \.vmk-cl-done/.test(css), 'لا حدّ بعرض الشاشة: عمود الحاسوب ٣٧٣–٥١٢ يفصلهما في ٨٦١–٩٤٥');
  assert.ok(Number(/css\/modules\.css\?v=(\d+)/.exec(read('index.html'))[1]) >= 695, 'وسم modules مرفوع');
});

test('٢٤. صانع الفيديو: صفّ «مشهد N» مكان زرّ التحميل لا داخل منصّة العرض (فيديوها مطلق فوقه)، وكلّ مشهد زوج مع «مشاركة» لا ينقسم', () => {
  const js = read('js/app-11-video.js');
  const fn = (name) => { const i = js.indexOf('  function ' + name + '('); assert.ok(i >= 0, name); return js.slice(i, js.indexOf('\n  }\n', i) + 4); };
  const one = (name) => { const i = js.indexOf('  function ' + name + '('); assert.ok(i >= 0, name); return js.slice(i, js.indexOf('\n', i) + 1); };
  const make = new Function('resultEl', 'downloadEl', '__swallow', 'document', fn('placeSceneLinks') + one('scenePair') + 'return { placeSceneLinks, scenePair };');
  const node = (cls) => { const n = { cls, parentNode: null, children: [], style: {}, appendChild(c) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
    get nextSibling() { const s = this.parentNode ? this.parentNode.children : []; return s[s.indexOf(this) + 1] || null; },
    closest(sel) { let p = this; while (p) { if ('.' + p.cls === sel) return p; p = p.parentNode; } return null; } }; return n; };
  const doc = { createElement: () => node('span') };
  // بعد بناء video.js: الفيديو في .vmk-stage، والتحميل وزرّ مشاركته في العمود الجانبيّ
  const side = node('vmk-side'), stage = node('vmk-stage'), res = node('video'), status = node('status'), dl = node('dl'), share = node('share'), desc = node('desc');
  side.appendChild(stage); stage.appendChild(res); side.appendChild(status); side.appendChild(dl); side.appendChild(share); side.appendChild(desc); dl.__omShareNext = share;
  const F = make(res, dl, () => {}, doc);
  const links = node('links');
  F.placeSceneLinks(links);
  assert.equal(links.parentNode, side, 'خارج منصّة العرض'); assert.equal(share.nextSibling, links, 'تحت زرّ التحميل ومشاركته');
  stage.appendChild(links); F.placeSceneLinks(links); // صفّ قديم بقي في المنصّة من مرّة سابقة يُنقل
  assert.equal(share.nextSibling, links);
  // بلا بناء video.js (التخطيط القديم): بعد الفيديو كما كان
  const box = node('box'), res2 = node('video'); box.appendChild(res2);
  const F2 = make(res2, node('dl'), () => {}, doc); const l2 = node('links'); F2.placeSceneLinks(l2);
  assert.equal(res2.nextSibling, l2);
  const a = node('a'); const pair = F.scenePair(a);
  assert.equal(a.parentNode, pair); assert.match(pair.style.cssText, /display:inline-flex/);
  assert.equal((js.match(/placeSceneLinks\(linksEl\);/g) || []).length, 2, 'المساران: المشاهد الجزئيّة وقائمة التشغيل');
  assert.equal((js.match(/linksEl\.appendChild\(scenePair\(a\)\);/g) || []).length, 2);
  assert.ok(!js.includes('resultEl.parentNode.insertBefore(linksEl'), 'لا إدراج بعد الفيديو داخل المنصّة');
  assert.ok(!/label: '↗️ ' \+ bT\('مشهد /.test(js), 'زرّ المشاركة «مشاركة» (بلا الإيموجي كان «مشهد N» مثل زرّ التحميل)');
});

test('٢٥. صورة أداة التوليد تلحق الأسفل عند تحميلها إن لم يصعد القارئ منذ كان في الأسفل — كان زرّ «مشاركة» وشرح الصورة تحت صندوق الكتابة؛ ولا تشدّ من صعد ببحث Ctrl+F، ولا مستمع لصورة مخزّنة', () => {
  const s = read('js/app-04-i18n-state.js');
  const i = s.indexOf("const genStrip = document.createElement('div');"); assert.ok(i > 0);
  const end = s.indexOf('// 🖼️ Feature ② — image strip ABOVE the reply text', i); assert.ok(end > i);
  const blk = s.slice(i, end);
  const LINE = "if(!(gimg.complete && gimg.naturalHeight)) gimg.addEventListener('load', () => { try{ if(gimg.isConnected && window.omranChatFollow && window.omranChatFollow.followGrowth()) smartScrollBottom(true); }catch(e){ __swallow(e, 'gen:follow'); } });";
  assert.ok(blk.includes(LINE), 'قرار followGrowth (app-40) لكلّ الردود، وصورة مخزّنة بلا مستمع');
  assert.ok(!blk.includes('mIdx === cur.messages.length - 1'), 'كلّ الردود: ردّ صورة قبل آخر رسالة يكبر بعد فتح المحادثة أيضًا');
  assert.ok(!/offsetHeight \+ 160/.test(blk), 'لا حدّ ارتفاع: كلّها فشلت في فحص ما');
  // الترتيب: الشريط في فقاعته، والصورة في الشريط، قبل أدوات الصورة — فيجد وسمُها (.oImgMsg) الفقاعةَ فورًا لا بعد تمرير الرسم
  const a = blk.indexOf('div.appendChild(genStrip);'), f = blk.indexOf('__genShown.slice(0, 4).forEach(');
  assert.ok(a > 0 && a < f, 'الشريط يُلحق بالفقاعة قبل الصور');
  assert.ok(blk.includes('gb.appendChild(gimg); genStrip.appendChild(gb); window.__omranImgTools(gb, url);'), 'الصورة في الشريط قبل أدواتها');
  assert.ok(read('js/app-09-attach.js').includes("__markBox(); setTimeout(__markBox, 0);"), 'أدوات الصورة تسم فورًا ثمّ بعد نبضة');
  // المستمع منفّذًا: صورة جديدة تكبر → يلحق بقرار followGrowth؛ مخزّنة (مقاسة لحظة إدراجها) → لا مستمع
  const run = (st) => { const h = {}; let n = 0;
    const gimg = { complete: st.complete, naturalHeight: st.natH, isConnected: true, addEventListener: (ev, fn) => { h[ev] = fn; } };
    new Function('gimg', 'window', 'smartScrollBottom', '__swallow', LINE)(gimg, { omranChatFollow: { followGrowth: () => st.grow } }, (near) => { if(near === true) n++; }, (e) => { throw e; });
    if(h.load) h.load(); return { listener: !!h.load, calls: n }; };
  assert.deepEqual(run({ complete: false, natH: 0, grow: true }), { listener: true, calls: 1 }, 'صورة تُفكّ الآن والقارئ في الأسفل: يلحق');
  assert.deepEqual(run({ complete: false, natH: 0, grow: false }), { listener: true, calls: 0 }, 'صعد (Ctrl+F أو عجلة) منذ كان في الأسفل: لا يشدّ');
  assert.deepEqual(run({ complete: true, natH: 1200, grow: true }), { listener: false, calls: 0 }, 'مخزّنة: مقاسة لحظة الإدراج وload بلا نموّ — لا مستمع');
  assert.deepEqual(run({ complete: true, natH: 0, grow: true }), { listener: true, calls: 1 }, 'complete بلا مقاس (لم تُفكّ): مستمع');
});
