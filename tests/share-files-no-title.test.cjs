'use strict';
/* v-pptx-ios (فيديو المالك ٩ نوفمبر ٢٠٢٦: «الحينه في الباور بوينت اذا يحمل ملف مايطلع اي شي»):
   على الآيفون «تحميل» في كرت PowerPoint يفتح ورقة المشاركة، والمعاينة شاشة سوداء باسم «text» فيها سطر واحد هو اسم الملفّ.
   الجذر (١): navigator.share({ files, title: filename }) — سفاري الآيفون يشارك العنوان بندًا نصّيًّا ثانيًا بجانب الملفّ، فالمعاينة
   و«حفظ في الملفّات» تأخذ النصّ. القاعدة: مشاركة الملفّ بالملفّ وحده في كلّ مسارات الحفظ والمشاركة.
   الجذر (٢): PptxGenJS يعطي blob بنوع application/zip (افتراض JSZip)، فيصل الملفّ «zip» باسم .pptx للمشاركة ولرابط /f/. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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

test('١. الآيفون: «تحميل» ملفّ Office يشارك الملفّ وحده — بلا عنوان يصير بندًا نصّيًّا باسم الملفّ', async () => {
  const shares = [];
  const ctx = {
    console, Blob, File, URL: { createObjectURL: () => 'blob:x' }, setTimeout: () => 0, __swallow: () => {},
    omranNativeBridge: () => null, omranLikelyApp: () => false, omranMobileUA: () => true,
    navigator: { canShare: () => true, share: async (d) => { shares.push(d); } },
    document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} } },
  };
  vm.createContext(ctx);
  const UI = read('js/app-05-ui.js');
  vm.runInContext([fnSource(UI, 'omranSaveBlob'), fnSource(UI, 'msgSaveExport')].join('\n') + '\nthis.msgSaveExport = msgSaveExport;', ctx);
  const name = 'إدارة الأزمات واتصالات الأزمة.pptx';
  ctx.msgSaveExport(new Blob(['PK'], { type: PPTX }), name);
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  assert.equal(shares.length, 1);
  assert.deepEqual(Object.keys(shares[0]), ['files'], 'لا title ولا text مع الملفّ');
  assert.equal(shares[0].files[0].name, name);
  assert.equal(shares[0].files[0].type, PPTX);
});

test('٢. كلّ navigator.share بملفّ في كود العميل: الملفّ وحده (لا title ولا text)', () => {
  const dir = path.join(root, 'js');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'app.bundle.js');
  /* توقيعي ✍️: نصّ الرسالة مقصود مع صورة التوقيع (المشاركة للمحادثات لا للحفظ) — مستثنى صراحةً */
  const allowed = new Set(['app-20-signature.js']);
  const bad = [];
  let seen = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    /* نداء مباشر بكائن حرفيّ، أو كائن بيانات يُبنى ثمّ يُمرَّر (share-sheet) */
    const re = /\{\s*files\s*:\s*\[[^\]]*\][^{}]*\}/g;
    let m;
    while ((m = re.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      if (/canShare\(\s*$/.test(before)) continue; // فحص القدرة لا المشاركة
      seen++;
      if (/\b(title|text)\s*:/.test(m[0]) && !allowed.has(f)) bad.push(f + ': ' + m[0]);
    }
  }
  assert.ok(seen >= 9, 'وُجدت مواضع المشاركة بالملفّ (' + seen + ')');
  assert.deepEqual(bad, []);
});

test('٣. ملفّ PowerPoint الحقيقيّ (PptxGenJS المضمَّن) بنوعه لا application/zip، وملفّ zip سليم فيه presentation.xml', async () => {
  const ctx = {
    console, Blob, Uint8Array, ArrayBuffer, Promise, Date, Math, JSON, Object, Array, String, Number, Error, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, setImmediate, queueMicrotask,
    __swallow: () => {}, t: (k) => k,
    localStorage: { getItem: () => '1', setItem() {} },
    navigator: { userAgent: 'test' },
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.document = {
    getElementById: () => null,
    createElement: (tag) => (tag === 'script' ? { tag } : { style: {}, getContext() { throw new Error('no canvas'); } }),
    head: { appendChild(s) {
      try { vm.runInContext(read(s.src.replace(/^\//, '').replace(/\?.*$/, '')), ctx); setImmediate(() => s.onload()); }
      catch (e) { setImmediate(() => s.onerror(e)); }
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/app-44-office.js'), ctx);
  const blob = await ctx.omranOffice.buildPptx({
    kind: 'pptx', fileName: 'test', title: 'إدارة الأزمات', rtl: true, theme: 'teal',
    slides: [{ layout: 'title', title: 'إدارة الأزمات', subtitle: 'عرض' }, { title: 'ما هي الأزمة؟', bullets: ['أ', 'ب'] }],
  });
  assert.equal(blob.type, PPTX);
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString('latin1'), 'PK', 'ملفّ zip');
  assert.ok(buf.includes(Buffer.from('ppt/presentation.xml')), 'فيه ppt/presentation.xml');
  assert.ok(buf.length > 5000, 'ليس فارغًا (' + buf.length + ' بايت)');
});
