'use strict';
/* v-perf-slim-linear + v-perf-slim-once + v-perf-save-slices + v-perf-hist-lazy (المالك ٣٠ سبتمبر: «إذا أطلع من التطبيق وأدخل
   يأخذ من ١٠ إلى ٢٠ ثانية، وإذا أدخل أيّ مكان يكون معلّق ويفتح — كلّ الهواتف»). مسبار إقلاع بحساب ثقيل (٤٠ محادثة، ١٤ تطبيقًا
   بكود ولقطات، ٣٦ م.ب، المعالج ×٤): المحادثات بعد ١٩٫٢ث، وتجميد ٣٩ث في الإقلاع أطوله ١٨٫٦ث، و١٥ث عند العودة للتطبيق.
   الجذور: chatsSlimForServer تربيعيّة (١٤ث للنداء)، وكلّ حفظ يسلسل السجلّ كلّه مرّتين في مهمّة واحدة، و١٤ معاينة iframe
   تُبنى عند الإقلاع والقائمة مخفيّة. هنا يعمل الكود الحقيقيّ في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const slice = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };

/* ── (١) النسخة المنحّفة: خطّيّة، والناتج هو نفسه حرفيًّا ── */
function slimBox(projects) {
  let chars = 0;
  const J = { stringify: (v, r) => { const s = JSON.stringify(v, r); chars += s ? s.length : 0; return s; }, parse: JSON.parse };
  const sb = { JSON: J, state: { projects }, Object, Array, String, Math, __slimCache: null };
  vm.createContext(sb);
  vm.runInContext('let __slimCache = null;\n' + slice('function __msgForServer(m){', '// v311: أي صورة') + '\nthis.run = chatsSlimForServer; this.msg = __msgForServer; this.reset = () => { __slimCache = null; };', sb);
  return { sb, chars: () => chars, zero: () => { chars = 0; } };
}
// المرجع: الخوارزميّة السابقة حرفيًّا (قياس القائمة كلّها في كلّ دور)
function oldTrim(list) {
  const size = (l) => { try { return JSON.stringify(l).length; } catch (e) { return Infinity; } };
  let i = 0;
  while (size(list) > 2000000 && i < list.length) { if (list[i].code) list[i] = Object.assign({}, list[i], { code: '' }); i++; }
  while (size(list) > 2000000 && list.length > 0) list.shift();
  return list;
}
function mkProjects(n, msgLen, codeLen, codeEvery) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p_' + (1700000000000 + i), title: 'م' + i, provider: 'openai', codeHistory: [{ code: 'x' }],
    code: codeEvery && i % codeEvery === 0 ? '<b>' + 'ك'.repeat(codeLen) + '</b>' : '',
    messages: [{ role: 'user', content: 'سؤال ' + i }, { role: 'assistant', content: 'ردّ '.repeat(msgLen) }, { role: 'assistant', content: 'تتمّة '.repeat(Math.round(msgLen * 0.6)) }], // __msgForServer يقصّ الرسالة عند ١٢ ألفًا
  }));
}
function reference(box, projects) {
  const list = projects.map((p) => ({ id: p.id, title: p.title || '', provider: p.provider || '', messages: p.messages.map(box.sb.msg), code: typeof p.code === 'string' ? p.code : '', updatedAt: Number(p.updatedAt) || 0 /* v-chat-order */ })).filter((p) => p.id);
  return JSON.stringify(oldTrim(list));
}

test('١. الناتج مطابق للخوارزميّة السابقة: تحت الحدّ، وفوقه بالكود وحده، وفوقه بالرسائل (حذف الأقدم)، وبلا مشاريع', () => {
  const cases = { under: mkProjects(20, 200, 5000, 3), codeOnly: mkProjects(40, 50, 90000, 2), msgsToo: mkProjects(120, 3000, 20000, 6), empty: [] };
  for (const [name, ps] of Object.entries(cases)) {
    const box = slimBox(ps);
    const got = JSON.stringify(box.sb.run());
    assert.equal(got, reference(box, ps), name);
    if (name !== 'empty') assert.ok(got.length <= 2000000 || name === 'under', name + ' تحت الحدّ');
  }
});

test('٢. خطّيّ: ما يُسلسَل ≈ ضعف حجم القائمة (كان عشرات الأضعاف)، والنسخة تُحسب مرّة لكلّ تغيير', () => {
  const ps = mkProjects(120, 3000, 20000, 6);
  const box = slimBox(ps);
  const size = ps.reduce((s, p) => s + JSON.stringify(p).length, 0);
  assert.ok(JSON.stringify(box.sb.run()).length < size * 0.8, 'العيّنة تتجاوز الحدّ فعلًا فيُقصّ منها'); box.sb.reset();
  box.zero();
  box.sb.run();
  assert.ok(box.chars() < size * 3, 'مُسلسَل ' + box.chars() + ' لحجم ' + size);
  let oldChars = 0; const S = JSON.stringify;
  JSON.stringify = function (v, r) { const s = S(v, r); oldChars += s ? s.length : 0; return s; };
  try { reference(box, ps); } finally { JSON.stringify = S; }
  assert.ok(oldChars > box.chars() * 10, 'السابق ' + oldChars + ' مقابل ' + box.chars());
  // الذاكرة المؤقّتة: النداء الثاني بلا تسلسل، وsaveState يبطلها
  const first = box.sb.run();
  box.zero();
  assert.equal(box.sb.run(), first, 'النسخة نفسها');
  assert.equal(box.chars(), 0);
  assert.match(src, /function saveState\(\)\{\n  __slimCache = null;/);
  assert.match(src, /localStorage\.setItem\('aiapp_projects_slim', JSON\.stringify\(chatsSlimForServer\(\)\)\)/, 'المرآة');
  assert.match(src, /const __slim = chatsSlimForServer\(\);/, 'والرفع — كلاهما يسلسل فقط');
});

/* ── (٢) الحفظ مشروعًا مشروعًا بمهلة للرسم ── */
function saveBox(projects, clockStep) {
  const writes = []; let timers = 0; let now = 0;
  const sb = {
    state: { projects, currentId: 'none' }, JSON, Object, Array, String, Promise,
    Date: { now: () => (now += clockStep) },
    setTimeout: (f) => { timers++; return setTimeout(f, 0); },
    __swallow: () => {},
    __vaultAssign: () => [], idbImgPutAll: () => Promise.resolve(),
    idbSet: (k, v) => { writes.push([k, v]); return Promise.resolve(); },
    getCurrent: () => null, __vaultRelease: () => {}, __imgWindowStart: () => 0,
  };
  vm.createContext(sb);
  vm.runInContext('const VAULT_MIN = 150000;\n' + slice('function __vaultReplacer(k, v){', '/* v-vault-restore (المالك ٢٣ سبتمبر') + slice('let __vaultGen = 0;', '/* الاستعادة: صور مشروع') +
    '\nthis.save = __vaultSave; this.lastLen = () => __vaultLastLen; this.rep = __vaultReplacer;', sb);
  return { sb, writes, timers: () => timers };
}

test('٣. الحفظ يكتب النسخة نفسها (بالمُستبدِل) مع مهلة للرسم بين المشاريع، والخروج دفعة واحدة، والحارس بحجم ما كُتب', async () => {
  const mk = () => mkProjects(12, 300, 2000, 2).map((p, i) => Object.assign(p, { messages: p.messages.concat([{ role: 'user', attachments: [{ isImage: true, vaultId: 'v' + i, dataUrl: 'data:image/png;base64,' + 'A'.repeat(160000), viewUrl: 'x' }] }]) }));
  const ps = mk();
  const want = JSON.stringify(ps, (k, v) => v);
  const a = saveBox(ps, 25);
  const expected = JSON.parse(JSON.stringify(ps, a.sb.rep));
  await a.sb.save(false);
  assert.equal(a.writes.length, 1);
  assert.equal(JSON.stringify(a.writes[0][1]), JSON.stringify(expected), 'النسخة كالسابق: الصور المخزونة معرّفات بلا base64');
  assert.equal(a.sb.lastLen(), JSON.stringify(ps, a.sb.rep).length, 'الحارس بحجم ما كُتب فعلًا');
  assert.ok(a.timers() >= 3, 'مهلات للرسم أثناء الحفظ: ' + a.timers());
  assert.equal(JSON.stringify(ps, (k, v) => v), want, 'الحالة نفسها لا تُمسّ');
  const b = saveBox(mk(), 25);
  await b.sb.save(true);
  assert.equal(b.timers(), 0, 'الخروج من التطبيق: دفعة واحدة قبل التجميد');
  assert.equal(b.writes.length, 1);
});

test('٤. حفظ أحدث يبدأ أثناء حفظ قديم = القديم يتوقّف قبل الكتابة، فلا تُكتب نسخة قديمة فوق أحدث', async () => {
  const ps = mkProjects(10, 300, 2000, 2);
  const a = saveBox(ps, 50);
  const p1 = a.sb.save(false);
  await new Promise((r) => setTimeout(r, 0));
  ps.push({ id: 'p_new', title: 'جديد', messages: [] });
  const p2 = a.sb.save(false);
  await Promise.all([p1, p2]);
  assert.equal(a.writes.length, 1, 'كتابة واحدة');
  assert.equal(a.writes[0][1][a.writes[0][1].length - 1].id, 'p_new', 'بالحالة الأحدث');
});

test('٥. الحارس وتمرير الخروج: بلا تسلسل للسجلّ في كلّ حفظ، والخروج/الإخفاء دفعة واحدة', () => {
  assert.match(src, /const __sz = __vaultLastLen;/);
  assert.ok(!/function __vaultJsonSize\(\)/.test(src), 'لا تسلسل ثانٍ للسجلّ كلّه');
  assert.match(src, /__vaultSave\(!!force \|\| document\.visibilityState === 'hidden'\)/);
  assert.match(src, /window\.addEventListener\('pagehide', __saveFlush\);/, 'pagehide يمرّر حدثه = force');
});

/* ── (٣) معاينات قائمة المحادثات عند ظهورها فقط ── */
function thumbBox(withIO) {
  const obs = { cb: null, observed: [], unobserved: [] };
  const mkEl = (tag) => ({ tagName: tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, querySelector(q) { return this.children.find((c) => c.tagName === q) || null; } });
  const sb = { String, document: { createElement: mkEl } };
  if (withIO) sb.IntersectionObserver = class { constructor(cb) { obs.cb = cb; } observe(t) { obs.observed.push(t); } unobserve(t) { obs.unobserved.push(t); } disconnect() {} };
  vm.createContext(sb);
  vm.runInContext(slice('let __histThumbIO = null;', 'function renderHistory(){') + '\nthis.lazy = __histThumbLazy;', sb);
  return { sb, obs, mkEl };
}

test('٦. المعاينة لا تُبنى حتّى تقترب من الظهور، وتُبنى مرّة بلا سكربتات — وبلا مراقب كما كانت', () => {
  const t = thumbBox(true);
  const thumb = t.mkEl('div');
  const p = { code: '<h1>تطبيق</h1><script>alert(1)</script><p>x</p>' };
  t.sb.lazy(thumb, p);
  assert.equal(thumb.children.length, 0, 'لا iframe عند الإقلاع');
  assert.equal(t.obs.observed[0], thumb);
  t.obs.cb([{ isIntersecting: false, target: thumb }]);
  assert.equal(thumb.children.length, 0);
  t.obs.cb([{ isIntersecting: true, target: thumb }]);
  assert.equal(thumb.children.length, 1);
  const f = thumb.children[0];
  assert.deepEqual([f.tagName, f.attrs.sandbox, f.srcdoc], ['iframe', '', '<h1>تطبيق</h1><p>x</p>']);
  assert.equal(t.obs.unobserved[0], thumb);
  t.obs.cb([{ isIntersecting: true, target: thumb }]);
  assert.equal(thumb.children.length, 1, 'مرّة واحدة');
  const n = thumbBox(false);
  const th2 = n.mkEl('div');
  n.sb.lazy(th2, p);
  assert.equal(th2.children.length, 1, 'متصفّح بلا مراقب: فورًا كما كان');
  const rh = slice('function renderHistory(){', 'historyEl.appendChild(div);');
  assert.ok(rh.includes('__histThumbLazy(thumb, p);') && !rh.includes('iframe.srcdoc'), 'renderHistory لا يبني iframe مباشرة');
  assert.ok(rh.indexOf('if(__histThumbIO) __histThumbIO.disconnect();') < rh.indexOf("historyEl.innerHTML = '';"), 'صفوف الرسم السابق لا تُراقَب بعد مسحها');
});
