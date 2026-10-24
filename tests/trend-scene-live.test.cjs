// tests/trend-scene-live.test.cjs — v-trend-scene-live (٢٠ أكتوبر ٢٠٢٦): المالك بصورة مشاهد الترندات الأربعة: «هذيل ما يشتغلون».
// بالمسار الحقيقيّ (ضغط «اصنع الفيديو» مع خادم وهميّ) لم يظهر مشهد الترند قطّ: نصوص لوحة الترندات تمرّ بـnoEmoji (ui) فيُكتب
// «يصنع الفيديو… نحو دقيقتين» بلا ⏳ أصلًا، ورصد مشهد التوليد كان يعرف «مشغول» بذلك الرمز. تحقّق v-scene-kinds كتب سطر الحالة
// باليد بالرمز — فمرّ. الآن اللوحة تعلن انشغالها بسمة data-genw-busy على سطر حالتها، والرصد يقرؤها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-34-gen-wait.js');
const VT = read('js/app-11-video-trends.js');

/* بيانات الترندات بنصوصها الأربع عشرة، وnoEmoji من ملفّ اللوحة نفسه */
const dataBox = { window: {} };
vm.runInNewContext(read('js/app-11-video-trends-data.js'), dataBox);
const D = dataBox.window.__VIDEO_TRENDS;
const noEmojiSrc = VT.slice(VT.indexOf('  var NOEMO_RE;'), VT.indexOf('  function ui(k){'));
const NE = {}; vm.runInNewContext(noEmojiSrc + ';this.noEmoji = noEmoji;', NE);

/* DOM وهميّ بقدر ما يحتاجه scan() و render(): سطر حالة الترند في لوحته، وكلّ ما عداه غائب */
function fakeEl(name) {
  const attrs = new Map();
  const t = {
    name, kids: [], parentNode: null, nextSibling: null, className: '', innerHTML: '', textContent: '',
    style: new Proxy({}, { get: (o, k) => (k === 'setProperty' ? () => {} : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    setAttribute: (k, v) => { attrs.set(k, String(v)); }, getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => { attrs.delete(k); }, hasAttribute: (k) => attrs.has(k),
    querySelectorAll: () => [], appendChild: (c) => { t.kids.push(c); c.parentNode = p; return c; },
    getBoundingClientRect: () => ({ width: 300, height: 300, top: 0, bottom: 300, left: 0, right: 300 }), closest: () => null,
  };
  t.querySelector = (sel) => {
    const m = /^\.genw\[data-genw-panel="([^"]+)"\]$/.exec(sel);
    if (m) return t.kids.find((c) => c.getAttribute && c.getAttribute('data-genw-panel') === m[1]) || null;
    // عناصر البطاقة الموجودة في HTMLها فقط — المشهد يرسم ما فيه (قوس، رقم، شريط) وما غاب يُتخطّى
    const cls = /^\.([\w-]+)/.exec(sel);
    return cls && new RegExp('class="(?:[^"]*\\s)?' + cls[1] + '(?:\\s[^"]*)?"').test(t.innerHTML) ? fakeEl('sub') : null;
  };
  t.insertBefore = (c) => { t.kids.push(c); c.parentNode = p; return c; };
  t.removeChild = (c) => { t.kids.splice(t.kids.indexOf(c), 1); c.parentNode = null; return c; };
  const p = new Proxy(t, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' ? () => {} : undefined)) });
  return p;
}
function world() {
  const panel = fakeEl('panel'), st = fakeEl('vtStatus');
  panel.appendChild(st);
  const store = new Map();
  const sandbox = {
    window: {}, Date, Math,
    document: {
      readyState: 'complete', body: fakeEl('body'), head: fakeEl('head'), documentElement: fakeEl('html'),
      querySelectorAll: () => [], getElementById: () => null, createElement: (n) => fakeEl(n), createTextNode: (s) => ({ textContent: s }),
      querySelector: (sel) => (sel === '#vtStatus' ? st : null),
    },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    MutationObserver: function () { return { observe() {} }; },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    __swallow: (e) => { throw e; },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const W = sandbox.window.omranGenWait;
  const card = () => panel.kids.find((c) => c.getAttribute('data-genw-panel') === 'vtrend') || null;
  return { W, st, panel, card };
}

test('١. الجذر: نصّ «يصنع الفيديو» يصل سطر الحالة بلا ⏳ في كلّ اللغات — فالرصد بالرمز لا يرى الانشغال', () => {
  assert.ok(VT.includes("function ui(k){ return noEmoji(T(D.ui[k])); }"), 'كلّ نصوص اللوحة تمرّ بـnoEmoji');
  const langs = Object.keys(D.ui.working);
  assert.ok(langs.length >= 14, 'نصّ «يصنع» بكلّ اللغات: ' + langs.length);
  const W = world().W;
  const oldCfg = { id: 'old', busy: ['⏳'], busyHas: ['⏳'] }; // إعداد v-scene-kinds
  for (const l of langs) {
    const shown = NE.noEmoji(D.ui.working[l]);
    assert.ok(shown.length > 3 && !shown.includes('⏳'), l + ': ' + shown);
    assert.equal(W._panelBusy(oldCfg, shown), false, l + ': بالرمز ما كان يُرى «مشغولًا» — هذا هو العطب');
  }
});

test('٢. الترندات تعلن انشغالها بسمة: تُضبط قبل كتابة «يصنع» وتُرفع قبل «جاهز» والخطأ وفي finally', () => {
  assert.ok(VT.includes("function setBusyFlag(on){ var s = $('vtStatus'); if(!s) return; if(on) s.setAttribute('data-genw-busy', '1'); else s.removeAttribute('data-genw-busy'); }"));
  const make = VT.slice(VT.indexOf('  async function make(t){'), VT.indexOf('}finally{', VT.indexOf('  async function make(t){')) + 120);
  const on = make.indexOf('setBusyFlag(true);'), working = make.indexOf("status(ui('working'));");
  assert.ok(on > 0 && on < working, 'السمة قبل النصّ: كتابة النصّ هي التي توقظ الرصد');
  assert.ok(make.indexOf("status(ui('photoReq'))") < on && make.indexOf("status(ui('login'))") < on, 'رسائل ما قبل التوليد لا تُعلن انشغالًا');
  assert.equal((make.match(/setBusyFlag\(true\)/g) || []).length, 1);
  const done = make.indexOf("status(ui('done'));");
  assert.ok(make.lastIndexOf('setBusyFlag(false);', done) > make.lastIndexOf('out.appendChild(again);', done), 'تُرفع قبل «جاهز» مباشرة');
  /* v-trend-one-confirm: في catch فرع المشاهد المكتملة قبل نصّ الخطأ — السمة ما زالت أوّل ما يُرفع */
  assert.match(make, /\}catch\(e\)\{\n\s+setBusyFlag\(false\);\n[\s\S]*?else if\(String\(e && e\.message\) !== 'cancelled'\) status\(errText\(e\)\);/, 'وقبل نصّ الخطأ');
  const cat = make.slice(make.lastIndexOf('}catch(e){')); // catch التوليد (الأوّل في make لتخزين رقم الخلفيّة)
  assert.ok(cat.indexOf('setBusyFlag(false);') < cat.indexOf('status('), 'أوّل ما في catch');
  assert.match(make, /\}finally\{ busy = false; setBusyFlag\(false\);/, 'وفي finally — لا تبقى عالقة');
});

test('٣. الرصد: لوحة الترندات بالسمة لا بالنصّ — المشهد يُركَّب بنصّ بلا إيموجي ويبقى عبر المشاهد ويُرفع مع «جاهز»', () => {
  const { W, st, card } = world();
  const p = W.PANELS.find((x) => x.id === 'vtrend');
  assert.equal(p.busyAttr, 'data-genw-busy'); assert.equal(p.busy, undefined); assert.equal(p.busyHas, undefined);
  assert.match(SRC, /var busy = p\.busyAttr \? attrBusy\(p, pel\) : panelBusy\(p, ptxt\);/);
  // قبل التوليد: نصّ بلا سمة (رسالة «يحتاج صورة») — لا مشهد
  st.textContent = NE.noEmoji(D.ui.photoReq.ar); W.scan();
  assert.equal(card(), null, 'رسالة ما قبل التوليد');
  // التوليد: السمة ثمّ «يصنع الفيديو…» بلا ⏳ — كما تكتبه اللوحة حرفيًّا
  st.setAttribute('data-genw-busy', '1'); st.textContent = NE.noEmoji(D.ui.working.ar); W.scan();
  const c = card();
  assert.ok(c, 'المشهد ركّب');
  assert.match(c.className, /genw--scene genw--vt/, 'من مشاهد الترندات الأربعة: ' + c.className);
  // الترند المتعدّد المشاهد: النصّ يتبدّل («المشهد ٢ من ٣…»، العدّ التنازليّ) والسمة باقية — المشهد نفسه
  st.textContent = 'المشهد 2 من 3… ' + NE.noEmoji(D.ui.working.ar); W.scan();
  assert.equal(card(), c, 'لا يُعاد تركيبه');
  // «جاهز»: السمة تُرفع قبل النصّ
  st.removeAttribute('data-genw-busy'); st.textContent = NE.noEmoji(D.ui.done.ar); W.scan();
  assert.equal(card(), null, 'رُفع مع النتيجة');
  // توليد ثانٍ: المشهد التالي بالدور
  st.setAttribute('data-genw-busy', '1'); st.textContent = NE.noEmoji(D.ui.working.ar); W.scan();
  assert.ok(card() && card().className !== c.className, 'دور المشاهد: ' + card().className);
});

test('٤. اللوحات الأخرى كما هي — بالنصّ، والسمة وحدها لا تغيّرها', () => {
  const { W } = world();
  assert.equal(W.PANELS.length, 6);
  for (const p of W.PANELS) if (p.id !== 'vtrend') assert.equal(p.busyAttr, undefined, p.id);
  const el = (v) => ({ getAttribute: (k) => (k === 'data-genw-busy' ? v : null) });
  const p = W.PANELS.find((x) => x.id === 'vtrend');
  assert.equal(W._attrBusy(p, el('1')), true); assert.equal(W._attrBusy(p, el(null)), false); assert.equal(W._attrBusy(p, null), false);
});

test('٥. الحزمة، التسجيل، القرار', () => {
  const bundle = read('js/app.bundle.js');
  for (const k of ["function setBusyFlag(on){", "busyAttr: 'data-genw-busy'", 'function attrBusy(p, pel){']) assert.ok(bundle.includes(k), 'الحزمة تحمل: ' + k);
  assert.ok(read('package.json').includes('node tests/trend-scene-live.test.cjs'), 'الاختبار مسجَّل');
  assert.ok(read('knowledge/DECISIONS.md').includes('— v-trend-scene-live:'), 'مدخل القرار في السجلّ');
});
