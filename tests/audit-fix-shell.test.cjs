'use strict';
/* v-audit-shell (فحص التطبيق كاملًا، مجموعة «هيكل الواجهة»): ستّ ملاحظات مثبتة، لكلّ واحدة حالة تفشل على ما قبل الإصلاح.
   ١ السلّة تحذف المحدَّد بلا تأكيد (حتّى «حذف الكل» وحسابات المستخدمين) · ٢ نقرة تحميل واحدة تشغّل مساري الحفظ معًا
   ٣ حذف الدروس المحدَّدة ReferenceError · ٤ تحديد نصّ بالفأرة يغلق الأداة · ٥ «باقتك الحالية» ثابتة على «مجاني»
   ٦ رسالة نجاح الدفع تقول «(وضع تجريبي)» و«تمّ الاشتراك» حتّى لرزمة نقاط.
   الملفّات الحقيقيّة تُشغَّل في vm بصفحة مزيّفة صغيرة (نمط history-select-mouse وswipe-back-history)، والدوالّ تُستخرج بـacorn. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/* مصدر دالّة/دوالّ معرَّفة بالاسم في أيّ عمق (FunctionDeclaration) — الغائب يُتخطّى فيفشل السلوك لا الاستخراج */
function fnSrc(src, names) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  const out = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name)) out.push(src.slice(n.start, n.end));
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return out.join('\n');
}
function findNode(src, pred) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  let hit = null;
  (function walk(n) {
    if (hit || !n || typeof n.type !== 'string') return;
    if (pred(n)) { hit = n; return; }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return hit;
}

/* ══════════════ صفحة مزيّفة لـ js/delete-confirm.js ══════════════ */
const DC = read('js/delete-confirm.js');
function matchesOne(el, s) {
  s = s.trim();
  let m;
  if ((m = /^\.([\w-]+)$/.exec(s))) return el.classList.contains(m[1]);
  if ((m = /^#([\w-]+)$/.exec(s))) return el.id === m[1];
  if ((m = /^\[([\w-]+)\]$/.exec(s))) return el.hasAttribute(m[1]);
  if ((m = /^\[([\w-]+)="([^"]*)"\]$/.exec(s))) return el.getAttribute(m[1]) === m[2];
  if ((m = /^\[([\w-]+)\*="([^"]*)"\]$/.exec(s))) return String(el.getAttribute(m[1]) || '').includes(m[2]);
  if (/^[a-z]+$/.test(s)) return el.tagName === s.toUpperCase();
  return false;
}
function makeEl(tag) {
  const cls = new Set();
  const attrs = new Map();
  const el = {
    tagName: String(tag).toUpperCase(), id: '', title: '', children: [], parentNode: null, dataset: {}, style: {}, isConnected: true, _text: '', onclick: null,
    classList: {
      add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      contains: (c) => cls.has(c), toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; on ? cls.add(c) : cls.delete(c); return on; },
    },
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => cls.add(x)); },
    get textContent() { return el._text + el.children.map((c) => c.textContent).join(''); },
    set textContent(v) { el._text = String(v); el.children = []; },
    set innerHTML(v) { el.children = []; for (const m of String(v).matchAll(/<(\w+) id="([\w-]+)"/g)) { const c = makeEl(m[1]); c.id = m[2]; el.appendChild(c); } },
    setAttribute: (k, v) => { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    appendChild: (c) => { c.parentNode = el; el.children.push(c); return c; },
    contains: (n) => { for (let x = n; x; x = x.parentNode) if (x === el) return true; return false; },
    matches: (sel) => sel.split(',').some((s) => matchesOne(el, s)),
    closest: (sel) => { for (let x = el; x && x.matches; x = x.parentNode) if (x.matches(sel)) return x; return null; },
    querySelectorAll: (sel) => { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); }); walk(el); return out; },
    querySelector: (sel) => {
      const sc = /^:scope > (.+)$/.exec(sel);
      if (sc) return el.children.find((c) => c.matches(sc[1])) || null;
      return el.querySelectorAll(sel)[0] || null;
    },
  };
  return el;
}
const DICT = {
  axShellDeleteSelected: '⚠️ سيتم حذف العناصر المحدّدة ({n}) نهائيًّا. متأكد؟',
  ownerDeleteConfirm: '⚠️ حذف نهائي لحساب "{u}"؟ لا يمكن التراجع.',
  defaultProjectTitle: 'محادثة جديدة',
};
function bootSelect({ confirmAnswers = [], eduCore = null, storage = null } = {}) {
  const html = makeEl('html');
  html.lang = 'ar'; html.dir = 'rtl';
  const head = html.appendChild(makeEl('head'));
  const body = html.appendChild(makeEl('body'));
  const history = body.appendChild(makeEl('div'));
  history.id = 'history';
  const rows = ['p1', 'p2'].map((pid) => {
    const row = history.appendChild(makeEl('div'));
    row.className = 'hist-item'; row.dataset.pid = pid;
    const title = row.appendChild(makeEl('span')); title.className = 'hist-title';
    return { row, title };
  });
  const delAll = body.appendChild(makeEl('button')); delAll.id = 'btnDeleteAll';
  /* صفّ مستخدم في لوحة المالك: زرّ حذفه onclick="adminDeleteUser('bob')" (app-01) */
  const adminRow = body.appendChild(makeEl('div'));
  const adminBtn = adminRow.appendChild(makeEl('button')); adminBtn.setAttribute('onclick', "adminDeleteUser('bob')");
  /* صفّ درس في مركز التعليم (edu.js showLessons) */
  const lessonRow = body.appendChild(makeEl('div'));
  lessonRow.className = 'eduLessonRow'; lessonRow.dataset.id = 'L1';
  const listeners = {};
  const timers = [];
  const document = {
    documentElement: html, head, body,
    getElementById: (id) => html.querySelectorAll('#' + id)[0] || null,
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    querySelector: (sel) => html.querySelectorAll(sel)[0] || null,
    createElement: (tag) => makeEl(tag),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const log = { confirm: [], fetch: [], errors: [], alerts: [], saved: 0 };
  const answers = confirmAnswers.slice();
  const sb = {
    document, navigator: {}, CSS: { escape: (s) => s },
    console: { log() {}, warn() {}, error: (...a) => log.errors.push(a.map(String).join(' ')) },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: (f) => { f(); return 1; },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    state: { projects: [{ id: 'p1', messages: [] }, { id: 'p2', messages: [] }], currentId: 'p1' },
    saveState: () => { log.saved++; }, renderAll: () => {},
    chatsAuthToken: () => 'tok', authGet: () => 'tok',
    t: (k) => (k in DICT ? DICT[k] : k),
    confirm: (m) => { log.confirm.push(String(m)); return answers.length ? answers.shift() : false; },
    alert: (m) => { log.alerts.push(String(m)); },
    fetch: (url, init) => { log.fetch.push({ url: String(url), body: JSON.parse((init && init.body) || '{}') }); return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }); },
    __eduCore: eduCore, localStorage: storage,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(DC, sb);
  const fire = (type, target, extra = {}) => {
    const ev = { type, target, clientX: 10, clientY: 10, defaultPrevented: false, stopped: false, ...extra,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    (listeners[type] || []).forEach((fn) => { if (!ev.stopped) fn(ev); });
    return ev;
  };
  const runTimers = () => { for (let i = 0; i < timers.length; i++) { const f = timers[i]; timers[i] = null; if (f) f(); } };
  const bar = () => html.querySelectorAll('#omranSelectionBar')[0];
  return {
    sb, log, rows, delAll, adminRow, lessonRow, bar,
    hold(target) { fire('pointerdown', target, { pointerType: 'touch' }); runTimers(); fire('pointerup', target, { pointerType: 'touch' }); },
    click: (target) => fire('click', target, { detail: 1 }),
    trash: () => bar().querySelector('#omranSelectionTrash').onclick(),
  };
}

test('cli-ui-shell-1: «حذف الكل» في وضع التحديد ثمّ السلّة — تأكيد بعدد العناصر قبل أيّ حذف، والرفض لا يحذف شيئًا ويُبقي التحديد', async () => {
  const b = bootSelect({ confirmAnswers: [false] });
  b.hold(b.rows[0].title);
  b.click(b.delAll); /* يُعترض: يحدّد كلّ المحادثات (chooseAllChats) */
  assert.ok(b.bar().classList.contains('show'));
  await b.trash();
  assert.equal(b.log.confirm.length, 1, 'السلّة كانت تحذف كلّ المحادثات بلا أيّ سؤال');
  assert.match(b.log.confirm[0], /\(2\)/, 'التأكيد يذكر عدد المحدَّد');
  assert.equal(b.sb.state.projects.length, 2, 'الرفض لا يحذف محلّيًّا');
  assert.equal(b.log.fetch.length, 0, 'ولا يرسل chats_delete');
  assert.ok(b.bar().classList.contains('show'), 'والتحديد باقٍ بعد الرفض');
  /* القبول: الحذف كما كان */
  b.sb.confirm = (m) => { b.log.confirm.push(String(m)); return true; };
  await b.trash();
  assert.deepEqual(b.sb.state.projects.map((p) => p.id).filter((id) => id === 'p1' || id === 'p2'), []);
  const del = b.log.fetch.find((f) => /chats_delete/.test(f.url));
  assert.ok(del, 'القبول يحذف من الخادم');
  assert.deepEqual(del.body.ids.sort(), ['p1', 'p2']);
});

test('cli-ui-shell-1: حذف حساب مستخدم بالتحديد (باب مقفل) — تأكيد لكلّ حساب بنصّ adminDeleteUser نفسه، والرفض لا يرسل admin-actions', async () => {
  const b = bootSelect({ confirmAnswers: [false] });
  b.hold(b.adminRow);
  assert.ok(b.adminRow.classList.contains('omran-selected'));
  await b.trash();
  assert.equal(b.log.confirm.length, 1, 'كان POST /api/admin-actions action:delete يُرسل بلا سؤال');
  assert.match(b.log.confirm[0], /حذف نهائي لحساب/);
  assert.ok(b.log.confirm[0].includes('bob'), 'التأكيد يسمّي الحساب');
  assert.equal(b.log.fetch.filter((f) => /admin-actions/.test(f.url)).length, 0);
  b.sb.confirm = (m) => { b.log.confirm.push(String(m)); return true; };
  await b.trash();
  const sent = b.log.fetch.filter((f) => /admin-actions/.test(f.url));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.action, 'delete');
  assert.equal(sent[0].body.targetUsername, 'bob');
});

/* ══════════════ ٣: حذف الدروس المحدَّدة ══════════════ */
const EDU = read('js/edu.js');
function realEduDelete(store) {
  const sb = { localStorage: store, sessionStorage: { getItem: () => null }, authGet: () => '', __swallow() {}, LS_GUEST: 'eduHubLessons' };
  vm.createContext(sb);
  vm.runInContext('var LS_GUEST="eduHubLessons";' + fnSrc(EDU, ['getToken', 'localLessons', 'saveLocalLessons', 'deleteLesson']) + ';this.deleteLesson=deleteLesson;', sb);
  return sb.deleteLesson;
}
function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

test('cli-ui-shell-3: edu.js يصدّر deleteLesson في __eduCore (كانت داخل الـIIFE وحدها)', () => {
  const node = findNode(EDU, (n) => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property && n.left.property.name === '__eduCore');
  assert.ok(node && node.right.type === 'ObjectExpression', 'window.__eduCore={…}');
  const prop = node.right.properties.find((p) => p.key && (p.key.name === 'deleteLesson' || p.key.value === 'deleteLesson'));
  assert.ok(prop, 'deleteLesson غير مصدَّرة — delete-confirm.js لا يصلها');
  assert.equal(prop.value.type, 'Identifier');
  assert.equal(prop.value.name, 'deleteLesson', 'الدالّة الحقيقيّة نفسها لا نسخة');
  const home = node.right.properties.find((p) => p.key && p.key.name === 'showHome');
  assert.ok(home, 'showHome مصدَّرة (لإعادة رسم القائمة بعد الحذف)');
});

test('cli-ui-shell-3: ضغط مطوّل على درس ثمّ السلّة — الدرس يُحذف فعلًا (deleteLesson الحقيقيّة) وتُعاد الشاشة، بلا ReferenceError', async () => {
  const store = memStore({ eduHubLessons: JSON.stringify([{ id: 'L1', title: 'أ' }, { id: 'L2', title: 'ب' }]) });
  const homes = [];
  const core = { deleteLesson: realEduDelete(store), showHome: () => homes.push(1), T: (k) => (k === 'err' ? 'حدث خطأ، حاول مرة أخرى.' : k) };
  const b = bootSelect({ confirmAnswers: [true], eduCore: core, storage: store });
  b.hold(b.lessonRow);
  assert.ok(b.lessonRow.classList.contains('omran-selected'));
  await b.trash();
  await tick();
  assert.deepEqual(b.log.errors.filter((e) => /lesson/.test(e)), [], 'كان: batch lesson delete ReferenceError: deleteLesson is not defined');
  assert.deepEqual(JSON.parse(store.getItem('eduHubLessons')).map((l) => l.id), ['L2'], 'الدرس المحدَّد حُذف ولم يُمسّ غيره');
  assert.equal(homes.length, 1, 'القائمة أُعيد رسمها');
  assert.deepEqual(b.log.alerts, []);
});

test('cli-ui-shell-3: فشل حذف الدرس رسالة للمستخدم بلغة التعليم — لا console.error صامت', async () => {
  const core = { deleteLesson: () => Promise.reject(new Error('net')), showHome: () => {}, T: (k) => (k === 'err' ? 'ERR-T' : k) };
  const b = bootSelect({ confirmAnswers: [true], eduCore: core });
  b.hold(b.lessonRow);
  await b.trash();
  await tick();
  assert.deepEqual(b.log.alerts, ['ERR-T']);
});

/* ══════════════ ٢: نقرة تحميل واحدة = مسار حفظ واحد ══════════════ */
const IMG_SAVE = read('js/app-05-img-save.js');
const SAVE_MEDIA = read('js/app-05-save-media.js');
const STUDIOS = read('js/app-12-studios.js');
/* مستمع زرّ تحميل أنماط الصور في app-12 (على العنصر نفسه، طور الفقاعة) — يُستخرج من الملفّ الحقيقيّ */
function studiosDownloadListener() {
  const node = findNode(STUDIOS, (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
    && n.callee.object.type === 'Identifier' && n.callee.object.name === 'downloadEl'
    && n.callee.property.name === 'addEventListener' && n.arguments[0] && n.arguments[0].value === 'click');
  assert.ok(node, 'مستمع downloadEl في app-12');
  return STUDIOS.slice(node.arguments[1].start, node.arguments[1].end);
}
function saveWorld(ua, { studios = false, href = 'data:image/png;base64,AAAA', download = 'omran-portrait-style.png' } = {}) {
  const docCapture = [];
  const calls = [];
  const sb = {
    console, lang: 'ar', navigator: { userAgent: ua, maxTouchPoints: 0, platform: '' },
    localStorage: { getItem: () => null },
    document: {
      addEventListener: (type, fn, cap) => { if (type === 'click' && cap === true) docCapture.push(fn); },
      getElementById: () => null,
    },
    omranMobileUA: () => /Mobile|Android|iPhone/.test(ua),
    omranLikelyApp: () => false,
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(IMG_SAVE, sb);
  vm.runInContext(SAVE_MEDIA, sb);
  sb.omranSaveImage = (h, n, mode) => { calls.push('saveImage:' + mode); return Promise.resolve(true); };
  sb.omranSaveMedia = () => { calls.push('saveMedia'); return Promise.resolve(true); };
  const a = { dataset: {}, href, getAttribute: (k) => (k === 'href' ? href : (k === 'download' ? download : null)) };
  let target = null;
  if (studios) {
    sb.downloadEl = a;
    target = vm.runInContext('(' + studiosDownloadListener() + ')', sb);
  }
  /* إرسال كالمتصفّح: مستمعو الالتقاط على document بالترتيب (stopPropagation لا يوقف مستمعًا آخر على العقدة نفسها،
     stopImmediatePropagation يوقفه)، ثمّ مستمع العنصر نفسه ما لم يُوقف الانتشار */
  const click = () => {
    const ev = { isTrusted: true, target: { closest: (s) => (s === 'a[download]' ? a : null) }, defaultPrevented: false, prop: false, imm: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.prop = true; }, stopImmediatePropagation() { this.prop = true; this.imm = true; } };
    for (const fn of docCapture) { if (ev.imm) break; fn(ev); }
    if (target && !ev.prop) target(ev);
    return ev;
  };
  return { click, calls, docCapture };
}

test('cli-ui-shell-2: داخل الغلاف (wv) نقرة واحدة على تحميل صورة data:image تنادي مسار حفظ واحدًا لا اثنين', () => {
  const w = saveWorld('Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0 Mobile Safari/537.36');
  assert.equal(w.docCapture.length, 2, 'المستمعان مسجّلان على document في طور الالتقاط');
  const ev = w.click();
  assert.deepEqual(w.calls, ['saveImage:save'], 'كان: [saveImage:save, saveMedia] — رفعتان من سلّة media-save-img وورقتان');
  assert.ok(ev.defaultPrevented);
});

test('cli-ui-shell-2: متصفّح الجوّال — زرّ تحميل أنماط الصور (مستمع app-12) لا ينادي الحفظ مرّة ثانية بعد الحافظ الموحّد', () => {
  const w = saveWorld('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1', { studios: true });
  w.click();
  assert.deepEqual(w.calls, ['saveMedia'], 'كان: [saveMedia, saveImage:save]');
});

test('cli-ui-shell-2: بلا تغيير — الكمبيوتر يمرّ بالحافظ الموحّد وحده، وملفّ غير صوريّ داخل الغلاف يبقى لمساره', () => {
  const d = saveWorld('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36');
  d.click();
  assert.deepEqual(d.calls, ['saveMedia']);
  /* زرّ أنماط الصور على الكمبيوتر: مستمع app-12 يتركه (ليس جوّالًا) */
  const ds = saveWorld('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', { studios: true });
  ds.click();
  assert.deepEqual(ds.calls, ['saveMedia']);
  /* داخل الغلاف: ملفّ Word من blob لا تخطفه مصيدة الصور (v-reply-export) — يبقى للحافظ الموحّد */
  const wv = saveWorld('Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0 Mobile Safari/537.36', { href: 'blob:x', download: 'omran-ai-reply.doc' });
  wv.click();
  assert.deepEqual(wv.calls, ['saveMedia']);
});

/* ══════════════ ٤: تحديد نصّ بالفأرة داخل أداة ══════════════ */
const SWIPE = read('js/app-05-swipe-back.js');
function swipeWorld() {
  const docL = {};
  const mk = (id, tag = 'div') => {
    const L = {};
    const el = {
      id, tagName: tag.toUpperCase(), children: [], parentElement: null, hidden: false, clicks: 0, style: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
      addEventListener: (t, fn) => { (L[t] = L[t] || []).push(fn); }, _L: L,
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
      compareDocumentPosition: () => 0, hasAttribute: () => false,
      append(c) { c.parentElement = el; el.children.push(c); return c; },
      click() { el.clicks++; if (el.onclick) el.onclick(); },
    };
    return el;
  };
  const modal = mk('religionModal');
  const closeBtn = mk('religionCloseBtn', 'button');
  closeBtn.onclick = () => { modal.hidden = true; };
  const box = modal.append(mk('religionBox'));
  const result = box.append(mk('religionResult'));
  /* عقدة نصّ النتيجة: سطر واحد بين x=100..500 وy=200..220 */
  const text = { nodeType: 3, nodeValue: 'The verse explains patience and gratitude.', parentElement: result, __rects: [{ left: 100, right: 500, top: 200, bottom: 220 }] };
  const els = { religionModal: modal, religionCloseBtn: closeBtn, religionBox: box, religionResult: result };
  const sel = { removed: 0, removeAllRanges() { this.removed++; } };
  const htmlCls = new Set();
  const document = {
    readyState: 'complete', head: { appendChild() {} }, body: mk('body'), activeElement: null,
    documentElement: { classList: { add: (c) => htmlCls.add(c), remove: (c) => htmlCls.delete(c), contains: (c) => htmlCls.has(c) } },
    createElement: () => ({ style: {}, textContent: '' }),
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    addEventListener: (t, fn) => { (docL[t] = docL[t] || []).push(fn); },
    /* كمتصفّح Chromium: النقطة تُلصق بأقرب موضع نصّ حتّى في الفراغ — الفحص الحقيقيّ صندوق السطر */
    caretRangeFromPoint: () => ({ startContainer: text, startOffset: 3 }),
    createRange: () => ({ n: null, selectNodeContents(n) { this.n = n; }, getClientRects() { return (this.n && this.n.__rects) || []; } }),
  };
  const ctx = {
    document, console, history: { state: null, pushState() {}, back() {}, replaceState() {} },
    location: { search: '', pathname: '/', hash: '', href: 'http://x/' },
    getComputedStyle: (el) => ({ display: (el === modal && modal.hidden) ? 'none' : 'block', visibility: 'visible', zIndex: '9000', overflowX: 'visible', userSelect: 'auto' }),
    getSelection: () => sel,
    MutationObserver: class { observe() {} },
    setTimeout, clearTimeout, setInterval: () => 0,
    innerWidth: 1280,
  };
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(SWIPE, ctx, { filename: 'app-05-swipe-back.js' });
  const drag = (target, x, y, dx) => {
    (modal._L.mousedown || []).forEach((f) => f({ button: 0, target, clientX: x, clientY: y }));
    for (const step of [20, dx / 2, dx]) (docL.mousemove || []).forEach((f) => f({ clientX: x + step, clientY: y, preventDefault() {} }));
    (docL.mouseup || []).forEach((f) => f({ clientX: x + dx, clientY: y }));
  };
  return { modal, closeBtn, box, result, sel, drag, htmlCls };
}

test('cli-ui-shell-4: سحب الفأرة لليمين فوق نصّ النتيجة تحديدٌ لا رجوع — لا يُمسح التحديد ولا تُغلق الأداة', async () => {
  const w = swipeWorld();
  w.drag(w.result, 120, 210, 240); /* سريع: >70px في أقلّ من 300ms */
  await tick(300);
  assert.equal(w.sel.removed, 0, 'كان removeAllRanges يمسح ما يحدّده المستخدم');
  assert.equal(w.closeBtn.clicks, 0, 'كانت الأداة تُغلق (display:none)');
  assert.ok(!w.htmlCls.has('omranMouseSwipe'));
});

test('cli-ui-shell-4: بلا تغيير — السحب من فراغ الأداة (خارج حروف النصّ) يرجع ويغلقها كما كان', async () => {
  const w = swipeWorld();
  w.drag(w.box, 120, 400, 240); /* تحت سطر النصّ: النقطة تُلصق بالنصّ لكنّها خارج صندوقه */
  await tick(300);
  assert.equal(w.closeBtn.clicks, 1, 'سحب الرجوع بالفأرة من الفراغ يبقى');
  assert.equal(w.modal.hidden, true);
});

/* ══════════════ ٥: «باقتك الحالية» على بطاقة الباقة الفعليّة ══════════════ */
const CHECKOUT = read('js/app-06-checkout.js');
const PARTIAL = read('js/partials-settings.js');
function planButtons() {
  const i = PARTIAL.indexOf('<div class="priceTab" data-tab="chat">');
  const j = PARTIAL.indexOf('<!-- v-autorenew-toggle', i);
  assert.ok(i > 0 && j > i, 'تبويب المحادثة في partials-settings.js');
  const chunk = PARTIAL.slice(i, j);
  return [...chunk.matchAll(/<button ([^>]*)>([^<]*)<\/button>/g)].map((m) => {
    const attrs = new Map([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((x) => [x[1], x[2] === undefined ? '' : x[2]]));
    const cls = new Set(String(attrs.get('class') || '').split(/\s+/).filter(Boolean));
    const b = {
      dataset: {}, style: {}, disabled: attrs.has('disabled'), textContent: m[2],
      get className() { return [...cls].join(' '); }, set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
      classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { (on === undefined ? !cls.has(c) : on) ? cls.add(c) : cls.delete(c); } },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
    };
    return b;
  });
}
const PRICE_T = { planCurrentBtn: 'باقتك الحالية', pricingSubscribeBtn: 'اشترك الآن', pricingPointsUnit: 'نقطة' };
async function pricingWorld(balance) {
  const btns = planButtons();
  assert.equal(btns.length, 4, 'أربع بطاقات: مجاني · Plus · Pro · Max');
  const row = { style: {} }, val = { textContent: '' };
  const sb = {
    console, __swallow() {},
    t: (k) => PRICE_T[k] || k,
    authGet: () => (balance ? 'tok' : ''),
    document: {
      getElementById: (id) => ({ pricingWalletRow: row, pricingWalletValue: val })[id] || null,
      querySelectorAll: (s) => (/pricingSection/.test(s) && /chat/.test(s) && /pbtn/.test(s) ? btns : []),
    },
    fetch: async () => ({ json: async () => balance }),
    /* applyPlanGate الحقيقيّ (app-05-ui) يكتب __omranPlan = plan || tier */
    applyPlanGate: (d) => { sb.__omranPlan = (d.tier === 'sub' ? String(d.plan || '').toLowerCase() : '') || d.tier; },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fnSrc(CHECKOUT, ['refreshPointsWallet', 'renderMediaPlanStatus', 'pricingMarkCurrentPlan']), sb);
  await sb.refreshPointsWallet();
  const [free, plus, pro, max] = btns;
  const view = (b) => ({ key: b.getAttribute('data-i18n'), text: b.textContent, disabled: !!b.disabled, hidden: b.style.visibility === 'hidden', ghost: b.classList.contains('ghost') });
  return { sb, btns, free, plus, pro, max, view };
}

test('cli-ui-shell-5: مشترك Pro يفتح الباقات — «باقتك الحالية» معطّلة على Pro، لا على «مجاني»؛ والبقيّة «اشترك الآن»', async () => {
  const w = await pricingWorld({ ok: true, authed: true, points: 920, tier: 'sub', plan: 'pro' });
  assert.deepEqual(w.view(w.pro), { key: 'planCurrentBtn', text: 'باقتك الحالية', disabled: true, hidden: false, ghost: true }, 'كانت Pro تقول «اشترك الآن» وتعمل');
  assert.equal(w.view(w.free).hidden, true, 'كانت «مجاني» تقول «باقتك الحالية» للمشترك');
  for (const b of [w.plus, w.max]) assert.deepEqual(w.view(b), { key: 'pricingSubscribeBtn', text: 'اشترك الآن', disabled: false, hidden: false, ghost: false });
  assert.equal(w.pro.getAttribute('onclick'), "openCheckout('pro')", 'لا يُمسّ مسار الدفع نفسه');
});

test('cli-ui-shell-5: الباقة تتغيّر (Max ثمّ مجّانيّ ثمّ ضيف) — الزرّ يتبعها ويعود كما كان، وPro يرجع ذهبيًّا', async () => {
  const w = await pricingWorld({ ok: true, authed: true, points: 1, tier: 'sub', plan: 'max' });
  assert.equal(w.view(w.max).key, 'planCurrentBtn');
  assert.equal(w.view(w.pro).key, 'pricingSubscribeBtn');
  assert.ok(w.pro.classList.contains('primary'), 'بطاقة Pro تبقى بزرّها الذهبيّ');
  w.sb.fetch = async () => ({ json: async () => ({ ok: true, authed: true, points: 70, tier: 'free', plan: null }) });
  await w.sb.refreshPointsWallet();
  assert.deepEqual(w.view(w.free), { key: 'planCurrentBtn', text: 'باقتك الحالية', disabled: true, hidden: false, ghost: true });
  for (const b of [w.plus, w.pro, w.max]) assert.equal(w.view(b).key, 'pricingSubscribeBtn');
  assert.equal(w.view(w.max).disabled, false);
  /* خروج: بلا رمز = ضيف — لا تبقى بطاقة مشترك سابق «حاليّة» */
  w.sb.fetch = async () => ({ json: async () => ({ ok: true, authed: true, tier: 'sub', plan: 'pro' }) });
  await w.sb.refreshPointsWallet();
  w.sb.authGet = () => '';
  await w.sb.refreshPointsWallet();
  assert.equal(w.view(w.free).key, 'planCurrentBtn');
  assert.equal(w.view(w.pro).key, 'pricingSubscribeBtn');
});

/* ══════════════ ٦ (cli-money-2): رسالة نجاح الدفع ══════════════ */
test('cli-money-2: checkoutSuccessMsg بلا «وضع تجريبي/test mode» ولا «اشتراك» — نصّ دفع محايد في كلّ اللغات الـ١٤', () => {
  const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  const data = read('js/app-03-i18n-data.js');
  const val = {};
  /* العربيّة أوّل مفتاح في الملفّ، والإنجليزيّة الثاني */
  const both = [...data.matchAll(/checkoutSuccessMsg:\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  assert.equal(both.length, 2, 'المفتاح في ar وen داخل app-03');
  val.ar = both[0]; val.en = both[1];
  for (const lg of LANGS.slice(2)) {
    const m = /"?checkoutSuccessMsg"?\s*:\s*"((?:\\.|[^"])*)"/.exec(read('i18n/' + lg + '.js'));
    assert.ok(m, lg + ': المفتاح موجود');
    val[lg] = m[1];
  }
  const TEST_MODE = /تجريبي|test mode|mode test|modo de prueba|test modu|mode uji|тестов|测试|परीक्षण|ٹیسٹ|পরীক্ষা|ടെസ്റ്റ്/i;
  const SUBSCRIBED = /الاشتراك|Subscribed|Abonnement|सदस्यता|سبسکرائب|সদস্যতা|berlangganan|naka-subscribe|Abonelik|订阅|Подписка|Suscripción|സബ്‌സ്‌ക്രൈബ്/i;
  for (const lg of LANGS) {
    assert.doesNotMatch(val[lg], TEST_MODE, lg + ': «وضع تجريبي» في دفع حقيقيّ (pk_live)');
    assert.doesNotMatch(val[lg], SUBSCRIBED, lg + ': «تمّ الاشتراك» يظهر لمشتري رزمة النقاط أيضًا');
    assert.ok(val[lg].startsWith('✅'), lg);
  }
  assert.notEqual(val.ur, val.ar, 'الأرديّة ليست العربيّة');
  /* النصّ نفسه يبقى مفتاح كلّ مسارات النجاح الستّة (البطاقة · PayPal · العودة من Stripe · جسر الآيفون · PayPal المعلّق) */
  assert.equal((CHECKOUT.match(/t\('checkoutSuccessMsg'\)/g) || []).length, 6);
});
