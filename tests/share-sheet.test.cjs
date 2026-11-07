'use strict';
/* v-share-sheet (لقطة المالك ٧ نوفمبر: نافذة يوتيوب «نفس هذي في كل التطبيق»، و«الصور لا ترسمه — الصور الرسميّة»):
   نافذة مشاركة واحدة (js/app-45-share-sheet.js) لكلّ أزرار المشاركة. الجذر: تطبيق متجر ويندوز يُعدّ «تطبيقًا» فكانت المسارات تفتح
   لوحة ويندوز المعلّقة. ١–٦ النافذة نفسها في بيئة DOM مزيّفة (حاسوب/هاتف/نصّ/رابط مؤجَّل/حوار/ملفّ بلا رابط)، ٧ الشعارات الرسميّة،
   ٨ كلّ مسار مشاركة يمرّ بها أوّلًا، ٩ النصوص بالـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-45-share-sheet.js');

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
  vm.runInContext(SRC, ctx, { filename: 'app-45-share-sheet.js' });
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
  assert.ok(read('js/app.bundle.js').includes('window.omranShareSheet = function'), 'الحزمة مبنيّة بالجزء');
  assert.ok(read('.vercelignore').split('\n').includes('js/app-45-share-sheet.js'));
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
  vm.runInContext(SRC, ctx, { filename: 'app-45-share-sheet.js' });
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
  assert.equal(run(WIN, true, false), true, 'تطبيق ويندوز');
  assert.equal(run('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605', true, false), true, 'تطبيق ماك');
  assert.equal(run(WIN, false, false), false, 'متصفّح ويندوز عاديّ (ليس تطبيقًا) — المسار الحاسوبيّ القائم');
  assert.equal(run('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile', true, true), false, 'هاتف أندرويد/TWA');
  assert.equal(run(WIN, true, false, { omranNativeBridge: () => ({}) }), false, 'غلاف بجسر مشاركة');
  assert.equal(run(WIN, true, false, { OmranAndroidShare: { share() {} } }), false);
  // مسارات الحفظ تسأله قبل أن تعامل «التطبيق» هاتفًا (navigator.share = لوحة ويندوز المعلّقة)
  assert.match(fnSource(read('js/app-05-img-save.js'), 'appish'), /omranDesktopApp\(\)\) return false;/);
  assert.match(read('js/app-05-save-media.js'), /function isMobile\(\)\{\s*try\{\s*if\(typeof omranDesktopApp === 'function' && omranDesktopApp\(\)\) return false;/);
  const GD = "!(typeof omranDesktopApp === 'function' && omranDesktopApp())"; // مُحاط بـtypeof: اختبارات تنسخ دالّة وحدها في بيئة معزولة
  assert.ok(UI.includes('const mobileish = (omranLikelyApp() && ' + GD + ') || omranMobileUA();'), 'omranSaveBlob');
  assert.ok(UI.includes("viaSheet = !!(omranNativeBridge('omranShare') || (omranLikelyApp() && " + GD + ') || omranMobileUA());'), 'msgSaveExport');
  assert.ok(UI.includes("omranLikelyApp() && " + GD + '); /* v-desktop-app: تطبيق ويندوز حاسوب */'), 'بطاقة «الملفّ جاهز»');
  assert.match(read('js/app-12-studios.js'), /omranLikelyApp\(\) && !\(typeof omranDesktopApp === 'function' && omranDesktopApp\(\)\)\); \/\* v-desktop-app \*\//);
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
  assert.equal((read('js/app-11-video.js').match(/window\.omranAddShareNextTo\(a, \{ kind: 'video', label: '↗️ ' \+ bT\('مشهد ', 'Scene '\)/g) || []).length, 2, 'مشاهد الصانع (المساران)');
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
