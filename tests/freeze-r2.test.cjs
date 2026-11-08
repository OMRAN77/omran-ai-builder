'use strict';
/* v-r3 (r3-f1 + r3-f2): بانر «⚠️ التطبيق يستجيب ببطء… تم حفظ عملك تلقائيًا. إعادة التحميل الآن؟» — الجذر الثاني بعد v-freeze-fix.
   مسبار Chromium (بذرة المالك الثقيلة، المعالج ×٢): __vaultSave يبني نسخته في شرائح ٤٠م.ث ثمّ idbSet('aiapp_projects', copy) — put واحد
   استنساخه البنيويّ متزامن على الخيط الرئيسيّ ويكبر مع السجلّ كلّه: ٢٤١ محادثة ٦٫٢ث، ٣٠١ ‏٧٫٧ث (رصد واحد)، ٣٦١ ‏١٢٫٧–١٣٫٥ث (البانر).
   وزرّ «إعادة التحميل» كان يعيد فورًا، والحفظ عند pagehide غير متزامن لا يكتمل بعد المغادرة — فيضيع تغيير داخل نافذة التجميع.
   هنا الكود الحقيقيّ من app-04 (وكاشف app-10) في vm فوق IndexedDB مزيّف في الذاكرة (معاملات متسلسلة، إلغاء يرجع كتاباته، ونسخ بنيويّ
   حقيقيّ بـstructuredClone): ترحيل السجلّ القديم بلا فقد، ذهاب وعودة، حفظ بعد تعديل محادثة واحدة يكتبها وحدها، انقطاع أو امتلاء
   السعة بين الكتابات يُبقي القديم مقروءًا، كنس مفاتيح المحذوف، الصيغتان معًا = الأحدث، تبويبان، الخروج يمسح كلّ المفاتيح، والبانر
   ينتظر الحفظ قبل أن يعيد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const A4 = fs.readFileSync(path.join(ROOT, 'js', 'app-04-i18n-state.js'), 'utf8');
const A10 = fs.readFileSync(path.join(ROOT, 'js', 'app-10-features.js'), 'utf8');
const slice = (src, from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const J = (x) => JSON.stringify(x);

/* ── IndexedDB مزيّف: قاعدة باسم، مخازن Map، معاملات تُنفَّذ واحدة بعد واحدة (كالنطاق المتداخل)، كلّ طلب في مهمّة لاحقة، الالتزام
   عند فراغ الطلبات، والإلغاء يُسقط كتابات المعاملة. خطافات: commitError (امتلاء السعة عند الالتزام)، وkill (الصفحة ماتت: لا جواب
   بعدها أبدًا). stats.txs = لكلّ معاملة ملتزمة: مفاتيح ما كُتب وطول نصّه. ── */
function fakeIDB(seed) {
  const dbs = new Map();
  if (seed) dbs.set('aiapp_db', { version: 2, stores: new Map(Object.entries(seed).map(([n, m]) => [n, new Map(m)])) });
  const hooks = { commitError: null, dead: false, txSeen: 0, killAfterTx: Infinity };
  const stats = { txs: [] };
  let queue = Promise.resolve();
  const req = () => ({ result: undefined, error: null, onsuccess: null, onerror: null });
  const range = (lo, hi) => ({ includes: (k) => typeof k === 'string' && k >= lo && k <= hi });
  function makeTx(d, storeName, mode) {
    const tx = { oncomplete: null, onabort: null, onerror: null, error: null };
    const writes = new Map(), DEL = Symbol('del'), reqs = [];
    const info = { keys: [], chars: 0, deletes: [] };
    let aborted = false, finished = false;
    const store = () => d.stores.get(storeName);
    const read = (k) => (writes.has(k) ? (writes.get(k) === DEL ? undefined : writes.get(k)) : store().get(k));
    const allKeys = () => { const s = new Set(store().keys()); writes.forEach((v, k) => (v === DEL ? s.delete(k) : s.add(k))); return [...s].sort(); };
    const enqueue = (fn) => { const rq = req(); reqs.push({ rq, fn }); return rq; };
    const os = {
      put(v, k) {
        if (mode !== 'readwrite') throw new Error('ReadOnlyError');
        const c = structuredClone(v); // الاستنساخ عند put نفسه، كالمتصفّح
        const chars = (J(v) || '').length;
        if (hooks.nsPerChar) { const t = Date.now(), ms = chars * hooks.nsPerChar / 1e6; while (Date.now() - t < ms); } // كلفة الاستنساخ في المتصفّح البطيء (r3-rv3)
        info.keys.push(k); info.chars += chars;
        return enqueue(() => { writes.set(k, c); return k; });
      },
      get: (k) => enqueue(() => { const v = read(k); return v === undefined ? undefined : structuredClone(v); }),
      delete: (k) => { if (mode !== 'readwrite') throw new Error('ReadOnlyError'); info.deletes.push(k); return enqueue(() => { writes.set(k, DEL); }); },
      count: (k) => enqueue(() => (read(k) !== undefined ? 1 : 0)),
      getAllKeys: (r) => enqueue(() => allKeys().filter((k) => !r || r.includes(k))),
    };
    tx.objectStore = () => os;
    tx.abort = () => { if (finished) throw new Error('InvalidStateError'); aborted = true; };
    queue = queue.then(() => new Promise((done) => {
      const n = ++hooks.txSeen;
      const finishAbort = (err) => { finished = true; tx.error = err || null; if (tx.onabort) tx.onabort(); done(); };
      const finishCommit = () => {
        const err = hooks.commitError && hooks.commitError(info, mode);
        if (err) return finishAbort(err);
        writes.forEach((v, k) => (v === DEL ? store().delete(k) : store().set(k, v)));
        finished = true;
        if (mode === 'readwrite') stats.txs.push(info);
        if (tx.oncomplete) tx.oncomplete();
        done();
      };
      const step = () => {
        if (hooks.dead || n > hooks.killAfterTx) { hooks.dead = true; return; } // الصفحة ماتت: لا التزام ولا إلغاء — ولا جواب بعدها
        if (aborted) return finishAbort(null);
        const r = reqs.shift();
        if (!r) return finishCommit();
        try { r.rq.result = r.fn(); } catch (e) { r.rq.error = e; return finishAbort(e); }
        if (r.rq.onsuccess) r.rq.onsuccess({ target: r.rq });
        setTimeout(step, 0);
      };
      setTimeout(step, hooks.lag || 0); // lag: قرص بطيء — أوّل طلب في كلّ معاملة بعد lag م.ث (r3-rv1ج)
    }));
    return tx;
  }
  const indexedDB = {
    open(name, ver) {
      const rq = req();
      setTimeout(() => {
        if (hooks.dead) return;
        let d = dbs.get(name); let up = false;
        if (!d) { d = { version: 0, stores: new Map() }; dbs.set(name, d); }
        if (ver > d.version) { d.version = ver; up = true; }
        rq.result = {
          objectStoreNames: { contains: (s) => d.stores.has(s) },
          createObjectStore: (s) => { d.stores.set(s, new Map()); },
          transaction: (s, mode) => makeTx(d, s, mode || 'readonly'),
          close() {},
        };
        if (up && rq.onupgradeneeded) rq.onupgradeneeded();
        if (rq.onsuccess) rq.onsuccess();
      }, 0);
      return rq;
    },
    deleteDatabase(name) { const rq = req(); setTimeout(() => { dbs.delete(name); if (rq.onsuccess) rq.onsuccess(); }, 0); return rq; },
  };
  const kv = () => { const d = dbs.get('aiapp_db'); return (d && d.stores.get('kv')) || new Map(); };
  return {
    indexedDB, IDBKeyRange: { bound: range }, hooks, stats,
    kv,
    keys: () => [...kv().keys()].sort(),
    /* «إعادة التحميل»: قاعدة جديدة بما التزم فعلًا لحظتها (ما لم يلتزم يضيع كما يضيع بموت الصفحة) */
    snapshot: () => { const d = dbs.get('aiapp_db'); const seedOut = {}; if (d) d.stores.forEach((m, n) => { seedOut[n] = [...m.entries()].map(([k, v]) => [k, structuredClone(v)]); }); return fakeIDB(seedOut); },
  };
}

/* ── التطبيق: كتلة IndexedDB والمخزن والحفظ (من const IDB_NAME إلى «Strips old image data») + الحفظ المجمّع (let __saveTimer … ⚡ v320)
   + كتلة الخروج — كما هي من app-04. ── */
const STORE_SRC = slice(A4, "const IDB_NAME = 'aiapp_db'", '// Strips old image data');
const FLUSH_SRC = slice(A4, 'let __saveTimer = null;', '// ⚡ v320:');
const LOGOUT_SRC = slice(A4, 'var __chatsLivePollTimer = null;', 'function __chatsPullMerge(){');
const DETECTOR = slice(A10, '// --- Freeze detector', '// --- AppGallery 7.5');
function makeApp(fdb, o) {
  const opt = o || {};
  const log = [];
  const wl = {}; const dl = {};
  const ls = new Map();
  let clockOff = 0;
  class FakeDate extends Date { static now() { return Date.now() + clockOff; } }
  const ctx = {
    console, structuredClone, Date: FakeDate,
    setTimeout: opt.setTimeout || setTimeout, clearTimeout,
    indexedDB: fdb.indexedDB, IDBKeyRange: fdb.IDBKeyRange,
    document: { visibilityState: 'visible', hidden: false, addEventListener: (t, f) => { (dl[t] = dl[t] || []).push(f); } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } },
    __swallow: (e, tag) => { log.push('swallow:' + tag + ':' + ((e && e.message) || e)); },
    state: { projects: [], currentId: null },
    t: (k) => k, confirm: () => true, renderAll: () => {},
    chatsServerPull: (cb) => setTimeout(() => cb(true), 0), fetch: async () => ({ ok: true }),
  };
  ctx.window = { indexedDB: fdb.indexedDB, __localChatsLoaded: true, addEventListener: (t, f) => { (wl[t] = wl[t] || []).push(f); } };
  vm.createContext(ctx);
  if (opt.random) vm.runInContext('Math.random = () => ' + opt.random + ';', ctx); // معرّف تبويب ثابت (Math السياق نفسه كي لا يُبطئ Math.imul)
  const prelude = 'let __chatsLoadedFor = null; let __chatsSyncTimer = null;\n'
    + 'function chatsAuthToken(){ return ""; } function chatsSlimForServer(){ return []; } function scheduleChatsServerSync(){}\n'
    + 'function pushCodeSnapshot(){} function saveStateLocal(){ window.__localSaves = (window.__localSaves || 0) + 1; } function renderHistory(){}\n'
    + 'function getCurrent(){ return state.projects.find(p => p.id === state.currentId); }\n';
  vm.runInContext(prelude + STORE_SRC + '\n' + FLUSH_SRC + '\n' + LOGOUT_SRC + '\nthis.__get = (n) => eval(n); this.__set = (n, v) => eval(n + " = v");', ctx);
  return {
    ctx, log, wl, dl,
    get: (n) => ctx.__get(n), set: (n, v) => ctx.__set(n, v),
    advance: (ms) => { clockOff += ms; },
    /* كما يقرأ الإقلاع (app-09): __codeExpand(await idbGetGuarded(__projLoad)) */
    load: async () => ctx.__codeExpand(await ctx.__projLoad()),
    save: (sync) => ctx.__vaultSave(!!sync),
  };
}

/* سجلّ مالك مصغّر: تطبيقات بإصدارات كود مكرّرة (رسالة البناء + آلة الزمن + الحاليّ) وصور مخزونة بمعرّفها ونصوص عربيّة */
const BIG = (tag, n) => '<!doctype html><title>' + tag + '</title><script>' + 'ك'.repeat(n || 3000) + tag + '</script>';
function history(n, codeLen) {
  return Array.from({ length: n }, (_, i) => {
    const v1 = BIG('A' + i, codeLen), v2 = BIG('B' + i, codeLen);
    return {
      id: 'p_' + (1700000000000 + i), title: 'محادثة ' + i, provider: 'claude', updatedAt: 1700000000000 + i,
      code: i % 2 ? v2 : '', codeType: 'html',
      codeHistory: i % 2 ? [{ ts: 1, code: v1, codeType: 'html' }, { ts: 2, code: v2, codeType: 'html' }] : [],
      messages: [
        { role: 'user', content: 'ابنِ تطبيق مصاريف ' + i, attachments: i % 3 ? [] : [{ name: 'img.png', isImage: true, mime: 'image/png', dataUrl: '', vaultId: 'v' + i, serverThumb: 'data:image/jpeg;base64,AAAA' }] },
        { role: 'assistant', content: 'تمّ ✅ ' + 'ردّ '.repeat(50), code: i % 2 ? v1 : undefined },
        { role: 'assistant', content: 'تعديل', code: i % 2 ? v2 : undefined },
      ],
    };
  });
}
const clone = (x) => JSON.parse(J(x));
/* السجلّ القديم كما كتبه الإصدار السابق: مصفوفة واحدة، كلّ مشروع بصيغة v-code-dedupe (رموز \0omcode و__omCodes) */
function legacyRecord(app, projects) {
  return projects.map((p) => {
    const plan = app.ctx.__codeDedupePlan(p);
    const obj = JSON.parse(JSON.stringify(p, plan ? function (k, v) { if (k === 'code' && typeof v === 'string' && plan.tokenOf.has(this)) return plan.tokenOf.get(this); return k === 'viewUrl' || k === 'vaultPending' ? undefined : v; } : undefined));
    if (plan && plan.table.length) obj.__omCodes = plan.table;
    return obj;
  });
}
const recKeys = (keys) => keys.filter((k) => k.startsWith('aiapp_p:'));

test('١. ترحيل السجلّ القديم بلا فقد: المشاريع نفسها بالترتيب نفسه وبالمحتوى نفسه حرفيًّا، والسجلّ القديم يُمحى عند التزام الفهرس', async () => {
  const want = history(12);
  const helper = makeApp(fakeIDB());
  const legacy = legacyRecord(helper, want);
  assert.ok(legacy.some((p) => Array.isArray(p.__omCodes)) && J(legacy).includes('\\u0000omcode:'), 'البذرة بصيغة الإصدار السابق المضغوطة');
  const fdb = fakeIDB({ kv: [['aiapp_projects', legacy]], images: [] });
  const A = makeApp(fdb);
  const loaded = await A.load();
  assert.equal(J(loaded), J(want), 'القراءة الأولى من السجلّ القديم كما كانت');
  A.ctx.state.projects = loaded;
  await A.save(false);
  const keys = fdb.keys();
  assert.ok(!keys.includes('aiapp_projects'), 'السجلّ القديم مُحي في معاملة الفهرس');
  assert.ok(keys.includes('aiapp_projects_m'), 'الفهرس');
  assert.equal(recKeys(keys).length, 12, 'سجلّ لكلّ مشروع');
  const B = makeApp(fdb.snapshot());
  const back = await B.load();
  assert.equal(back.length, 12);
  assert.equal(J(back.map((p) => p.id)), J(want.map((p) => p.id)), 'الترتيب نفسه');
  assert.equal(J(back), J(want), 'المحتوى نفسه حرفيًّا (الرموز تتوسّع والجدول يُزال)');
  assert.ok(!J(fdb.kv().get(fdb.keys().find((k) => k.startsWith('aiapp_p:')))).includes('"vaultPending"'), 'السجلّ بلا حقول الذاكرة');
});

test('٢. ذهاب وعودة: ما يُحفظ هو ما يُقرأ، وحفظ بعد القراءة بلا تغيير لا يعيد كتابة أيّ مشروع (البصمة محفوظة في الفهرس)', async () => {
  const want = history(9);
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = clone(want);
  await A.save(false);
  const B = makeApp(fdb);
  const got = await B.load();
  assert.equal(J(got), J(want));
  B.ctx.state.projects = got;
  const before = fdb.stats.txs.length;
  await B.save(false);
  const txs = fdb.stats.txs.slice(before);
  assert.equal(txs.length, 1, 'معاملة واحدة');
  assert.deepEqual(recKeys(txs[0].keys), [], 'لا سجلّ أُعيدت كتابته');
  assert.deepEqual(txs[0].keys, ['aiapp_projects_m'], 'الفهرس وحده');
});

test('٣. حفظ بعد تعديل محادثة واحدة يكتبها وحدها (وفي تبويب أُعيد تحميله أيضًا)، وأطول معاملة يحدّها أكبر مشروع لا السجلّ كلّه', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(30, 400000); // ١٥ تطبيقًا بإصدارين ٤٠٠ ألف حرف: ~١٢م حرف بعد ضغط الكود المكرّر
  await A.save(false);
  const all = fdb.stats.txs.reduce((a, t) => a + t.chars, 0);
  const biggestRec = Math.max(...fdb.kv().get('aiapp_projects_m').keys.map((k) => J(fdb.kv().get(k)).length));
  for (const t of fdb.stats.txs) assert.ok(t.chars <= Math.max(4000000, biggestRec) + 20000, 'معاملة ' + t.chars + ' حرفًا (الحدّ max(٤م، أكبر سجلّ ' + biggestRec + '))');
  assert.ok(fdb.stats.txs.length >= 3, 'الترحيل في معاملات متعدّدة: ' + fdb.stats.txs.length + ' لسجلّ ' + all + ' حرفًا');
  // تعديل محادثة واحدة
  const before = fdb.stats.txs.length;
  A.ctx.state.projects[17].messages.push({ role: 'user', content: 'رسالة جديدة' });
  await A.save(false);
  let txs = fdb.stats.txs.slice(before);
  assert.equal(txs.length, 1, 'حفظ معتاد = معاملة واحدة');
  assert.equal(recKeys(txs[0].keys).length, 1, 'سجلّ المحادثة المعدّلة وحده');
  assert.ok(txs[0].chars < J(A.ctx.state.projects[17]).length + 20000, 'المكتوب بحجم محادثة واحدة: ' + txs[0].chars + ' من ' + all);
  // تبويب جديد يقرأ ثمّ يعدّل محادثة: يكتبها وحدها أيضًا
  const B = makeApp(fdb);
  B.ctx.state.projects = await B.load();
  B.ctx.state.projects[3].title = 'عنوان جديد';
  const b2 = fdb.stats.txs.length;
  await B.save(false);
  txs = fdb.stats.txs.slice(b2);
  assert.equal(recKeys(txs[0].keys).length, 1);
  const C = makeApp(fdb.snapshot());
  const back = await C.load();
  assert.equal(back[3].title, 'عنوان جديد');
  assert.equal(back[17].messages[back[17].messages.length - 1].content, 'رسالة جديدة');
  assert.equal(J(back), J(B.ctx.state.projects));
});

test('٤. انقطاع بين الكتابات (الصفحة ماتت) أو امتلاء السعة: الفهرس السابق وسجلّاته سليمة ومقروءة، واليتيم يُكنس في الحفظ التالي', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(6, 1500000); // ثلاثة تطبيقات ~٣م حرف: الحفظ الكامل معاملتان (دفعة ≥٤م ثمّ الأخيرة مع الفهرس)
  await A.save(false);
  const old = clone(A.ctx.state.projects);
  A.ctx.state.projects.forEach((p, i) => { p.messages.push({ role: 'user', content: 'جديد ' + i }); });
  // (أ) الصفحة تموت بعد أوّل معاملة من الحفظ الجديد
  fdb.hooks.killAfterTx = fdb.hooks.txSeen + 1;
  const pending = A.save(false); pending.catch(() => {});
  for (let i = 0; i < 300 && !fdb.hooks.dead; i++) await tick(10);
  assert.ok(fdb.hooks.dead, 'ماتت في منتصف الحفظ');
  const R = makeApp(fdb.snapshot());
  assert.equal(J(await R.load()), J(old), 'بعد إعادة التحميل: النسخة السابقة كاملة');
  // (ب) امتلاء السعة عند التزام الفهرس
  const g = fakeIDB();
  const Q = makeApp(g);
  Q.ctx.state.projects = history(6, 1500000);
  await Q.save(false);
  const old2 = clone(Q.ctx.state.projects);
  const live = new Set(g.keys());
  Q.ctx.state.projects.forEach((p, i) => { p.messages.push({ role: 'user', content: 'جديد ' + i }); });
  g.hooks.commitError = (info) => (info.keys.includes('aiapp_projects_m') ? Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }) : null);
  await assert.rejects(Q.save(false), /Quota/);
  assert.equal(J(await makeApp(g.snapshot()).load()), J(old2), 'الفهرس السابق مقروء كاملًا');
  assert.ok(g.keys().some((k) => !live.has(k)), 'سجلّات معاملات سبقت الفشل بقيت يتيمة');
  g.hooks.commitError = null;
  await Q.save(false);
  const man = g.kv().get('aiapp_projects_m');
  assert.deepEqual(recKeys(g.keys()), [...man.keys].sort(), 'الحفظ الناجح التالي يكنس اليتيم: المخزن = مفاتيح الفهرس');
  assert.equal(J(await makeApp(g.snapshot()).load()), J(Q.ctx.state.projects));
});

test('٥. مشروع حُذف: سجلّه يُكنس عند التزام الفهرس؛ مفتاح تبويب آخر قديم يُكنس، والحديث (قد يكون قيد الكتابة) يبقى', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(5);
  await A.save(false);
  const delKey = fdb.kv().get('aiapp_projects_m').keys[2];
  A.ctx.state.projects = A.ctx.state.projects.filter((_, i) => i !== 2);
  // مفتاحان من تبويب آخر خارج أيّ فهرس: قديم (١١ دقيقة) وحديث (دقيقة)
  const now = Date.now();
  const oldForeign = 'aiapp_p:zz9:' + (now - 660000).toString(36) + ':1', newForeign = 'aiapp_p:zz9:' + (now - 60000).toString(36) + ':2';
  fdb.kv().set(oldForeign, { id: 'x' }); fdb.kv().set(newForeign, { id: 'y' });
  await A.save(false);
  const keys = fdb.keys();
  assert.ok(!keys.includes(delKey), 'سجلّ المحذوف كُنس');
  assert.ok(!keys.includes(oldForeign), 'مفتاح تبويب آخر أقدم من ١٠ دقائق كُنس');
  assert.ok(keys.includes(newForeign), 'الحديث باقٍ (فهرسه يتحقّق قبل التزامه على كلّ حال)');
  assert.equal(J((await makeApp(fdb.snapshot()).load()).map((p) => p.id)), J(A.ctx.state.projects.map((p) => p.id)));
});

test('٦. الصيغتان معًا: السجلّ القديم الموجود بعد فهرس كتبه تبويب من الإصدار السابق بعده فهو الأحدث — محادثاته لا تسقط، ثمّ يُرحَّل', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(4);
  await A.save(false);
  // تبويب مفتوح من الإصدار السابق يحفظ ذاكرته (فيها محادثة جديدة) في السجلّ القديم الواحد
  const oldTab = history(4).concat([{ id: 'p_new_old_tab', title: 'من التبويب القديم', messages: [{ role: 'user', content: 'لا تضيع' }], code: '' }]);
  fdb.kv().set('aiapp_projects', legacyRecord(A, oldTab));
  const B = makeApp(fdb);
  const got = await B.load();
  assert.equal(got.length, 5);
  assert.equal(got[4].messages[0].content, 'لا تضيع', 'الأحدث (السجلّ القديم) هو المقروء');
  B.ctx.state.projects = got;
  await B.save(false);
  assert.ok(!fdb.keys().includes('aiapp_projects'), 'ورُحّل: التزام الفهرس محاه');
  assert.equal(J(await makeApp(fdb.snapshot()).load()), J(oldTab));
  // والعكس: فهرس يُلتزم بعد السجلّ القديم = الفهرس هو الأحدث
  fdb.kv().set('aiapp_projects', legacyRecord(A, history(2)));
  B.ctx.state.projects[0].title = 'أحدث من القديم';
  await B.save(false);
  const after = await makeApp(fdb.snapshot()).load();
  assert.equal(after.length, 5); assert.equal(after[0].title, 'أحدث من القديم');
});

test('٧. تبويبان: مفتاح أعاد تبويبٌ استعماله فكنسه الآخر لا يُلتزم فهرسٌ به — يُعاد كتابته، وكلّ مفتاح في الفهرس موجود', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb, { random: 0.111 });
  A.ctx.state.projects = history(3);
  await A.save(false);
  const B = makeApp(fdb, { random: 0.777 });
  assert.notEqual(A.get('__projTab'), B.get('__projTab'));
  B.ctx.state.projects = await B.load();
  B.advance(11 * 60000); // بعد ١١ دقيقة: مفاتيح A «قديمة» في نظر B
  B.ctx.state.projects[1].title = 'من B';
  await B.save(false); // يكنس مفتاح A القديم للمشروع ١
  const aKey1 = A.get('__projRec').get(A.ctx.state.projects[1]).key;
  assert.ok(!fdb.keys().includes(aKey1), 'B كنس سجلّ A القديم للمشروع ١');
  A.ctx.state.projects[0].title = 'من A';
  await A.save(false); // A يعيد استعمال مفتاحه المكنوس للمشروع ١ ← الفهرس يرفض ← يُعاد كتابته
  const man = fdb.kv().get('aiapp_projects_m');
  for (const k of man.keys) assert.ok(fdb.keys().includes(k), 'موجود: ' + k);
  const got = await makeApp(fdb.snapshot()).load();
  assert.equal(J(got), J(A.ctx.state.projects), 'الكاتب الأخير يغلب كما كان مع السجلّ الواحد — بلا سجلّ مفقود');
  assert.ok(!A.log.some((l) => /proj:load|missing/.test(l)), A.log.join(' | '));
});

test('٨. الخروج يمسح القاعدة كلّها (الفهرس وكلّ سجلّات المشاريع والسجلّ القديم)، والحفظ بعده يكتب المحادثة الفارغة وحدها', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(4); A.ctx.state.currentId = A.ctx.state.projects[0].id;
  await A.save(false);
  fdb.kv().set('aiapp_projects', [{ id: 'legacy' }]);
  const before = fdb.keys();
  assert.ok(before.length >= 6);
  assert.equal(await A.ctx.window.chatsLogoutWipe({ silent: true }), true);
  await A.ctx.__saveFlushWait(1000);
  const keys = fdb.keys();
  assert.ok(recKeys(before).every((k) => !keys.includes(k)) && !keys.includes('aiapp_projects'), 'لا سجلّ قديم باقٍ: ' + keys.join(','));
  assert.equal(J(recKeys(keys)), J([...fdb.kv().get('aiapp_projects_m').keys]), 'المخزن = سجلّ المحادثة الجديدة وفهرسها');
  const got = await makeApp(fdb.snapshot()).load();
  assert.equal(got.length, 1); assert.equal(got[0].messages.length, 0, 'المحادثة الفارغة الجديدة وحدها');
});

test('٩. زرّ «إعادة التحميل» في البانر ينتظر الحفظ: تغيير داخل نافذة التجميع (٣٠ث للسجلّ الثقيل) يصل قبل الإعادة — وpagehide وحده لا', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb);
  A.ctx.state.projects = history(5); A.ctx.state.currentId = A.ctx.state.projects[4].id;
  await A.save(false);
  A.set('__vaultLastLen', 70000000); A.set('__idbSavedAt', Date.now()); // سجلّ فوق 60MB حُفظ للتوّ ← الحفظ التالي بعد ٣٠ث
  A.ctx.state.projects[4].messages.push({ role: 'user', content: 'تغيير قبل إعادة التحميل' });
  A.ctx.saveState();
  // كما كان: إعادة فوريّة ← pagehide ← __saveFlush يبدأ حفظًا غير متزامن، والصفحة تُهدم قبل التزامه
  (A.wl.pagehide || []).forEach((f) => f({ persisted: false }));
  const lost = await makeApp(fdb.snapshot()).load();
  assert.ok(!J(lost).includes('تغيير قبل إعادة التحميل'), 'الإعادة الفوريّة كانت تضيّعه');
  await tick(50);
  // الآن: الكاشف الحقيقيّ في سياق التطبيق نفسه — البانر يظهر ثمّ «إعادة التحميل»
  const gdb = fakeIDB();
  const B = makeApp(gdb);
  B.ctx.state.projects = history(5); B.ctx.state.currentId = B.ctx.state.projects[4].id;
  await B.save(false);
  B.set('__vaultLastLen', 70000000); B.set('__idbSavedAt', Date.now());
  B.ctx.state.projects[4].messages.push({ role: 'user', content: 'تغيير قبل إعادة التحميل' });
  B.ctx.saveState();
  const w = detector(B, () => gdb.snapshot());
  w.freeze();
  assert.equal(w.banner.style.display, 'flex', 'البانر');
  w.reloadBtn.onclick();
  assert.equal(w.reloads.length, 0, 'لا إعادة في اللحظة نفسها');
  assert.equal(w.reloadBtn.disabled, true, 'الزرّ معطّل أثناء الانتظار');
  for (let i = 0; i < 100 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد بعد الحفظ');
  const after = await makeApp(w.reloads[0]).load();
  assert.ok(J(after).includes('تغيير قبل إعادة التحميل'), 'التغيير ملتزم قبل الإعادة: «تم حفظ عملك تلقائيًا» صادقة');
  assert.equal(J(after), J(B.ctx.state.projects));
});

/* الكاشف الحقيقيّ (app-10) في سياق التطبيق: عامل نبض وساعة مزيّفان، وlocation.reload يلتقط القاعدة الملتزمة لحظتها */
function detector(app, snap) {
  const banner = { style: { display: 'none' } }, reloadBtn = { onclick: null, disabled: false };
  const reloads = []; let worker = null;
  const RealDate = app.ctx.Date; let now = RealDate.now();
  class DetDate extends RealDate { static now() { return now; } }
  const ctx = app.ctx;
  Object.assign(ctx, {
    $: (s) => (s === '#freezeBanner' ? banner : s === '#freezeReloadBtn' ? reloadBtn : { onclick: null }),
    Worker: function () { worker = this; this.terminate = () => {}; }, Blob: function () {}, URL: { createObjectURL: () => 'blob:x' },
    location: { reload: () => { reloads.push(snap()); } },
  });
  ctx.window.Worker = function () {};
  ctx.Date = DetDate;
  vm.runInContext(DETECTOR, ctx);
  ctx.Date = RealDate;
  return {
    banner, reloadBtn, reloads,
    freeze() {
      ctx.Date = DetDate;
      const T = now + 20000;
      for (const [sent, got] of [[T, T + 50], [T + 1000, T + 8000], [T + 2000, T + 8010]]) { now = got; worker.onmessage({ data: sent }); }
      ctx.Date = RealDate;
    },
  };
}

test('١٠. انتظار الإعادة محدود: IndexedDB معلّق (علّة iOS) ← يعيد بعد المهلة ولا يعلق للأبد', async () => {
  const fdb = fakeIDB();
  const fast = (f, ms) => setTimeout(f, ms >= 1000 ? Math.round(ms / 50) : ms); // ٥ث ← ١٠٠م.ث
  const A = makeApp(fdb, { setTimeout: fast });
  A.ctx.state.projects = history(3); A.ctx.state.currentId = A.ctx.state.projects[0].id;
  await A.save(false);
  A.ctx.state.projects[0].messages.push({ role: 'user', content: 'معلّق' });
  A.ctx.saveState();
  fdb.hooks.dead = true;
  const w = detector(A, () => 'reloaded');
  w.freeze();
  w.reloadBtn.onclick();
  await tick(20);
  assert.equal(w.reloads.length, 0, 'ينتظر');
  for (let i = 0; i < 60 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد بعد المهلة رغم تعليق القاعدة');
});

test('١١. المصدر: الإقلاع يقرأ بـ__projLoad، ولا كتابة للسجلّ الواحد في الحفظ الدوريّ، والبانر لا يحفظ لحظة التجمّد', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'js', 'app-09-attach.js'), 'utf8');
  assert.equal((boot.match(/idbGetGuarded\(__projLoad\)/g) || []).length, 2);
  const save = slice(A4, 'async function __vaultSaveRun(', 'function __noViewReplacer');
  assert.ok(!/idbSet\(/.test(save), 'الحفظ الدوريّ لا يكتب السجلّ كلّه put واحدًا');
  assert.match(DETECTOR, /window\.__saveFlushWait\(5000\)/);
  assert.ok(!/saveState\s*\(/.test(DETECTOR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'لا saveState في الكاشف (v-freeze-fix)');
});

test('١٢. مهلة الإقلاع لانقطاع التقدّم: قراءة طويلة تتقدّم سجلًّا سجلًّا لا تُطلق قراءة ثانية فوقها، والتعليق يُكشف كما كان', async () => {
  const boot = fs.readFileSync(path.join(ROOT, 'js', 'app-09-attach.js'), 'utf8');
  const src = slice(boot, 'const idbGetGuarded = async (load) => {', '  try{\n    const migrated');
  const T = 100; // ٣ث ← ٣٠م.ث
  const guard = () => new Function('setTimeout', 'clearTimeout', 'fetch', 'location', 'navigator', src + '\nreturn idbGetGuarded;')(
    (f, ms) => setTimeout(f, ms / T), clearTimeout, () => Promise.resolve(), { pathname: '/' }, { userAgent: 'x' });
  // سجلّ ثقيل: ٢٠ سجلًّا، كلّ واحد بعد «ثانيتين» — ٤٠ث بالمجموع، والمهلة ٣ث
  let calls = 0;
  const slow = (alive) => { calls++; return new Promise((res) => { let n = 0; const step = () => { if (++n > 20) return res(['تمّ']); alive(); setTimeout(step, 2000 / T); }; step(); }); };
  assert.equal(J(await guard()(slow)), J(['تمّ']));
  assert.equal(calls, 1, 'قراءة واحدة — لا ثانية فوقها');
  // تعليق حقيقيّ: لا تقدّم ولا جواب ← محاولة إنعاش ثمّ رفض (كما كان)
  let hung = 0;
  await assert.rejects(guard()(() => { hung++; return new Promise(() => {}); }), /idb-timeout/);
  assert.equal(hung, 2);
});

/* ── جولة المراجعة (r3-rv*) ── */
/* «إعادة التحميل» أثناء حفظ مقسّم جارٍ — المعالج البطيء محاكى: كلّ نداء Date.now يتقدّم ١٥م.ث (فيتنازل الحفظ كلّ ٣ مشاريع تقريبًا)،
   والتنازل ٢٥م.ث حقيقيّة، ومهلة ٥ث ← ١٠٠م.ث، وسقف ٣٠ث ← ٦٠٠م.ث. التغيير يمرّ عليه مؤقّت التجميع (__saveFlush) فيبدأ حفظ مقسّم
   ولا يبقى شيء «قذر» — ثمّ ينقر المستخدم «إعادة التحميل» والحفظ ما زال جاريًا. */
const slowTimers = (f, ms) => setTimeout(f, ms === 0 ? 25 : (ms >= 1000 ? Math.round(ms / 50) : ms));
async function inflightApp() {
  const fdb = fakeIDB();
  const A = makeApp(fdb, { setTimeout: slowTimers });
  A.ctx.state.projects = history(30, 20000); A.ctx.state.currentId = A.ctx.state.projects[29].id;
  await A.save(false);
  let off = 0; const RD = A.ctx.Date;
  A.ctx.Date = class extends RD { static now() { off += 15; return RD.now() + off; } };
  A.set('__vaultLastLen', 70000000); A.set('__idbSavedAt', 0);
  A.ctx.state.projects[17].messages.push({ role: 'user', content: 'CHANGE_IN_FLIGHT' });
  A.ctx.saveState();
  A.ctx.__saveFlush(); // ما يفعله مؤقّت التجميع: حفظ مقسّم يبدأ، ولا شيء «قذر» بعده
  assert.equal(A.get('__saveDirty'), false);
  await tick(30);
  return { fdb, A };
}

test('r3-rv1أ. «إعادة التحميل» أثناء حفظ مقسّم جارٍ ولا شيء ينتظر: الإعادة بعد التزام الحفظ الذي يحمل التغيير لا بعد ٥ث من النقر', async () => {
  const { fdb, A } = await inflightApp();
  const w = detector(A, () => fdb.snapshot());
  w.freeze();
  w.reloadBtn.onclick();
  for (let i = 0; i < 300 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد');
  const after = await makeApp(w.reloads[0]).load();
  assert.ok(J(after).includes('CHANGE_IN_FLIGHT'), 'التغيير الذي يحمله الحفظ الجاري ضاع بإعادة التحميل');
});

test('r3-rv1ب. حفظ أحدث يوقف الحفظ المنتظَر أثناء الانتظار: الانتظار يتبع الأحدث (هو الذي يحمل التغيير الآن)', async () => {
  const { fdb, A } = await inflightApp();
  const w = detector(A, () => fdb.snapshot());
  w.freeze();
  w.reloadBtn.onclick();
  // بعد النقر: تغيير آخر ومؤقّت التجميع يبدأ حفظًا جديدًا ← الجيل يرتفع فيتوقّف الجاري عند أوّل مهلة بلا فهرس
  A.ctx.state.projects[3].title = 'بعد النقر';
  A.ctx.saveState();
  A.ctx.__saveFlush();
  for (let i = 0; i < 300 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد');
  const after = await makeApp(w.reloads[0]).load();
  assert.ok(J(after).includes('CHANGE_IN_FLIGHT'), 'الحفظ المنتظَر توقّف والأحدث لم يلتزم بعد — والإعادة لم تنتظره');
});

test('r3-rv1ج. مهلة الانتظار لـIndexedDB لا للتسلسل: حفظ متزامن طويل خلف حفظ جارٍ لا تسبقه المهلة إلى الإعادة', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb, { setTimeout: slowTimers }); // ٥ث ← ١٠٠م.ث
  const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };
  A.ctx.state.projects = history(30, 2000); A.ctx.state.currentId = A.ctx.state.projects[29].id;
  A.ctx.state.projects.forEach((p) => { p.heavy = { toJSON: () => { busy(10); return 1; } }; }); // تسلسل كلّ مشروع ١٠م.ث: الحفظ كلّه ٣٠٠م.ث
  await A.save(false);
  A.set('__vaultLastLen', 70000000); A.set('__idbSavedAt', 0);
  A.ctx.state.projects[17].messages.push({ role: 'user', content: 'CHANGE_IN_FLIGHT' });
  A.ctx.saveState();
  fdb.hooks.lag = 40; // القرص بطيء: معاملة الفهرس تنتظر ٤٠م.ث
  const n0 = fdb.hooks.txSeen;
  A.ctx.__saveFlush(); // حفظ مقسّم جارٍ
  for (let i = 0; i < 2000 && fdb.hooks.txSeen === n0; i++) await tick(1); // النقر والحفظ الجاري ينتظر التزام فهرسه في IndexedDB
  assert.notEqual(fdb.hooks.txSeen, n0, 'الحفظ الجاري بلغ معاملة فهرسه');
  A.ctx.state.projects[3].messages.push({ role: 'user', content: 'CHANGE_PENDING' });
  A.ctx.saveState(); // وتغيير ينتظر في التجميع ← النقر يبدأ حفظًا خلف الجاري (كان متزامنًا: ٣٠٠م.ث في مهمّة واحدة > مهلة ١٠٠م.ث؛ مقسّم منذ r3-rv3)
  const w = detector(A, () => fdb.snapshot());
  w.freeze();
  w.reloadBtn.onclick();
  for (let i = 0; i < 300 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد');
  const after = J(await makeApp(w.reloads[0]).load());
  assert.ok(after.includes('CHANGE_IN_FLIGHT') && after.includes('CHANGE_PENDING'), 'المهلة انقضت أثناء التسلسل فسبقت الإعادة التزام الفهرس');
});

test('r3-rv2. التراجع ثمّ العودة: الإصدار السابق كتب المرآة المنحّفة سجلًّا قديمًا — الإقلاع يدمجه بالفهرس بالمعرّف ولا يُكنس التاريخ', async () => {
  const fdb = fakeIDB();
  const A = makeApp(fdb, { random: 0.111 });
  const full = history(12, 20000);
  A.ctx.state.projects = clone(full);
  await A.save(false);
  // الإصدار السابق لا يقرأ إلّا aiapp_projects: يقلع على المرآة المنحّفة (أحدث ما يتّسع، بلا كود ولا آلة زمن)، وأوّل حفظ له يكتبها سجلًّا قديمًا
  const slim = full.slice(-3).map((p) => ({ id: p.id, title: p.title, provider: p.provider, messages: p.messages.map((m) => ({ role: m.role, content: m.content })), code: '', updatedAt: p.updatedAt }));
  slim.push({ id: 'p_rolled_back', title: 'من الإصدار السابق', messages: [{ role: 'user', content: 'كتبتها أثناء التراجع' }], code: '' });
  fdb.kv().set('aiapp_projects', slim);
  // العودة إلى هذا الإصدار: تبويب جديد
  const B = makeApp(fdb, { random: 0.777 });
  const got = await B.load();
  assert.equal(got.length, 13, 'التاريخ كلّه + محادثة الإصدار السابق: ' + got.length);
  assert.equal(J(got.slice(0, 12)), J(full), 'النسخة الكاملة تغلب المنحّفة (الرسائل نفسها، والكاملة أطول)');
  assert.equal(got[12].messages[0].content, 'كتبتها أثناء التراجع', 'وما كتبه الإصدار السابق وحده يُضاف');
  B.ctx.state.projects = got;
  await B.save(false);
  assert.ok(!fdb.keys().includes('aiapp_projects'), 'رُحّل');
  // بعد ١١ دقيقة: كنس مفاتيح التبويب الآخر القديمة لا يمسّ شيئًا من التاريخ
  B.advance(11 * 60000);
  B.ctx.state.projects[0].title = 'بعد ١١ دقيقة';
  await B.save(false);
  const back = await makeApp(fdb.snapshot()).load();
  assert.equal(back.length, 13, 'بعد الكنس: ' + back.length);
  assert.equal(J(back), J(B.ctx.state.projects));
  assert.ok(back.filter((p) => p.code).length >= 6 && back.some((p) => (p.codeHistory || []).length === 2), 'التطبيقات بكودها وآلة الزمن');
});

/* ── جولة المراجعة الثالثة (r3-rv3): «إعادة التحميل» بعد أوّل إقلاع من السجلّ القديم ── */
/* أوّل إقلاع لكلّ جهاز بعد النشر يقرأ السجلّ القديم الواحد، فلا __projRec لأيّ مشروع. النقر كان يفرض حفظًا متزامنًا (__saveFlush(true))
   = كلّ المشاريع في معاملة الفهرس الواحدة، واستنساخها البنيويّ داخل put متزامن بحجم التاريخ كلّه (>٥ث على ٣٦١ محادثة، المعالج ×٢):
   المهلة المسلّحة قبلها تنقضي أثناءه، والإعادة تقتل المعاملة قبل التزامها فيضيع التغيير (ويبقى يتيم الدفعات السابقة).
   محاكاة المعالج البطيء: كلّ حرف يُستنسخ في put بـ٣٠ن.ث (دفعة ٤م حرف ≈ ١٢٠م.ث، والسجلّ كلّه ≈ ١٢م حرف ≈ ٣٦٠م.ث)، ومهلة ٥ث ← ٢٥٠م.ث. */
const budgetTimers = (f, ms) => setTimeout(f, ms >= 1000 ? Math.round(ms / 20) : ms);
async function legacyBootApp() {
  const legacy = legacyRecord(makeApp(fakeIDB()), history(30, 400000));
  const fdb = fakeIDB({ kv: [['aiapp_projects', legacy]], images: [] });
  const A = makeApp(fdb, { setTimeout: budgetTimers });
  A.ctx.state.projects = await A.load(); // أوّل إقلاع بعد النشر: من السجلّ القديم وحده
  A.ctx.state.currentId = A.ctx.state.projects[29].id;
  const biggestRec = Math.max(...legacy.map((p) => J(p).length));
  fdb.hooks.nsPerChar = 30;
  return { fdb, A, biggestRec };
}
async function clickReload(A, fdb) {
  const w = detector(A, () => fdb.snapshot());
  w.freeze();
  w.reloadBtn.onclick();
  for (let i = 0; i < 1500 && !w.reloads.length; i++) await tick(10);
  assert.equal(w.reloads.length, 1, 'أعاد');
  return w.reloads[0];
}
const maxTx = (fdb, from) => Math.max(0, ...fdb.stats.txs.slice(from).map((t) => t.chars));

test('r3-rv3أ. «إعادة التحميل» بعد أوّل إقلاع من السجلّ القديم: الحفظ الذي ينتظره مقسّم (لا معاملة بحجم التاريخ) والتغيير ملتزم قبل الإعادة', async () => {
  const { fdb, A, biggestRec } = await legacyBootApp();
  const n0 = fdb.stats.txs.length;
  A.ctx.state.projects[17].title = 'CHANGE_AFTER_LEGACY_BOOT';
  A.ctx.saveState();
  const snap = await clickReload(A, fdb);
  const after = await makeApp(snap).load();
  assert.ok(J(after).includes('CHANGE_AFTER_LEGACY_BOOT'), 'التغيير ضاع: الإعادة سبقت التزام معاملة الفهرس');
  assert.ok(snap.keys().includes('aiapp_projects_m') && !snap.keys().includes('aiapp_projects'), 'رُحّل قبل الإعادة');
  assert.equal(J(after), J(A.ctx.state.projects));
  await A.ctx.__saveFlushWait(1000);
  assert.ok(maxTx(fdb, n0) <= Math.max(4000000, biggestRec) + 20000, 'أكبر معاملة ' + maxTx(fdb, n0) + ' حرفًا — الحفظ المفروض كتب التاريخ كلّه في معاملة واحدة');
});

test('r3-rv3ب. ترحيل مقسّم جارٍ من مؤقّت التجميع لحظة النقر وتغيير ينتظر: الحفظ الأحدث مقسّم أيضًا، والتغييران ملتزمان قبل الإعادة', async () => {
  const { fdb, A, biggestRec } = await legacyBootApp();
  const n0 = fdb.stats.txs.length;
  let off = 0; const RD = A.ctx.Date;
  A.ctx.Date = class extends RD { static now() { off += 15; return RD.now() + off; } }; // المعالج البطيء: الترحيل يتنازل كلّ مشروعين تقريبًا
  A.ctx.state.projects[3].title = 'CHANGE_IN_FLIGHT';
  A.ctx.saveState();
  A.ctx.__saveFlush(); // مؤقّت التجميع: الترحيل المقسّم يبدأ ولا شيء «قذر» بعده
  assert.equal(A.get('__saveDirty'), false);
  await tick(0);
  A.ctx.state.projects[17].title = 'CHANGE_PENDING';
  A.ctx.saveState(); // تغيير ينتظر في التجميع لحظة النقر
  const snap = await clickReload(A, fdb);
  const after = J(await makeApp(snap).load());
  assert.ok(after.includes('CHANGE_IN_FLIGHT') && after.includes('CHANGE_PENDING'), 'ضاع تغيير: الإعادة سبقت التزام معاملة الفهرس');
  await A.ctx.__saveFlushWait(1000);
  assert.ok(maxTx(fdb, n0) <= Math.max(4000000, biggestRec) + 20000, 'أكبر معاملة ' + maxTx(fdb, n0) + ' حرفًا');
});

test('r3-rv3ج. ترحيل أوّل انقطع بعد دفعة (يتيم بمعرّف تبويب ميّت): لا يحجب السجلّ القديم عند الإقلاع ولا الفهرس بعد الترحيل، ويُكنس بعد ١٠ دقائق', async () => {
  const want = history(6, 1500000); // ثلاثة تطبيقات ~٣م حرف: كلّ تطبيق معاملة
  const legacy = legacyRecord(makeApp(fakeIDB()), want);
  const fdb = fakeIDB({ kv: [['aiapp_projects', legacy]], images: [] });
  const A = makeApp(fdb, { random: 0.111 });
  A.ctx.state.projects = await A.load();
  A.ctx.state.projects.forEach((p) => { p.title = 'ORPHAN_ONLY ' + p.title; }); // لم يلتزم قطّ: يبقى في اليتيم وحده
  fdb.hooks.killAfterTx = fdb.hooks.txSeen + 1; // الصفحة تموت بعد أوّل دفعة (إعادة أو إغلاق أثناء الترحيل)
  A.save(false).catch(() => {});
  for (let i = 0; i < 300 && !fdb.hooks.dead; i++) await tick(10);
  assert.ok(fdb.hooks.dead, 'ماتت في منتصف الترحيل');
  const S = fdb.snapshot();
  const orphans = recKeys(S.keys());
  assert.ok(orphans.length >= 1 && S.keys().includes('aiapp_projects') && !S.keys().includes('aiapp_projects_m'), 'يتيم والسجلّ القديم ولا فهرس: ' + S.keys().join(','));
  // الإقلاع التالي (تبويب جديد): السجلّ القديم كما هو — اليتيم لا يُقرأ
  const B = makeApp(S, { random: 0.777 });
  const got = await B.load();
  assert.equal(J(got), J(want), 'السجلّ القديم الملتزم هو المقروء — لا شيء من اليتيم');
  B.ctx.state.projects = got;
  await B.save(false);
  assert.ok(!S.keys().includes('aiapp_projects') && S.keys().includes('aiapp_projects_m'), 'رُحّل');
  const mid = J(await makeApp(S.snapshot()).load());
  assert.equal(mid, J(want), 'بعد الترحيل: الفهرس وحده يُقرأ — اليتيم الحديث (تبويب آخر <١٠ دقائق) باقٍ ولا يحجب');
  assert.ok(orphans.every((k) => S.keys().includes(k)), 'اليتيم الحديث باقٍ قبل ١٠ دقائق (قد يكون قيد الكتابة في تبويب حيّ)');
  // بعد ١١ دقيقة: أوّل حفظ يكنس اليتيم — المخزن = مفاتيح الفهرس
  B.advance(11 * 60000);
  B.ctx.state.projects[0].title = 'بعد ١١ دقيقة';
  await B.save(false);
  const man = S.kv().get('aiapp_projects_m');
  assert.ok(orphans.every((k) => !S.keys().includes(k)), 'اليتيم كُنس');
  assert.deepEqual(recKeys(S.keys()), [...man.keys].sort(), 'المخزن = مفاتيح الفهرس');
  assert.equal(J(await makeApp(S.snapshot()).load()), J(B.ctx.state.projects));
});

