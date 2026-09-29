'use strict';
/* v-cpu-status (المالك ٢٩ سبتمبر، لقطة أثناء عمل الوكيل: «يعلّق إذا يقرأ الوكيل… فرق بسيط الحين»): بعد v-cpu-calm بقي
   مصدران أثناء العمل نفسه. مسبار الوكيل (?store=huawei وجسر cpu، خلفيّة صورة، ٣٠ رسالة، المعالج ×٤):
   (١) حبّة الحالة ستّ حركات لا تنتهي طوال قراءة الوكيل — ٣٧٦ إطارًا في ٦ ثوانٍ؛
   (٢) مراقب delete-confirm.js على الصفحة كلّها يمسحها بعد كلّ تحديث لفقاعة البثّ — ٥٦ مسحًا بـ٣٣٩مل في ١٠ ثوانٍ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const CSS = fs.readFileSync('css/tokens.css', 'utf8');
const DC = fs.readFileSync('js/delete-confirm.js', 'utf8');

test('١. حبّة الحالة تسكن تحت html.omCpu (الشرارة، اللمعان، النقاط، الوميض) ويبقى نصّها مقروءًا', () => {
  assert.match(CSS, /html\.omCpu :is\(\.chat-status-spark, \.chat-status-running, \.chat-status-dots i, \.chat-status-fold summary\.is-running\)\{animation:none;\}/);
  assert.match(CSS, /html\.omCpu \.chat-status-running\{color:var\(--text,#fff\); background:none;\}/, 'بلا لمعان النصّ شفّاف — يعود لونه');
  // الحركات نفسها باقية لغير هواوي
  assert.match(CSS, /\.chat-status-running\{animation:none; background:linear-gradient[^}]*animation:omranShimmer 2\.2s linear infinite;\}/);
  assert.match(CSS, /\.chat-status-fold summary\.is-running\{animation:omranGlow 2\.4s ease-in-out infinite;/);
});

/* المراقب الحقيقيّ في vm بصفحة مزيّفة */
function boot({ withMessages = true } = {}) {
  let cb = null;
  const counts = { raf: 0, qsa: 0 };
  const msgs = { isConnected: true, contains: (n) => n === msgs || !!(n && n.inMsgs) };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, querySelector: () => el(), setAttribute() {}, set innerHTML(v) {}, set textContent(v) {} });
  const sb = {
    document: {
      documentElement: { lang: 'ar', classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
      head: { appendChild() {} }, body: { appendChild() {} },
      getElementById: (id) => (id === 'messages' && withMessages ? msgs : null),
      querySelectorAll: () => { counts.qsa++; return []; },
      createElement: el, addEventListener() {},
    },
    MutationObserver: class { constructor(f) { cb = f; } observe() {} },
    requestAnimationFrame: (f) => { counts.raf++; f(); return 0; },
    setTimeout, clearTimeout, CSS: { escape: (s) => s },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(DC, sb);
  return { fire: (targets) => cb(targets.map((target) => ({ target }))), counts };
}

test('٢. تغيّرات المحادثة (#messages) لا تمسح الصفحة — وتغيّرات خارجها تمسحها كما كانت', () => {
  const b = boot();
  const q0 = b.counts.qsa;
  b.fire([{ inMsgs: true }, { inMsgs: true }]);
  assert.equal(b.counts.raf, 0, 'فقاعة البثّ لا تجدول مسحًا');
  assert.equal(b.counts.qsa, q0);
  b.fire([{ inMsgs: true }, {}]);
  assert.equal(b.counts.raf, 1, 'تغيّر في قائمة المحادثات (خارج المحادثة) يمسح');
  assert.ok(b.counts.qsa > q0, 'المسح نفسه لم يتغيّر');
});

test('٣. صفحة بلا #messages: كلّ تغيّر يمسح كما قبل', () => {
  const b = boot({ withMessages: false });
  b.fire([{ inMsgs: true }]);
  assert.equal(b.counts.raf, 1);
});

test('٤. وسوم الكاش ارتفعت', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('css/tokens.css?v=729') && html.includes('/js/ui-wiring.js?v=659'));
  assert.ok(fs.readFileSync('js/ui-wiring.js', 'utf8').includes("/js/delete-confirm.js?v=20260929a'"));
});
