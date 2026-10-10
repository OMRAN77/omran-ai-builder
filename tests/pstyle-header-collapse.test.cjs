// tests/pstyle-header-collapse.test.cjs — v-psheet-header-collapse (طلب المالك بلقطة جوّال: رأس
// «أنماط الصور» كان مساحة ثابتة كبيرة طوال تمرير المعرض. الحلّ: bindPsheetHeaderCollapse تراقب سكرول
// المعرض وتضيف/تزيل class على #portraitStyleSheetHeader فيرتفع العنوان ويصغر الرأس بعد أوّل ٢٠px سكرول
// ويعود لحجمه عند القمّة. يشغّل هذا الاختبار الدالّة الحقيقيّة من js/app-12-studios.js في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start > 0, name + ' موجودة');
  const end = src.indexOf('\n  }', start) + 4;
  return src.slice(start, end);
}

function makeScroller() {
  const listeners = {};
  return {
    scrollTop: 0,
    addEventListener(type, fn) { listeners[type] = fn; },
    __fire() { listeners.scroll(); },
    __listenerCount: () => Object.keys(listeners).length,
  };
}

function makeHeader() {
  const classes = new Set();
  return { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } }, __classes: classes };
}

function load(src, header) {
  const body = extractFn(src, 'bindPsheetHeaderCollapse');
  const ctx = { document: { getElementById: (id) => (id === 'portraitStyleSheetHeader' ? header : null) } };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx.bindPsheetHeaderCollapse;
}

for (const file of ['js/app-12-studios.js', 'js/app.bundle.js']) {
  test(file + ': السكرول بعد ٢٠px يضيف pstyleHeaderSmall، والعودة للقمّة تزيله', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const header = makeHeader();
    const scroller = makeScroller();
    const bind = load(src, header);
    bind(scroller);

    scroller.scrollTop = 5; scroller.__fire();
    assert.ok(!header.__classes.has('pstyleHeaderSmall'), 'سكرول خفيف لا يصغّر الرأس بعد');

    scroller.scrollTop = 30; scroller.__fire();
    assert.ok(header.__classes.has('pstyleHeaderSmall'), 'سكرول أكثر من ٢٠px يصغّر الرأس ويرفع العنوان');

    scroller.scrollTop = 0; scroller.__fire();
    assert.ok(!header.__classes.has('pstyleHeaderSmall'), 'العودة للقمّة تعيد الرأس لحجمه');
  });

  test(file + ': الربط مرّة واحدة فقط (لا يتكرّر مستمع السكرول عند إعادة فتح المعرض)', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const header = makeHeader();
    const scroller = makeScroller();
    const bind = load(src, header);
    bind(scroller);
    const before = scroller.__listenerCount();
    bind(scroller);
    assert.equal(scroller.__listenerCount(), before, 'استدعاء ثانٍ لا يضيف مستمعًا جديدًا');
    assert.equal(scroller.__pstyleHeaderBound, true);
  });
}

test('js/partials-core.js: رأس المعرض وعنوانه يحملان id يستهدفهما تصغير السكرول', () => {
  const src = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
  assert.match(src, /id="portraitStyleSheetHeader"/, 'الرأس يحمل id');
  assert.match(src, /id="portraitStyleSheetTitle"/, 'العنوان يحمل id');
});

for (const file of ['js/app-12-studios.js', 'js/app.bundle.js']) {
  test(file + ': ensurePsheetChrome يربط تصغير الرأس بسكرولر المعرض', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const i = src.indexOf('function ensurePsheetChrome');
    assert.ok(i > 0);
    const block = src.slice(i, i + 400);
    assert.match(block, /bindPsheetHeaderCollapse\(scroller\)/, 'ensurePsheetChrome يستدعي bindPsheetHeaderCollapse');
  });

  test(file + ': CSS تصغير الرأس (pstyleHeaderSmall) يرفع العنوان ويخفي العدّاد', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /pstyleHeaderSmall\{padding-top:/, 'الرأس يصغّر حشوته العلوية');
    assert.match(src, /pstyleHeaderSmall #portraitStyleSheetTitle\{font-size:14\.5px/, 'العنوان يصغر ويرتفع');
    assert.match(src, /pstyleHeaderSmall #portraitStyleSheetCount\{opacity:0/, 'العدّاد يختفي فيتوفّر ارتفاع إضافي');
  });
}
