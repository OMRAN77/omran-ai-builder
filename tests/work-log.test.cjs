'use strict';
/* v-work-log (المالك ١٣ أكتوبر: «الحينه هذا منظم بي ذمتك»، ثمّ لقطة واجهة Claude وهو يعمل: «سولي نفس هذي بالضبط»): عمل المزوّد في
   المحادثة صندوق واحد فوق الردّ — رأس «✦ ما يجري · الوقت ⌄»، وفي إطاره عناصر بترتيب وصولها: التفكير أسطرًا قصيرة بعنوان آخر جملة،
   والأداة «الطلب/النتيجة». التفكير مسكّر حتّى يفتحه من يريد، وأحدث أداة وحدها مفتوحة؛ والمحفوظ مطويّ «عمل لمدّة …». كود العميل الحقيقيّ في vm بصفحة مصغّرة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v)); // مصفوفات من سياق vm آخر

/* ── app-18: البثّ ← ما يصل الصندوق حيًّا، والسجلّ المحفوظ ── */
async function stream(events) {
  const src = read('js/app-18-chat-tools.js');
  const body = src.slice(0, src.indexOf('// v478'));
  const lines = events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('');
  const enc = new TextEncoder();
  let once = false;
  const notes = [];
  const window = { __omranThinkNote: (x) => notes.push(plain(x)) };
  const ctx = {
    window, TextDecoder, TextEncoder, Promise, setTimeout, clearTimeout, JSON, String, Array, Date, Error,
    tStatus: (ev) => ev.status,
    fetch: async () => ({ ok: true, body: { getReader: () => ({ read: async () => { if (once) return { done: true }; once = true; return { done: false, value: enc.encode(lines) }; }, cancel() {} }) } }),
  };
  vm.runInNewContext(body, ctx);
  const r = await window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude');
  return { r, notes };
}
const code = (p) => ({ p, r: '', a: 1, b: 40, n: 40, l: ['x'] });

test('١. البثّ: الرأس بما يجري، وكلّ تفكير وخطوة يصلان الصندوق لحظتهما ومعهما بداية الدور؛ والمحفوظ بالترتيب وأوّله المدّة', async () => {
  const { r, notes } = await stream([
    { status: '💭 يقرأ سؤالك…', k: 'stReading' },
    { status: '↳ 💭 أبدأ', think: { s: 'أبدأ بسجلّ الأخطاء. ثمّ الكود.' } },
    { status: '🐙 يقرأ من GitHub…', k: 'stFetchPage' },
    { status: '↳ قرأتُ GitHub a.js', k: 'trFetch', cmd: 'o/r a.js', out: '📄', code: code('api/a.js') },
    { status: '↳ 💭 الآن', think: { s: 'لا يوجد emiratiHeritage' } },
    { status: '↳ بحثتُ عن «x» — حصلتُ 3 نتيجة', k: 'trSearchN', cmd: 'x', out: '1. a' },
    { delta: 'الجواب' },
  ]);
  assert.deepEqual(notes.map((n) => (n.head ? 'head:' + n.head : n.s ? 'think' : 'step')), ['head:يقرأ سؤالك…', 'think', 'head:يقرأ من GitHub…', 'step', 'think', 'step'], 'v-interleave: التفكير بين الأدوات يصل الصندوق كما يفكّر');
  assert.ok(notes.every((n) => typeof n.t0 === 'number'), 'بداية الدور لعدّاد الوقت');
  assert.equal(notes[3].step.title, 'api/a.js  1–40', 'قراءة الملفّ: عنوانها مساره وأسطره');
  assert.equal(notes[5].step.title, 'بحثتُ عن «x» — حصلتُ 3 نتيجة');
  const log = plain(r.log);
  assert.deepEqual(log.map((p) => p.t), ['meta', 'think', 'tool', 'think', 'tool'], 'v-interleave: التفكير بين الأدوات بترتيبه');
  assert.ok(log[0].ms >= 0);
  assert.ok(log.filter((p) => p.t === 'think').every((p) => !('open' in p)), 'لا تفكير محفوظ مفتوحًا');
  assert.equal(log[2].code.p, 'api/a.js', 'مقطع لوحة الكود المقروء باقٍ مع خطوته');
  const none = await stream([{ status: '💭', k: 'stReading' }, { delta: 'مرحبا' }]);
  assert.equal(none.r.log, undefined, 'ردّ بلا تفكير ولا أداة = بلا صندوق');
});

/* ── الصندوق نفسه (app-39) ومدخله (omranShowThink في app-09) ── */
function mkEl(tag) {
  const el = {
    tagName: tag.toUpperCase(), childNodes: [], parentNode: null, className: '', open: false, dir: '', _text: '', style: {},
    get children() { return this.childNodes; },
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return !!n.__root; },
    get firstChild() { return this.childNodes[0] || null; },
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); const i = this.childNodes.indexOf(ref); c.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c); return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
    replaceChild(n, o) { const i = this.childNodes.indexOf(o); if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes[i] = n; o.parentNode = null; return o; },
    get lastElementChild() { return this.lastChild; },
    replaceWith(n) { this.parentNode.replaceChild(n, this); },
    querySelectorAll(sel) { return sel === 'details.cwItem[open]' ? this.q('cwItem').filter((x) => x.tagName === 'DETAILS' && x.open) : []; },
    querySelector(sel) { return this.q(sel.replace(/^\./, ''))[0] || null; },
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); },
    set textContent(v) { this.childNodes = []; this._text = String(v); },
    q(cls) { const out = []; const walk = (n) => { n.childNodes.forEach((c) => { if ((' ' + c.className + ' ').includes(' ' + cls + ' ')) out.push(c); walk(c); }); }; walk(this); return out; },
  };
  el.classList = {
    toggle(c, on) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); if (on) s.add(c); else s.delete(c); el.className = [...s].join(' '); },
    add(c) { this.toggle(c, true); }, contains(c) { return el.className.split(/\s+/).includes(c); },
  };
  return el;
}
const AR = { agThought: 'فكّر لمدّة {n} ث', agNoOutput: 'بلا ناتج', cwWorked: 'عمل لمدّة {t}', cwRequest: 'الطلب', cwResponse: 'النتيجة', cwTimeM: '{m}د {s}ث', cwTimeS: '{s}ث', cwWorking: 'يعمل…' };
const APP09 = read('js/app-09-attach.js');
const SHOW = APP09.slice(APP09.indexOf('function omranShowThink('), APP09.indexOf('function __agLogGroupEl('));
function client(now) {
  const timers = [];
  const sb = {
    window: {}, Date: { now: () => now.t }, String, Number, Math, Array, JSON, console,
    document: { createElement: mkEl },
    setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval: () => {},
    t: (k) => AR[k] || k, __swallow: (e) => { throw e; },
  };
  vm.createContext(sb);
  vm.runInContext(read('js/app-39-work-log.js') + '\n' + SHOW + '\nthis.omranShowThink = omranShowThink;', sb);
  sb.window.omranWorkLog = sb.window.omranWorkLog || sb.omranWorkLog;
  return { sb, timers };
}
const kids = (list) => list.childNodes.map((c) => c.className.split(' ')[1] === 'cwPlain' ? 'plain' : (c.q('cwThink').length ? 'think' : 'tool') + (c.open ? '+' : ''));

test('٢. الحيّ: لا صندوق قبل أوّل تفكير أو خطوة؛ ثمّ رأس بما يجري ووقت يعدّ، والتفكير مسكّر وأحدث أداة وحدها مفتوحة', () => {
  const now = { t: 1000 };
  const { sb, timers } = client(now);
  const msgs = mkEl('div'); msgs.__root = true;
  const bubble = msgs.appendChild(mkEl('div'));
  sb.omranShowThink(bubble, { head: 'يقرأ سؤالك…', t0: 1000 });
  assert.equal(msgs.childNodes.length, 1, 'رأس وحده لا ينشئ صندوقًا');
  now.t = 18000;
  sb.omranShowThink(bubble, { s: 'أقرأ سجلّ الأخطاء أوّلًا. ثمّ أتتبّع الكود حتّى عنصر التفكير.', ms: 17000, t0: 1000 });
  const box = msgs.childNodes[0];
  assert.equal(box.className, 'cwBox cwLive', 'الصندوق فوق الفقاعة');
  assert.equal(box.open, false, 'v-live-fold: الصندوق الحيّ يبدأ مطويًّا كـClaude — الرأس يكفي');
  assert.ok(bubble.className.includes('cwOn'), 'شريط الحالة القديم يختفي');
  const [head, list] = box.childNodes;
  assert.equal(head.childNodes[1].textContent, 'يقرأ سؤالك…');
  assert.equal(head.childNodes[2].textContent, '17ث');
  const think = list.childNodes[0];
  assert.equal(think.childNodes[0].textContent, 'ثمّ أتتبّع الكود حتّى عنصر التفكير.', 'عنوان التفكير آخر جملة');
  assert.deepEqual(think.q('cwLine').map((l) => l.textContent), ['أقرأ سجلّ الأخطاء أوّلًا.', 'ثمّ أتتبّع الكود حتّى عنصر التفكير.'], 'جملة في كلّ سطر');
  assert.equal(think.tagName, 'DETAILS');
  assert.equal(think.open, false, 'التفكير مسكّر حتى يفتحه من يريد');
  think.open = true;
  assert.equal(think.open, true, 'من يريد يفتحه');
  think.open = false;
  sb.omranShowThink(bubble, { head: 'يقرأ من GitHub…' });
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trFetch', title: 'api/_lib/chat.js  1–40', cmd: 'OMRAN77/omran-ai-builder api/_lib/chat.js', out: '📄 chat.js', err: 0 } });
  assert.equal(head.childNodes[1].textContent, 'يقرأ من GitHub…', 'الرأس يتبع ما يجري');
  assert.deepEqual(kids(list), ['think', 'tool'], 'v-read-fold: قراءة الصفحة مطويّة كـClaude Code ولو كانت الأحدث');
  sb.omranShowThink(bubble, { s: 'الآن أعدّل المقطع من جديد داخل التعديل.', ms: 2000, t0: 1000 });
  assert.deepEqual(kids(list), ['think', 'tool', 'think'], 'v-interleave: تفكير بعد الأداة سطر مطويّ، والأداة تُطوى');
  const tool = list.childNodes[1];
  assert.deepEqual(tool.q('cwLbl').map((x) => x.textContent), ['الطلب', 'النتيجة']);
  assert.deepEqual(tool.q('cwPre').map((x) => x.textContent + ':' + x.dir), ['OMRAN77/omran-ai-builder api/_lib/chat.js:ltr', '📄 chat.js:ltr']);
  now.t = 1000 + 255000;
  timers.forEach((f) => f());
  assert.equal(head.childNodes[2].textContent, '4د 15ث', 'العدّاد كلّ ثانية بالدقائق والثواني');
  sb.omranShowThink(bubble, { step: { t: 'tool', title: 'سجلّ الأخطاء', cmd: '', out: '', err: 1 } });
  assert.deepEqual(kids(list), ['think', 'tool', 'think', 'tool+'], 'أداة جديدة تطوي الأداة قبلها والتفكير مطوي');
  assert.equal(box.open, false, 'v-live-fold: ما يصل لا يفتح الصندوق');
  box.open = true;
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trSearchN', title: 'بحث', cmd: 'q', out: 'y', err: 0 } });
  assert.equal(box.open, true, 'v-live-fold: من فتحه يبقى مفتوحًا مع ما يصل');
  assert.ok(list.childNodes[3].className.includes('cwFail') && list.childNodes[3].q('cwNone').length === 1, 'الفشل أحمر، وبلا ناتج سطر');
});

test('٣. المحفوظ: صندوق مطويّ «عمل لمدّة …» وعناصره مطويّة بترتيبها؛ وسجلّ الوكيل القديم بلا meta يُرسم كما كان', () => {
  const { sb } = client({ t: 0 });
  const d = sb.window.omranWorkLog.render([
    { t: 'meta', ms: 75000 }, { t: 'think', ms: 9000, s: 'أفكّر.' }, { t: 'tool', title: 'a.js', cmd: 'c', out: 'o' }, { t: 'think', ms: 800, s: '' },
  ]);
  assert.equal(d.open, false);
  assert.equal(d.childNodes[0].childNodes[1].textContent, 'عمل لمدّة 1د 15ث');
  assert.deepEqual(kids(d.childNodes[1]).slice(0, 2), ['think', 'tool'], 'بترتيبها'); assert.equal(d.childNodes[1].childNodes.length, 3, 'v-interleave: التفكير بعد الأداة يُرسم');
  const r = APP09.slice(APP09.indexOf('function __agLogRender('), APP09.indexOf('function __agLogRender(') + 300);
  assert.ok(r.includes("if(parts[0] && parts[0].t === 'meta' && window.omranWorkLog) return window.omranWorkLog.render(parts);"), 'الوكيل بلا meta = مساره القديم');
});

test('٤. الواجهة: الأنماط، والجزء خارج النشر المفرد، والنصوص الستّة بالأربع عشرة لغة، والحزمة', () => {
  const css = read('css/tokens.css');
  for (const sel of ['.cwBox{', '.cwHead{', '.cwList{', '.cwItem{', '.cwThink{', '.cwPre{', '.msg.cwOn > .chat-status-fold{display:none;}']) assert.ok(css.includes(sel), sel);
  assert.ok(read('.vercelignore').split('\n').includes('js/app-39-work-log.js'));
  const ar = read('js/app-03-i18n-data.js');
  assert.ok(ar.includes("cwWorked: 'عمل لمدّة {t}', cwRequest: 'الطلب', cwResponse: 'النتيجة', cwTimeM: '{m}د {s}ث', cwTimeS: '{s}ث', cwWorking: 'يعمل…',"));
  assert.ok(ar.includes("cwWorked: 'Worked for {t}', cwRequest: 'Request', cwResponse: 'Response',"));
  for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((n) => n !== 'ad-studio.js')) {
    assert.match(read('i18n/' + f), /cwWorked: '[^']*\{t\}[^']*', cwRequest: '[^']+', cwResponse: '[^']+', cwTimeM: '[^']*\{m\}[^']*\{s\}[^']*', cwTimeS: '[^']*\{s\}[^']*', cwWorking: '[^']+',/, f);
  }
  const tag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 743, 'وسم ملفّات اللغات مرفوع');
  assert.ok(read('js/app.bundle.js').includes('window.omranWorkLog = {'), 'الحزمة مبنيّة من الأجزاء');
});

test('٥. v-interleave (المالك ١٤ أكتوبر «نفس فكرة كلاود كودي»): أدوات متتالية من النوع نفسه سطر «آخر عنوان · +N» ينفتح عليها، حيًّا ومحفوظًا، والوكيل بالعناصر نفسها', () => {
  const { sb } = client({ t: 0 });
  const bubble = mkEl('div'); const host = mkEl('div'); host.__root = 1; host.appendChild(bubble);
  sb.omranShowThink(bubble, { s: 'أقرأ الملفّات.', ms: 1000, t0: 0 });
  for (const f of ['a.js', 'b.js', 'c.js']) sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trFetch', title: 'قرأ ' + f, cmd: f, out: 'x', err: 0 } });
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trSearchN', title: 'بحث', cmd: 'q', out: 'y', err: 0 } });
  const list = host.childNodes[0].childNodes[1];
  assert.equal(list.childNodes.length, 3, 'تفكير + مجموعة القراءة + البحث');
  const g = list.childNodes[1];
  assert.ok(g.classList.contains('cwGroup') && g.open === false);
  assert.equal(g.q('cwTitle')[0].textContent, 'قرأ c.js  · +2', 'آخر عنوان وعدد ما قبله');
  assert.equal(g.childNodes[1].childNodes.length, 3, 'ينفتح على خطواته الثلاث');
  assert.equal(list.childNodes[2].open, true, 'الأداة الأحدث وحدها مفتوحة');
  const d = sb.window.omranWorkLog.render([{ t: 'meta', ms: 3000 }, { t: 'tool', name: 'r', title: 'x' }, { t: 'tool', name: 'r', title: 'y' }, { t: 'think', s: 'ثمّ.' }, { t: 'tool', name: 'r', title: 'z' }]);
  assert.equal(d.childNodes[1].childNodes.length, 3, 'محفوظًا: مجموعة ثمّ تفكير ثمّ أداة');
  assert.equal(d.childNodes[1].childNodes[0].q('cwTitle')[0].textContent, 'y  · +1');
  const a9 = APP09;
  assert.ok(a9.includes("if(window.omranWorkLog) return window.omranWorkLog.thinkEl(p, false);"), 'تفكير الوكيل سطر مطويّ');
  assert.ok(a9.includes("p.el = W.groupAdd(g, p); g.__last = p;") && a9.includes("p.el = W.toolEl(p, !W.isRead(p));"), 'أدوات الوكيل بالمجموعة والقراءة مطويّة');
  assert.ok(a9.includes("return window.omranWorkLog.render([{ t: 'meta'"), 'سجلّ الوكيل المحفوظ بالصندوق نفسه');
  assert.ok(read('js/app-18-chat-tools.js').includes('__thinks.length < 24) { __moveSeg();'), 'المحادثة: التفكير بين الأدوات لكلّ المزوّدين');
  assert.ok(require(path.join(root, 'api/_lib/github-edit.js')).WORK_NOTE.includes('اعمل كما يعمل Claude Code (v-interleave)'), 'تعليمة المزوّدين');
  for (const s of ['groupAdd: groupAdd', '__thinks.length < 24']) assert.ok(read('js/app.bundle.js').includes(s), 'الحزمة: ' + s);
});

test('٦. v-read-fold (المالك ١٤ أكتوبر «يقرى الصفحة اريدها مطوية نفس نظام كلاود»): القراءة مطويّة لكلّ المزوّدين ولو كانت الأحدث، والبحث يبقى مفتوحًا', () => {
  const { sb } = client({ t: 0 });
  const bubble = mkEl('div'); const host = mkEl('div'); host.__root = 1; host.appendChild(bubble);
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trFetch', title: 'example.com', cmd: 'https://example.com', out: '<html>…', err: 0 } });
  const list = host.childNodes[0].childNodes[1];
  assert.equal(list.childNodes[0].open, false, 'fetch_page مطويّ كـRead في Claude Code');
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'read_github', title: 'a.js  1–40', cmd: 'a.js', out: '📄', code: { p: 'a.js' }, err: 0 } });
  assert.equal(list.childNodes[1].open, false, 'read_github مطويّ');
  sb.omranShowThink(bubble, { step: { t: 'tool', name: 'trSearchN', title: 'بحث', cmd: 'q', out: 'y', err: 0 } });
  assert.equal(list.childNodes[2].open, true, 'البحث الأحدث مفتوح كما كان');
  const W = sb.window.omranWorkLog;
  assert.equal(W.isRead({ t: 'tool', name: 'fetch_page' }), true);
  assert.equal(W.isRead({ t: 'tool', name: 'trSearchN' }), false);
  assert.equal(W.isRead({ t: 'tool', code: { p: 'x.js' } }), true);
  assert.ok(read('js/app-04-i18n-state.js').includes('window.omranCC.foldCode(textDiv)'), 'كود الردّ الطويل يُطوى لكلّ المزوّدين');
  assert.ok(read('js/app-38-read-panel.js').includes('v-read-fold') && !read('js/app-38-read-panel.js').includes('if(first && !isMobile()) reveal()'), 'اللوحة لا تُفتح وحدها');
});

test('٦. v-interleave-fix: الجملة قبل الأداة سطر في السجلّ لا في الردّ، والتجميع باسم الأداة، والفشل أحمر، والسجلّ يبقى مع الخطأ، والوكيل يجمع بعد اكتمال الأداة', async () => {
  const { r, notes } = await stream([
    { delta: 'أقرأ app-17 أوّلًا.' },
    { status: '↳ قرأتُ GitHub a.js', k: 'trFetch', tool: 'read_github', cmd: 'a.js', out: '📄' },
    { delta: 'الآن أرفع الصور.' },
    { status: '↳ استخدمتُ write_github', k: 'trTool', tool: 'write_github', cmd: 'O/r a.webp', out: '✗ لم يُرفع شيء', err: 1 },
    { delta: 'تمّ — هذا رابط الطلب.' },
  ]);
  assert.equal(r.reply, 'تمّ — هذا رابط الطلب.', 'الردّ ما بعد آخر خطوة');
  const log = plain(r.log);
  assert.deepEqual(log.map((p) => p.t + (p.t === 'text' ? ':' + p.s : '')), ['meta', 'text:أقرأ app-17 أوّلًا.', 'tool', 'text:الآن أرفع الصور.', 'tool'], 'بترتيب Claude Code');
  assert.equal(log[2].name, 'read_github'); assert.equal(log[4].name, 'write_github', 'اسم الأداة لا مفتاح الترجمة');
  assert.equal(log[4].err, 1, 'الفشل أحمر بحكم الخادم');
  assert.ok(notes.some((n) => n.step && n.step.t === 'text'), 'الجملة تصل الصندوق حيًّا');
  // ردّ ينتهي بأداة بلا كلام بعدها: آخر جملة هي الردّ
  const end = await stream([{ delta: 'أرفع الآن.' }, { status: '↳ x', k: 'trTool', tool: 'write_github' }]);
  assert.equal(end.r.reply, 'أرفع الآن.');
  // كلام طويل قبل أداة يبقى في الردّ مفصولًا لا يُقصّ
  const long = 'جواب طويل '.repeat(40).trim();
  const keep = await stream([{ delta: long }, { status: '↳ x', k: 'trFetch', tool: 'read_github' }, { delta: 'وبعده.' }]);
  assert.equal(keep.r.reply, long + '\n\nوبعده.');
  // خطأ بلا نصّ: السجلّ معه
  let err = null; try { await stream([{ status: '↳ x', k: 'trFetch', tool: 'read_github' }]); } catch (e) { err = e; }
  assert.ok(err && Array.isArray(err.log) && err.log[0].t === 'meta', 'السجلّ يبقى مع الخطأ');
  assert.ok(APP09.includes("cur.messages.push(omranStopMsg(partial, __run.timedOut, (err && Array.isArray(err.log)) ? err.log : undefined));") && APP09.includes("_agParts: log };") && APP09.includes("_agParts: (err && Array.isArray(err.log)) ? err.log : undefined});"), 'الإيقاف (omranStopMsg، v-chat-sys-msg) والخطأ يحفظان السجلّ');

  // الوكيل: أداة ← اكتمال ← أداة من النوع نفسه = مجموعة واحدة (كان «done» يمحو علامة الصفّ)
  const { sb } = client({ t: 0 });
  const LIVE = APP09.slice(APP09.indexOf('const AG_LOG_BUDGET'), APP09.indexOf('async function runOmranAgent('));
  sb.document.documentElement = { classList: { contains: () => false } };
  vm.runInContext(LIVE + '\nthis.agLive = __agLogLive;', sb);
  const host = mkEl('div'); host.__root = 1;
  const L = sb.agLive(host);
  for (const [id, f] of [['1', 'a.js'], ['2', 'b.js'], ['3', 'c.js']]) {
    L.act({ k: 'tool', id, name: 'read_github', t: 'قرأ ' + f, cmd: f });
    L.act({ k: 'done', id, ok: true, out: 'x' });
  }
  const root = host.childNodes[0];
  assert.equal(root.childNodes.length, 1, 'صفّ واحد');
  assert.ok(root.childNodes[0].classList.contains('cwGroup'), 'مجموعة');
  assert.equal(root.childNodes[0].q('cwTitle')[0].textContent, 'قرأ c.js  · +2');
  const saved = plain(L.split().log);
  assert.equal(saved[0].t, 'meta', 'مدّة التشغيل الحقيقيّة أوّل السجلّ المحفوظ');

  // النصّ الطويل المحفوظ ينفتح، والأداة الجارية «…» لا «بلا ناتج»
  const W = sb.window.omranWorkLog;
  const d = W.render([{ t: 'meta', ms: 1000 }, { t: 'text', s: 'وجدت السبب: ' + 'تفصيل '.repeat(40) }]);
  assert.equal(d.childNodes[1].childNodes[0].tagName, 'DETAILS', 'الطويل ينفتح على كامله');
  assert.equal(W.toolEl({ t: 'tool', title: 'x', run: true }, true).q('cwNone')[0].textContent, '…');
});
