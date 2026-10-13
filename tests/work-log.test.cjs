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
  assert.deepEqual(notes.map((n) => (n.head ? 'head:' + n.head : n.s ? 'think' : 'step')), ['head:يقرأ سؤالك…', 'think', 'head:يقرأ من GitHub…', 'step', 'think', 'step'], 'الرأس بلا رمزه، ولا رأس من سطر أثر');
  assert.ok(notes.every((n) => typeof n.t0 === 'number'), 'بداية الدور لعدّاد الوقت');
  assert.equal(notes[3].step.title, 'api/a.js  1–40', 'قراءة الملفّ: عنوانها مساره وأسطره');
  assert.equal(notes[5].step.title, 'بحثتُ عن «x» — حصلتُ 3 نتيجة');
  const log = plain(r.log);
  assert.deepEqual(log.map((p) => p.t), ['meta', 'think', 'tool', 'think', 'tool'], 'بترتيب الوصول');
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
  assert.ok(box.open && bubble.className.includes('cwOn'), 'مفتوح، وشريط الحالة القديم يختفي');
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
  sb.omranShowThink(bubble, { step: { t: 'tool', title: 'api/_lib/chat.js  1–40', cmd: 'OMRAN77/omran-ai-builder api/_lib/chat.js', out: '📄 chat.js', err: 0 } });
  assert.equal(head.childNodes[1].textContent, 'يقرأ من GitHub…', 'الرأس يتبع ما يجري');
  assert.deepEqual(kids(list), ['think', 'tool+'], 'التفكير مطويّ والأداة الأحدث مفتوحة');
  const tool = list.childNodes[1];
  assert.deepEqual(tool.q('cwLbl').map((x) => x.textContent), ['الطلب', 'النتيجة']);
  assert.deepEqual(tool.q('cwPre').map((x) => x.textContent + ':' + x.dir), ['OMRAN77/omran-ai-builder api/_lib/chat.js:ltr', '📄 chat.js:ltr']);
  now.t = 1000 + 255000;
  timers.forEach((f) => f());
  assert.equal(head.childNodes[2].textContent, '4د 15ث', 'العدّاد كلّ ثانية بالدقائق والثواني');
  sb.omranShowThink(bubble, { step: { t: 'tool', title: 'سجلّ الأخطاء', cmd: '', out: '', err: 1 } });
  assert.deepEqual(kids(list), ['think', 'tool', 'tool+'], 'أداة جديدة تطوي الأداة قبلها والتفكير مطوي');
  assert.ok(list.childNodes[2].className.includes('cwFail') && list.childNodes[2].q('cwNone').length === 1, 'الفشل أحمر، وبلا ناتج سطر');
});

test('٣. المحفوظ: صندوق مطويّ «عمل لمدّة …» وعناصره مطويّة بترتيبها؛ وسجلّ الوكيل القديم بلا meta يُرسم كما كان', () => {
  const { sb } = client({ t: 0 });
  const d = sb.window.omranWorkLog.render([
    { t: 'meta', ms: 75000 }, { t: 'think', ms: 9000, s: 'أفكّر.' }, { t: 'tool', title: 'a.js', cmd: 'c', out: 'o' }, { t: 'think', ms: 800, s: '' },
  ]);
  assert.equal(d.open, false);
  assert.equal(d.childNodes[0].childNodes[1].textContent, 'عمل لمدّة 1د 15ث');
  assert.deepEqual(kids(d.childNodes[1]), ['think', 'tool', 'plain'], 'تفكير بلا ملخّص = سطر «فكّر لمدّة N ث» لا ينفتح');
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
