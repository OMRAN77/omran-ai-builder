'use strict';
/* v-freeze-fix (لقطة عمران ٨ نوفمبر: البانر الأحمر «⚠️ التطبيق يستجيب ببطء… تم حفظ عملك تلقائيًا» على الحاسوب فوق محادثة فارغة
   ولوحة المعاينة مفتوحة). مسبار Chromium (main 415d4c21، الحزمة المنشورة، حساب المالك بسجلّ ثقيل: ٢٤١ محادثة، ٣٩٤٨ رسالة، ٢٥٦ مليون
   حرف كود في رسائل البناء، المعالج ×٢) ثمّ «محادثة جديدة»: __saveFlush ← __writeChatsMirror ← chatsSlimForServer مهمّة واحدة ٧٫٨ث
   (طويلة ٨٫٣ث) ← نبضتان متأخّرتان ٨١١٨ و٧١١٩ م.ث ← البانر؛ ثمّ saveState() داخل الكاشف نفسه أعاد الرفع كاملًا ← تجمّد ثانٍ ١٤ث.
   الجذر: chatsSlimForServer تنسخ كلّ رسالة في كلّ المحادثات (__msgForServer = نسخ JSON يحمل كود التطبيق كاملًا) وتسلسلها مرّة أخرى
   للقياس، ثمّ لا تُبقي إلّا أحدث ما يتّسع في 2MB — الكلفة تكبر مع السجلّ كلّه والناتج ثابت.
   هنا الكود الحقيقيّ في vm: (١) العمل محدود بما يتّسع في الحدّ لا بالسجلّ كلّه، (٢) الناتج مطابق حرفيًّا للخوارزميّة السابقة،
   (٣) الكاشف يُظهر البانر بلا إعادة حفظ كاملة لحظة التجمّد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const A4 = fs.readFileSync(path.join(ROOT, 'js', 'app-04-i18n-state.js'), 'utf8');
const slice = (src, from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };
const LIMIT = 2000000;

/* الدالّتان الحقيقيّتان (__msgForServer + chatsSlimForServer) في vm، مع عدّاد لما يُسلسَل ولعدد الرسائل المنسوخة (المُستبدِل دالّة =
   نداء __msgForServer). */
function slimBox() {
  const counters = { chars: 0, msgCopies: 0 };
  const J = {
    stringify: (v, r) => { const s = JSON.stringify(v, r); counters.chars += s ? s.length : 0; if (typeof r === 'function') counters.msgCopies++; return s; },
    parse: JSON.parse,
  };
  const sb = { JSON: J, state: { projects: [] } };
  vm.createContext(sb);
  vm.runInContext('let __slimCache = null;\n' + slice(A4, 'function __msgForServer(m){', '// v311: أي صورة') +
    '\nthis.run = (ps) => { state.projects = ps; __slimCache = null; return chatsSlimForServer(); }; this.msg = __msgForServer;', sb);
  return {
    run(ps) { counters.chars = 0; counters.msgCopies = 0; const out = sb.run(ps); return { out, chars: counters.chars, msgCopies: counters.msgCopies }; },
    msg: sb.msg,
  };
}

/* المرجع: الخوارزميّة كما كانت في main ‏415d4c21 (v-perf-slim-linear) — كلّ المشاريع، ثمّ نزع p.code من الأقدم، ثمّ حذف الأقدم. */
function currentSlim(projects, msg) {
  const list = projects.map((p) => ({
    id: p.id, title: p.title || '', provider: p.provider || '',
    messages: Array.isArray(p.messages) ? p.messages.map(msg) : [],
    code: (typeof p.code === 'string') ? p.code : '', updatedAt: Number(p.updatedAt) || 0,
  })).filter((p) => p.id);
  let lens;
  try { lens = list.map((p) => JSON.stringify(p).length); } catch (e) { return []; } // كالأصل: قائمة لا تُسلسَل تُفرَّغ
  let total = list.length ? 2 + (list.length - 1) + lens.reduce((a, b) => a + b, 0) : 2;
  let i = 0;
  while (total > LIMIT && i < list.length) {
    if (list[i].code) { const np = Object.assign({}, list[i], { code: '' }); const nl = JSON.stringify(np).length; total += nl - lens[i]; lens[i] = nl; list[i] = np; }
    i++;
  }
  let k = 0;
  while (total > LIMIT && k < list.length) { total -= lens[k] + (list.length - k > 1 ? 1 : 0); k++; }
  return k ? list.slice(k) : list;
}

/* سجلّ مالك ثقيل: كلّ محادثة تطبيق بأربع رسائل بناء تحمل كود التطبيق كاملًا (m.code) — النصّ مشترك بالمرجع فلا يثقل ذاكرة الاختبار،
   والنسخ والتسلسل داخل الدالّة حقيقيّان. أحدث ~٩ محادثات تملأ 2MB وحدها. */
const BUILD_CODE = '<!doctype html><script>' + 'ك'.repeat(60000) + '</script>';
function ownerHistory(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p_' + (1700000000000 + i), title: 'تطبيق ' + i, provider: 'claude', updatedAt: 1700000000000 + i,
    code: BUILD_CODE,
    messages: [
      { role: 'user', content: 'ابنِ تطبيق مصاريف ' + i },
      { role: 'assistant', content: 'تمّ البناء ١', code: BUILD_CODE },
      { role: 'user', content: 'عدّل الألوان' },
      { role: 'assistant', content: 'تمّ البناء ٢', code: BUILD_CODE },
      { role: 'assistant', content: 'تمّ البناء ٣', code: BUILD_CODE },
      { role: 'assistant', content: 'تمّ البناء ٤', code: BUILD_CODE },
    ],
  }));
}

test('١. سجلّ أكبر بعشرة أضعاف ← العمل نفسه تقريبًا (كان يكبر ×١٠ والناتج ثابت): محدود بما يتّسع في 2MB لا بالسجلّ كلّه', () => {
  const box = slimBox();
  const small = ownerHistory(24), big = ownerHistory(240);
  const a = box.run(small), b = box.run(big);
  const oneProject = JSON.stringify(currentSlim([big[0]], box.msg)).length;
  // الناتج: أحدث ما يتّسع، والسجلّان ينتهيان بالمحادثات نفسها حجمًا فالناتج بالحجم نفسه
  assert.ok(JSON.stringify(b.out).length <= LIMIT, 'الناتج تحت الحدّ');
  assert.equal(b.out.length, a.out.length, 'عدد ما يُبقى ثابت');
  assert.equal(b.out[b.out.length - 1].id, big[big.length - 1].id, 'الأحدث آخرًا');
  // العمل: لا يتجاوز (الحدّ + محادثة واحدة) بهامش نسخ القياس، ولا يكبر مع السجلّ
  assert.ok(b.chars < 3 * (LIMIT + oneProject), 'مُسلسَل ' + b.chars + ' لسجلّ ٢٤٠ محادثة (الحدّ ' + LIMIT + ')');
  assert.ok(b.chars < a.chars * 1.5, '٢٤٠ محادثة: ' + b.chars + ' مقابل ٢٤ محادثة: ' + a.chars);
  assert.ok(b.msgCopies < a.msgCopies * 1.5, 'رسائل منسوخة ' + b.msgCopies + ' مقابل ' + a.msgCopies + ' (السجلّ ٤٠ ضعفًا: ' + big.length * 6 + ' رسالة)');
  assert.ok(b.msgCopies < big.length * 6 / 4, 'لا تُنسخ رسائل المحادثات القديمة التي لن تُرفع');
});

test('٢. الناتج مطابق حرفيًّا للخوارزميّة السابقة: ١٢٠ سجلًّا عشوائيًّا تحت الحدّ وفوقه، بلا معرّف، بلا رسائل، أحدثها وحده أكبر من الحدّ', () => {
  const box = slimBox();
  let seed = 20261108;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const str = (n) => 'x'.repeat(Math.max(0, n | 0));
  const gen = (n, scale) => Array.from({ length: n }, (_, i) => {
    const msgs = Array.from({ length: (rnd() * 10) | 0 }, (_, j) => {
      const m = { role: j % 2 ? 'assistant' : 'user', content: str(rnd() * 4000 * scale) };
      if (rnd() < 0.3) m.code = str(rnd() * 120000 * scale);
      if (rnd() < 0.08) m.attachments = [{ isImage: true, dataUrl: str(rnd() * 300000), serverThumb: rnd() < 0.5 ? 'thumb' : undefined }];
      if (rnd() < 0.04) m.content = str(13000); // يُقصّ عند ١٢ ألفًا
      return m;
    });
    const p = { id: rnd() < 0.04 ? '' : 'p_' + (1e12 + i), title: rnd() < 0.1 ? undefined : 't' + i, provider: rnd() < 0.5 ? 'c' : '', messages: msgs, code: rnd() < 0.4 ? str(rnd() * 200000 * scale) : (rnd() < 0.1 ? null : ''), updatedAt: rnd() < 0.1 ? 'x' : i };
    if (rnd() < 0.05) delete p.messages;
    return p;
  });
  const scales = [0.01, 0.1, 0.5, 1, 2];
  let over = 0, codeStrippedOnly = 0;
  for (let t = 0; t < 120; t++) {
    const ps = gen((rnd() * 50) | 0, scales[t % scales.length]);
    if (t === 7) ps.push({ id: 'p_huge', title: 'ضخم', messages: [{ role: 'assistant', content: 'x', code: str(2100000) }], code: '' });
    if (t === 8) ps.push({ id: 'p_edge', title: 'حدّ', messages: [], code: str(LIMIT) });
    const want = JSON.stringify(currentSlim(ps, box.msg));
    const got = JSON.stringify(box.run(ps).out);
    assert.equal(got.length, want.length, 'الحالة ' + t + ': الطول');
    assert.ok(got === want, 'الحالة ' + t + ': الناتج نفسه حرفيًّا');
    const kept = JSON.parse(want);
    if (kept.length && kept.length < ps.filter((p) => p.id).length) over++;
    const src = new Map(ps.map((p) => [p.id, p]));
    if (kept.some((k) => !k.code && typeof (src.get(k.id) || {}).code === 'string' && src.get(k.id).code)) codeStrippedOnly++;
  }
  assert.ok(over >= 20, 'حالات فوق الحدّ يُحذف فيها الأقدم: ' + over);
  assert.ok(codeStrippedOnly >= 20, 'وحالات يُنزع فيها كود التطبيق: ' + codeStrippedOnly);
  // الحالات الحدّيّة صراحة
  assert.equal(JSON.stringify(box.run([]).out), '[]');
  assert.equal(JSON.stringify(box.run([{ id: 'p_only', messages: [{ role: 'assistant', code: str(LIMIT) }] }]).out), '[]', 'الأحدث وحده أكبر من الحدّ ← لا شيء (كالسابق)');
});

test('٣. الذاكرة المؤقّتة كما هي: النداء الثاني بلا تسلسل، وsaveState يبطلها', () => {
  const sb = { state: { projects: ownerHistory(30) } };
  vm.createContext(sb);
  vm.runInContext('let __slimCache = null;\n' + slice(A4, 'function __msgForServer(m){', '// v311: أي صورة') + '\nthis.run = chatsSlimForServer;', sb);
  const first = sb.run();
  assert.equal(sb.run(), first, 'النسخة نفسها');
  assert.match(A4, /function saveState\(\)\{\n  __slimCache = null;/);
});

/* ── كاشف التجمّد: البانر بلا إعادة حفظ كاملة لحظة التجمّد ── */
const A10 = fs.readFileSync(path.join(ROOT, 'js', 'app-10-features.js'), 'utf8');
const DETECTOR = slice(A10, '// --- Freeze detector', '// --- AppGallery 7.5');
function detectorWorld() {
  let now = 1000000; let worker = null; let saved = 0;
  const banner = { style: { display: 'none' } };
  const ctx = {
    Date: { now: () => now },
    document: { hidden: false, addEventListener() {} },
    window: { Worker: function () {}, addEventListener() {} },
    Worker: function () { worker = this; this.terminate = () => {}; },
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x' },
    $: (sel) => (sel === '#freezeBanner' ? banner : { onclick: null }),
    saveState: () => { saved++; }, __saveFlush: () => { saved++; }, __swallow() {},
  };
  vm.createContext(ctx);
  vm.runInContext(DETECTOR, ctx);
  return { banner, get saved() { return saved; }, beat(sentAt, deliveredAt) { now = deliveredAt; worker.onmessage({ data: sentAt }); } };
}

test('٤. تجمّد حقيقيّ ← البانر يظهر، ولا saveState منه: الحفظ الدوريّ (١٫٥ث) والخروج يحفظان العمل، وإعادة الحفظ هنا كانت تجمّدًا ثانيًا ١٤ث', () => {
  const w = detectorWorld();
  const T = 1000000 + 20000;
  w.beat(T, T + 50);
  w.beat(T + 1000, T + 8000);
  w.beat(T + 2000, T + 8010);
  assert.equal(w.banner.style.display, 'flex', 'البانر كما كان');
  assert.equal(w.saved, 0, 'لا إعادة حفظ لحظة التجمّد');
  assert.ok(!/saveState\s*\(/.test(DETECTOR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'لا نداء saveState في الكاشف');
});

test('٥. الحفظ عند المغادرة باقٍ (زرّ «إعادة التحميل» = pagehide ← __saveFlush والمرآة)', () => {
  assert.match(A4, /window\.addEventListener\('pagehide', __saveFlush\);/);
  assert.match(A4, /window\.addEventListener\('pagehide', __writeChatsMirror\);/);
  assert.match(A4, /__saveTimer = setTimeout\(__saveFlush, 1500\);/, 'الحفظ المجمّع كلّ ١٫٥ث');
});
