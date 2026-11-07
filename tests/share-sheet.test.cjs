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
  const keys = ['shareSheetTitle', 'shareCopy', 'shareCopied', 'shareMore', 'shareMessages', 'shareEmail', 'shareFail', 'sharePreparing', 'shareLinkFail'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((data.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, 'ar+en: ' + k);
  const ctx = { I18N: {} }; ctx.window = ctx; vm.createContext(ctx);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    ctx.I18N[lg] = {};
    vm.runInContext(read('i18n/' + lg + '.js'), ctx);
    for (const k of keys) assert.ok(typeof ctx.I18N[lg][k] === 'string' && ctx.I18N[lg][k], lg + ': ' + k);
  }
});
