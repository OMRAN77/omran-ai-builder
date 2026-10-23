// tests/om3-press.test.cjs — v-om3-press: «نفس الشي ما تغيّر الوميض عند الضغط» (المالك ٢٣ أكتوبر ٢٠٢٦ بعد v-om3-still).
//
// المقيس بالمسبار (لكلّ إطار، حاسوب وجوّال): الضغط على تبويب في صانع الفيديو يعيد بناء شريطه، والتبويب الجديد
// يُرسم إطارًا أو اثنين (~٥٠ مللي ثانية) بأسلوبه الأصليّ (حدّ ذهبيّ مصمت وخلفيّة أفتح) ثمّ يصنّفه مصنّف الألوان الثلاثة
// في وقت الفراغ فيطفئ الحدّ — وميض. وعلى أندرويد فوقه غطاء اللمس الأزرق الافتراضيّ. بعد الإصلاح: صفر إطارات بلا أصناف.
// (نظيره في app-36-clean-ui.js — الإيموجي يُرسم إطارًا ثمّ يُقصّ — أصلحه #1221 v-no-emoji-flash، واختباره clean-ui ٦.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src41 = read('js/app-41-three-colors.js');
const src36 = read('js/app-36-clean-ui.js');
const pick = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('مقطع غير موجود: ' + from); return src.slice(a, b); };

/** طابور app-41 الحقيقيّ (push/add/pump/schedule/markNow) فوق mark وهميّ يسجّل، ووقت فراغ لا يأتي أبدًا */
function queue41() {
  const marked = [], idle = [];
  const node = (n, kids) => ({ nodeType: 1, isConnected: true, id: n, closest: () => null, getElementsByTagName: () => kids || [] });
  const sb = { window: { requestIdleCallback: (f, o) => { idle.push(f); return 1; } }, WeakSet, setTimeout: (f) => { idle.push(f); return 1; }, document: {},
    TOOLS: '#x', mark: (el) => marked.push(el.id) };
  sb.window.requestIdleCallback = (f) => { idle.push(f); return 1; };
  vm.runInNewContext(pick(src41, '  /* طابور عناصر', '  function start(){') + '\nthis.add=add;this.itemsOf=function(){return items;};', sb);
  return { add: sb.add, marked, idle, node, items: sb.itemsOf };
}

test('١. app-41: الدفعة الصغيرة من المراقب تُصنَّف فورًا (قبل الرسم)، وبلا «الآن» تنتظر وقت الفراغ كما كانت', () => {
  const q = queue41();
  const kids = Array.from({ length: 12 }, (_, i) => q.node('k' + i));
  q.add(q.node('tab', kids), false, true);
  assert.deepEqual(q.marked, ['tab', ...kids.map((k) => k.id)], 'التبويب وأبناؤه مصنَّفون في النداء نفسه — لا إطار بلا أصناف');
  assert.equal(q.items().length, 0);
  const q2 = queue41();
  q2.add(q2.node('lazy'));
  assert.deepEqual(q2.marked, [], 'بلا now: في الطابور حتّى وقت الفراغ (الفحص الأوّل للصفحة)');
  assert.equal(q2.idle.length, 1, 'جُدول في وقت الفراغ');
  q2.idle[0]({ timeRemaining: () => 50 });
  assert.deepEqual(q2.marked, ['lazy']);
  const q3 = queue41();
  q3.add(q3.node('x'), true, true);
  assert.deepEqual(q3.marked, ['x'], 'تغيّر style أو transitionend: العنصر وحده فورًا');
});

test('٢. app-41: دفعة أكبر من الميزانيّة (١٢٠) لا تُصنَّف فورًا (لا مهمّة طويلة على أندرويد) بل في وقت الفراغ', () => {
  const q = queue41();
  const kids = Array.from({ length: 450 }, (_, i) => q.node('k' + i));
  q.add(q.node('big', kids), false, true);
  assert.deepEqual(q.marked, [], 'ما فوق SYNC_MAX يُؤجَّل');
  assert.equal(q.items().length, 451);
  assert.equal(q.idle.length, 1);
  assert.ok(src41.includes('var SYNC_MAX = 120, budget = SYNC_MAX;'));
  assert.ok(src41.includes("if(r.type === 'childList'){ for(var j = 0; j < r.addedNodes.length; j++) add(r.addedNodes[j], false, true); }") && src41.includes('else add(r.target, true, true);'), 'المراقب يطلب التصنيف الفوريّ');
  assert.ok(src41.includes("{ budget = SYNC_MAX; add(e.target, true, true); } }, true);"), 'transitionend كذلك');
  assert.ok(src41.includes('    add(document.body);\n'), 'الفحص الأوّل بلا now');
  assert.ok(src41.includes('if(now && all.length + 1 <= budget){ budget -= all.length + 1; markNow([node]);'), 'الفوريّ بعناصر التغيّر نفسه وبالميزانيّة');
});

test('٣. CSS: لا توهّج لمس افتراضيّ على أيّ عنصر، في أوّل redesign.css (كلّ الأوضاع — بلا-خطوط.css للأسود وحده)، والوسم مرفوع؛ والحزمة مبنيّة', () => {
  const css = read('css/redesign.css');
  assert.ok(/^\/\* v-om3-press[^\n]*\*\/\n\*\{-webkit-tap-highlight-color:transparent\}\n/.test(css), 'قاعدة عامّة في رأس الملفّ (لكلّ الأوضاع لا الأسود وحده)');
  assert.equal((css.match(/tap-highlight-color/g) || []).length, 2, 'العامّة + القديمة على بطاقات الأدوات');
  assert.ok(!read('css/بلا-خطوط.css').includes('tap-highlight'), 'بلا-خطوط.css للوضع الأسود وحده (no-lines-2 ٢)');
  const tag = Number((read('index.html').match(/css\/redesign\.css\?v=(\d+)/) || [])[1]);
  assert.ok(tag >= 696, 'وسم redesign.css رُفع (يُقرأ لا يُثبَّت)');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('var SYNC_MAX = 120, budget = SYNC_MAX;') && bundle.includes('function markNow(list){'), 'شغّل npm run bundle');
});

test('٤. app-41: التغيّر الصغير لا يفرّغ طابور الفتح المؤجَّل (كان ٨٢٠–٨٧٠ م.ث متواصلة عند فتح صانع الفيديو على جوّال بمعالج ×٤)، والميزانيّة لكلّ نداء', () => {
  const q = queue41();
  const big = Array.from({ length: 844 }, (_, i) => q.node('o' + i));
  q.add(q.node('modal', big), false, true);
  assert.equal(q.items().length, 845, 'فتح النافذة (٨٤٤) مؤجَّل كلّه');
  const tabKids = Array.from({ length: 46 }, (_, i) => q.node('t' + i));
  q.add(q.node('tabbar', tabKids), false, true);
  assert.equal(q.marked.length, 47, 'اختيار محرّك (٤٧ عنصرًا) مصنَّف فورًا');
  assert.ok(q.marked.every((id) => !/^o/.test(id)), 'ولا عنصر من طابور الفتح صُنِّف معه');
  assert.equal(q.items().length, 845, 'الطابور المؤجَّل كما هو');
  // الميزانيّة: في نداء واحد ١٠٠ ثمّ ١٠٠ — الثانية تُؤجَّل (فتح النافذة عشرات الأشجار الصغيرة في نداء واحد)
  const q2 = queue41();
  q2.add(q2.node('a', Array.from({ length: 99 }, (_, i) => q2.node('a' + i))), false, true);
  q2.add(q2.node('b', Array.from({ length: 99 }, (_, i) => q2.node('b' + i))), false, true);
  assert.equal(q2.marked.length, 100); assert.equal(q2.items().length, 100);
  assert.ok(src41.includes('budget = SYNC_MAX; /* ميزانيّة الفوريّ لكلّ نداء */') && src41.includes("{ budget = SYNC_MAX; add(e.target, true, true); }"), 'تتجدّد لكلّ نداء مراقب ولكلّ transitionend');
  assert.ok(!src41.includes('function drainNow'), 'لا تفريغ للطابور المؤجَّل من الفوريّ');
});
