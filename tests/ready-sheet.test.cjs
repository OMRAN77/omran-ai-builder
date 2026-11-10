// tests/ready-sheet.test.cjs — v-ready-sheet (طلب المالك بلقطة صندوق «الملفّ جاهز»): مكوّن واحد moحّد
// window.omranReadySheet لصندوق الحفظ/المشاركة. الكمبيوتر بطاقة وسط الشاشة (تحميل ذهبيّ + نسخ + واتساب،
// بلا زرّ مشاركة لأنّ لوحة ويندوز تفشل صامتة)، والجوّال ورقة أسفل (تحميل + مشاركة النظام). أيقونات SVG
// بلا إيموجي، والواتساب/نسخ الرابط يظهران فقط مع رابط دائم (shareUrl) لا رابط تنزيل عمره ساعة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UI = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');

/* يستخرج دالّة كاملة من المصدر بمطابقة الأقواس (بلا تنفيذ بقيّة الملفّ الثقيل) */
function fnSource(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  assert.ok(m, 'الدالّة ' + name + ' موجودة');
  let i = src.indexOf('{', m.index), depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, k + 1); }
  }
  throw new Error('لم تُغلق ' + name);
}
const SRC = ['rsT', 'rsBytes', 'rsIcon', 'omranReadySheet'].map((n) => fnSource(UI, n)).join('\n');

const EMOJI = /\p{Extended_Pictographic}/u;
// قاموس يحمل الإيموجي عمدًا — نثبت أنّ المكوّن ينزعه
const T = {
  imgReadyTitle: '✅ الصورة جاهزة', fileReadyTitle: '✅ الملف جاهز',
  imgDlBtn: '⬇️ تحميل', imgWaBtn: '💬 واتساب', imgShareBtn: '📤 مشاركة',
  sheetCopyImg: 'نسخ الصورة', sheetCopyLink: 'نسخ الرابط', sheetCopied: 'تم النسخ',
  sheetCopyFail: 'تعذّر النسخ', sheetShareFail: 'تعذّرت المشاركة — جرّب التحميل',
  sheetDlDesktop: 'تم التحميل — تلقاها في مجلد التنزيلات', closeTitle: 'إغلاق',
};

function render(opts, { mobile = false, canShare = false } = {}) {
  const made = [];
  const mk = (tag) => {
    const e = { tag, style: {}, dataset: {}, attrs: {}, children: [], href: '', innerHTML: '', textContent: '', id: '',
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, remove() {}, click() {} };
    made.push(e); return e;
  };
  const ctx = {
    lang: 'ar', t: (k) => T[k] || k, __swallow() {},
    omranMobileUA: () => mobile, omranLikelyApp: () => false,
    document: { createElement: mk, getElementById: () => null, body: { appendChild() {} } },
    navigator: canShare ? { canShare: () => true, share: () => Promise.resolve() } : {},
    URL: { createObjectURL: () => 'blob:thumb', revokeObjectURL() {} },
    encodeURIComponent, decodeURIComponent, setTimeout: () => 0, String, Number, Math, Date, Error, Promise, console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n;this.omranReadySheet = omranReadySheet;', ctx);
  const ok = ctx.omranReadySheet(opts);
  const row = made.find((e) => String(e.style.cssText || '').includes('grid-template-columns:repeat('));
  const btns = row ? row.children : [];
  const labelOf = (b) => { const l = b.children.find((c) => c.textContent); return l ? String(l.textContent) : ''; };
  const hasSvg = (b) => b.children.some((c) => String(c.innerHTML || '').includes('<svg'));
  const hasBackdrop = made.some((e) => e.id === 'omranReadyBg');
  const titleEl = made.find((e) => /جاهز/.test(String(e.textContent || '')));
  return { ok, made, btns, labels: btns.map(labelOf), hasSvg, hasBackdrop, titleText: titleEl ? String(titleEl.textContent) : '', row };
}

test('الكمبيوتر + صورة + رابط دائم: تحميل (ذهبيّ) + نسخ الصورة + واتساب، بلا مشاركة، وخلفيّة مركزيّة', () => {
  const r = render({ kind: 'image', name: 'a.png', downloadUrl: 'https://app.example/i/x.raw.png?dl=1', shareUrl: 'https://app.example/i/x.png', shareFile: { size: 9, type: 'image/png' }, size: 2048 }, { mobile: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.labels, ['تحميل', 'نسخ الصورة', 'واتساب'], 'الأزرار الثلاثة بترتيبها');
  assert.ok(r.btns.every(r.hasSvg), 'كلّ زرّ بأيقونة SVG');
  assert.ok(r.hasBackdrop, 'بطاقة وسط الشاشة لها خلفيّة معتمة');
  assert.ok(!r.labels.includes('مشاركة'), 'لا زرّ مشاركة على الكمبيوتر');
  // تحميل ذهبيّ، والباقي بإطار فقط
  assert.match(String(r.btns[0].style.cssText), /#d4af37/, 'تحميل ذهبيّ');
  assert.match(String(r.btns[1].style.cssText), /background:none/, 'نسخ بإطار');
  assert.match(String(r.btns[2].style.cssText), /background:none/, 'واتساب بإطار');
  // واتساب يحمل الرابط الدائم لا رابط التنزيل
  const wa = r.btns[2];
  assert.match(String(wa.href), /wa\.me\/\?text=/);
  assert.equal(decodeURIComponent(String(wa.href).split('text=')[1]), 'https://app.example/i/x.png', 'الرابط الدائم (٧ أيّام)');
  assert.ok(!String(wa.href).includes('dl=1'), 'ليس رابط التنزيل ذا الساعة');
});

test('الجوّال + صورة قابلة للمشاركة: تحميل + مشاركة النظام، بلا واتساب، وورقة سفليّة بلا خلفيّة', () => {
  const r = render({ kind: 'image', name: 'b.png', downloadUrl: 'https://app.example/i/y.raw.png?dl=1', shareUrl: 'https://app.example/i/y.png', shareFile: { size: 9, type: 'image/png' } }, { mobile: true, canShare: true });
  assert.deepEqual(r.labels, ['تحميل', 'مشاركة']);
  assert.ok(!r.hasBackdrop, 'الجوّال ورقة سفليّة بلا خلفيّة مركزيّة');
  assert.ok(r.btns.every(r.hasSvg));
});

test('وضع الحفظ (بلا رابط دائم): الكمبيوتر = تحميل + نسخ الصورة فقط، لا واتساب (الرابط يموت بعد ساعة)', () => {
  const r = render({ kind: 'image', name: 'c.png', downloadUrl: 'https://app.example/i/z.raw.png?dl=1', shareFile: { size: 9, type: 'image/png' } }, { mobile: false });
  assert.deepEqual(r.labels, ['تحميل', 'نسخ الصورة']);
  assert.ok(!r.labels.includes('واتساب'), 'لا واتساب برابط عمره ساعة');
});

test('الكمبيوتر + PDF + رابط دائم: نسخ الرابط (لا نسخ الصورة) + واتساب', () => {
  const r = render({ kind: 'pdf', name: 'doc.pdf', downloadUrl: 'https://app.example/p/d.pdf', shareUrl: 'https://app.example/p/d.pdf', shareFile: null }, { mobile: false });
  assert.deepEqual(r.labels, ['تحميل', 'نسخ الرابط', 'واتساب']);
});

test('بلا إيموجي في أيّ نصّ (العنوان والأزرار) — المكوّن ينزع رمز المفاتيح القديمة', () => {
  const r = render({ kind: 'image', name: 'd.png', downloadUrl: 'https://app.example/i/w.raw.png?dl=1', shareUrl: 'https://app.example/i/w.png', shareFile: { size: 9, type: 'image/png' } }, { mobile: false });
  assert.doesNotMatch(r.titleText, EMOJI, 'العنوان بلا إيموجي: ' + r.titleText);
  assert.equal(r.titleText, 'الصورة جاهزة');
  for (const lbl of r.labels) assert.doesNotMatch(lbl, EMOJI, 'زرّ بلا إيموجي: ' + lbl);
  // كلّ نصوص الصندوق بلا إيموجي
  for (const e of r.made) assert.doesNotMatch(String(e.textContent || ''), EMOJI, 'نصّ بإيموجي: ' + e.textContent);
});

test('ملفّ غير صورة بلا رابط ولا ملفّ: زرّ تحميل وحده (لا نسخ ولا واتساب مكسور)', () => {
  const r = render({ kind: 'file', name: 'f.zip', downloadUrl: 'blob:local' }, { mobile: false });
  assert.deepEqual(r.labels, ['تحميل']);
});
