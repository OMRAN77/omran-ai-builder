'use strict';
// tests/acct-rows-toggle.test.cjs — فحص تفاعلية صفوف قسم «حسابي» وأزرار الباركود والمشاركة المباشرة
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const partials = fs.readFileSync('js/partials-settings.js', 'utf8');
const app05 = fs.readFileSync('js/app-05-ui.js', 'utf8');

test('١. لا سكربتات داخل قالَب HTML في partials-settings (المتصفحات لا تنفّذ سكربتات innerHTML)', () => {
  // استخراج نص المتغير H
  const matchH = partials.match(/var H = String\.raw`([\s\S]*?)`;/);
  assert.ok(matchH && matchH[1], 'قالَب H موجود في partials-settings.js');
  const hContent = matchH[1];
  assert.doesNotMatch(hContent, /<script[\s>]/i, 'لا وسوم <script> داخل قالَب H المحقون عبر innerHTML');
});

test('٢. دوال التفاعل معرّفة مباشرة على window في النطاق التنفيذي لـ partials-settings و app-05-ui', () => {
  assert.ok(partials.includes('window.acctToggleRow = function'), 'acctToggleRow معرّفة في partials-settings.js');
  assert.ok(partials.includes('window.acctToggleQr = function'), 'acctToggleQr معرّفة في partials-settings.js');
  assert.ok(partials.includes('window.acctShareApp = async function'), 'acctShareApp معرّفة في partials-settings.js');

  assert.ok(app05.includes('window.acctToggleRow = function'), 'acctToggleRow معرّفة في app-05-ui.js كحماية أساسية');
  assert.ok(app05.includes('window.acctToggleQr = function'), 'acctToggleQr معرّفة في app-05-ui.js كحماية أساسية');
  assert.ok(app05.includes('window.acctShareApp = async function'), 'acctShareApp معرّفة في app-05-ui.js كحماية أساسية');
});

test('٣. محاكاة فتح وإغلاق صفوف الحساب الخمسة وتدوير سهم التوجيه', () => {
  // محاكاة بيئة DOM مصغّرة لاختبار الدالة التنفيذية
  const elements = {};
  global.document = {
    getElementById: (id) => elements[id] || null
  };
  global.window = {};

  // تقييم كود الدالة
  const fnMatch = partials.match(/window\.acctToggleRow\s*=\s*function\([\s\S]*?\n  \};/);
  assert.ok(fnMatch, 'عثرنا على كود window.acctToggleRow');
  const createFn = new Function('window', 'document', fnMatch[0]);
  createFn(global.window, global.document);
  assert.equal(typeof global.window.acctToggleRow, 'function');

  const rows = ['acctRowUser', 'acctRowPass', 'acctRowEmail', 'acctRowRef', 'acctRowCleanup'];
  for (const rowId of rows) {
    const rowEl = { id: rowId, style: { display: 'none' } };
    elements[rowId] = rowEl;

    const chevronSvg = { style: { transform: '' } };
    const btn = {
      querySelector: (sel) => {
        if (sel === 'svg:last-of-type') return chevronSvg;
        if (sel === 'svg') return chevronSvg;
        return null;
      }
    };

    // الضغطة الأولى: يفتح الصف ويدور السهم
    global.window.acctToggleRow(rowId, btn);
    assert.equal(rowEl.style.display, 'block', `${rowId} فتح بعد الضغطة الأولى`);
    assert.equal(chevronSvg.style.transform, 'rotate(90deg)', `${rowId} السهم دار 90 درجة`);

    // الضغطة الثانية: يغلق الصف ويعود السهم لوضعه
    global.window.acctToggleRow(rowId, btn);
    assert.equal(rowEl.style.display, 'none', `${rowId} أُغلق بعد الضغطة الثانية`);
    assert.equal(chevronSvg.style.transform, '', `${rowId} عاد السهم لوضعه الطبيعي`);
  }
});

test('٤. زر تنظيف التطبيق: تدوير سهم التوجيه chevron فقط دون التأثير على أيقونة سلة المهملات الأولى', () => {
  const elements = {};
  global.document = { getElementById: (id) => elements[id] || null };
  global.window = {};

  const fnMatch = partials.match(/window\.acctToggleRow\s*=\s*function\([\s\S]*?\n  \};/);
  const createFn = new Function('window', 'document', fnMatch[0]);
  createFn(global.window, global.document);

  const cleanupEl = { id: 'acctRowCleanup', style: { display: 'none' } };
  elements['acctRowCleanup'] = cleanupEl;

  const trashSvg = { style: { transform: '' } };
  const chevronSvg = { style: { transform: '' } };
  const btn = {
    querySelector: (sel) => {
      if (sel === 'svg:last-of-type') return chevronSvg;
      if (sel === 'svg') return trashSvg;
      return null;
    }
  };

  global.window.acctToggleRow('acctRowCleanup', btn);
  assert.equal(cleanupEl.style.display, 'block');
  assert.equal(chevronSvg.style.transform, 'rotate(90deg)', 'سهم التوجيه الثاني دار');
  assert.equal(trashSvg.style.transform, '', 'أيقونة سلة المهملات الأولى لم تُمسّ');
});

test('٥. زر الباركود acctToggleQr يبدّل حالة ظهور صندوق الباركود acctQrBox', () => {
  const elements = {};
  global.document = { getElementById: (id) => elements[id] || null };
  global.window = {};

  const fnMatch = partials.match(/window\.acctToggleQr\s*=\s*function\([\s\S]*?\n  \};/);
  assert.ok(fnMatch);
  const createFn = new Function('window', 'document', fnMatch[0]);
  createFn(global.window, global.document);

  const qrBox = { id: 'acctQrBox', style: { display: 'none' } };
  elements['acctQrBox'] = qrBox;

  global.window.acctToggleQr();
  assert.equal(qrBox.style.display, 'block', 'صندوق الباركود ظهر');

  global.window.acctToggleQr();
  assert.equal(qrBox.style.display, 'none', 'صندوق الباركود اختفى');
});

/* v-acct-referral-i18n (تدقيق ١٨ أكتوبر، g12/acct-referral): زرّ «فتح الباركود» لا يتغيّر نصّه بعد الفتح، و«إرسال ومشاركة»
   يُظهر alert عربيًّا (ونصّ المشاركة وprompt عربيّان) حتّى في الإنجليزيّ. النسختان (الاحتياط في partials-settings والفعّالة
   في app-05) تتبعان المفاتيح. */
const AR_RE = /[؀-ۿ]/;
const T = { acctQrOpen: 'OPEN', acctQrClose: 'CLOSE', acctShareBtn: 'SHARE', acctReferralCopied: 'COPIED', acctShareText: 'TRY', acctCopyPrompt: 'COPY_IT', pageTitle: 'Omran AI — Platform' };
const tStub = (k) => (k in T ? T[k] : k);
function attrEl(id, attrs) {
  return { id, style: { display: 'none' }, textContent: '', value: '', attrs: Object.assign({}, attrs),
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } };
}
const COPIES = {
  partials: { qr: () => partials.match(/window\.acctToggleQr\s*=\s*function\([\s\S]*?\n  \};/), share: () => partials.match(/window\.acctShareApp\s*=\s*async function\(\)\s*\{[\s\S]*?\n  \};/) },
  app05: { qr: () => app05.match(/window\.acctToggleQr = function\(\) \{[\s\S]*?\n\};/), share: () => app05.match(/window\.acctShareApp = async function\(\) \{[\s\S]*?\n\};/) },
};

test('٦. زرّ الباركود يتبع حالته في النسختين: «إخفاء» بعد الفتح و«فتح» بعد الإغلاق، ومفتاحه معه لتبديل اللغة', () => {
  for (const [name, c] of Object.entries(COPIES)) {
    const m = c.qr();
    assert.ok(m, name + ': acctToggleQr');
    const els = { acctQrBox: attrEl('acctQrBox'), acctQrBtn: attrEl('acctQrBtn', { 'data-i18n': 'acctQrOpen' }) };
    const win = { t: tStub };
    new Function('window', 'document', 't', m[0])(win, { getElementById: (id) => els[id] || null }, tStub);
    win.acctToggleQr();
    assert.equal(els.acctQrBox.style.display, 'block', name);
    assert.deepEqual([els.acctQrBtn.textContent, els.acctQrBtn.getAttribute('data-i18n')], ['CLOSE', 'acctQrClose'], name + ' بعد الفتح');
    win.acctToggleQr();
    assert.deepEqual([els.acctQrBtn.textContent, els.acctQrBtn.getAttribute('data-i18n')], ['OPEN', 'acctQrOpen'], name + ' بعد الإغلاق');
  }
});

test('٧. «إرسال ومشاركة» بلا alert في النسختين: النسخ يومض على الزرّ نفسه، والمشاركة وprompt بمفاتيح، ولا نصّ عربيّ ثابت', async () => {
  for (const [name, c] of Object.entries(COPIES)) {
    const m = c.share();
    assert.ok(m, name + ': acctShareApp');
    const code = m[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // التعليقات خارج الفحص
    assert.doesNotMatch(code, AR_RE, name + ': لا نصّ عربيّ ثابت');
    assert.doesNotMatch(m[0], /\balert\(/, name + ': لا alert');
    const run = async (nav) => {
      const els = { acctReferralLink: attrEl('acctReferralLink'), acctShareBtn: attrEl('acctShareBtn', { 'data-i18n': 'acctShareBtn' }) };
      els.acctReferralLink.value = 'https://omran.test/?ref=sara';
      els.acctShareBtn.textContent = 'SHARE';
      const calls = { alert: 0, prompt: [], share: [], timers: [] };
      const win = { t: tStub, acctQrLink: () => 'https://omran.test/app?ref=sara' };
      new Function('window', 'document', 't', 'navigator', 'alert', 'prompt', 'setTimeout', m[0])(
        win, { getElementById: (id) => els[id] || null }, tStub, nav(calls),
        () => { calls.alert++; }, (msg, v) => { calls.prompt.push([msg, v]); }, (f) => { calls.timers.push(f); });
      await win.acctShareApp();
      return { els, calls };
    };
    let r = await run(() => ({ clipboard: { writeText: async () => {} } }));
    assert.equal(r.calls.alert, 0, name);
    assert.equal(r.els.acctShareBtn.textContent, 'COPIED', name + ': الزرّ يقول «تم نسخ الرابط»');
    r.calls.timers.forEach((f) => f());
    assert.equal(r.els.acctShareBtn.textContent, 'SHARE', name + ': ويرجع');
    r = await run(() => ({ clipboard: { writeText: async () => { throw new Error('denied'); } } }));
    assert.deepEqual(r.calls.prompt, [['COPY_IT', 'https://omran.test/app?ref=sara']], name + ': prompt بمفتاح');
    r = await run((calls) => ({ share: async (d) => { calls.share.push(d); } }));
    assert.deepEqual(JSON.parse(JSON.stringify(r.calls.share)), [{ title: 'om ai', text: 'TRY', url: 'https://omran.test/app?ref=sara' }] /* v-om-ai-name: الاسم ثابت لا من pageTitle */, name + ': المشاركة بمفتاح');
  }
});
