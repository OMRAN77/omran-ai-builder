'use strict';
/* v-attach-nofalse + v-err-build — تنبيه المالك (٢٣ سبتمبر): «أخطاء مسجلة من المستخدمين: 9» منها
   «attach-picker timeout … files=0» مرّتين و«Uncaught SyntaxError: Unexpected token».
   (١) بلاغ timeout كان يُرسَل بعد ٢٠ ثانية من النقر مهما حدث: إلغاء، أو اختيار بطيء، أو change سبق
       المراقب — كلّها ليست أعطالًا. هنا يُشغَّل المراقب نفسه بساعة مزيّفة.
   (٢) السجلّ لا ينتهي: خطأ نسخة أُصلحت (علامات التعارض ٢١ سبتمبر) يبقى ينذر. البلاغ يحمل بصمة الحزمة،
       والتنبيه يعرض النسخة الحاليّة فقط. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = (p) => path.join(__dirname, '..', p);
const attach = fs.readFileSync(R('js/app-09-attach.js'), 'utf8');
const selfdiag = fs.readFileSync(R('js/selfdiag.js'), 'utf8');

function extract(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'موجود: ' + head);
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('لم يُغلق: ' + head);
}

function emitter() {
  const ls = {};
  return {
    addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
    removeEventListener(t, f) { ls[t] = (ls[t] || []).filter((x) => x !== f); },
    fire(t) { (ls[t] || []).slice().forEach((f) => f({ target: this })); },
    count(t) { return (ls[t] || []).length; },
  };
}

function harness() {
  let now = 0, timer = null;
  const diags = [], got = [];
  const win = emitter();
  const doc = Object.assign(emitter(), { visibilityState: 'visible' });
  const input = Object.assign(emitter(), { id: 'attachInput', files: [], value: 'x' });
  const ctx = {
    window: win, document: doc, Promise, Array,
    Date: { now: () => now },
    setInterval: (f) => { timer = f; return 1; },
    clearInterval: () => { timer = null; },
    __swallow: () => {},
    omranPickerDiag: (kind) => diags.push(kind),
  };
  vm.runInNewContext(extract(attach, 'function omranWatchFilePicker(input, onFiles)') + ';this.w = omranWatchFilePicker;', ctx);
  ctx.w(input, (files) => { got.push(files.length); });
  return {
    input, doc, win, diags, got,
    run(ms) { for (let t = 0; t < ms; t += 350) { now += 350; if (timer) timer(); } },
    alive: () => !!timer,
  };
}

test('المنتقي: الإلغاء لا يُبلَّغ', () => {
  const h = harness();
  h.run(2000);
  h.input.fire('cancel');
  h.run(60000);
  assert.deepStrictEqual(h.diags, []);
  assert.ok(!h.alive(), 'المراقب توقّف');
  assert.strictEqual(h.input.count('change') + h.input.count('cancel') + h.win.count('focus') + h.doc.count('visibilitychange'), 0, 'المستمعات أزيلت');
});

test('المنتقي: اختيار بطيء (دقيقة في المعرض) ثمّ change — لا بلاغ', () => {
  const h = harness();
  h.doc.visibilityState = 'hidden'; h.doc.fire('visibilitychange');
  h.run(60000);
  assert.deepStrictEqual(h.diags, [], 'لا يعدّ الوقت والمنتقي مفتوح');
  h.input.files = [{ name: 'a.jpg' }];
  h.input.fire('change');
  h.run(30000);
  assert.deepStrictEqual(h.diags, []);
  assert.deepStrictEqual(h.got, [], 'change بملفّات: معالجه الخاصّ يستوعبها لا المراقب');
  assert.strictEqual(h.input.value, 'x', 'المراقب لا يمسح القيمة أثناء قراءة معالج change (فخّ v3)');
});

test('المنتقي: الملفّ يصل بلا أيّ حدث — المراقب يلتقطه مرّة واحدة', () => {
  const h = harness();
  h.run(1000);
  h.input.files = [{ name: 'a.jpg' }, { name: 'b.jpg' }];
  h.run(3000);
  assert.deepStrictEqual(h.got, [2]);
  assert.deepStrictEqual(h.diags, []);
});

test('المنتقي: عاد المستخدم بلا ملفّ ولا إلغاء — بلاغ no-file واحد بعد ٨ ثوانٍ', () => {
  const h = harness();
  h.doc.visibilityState = 'hidden'; h.doc.fire('visibilitychange');
  h.run(5000);
  h.doc.visibilityState = 'visible'; h.doc.fire('visibilitychange');
  h.run(7000);
  assert.deepStrictEqual(h.diags, [], 'مهلة سماح بعد العودة');
  h.run(3000);
  assert.deepStrictEqual(h.diags, ['no-file']);
  h.run(60000);
  assert.deepStrictEqual(h.diags, ['no-file'], 'مرّة واحدة');
});

test('المنتقي: لا عودة ولا شيء خلال ٥ دقائق — يتوقّف بلا بلاغ', () => {
  const h = harness();
  h.run(6 * 60000);
  assert.ok(!h.alive());
  assert.deepStrictEqual(h.diags, []);
});

test('تنبيه المالك: أخطاء النسخة الحاليّة فقط', () => {
  const ctx = { window: {}, document: {}, Date, isNaN };
  vm.runInNewContext(extract(selfdiag, 'window.__omranErrLive = function(e, build, now)'), ctx);
  const live = ctx.window.__omranErrLive;
  const now = Date.parse('2026-09-23T12:00:00Z');
  assert.strictEqual(live({ build: 'abc123' }, 'abc123', now), true, 'النسخة الحاليّة');
  assert.strictEqual(live({ build: '4b5c00ab' }, 'abc123', now), false, 'نسخة سابقة أُصلحت');
  assert.strictEqual(live({ build: 'abc123' }, '', now), true, 'بصمة الصفحة مجهولة = يُعرض');
  assert.strictEqual(live({ lastSeen: '2026-09-21T11:20:00Z' }, 'abc123', now), false, 'قديم بلا بصمة (علامات التعارض ٢١ سبتمبر)');
  assert.strictEqual(live({ lastSeen: '2026-09-23T09:00:00Z' }, 'abc123', now), true, 'بلا بصمة ورُئي اليوم = يُعرض');
  assert.strictEqual(live({}, 'abc123', now), false);
});

test('المُبلِّغون يرسلون البصمة، والتنبيه يعرض الملفّ والسطر', () => {
  const video = fs.readFileSync(R('js/app-11-video.js'), 'utf8');
  const swallow = fs.readFileSync(R('js/app-00-swallow.js'), 'utf8');
  assert.ok(/build: window\.__omranBuild\(\)/.test(selfdiag), 'selfdiag');
  assert.ok(swallow.includes("build: (typeof window.__omranBuild === 'function')"), 'swallow');
  assert.ok(attach.includes("build: (typeof window.__omranBuild === 'function')"), 'attach-picker');
  assert.ok(video.includes('window.__omranErrLive(e, __build, Date.now())') && video.includes('__live.length'), 'التنبيه يفلتر ويعدّ الحيّ');
  assert.ok(/e\.line \? ':' \+ e\.line/.test(video), 'الملفّ:السطر في التنبيه');
  const html = fs.readFileSync(R('index.html'), 'utf8');
  assert.ok(html.indexOf('/js/selfdiag.js?v=') < html.indexOf('/js/app.bundle.js?v='), 'selfdiag قبل الحزمة (البصمة معرّفة قبل أيّ بلاغ)');
});

test('الخادم يخزّن البصمة ويفصل توقيع كلّ نسخة', async () => {
  const rp = (p) => require.resolve(R(p));
  const store = {};
  require.cache[rp('api/_lib/kv.js')] = {
    id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true,
    exports: { kvGetJSON: async (k) => store[k] || null, kvPutJSON: async (k, v) => { store[k] = v; } },
  };
  delete require.cache[rp('api/_lib/client-errors.js')];
  const h = require(R('api/_lib/client-errors.js'));
  const post = (body) => new Promise((resolve) => {
    const res = { setHeader() {}, status() { return this; }, json: resolve, end: resolve };
    h({ method: 'POST', body, headers: {}, query: {} }, res);
  });
  const base = { message: 'Uncaught SyntaxError: x', source: '/js/app.bundle.js', line: 5 };
  await post(Object.assign({ build: 'aaaa1111' }, base));
  await post(Object.assign({ build: 'bbbb2222' }, base));
  await post(Object.assign({ build: 'bbbb2222' }, base));
  await post(Object.assign({ build: '<script>' }, base));
  const log = store['db/client-errors/log.json'];
  assert.strictEqual(log.length, 3);
  const b = log.find((e) => e.build === 'bbbb2222');
  assert.strictEqual(b.count, 2);
  assert.ok(log.find((e) => e.build === 'aaaa1111'));
  assert.ok(log.find((e) => e.build === ''), 'بصمة غير صالحة تُهمل');
});
