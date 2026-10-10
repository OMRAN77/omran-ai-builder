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
