'use strict';
/* v-agent-log (المالك ٢٩ سبتمبر، لقطتا Claude Code: «اريدك تسويله نفس الفكرة بالضبط عند قراءة الكود… وطريقة تعمّق الوكيل
   في قراءة الملفّات»): عمل الوكيل سجلّ بترتيبه كما في Claude Code — جملته قبل الخطوة كلامًا، وكلّ أداة سطر «$ عنوان»
   ينفتح على الأمر وناتجه، و«فكّر N ث» ينفتح على ملخّص تفكيره، وقراءات الملفّات المتتالية تحت «استكشف N ملفّات».
   كان: حبّة حالة واحدة تُستبدل، ونصّ واحد ثابت، وعلى Opus 5.5 ملاحظاته بين الأدوات تصل كتل تفكير فارغة (العرض
   «omitted» افتراضًا) فيبدو صامتًا. هنا: المعالج الحقيقيّ بمزوّد مزيّف، وكود العميل الحقيقيّ في vm بصفحة مصغّرة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'agent-log-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* ── الخادم ── */
const store = new Map();
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('api/_lib/kv.js', { kvPutJSON: async (k, v) => { store.set(k, v); }, kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null), kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {}, kvIncr: async () => 1 });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'omran' }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const GH = require(rp('api/_lib/github-read.js'));
stub('api/_lib/github-read.js', Object.assign({}, GH, { readGithub: async (input) => (input.path === 'bad.js' ? 'غير موجود: bad.js' : '📄 ' + (input.path || input.url) + '\n1  const a = 1;') }));
const agent = require(rp('api/_lib/agent.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } };
const think = (i, s) => [
  { type: 'content_block_start', index: i, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: i, delta: { type: 'thinking_delta', thinking: s } },
  { type: 'content_block_delta', index: i, delta: { type: 'signature_delta', signature: 'SIG' + i } },
  { type: 'content_block_stop', index: i },
];
const tool = (i, id, input) => [
  { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id, name: 'read_github', input: {} } },
  { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: i },
];
const LONG = 'أفكّر في المسار '.repeat(40);
const step1 = () => sse([start, ...think(0, 'سأبدأ بقراءة بنية المستودع.'), ...tool(1, 'tu1', { step_title: 'قراءة api/x.js', url: 'OMRAN77/r', path: 'api/x.js' }), ...tool(2, 'tu2', { url: 'OMRAN77/r', path: 'bad.js' }), { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]);
const step2 = () => sse([start, ...think(0, LONG), { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'الجذر في x.js:1' } }, { type: 'content_block_stop', index: 1 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);

async function run(script, extra) {
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body));
    return script[Math.min(i++, script.length - 1)]();
  };
  let written = '';
  const req = { method: 'POST', headers: { host: 'x' }, body: Object.assign({ messages: [{ role: 'user', content: 'وين الخلل؟' }], token: token('omran') }, extra) };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await agent(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, acts: events.filter((e) => e.act).map((e) => e.act) };
}

test('١. كلّ أداة تحمل step_title أوّل خصائصها (والمالك بأدواته الإضافيّة)، والأمر المعروض بلا العنوان ومختصر', () => {
  const { toolsFor } = agent.__test;
  for (const u of ['someone', 'omran']) {
    const tools = toolsFor(u);
    assert.ok(tools.length >= 6);
    for (const t of tools) assert.equal(Object.keys(t.input_schema.properties)[0], 'step_title', t.name);
  }
  assert.ok(toolsFor('omran').some((t) => t.name === 'write_github'));
  const src = read('api/_lib/agent.js');
  const fn = src.slice(src.indexOf('function stepCmd('), src.indexOf('\n}\n', src.indexOf('function stepCmd(')) + 3);
  const stepCmd = vm.runInNewContext('(' + fn + ')');
  const c = stepCmd('run_js', { step_title: 'تشغيل', code: 'x'.repeat(900) });
  assert.ok(!c.includes('step_title') && c.startsWith('run_js {"code":"xxx') && c.includes('…'));
  assert.equal(stepCmd('write_github', { repo: 'a/b', files: [1, 2, 3] }), 'write_github {"repo":"a/b","files":"3 عنصرًا"}');
});

test('٢. التفكير يُطلب ملخّصًا على نماذج 5.x (العرض «omitted» افتراضًا = كتل فارغة وصمت)', async () => {
  const r = await run([step1, step2]);
  assert.deepEqual(r.calls[0].thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(r.calls[1].thinking, { type: 'adaptive', display: 'summarized' }, 'كلّ خطوة بالإعداد نفسه');
  const s = await run([step1, step2], { agentModel: 'sonnet-5' });
  assert.equal(s.calls[0].model, 'claude-sonnet-5');
  assert.deepEqual(s.calls[0].thinking, { type: 'adaptive', display: 'summarized' });
  // الكتل تعود بلا تعديل — بملخّصها الآن
  const asst = r.calls[1].messages[r.calls[1].messages.length - 2];
  assert.deepEqual(asst.content[0], { type: 'thinking', thinking: 'سأبدأ بقراءة بنية المستودع.', signature: 'SIG0' });
});

test('٣. أحداث السجلّ بترتيب Claude Code: ملاحظة قبل الأداة، سطر الأداة ثمّ اكتماله، وتفكير طويل بمدّته', async () => {
  const r = await run([step1, step2]);
  const kinds = r.acts.map((a) => a.k + (a.id ? ':' + a.id : ''));
  assert.deepEqual(kinds, ['note', 'tool:tu1', 'done:tu1', 'tool:tu2', 'done:tu2', 'think']);
  assert.equal(r.acts[0].s, 'سأبدأ بقراءة بنية المستودع.', 'تفكير قصير تتلوه أداة = جملة الوكيل قبل خطوته');
  assert.equal(r.acts[1].t, 'قراءة api/x.js', 'العنوان من step_title');
  assert.equal(r.acts[1].g, 1, 'قراءة ملفّ تُجمع تحت «استكشف»');
  assert.ok(r.acts[1].cmd.startsWith('read_github {"url":"OMRAN77/r","path":"api/x.js"}'));
  assert.ok(r.acts[2].ok && r.acts[2].out.startsWith('📄 api/x.js'));
  assert.match(r.acts[3].t, /^قرأتُ من GitHub OMRAN77\/r bad\.js/, 'بلا عنوان = الأثر المشتقّ من المدخل');
  assert.equal(r.acts[4].ok, false, 'الفشل يظهر فشلًا');
  const th = r.acts[5];
  assert.ok(typeof th.ms === 'number' && th.ms >= 0 && th.s.length > 400 && th.s.length <= 2000, 'تفكير طويل (لا يتلوه أداة) = «فكّر N ث» بملخّصه');
  assert.equal(r.events.filter((e) => e.delta).map((e) => e.delta).join(''), 'الجذر في x.js:1');
});

test('٤. منهج التعمّق في التعليمات: الخريطة ← القرارات ← البحث ← القراءة كاملة ← المستدعون، وجملة قبل كلّ مجموعة أدوات', () => {
  const src = read('api/_lib/agent.js');
  assert.match(src, /44-ب\. [^\n]*\(٠\) اقرأ المستودع كمهندس يفتحه لأوّل مرّة[^\n]*خريطته أوّلًا[^\n]*knowledge\/DECISIONS\.md[^\n]*بحث query[^\n]*كاملة مع اختباراتها[^\n]*تتبّع من يستدعيها[^\n]*جملة واحدة بما ستفعله[^\n]*step_title/);
});

/* ── العميل: السجلّ الحيّ والحفظ والرسم في vm بصفحة مصغّرة ── */
function mkEl(tag) {
  const el = {
    tagName: tag.toUpperCase(), childNodes: [], parentNode: null, className: '', dir: '', open: false, _text: '', style: {},
    get firstChild() { return this.childNodes[0] || null; },
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
    replaceChild(n, o) { const i = this.childNodes.indexOf(o); if (n.parentNode) n.parentNode.removeChild(n); this.childNodes[i] = n; n.parentNode = this; o.parentNode = null; return o; },
    set innerHTML(v) { this.childNodes = []; this._text = ''; },
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); },
    set textContent(v) { this.childNodes = []; this._text = String(v); },
    classList: null,
    q(cls) { const out = []; const walk = (n) => { n.childNodes.forEach((c) => { if ((' ' + c.className + ' ').includes(' ' + cls + ' ')) out.push(c); walk(c); }); }; walk(this); return out; },
  };
  el.classList = {
    toggle(c, on) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); if (on) s.add(c); else s.delete(c); el.className = [...s].join(' '); },
    add(c) { this.toggle(c, true); }, contains(c) { return el.className.split(/\s+/).includes(c); },
  };
  return el;
}
const APP09 = read('js/app-09-attach.js');
const CLIENT = APP09.slice(APP09.indexOf('const AG_LOG_BUDGET'), APP09.indexOf('async function runOmranAgent('));
const APPLY = APP09.slice(APP09.indexOf('async function __agentApplyResult('), APP09.indexOf('\n}\n', APP09.indexOf('async function __agentApplyResult(')) + 3);
const AR = { agThought: 'فكّر لمدّة {n} ث', agExplored: 'استكشف {n} ملفّات', agNoOutput: 'بلا ناتج', buildNoCode: 'بلا كود' };
function client() {
  const sb = {
    window: {}, lang: 'ar', Date, setTimeout, clearTimeout, String, Number, Math, Array, JSON, console,
    document: { createElement: mkEl, documentElement: { classList: { contains: () => false } } },
    t: (k) => AR[k] || k,
    buildSpokenWordSpans: (d, s) => { d.textContent = s; return []; },
    renderStreamingAssistant: (el, s) => { el.textContent = s; },
    stripCodeFromChat: (s) => String(s).replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/g, '').trim(),
    extractReply: () => null, selfHealCode: async (c) => c,
  };
  vm.createContext(sb);
  vm.runInContext(CLIENT + '\n' + APPLY + '\nthis.__agLogLive = __agLogLive; this.__agLogRender = __agLogRender; this.__agentApplyResult = __agentApplyResult;', sb);
  return sb;
}

test('٥. السجلّ الحيّ: كلام ← ملاحظة ← قراءتان تُجمعان «استكشف ٢» ← تفكير ← بحث ← الجواب — إلحاقٌ لا إعادة رسم', () => {
  const sb = client();
  const host = mkEl('div');
  const L = sb.__agLogLive(host);
  const root = host.childNodes[0];
  assert.equal(host.childNodes[1], L.pill, 'الحبّة تحت السجلّ');
  L.text('خطّتي: ');
  L.text('أقرأ ثمّ أبحث.');
  L.act({ k: 'note', s: 'سأبدأ بقراءة بنية المستودع.' });
  L.act({ k: 'tool', id: 'a', name: 'read_github', t: 'خريطة المستودع', cmd: 'read_github {}', g: 1 });
  const firstRow = root.q('agStep')[0];
  assert.ok(firstRow.className.includes('agRun'), 'جارية حتّى يكتمل');
  L.act({ k: 'done', id: 'a', ok: true, out: 'الشجرة' });
  assert.ok(!firstRow.className.includes('agRun') && firstRow.childNodes.length === 3, 'العنوان + الأمر + الناتج');
  L.act({ k: 'tool', id: 'b', name: 'read_github', t: 'قراءة x.js', cmd: 'read_github {"path":"x.js"}', g: 1 });
  const groups = root.q('agGroup');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].firstChild.textContent, 'استكشف 2 ملفّات');
  assert.equal(firstRow.parentNode, groups[0], 'السطر الأوّل نُقل إلى المجموعة ولم يُعد بناؤه');
  L.act({ k: 'done', id: 'b', ok: false, out: 'غير موجود' });
  assert.ok(root.q('agErr').length === 1, 'الفشل أحمر');
  L.act({ k: 'think', ms: 3200, s: 'ملخّص التفكير' });
  L.act({ k: 'tool', id: 'c', name: 'read_github', t: 'البحث عن foo', cmd: 'read_github {"query":"foo"}', g: 0 });
  L.act({ k: 'done', id: 'c', ok: true, out: '3 ملفّات' });
  L.text('**الجذر** في x.js:1');
  const labels = root.childNodes.map((c) => c.className.split(' ')[0]);
  assert.deepEqual(labels, ['agText', 'agText', 'agGroup', 'agThink', 'agStep', 'agText']);
  assert.equal(root.childNodes[0].textContent, '🤖 خطّتي: أقرأ ثمّ أبحث.', 'أوّل كلام يحمل 🤖');
  assert.equal(root.q('agThink')[0].firstChild.textContent, 'فكّر لمدّة 3 ث');
  const sp = L.split();
  assert.equal(sp.tail, '**الجذر** في x.js:1', 'الردّ = ما بعد آخر خطوة');
  assert.deepEqual(Array.from(sp.log, (p) => p.t + (p.g ? '*' : '')), ['text', 'text', 'tool*', 'tool*', 'think', 'tool']);
  assert.equal(sp.log[3].err, 1);
  assert.ok(sp.log.every((p) => !('el' in p)), 'لا عناصر DOM في الحفظ');
});

test('٦. الحفظ: نصّ الرسالة هو الردّ بعد آخر خطوة والسجلّ في _agParts — وبلا خطوات كما كان تمامًا', async () => {
  const sb = client();
  const cur = { messages: [] };
  const log = [{ t: 'text', s: 'سأبدأ.' }, { t: 'tool', name: 'read_github', title: 'قراءة', cmd: 'x', out: 'y', err: 0, g: 1 }];
  await sb.__agentApplyResult(cur, 'سأبدأ.الجواب النهائيّ', { log, tail: 'الجواب النهائيّ' });
  assert.equal(cur.messages[0].content, '🤖 الجواب النهائيّ');
  assert.deepEqual(cur.messages[0]._agParts, log);
  await sb.__agentApplyResult(cur, 'ردّ بلا أدوات', null);
  assert.equal(cur.messages[1].content, '🤖 ردّ بلا أدوات');
  assert.ok(!('_agParts' in cur.messages[1]));
  await sb.__agentApplyResult(cur, 'كلام', { log: [{ t: 'text', s: 'كلام' }], tail: '' });
  assert.equal(cur.messages[2].content, '🤖 كلام', 'سجلّ بلا خطوات = المسار القديم');
});

test('٧. رسم الرسالة المحفوظة: القراءات المتتالية مجموعة، والمفردة سطر، والتفكير بلا ملخّص سطر لا ينفتح', () => {
  const sb = client();
  const el = sb.__agLogRender([
    { t: 'text', s: 'سأبدأ.' },
    { t: 'tool', title: 'أ', cmd: 'c1', out: 'o1', g: 1 }, { t: 'tool', title: 'ب', cmd: 'c2', out: '', g: 1 },
    { t: 'think', ms: 800, s: '' },
    { t: 'tool', title: 'ج', cmd: 'c3', out: 'o3', g: 1 },
    { t: 'text', s: '' },
  ]);
  assert.deepEqual(el.childNodes.map((c) => c.tagName + '.' + c.className), ['DIV.agText', 'DETAILS.agGroup', 'DIV.agThink', 'DETAILS.agStep']);
  assert.equal(el.childNodes[1].firstChild.textContent, 'استكشف 2 ملفّات');
  assert.equal(el.childNodes[2].textContent, 'فكّر لمدّة 1 ث');
  assert.ok(el.q('agNone').length === 1 && el.q('agNone')[0].textContent === 'بلا ناتج');
});

test('٨. الوصلات: الحلقة تمرّر الأحداث وتحفظ السجلّ، renderMessages يرسمه قبل النصّ، والنصوص بالـ١٤ لغة، والأنماط ساكنة', () => {
  const run = APP09.slice(APP09.indexOf('async function runOmranAgent('), APP09.indexOf('async function __agentApplyResult('));
  assert.ok(run.includes('const agLog = __agLogLive(thinkingDiv);') && run.includes('makeChatStatus(agLog.pill)'));
  assert.ok(run.includes('if(ev.act){') && run.includes('agLog.act(ev.act);') && run.includes('agLog.text(ev.delta);'));
  assert.ok(run.includes("if(ev.status && !/^↳/.test(String(ev.status))){"), 'سطر الأثر لا يتكرّر في الحبّة');
  assert.ok(run.includes('await __agentApplyResult(cur, full, streamBroke ? null : agLog.split());'));
  const r4 = read('js/app-04-i18n-state.js');
  const hook = r4.indexOf('window.omranAgentLog.render(m._agParts)');
  assert.ok(hook > 0 && hook < r4.indexOf('div.appendChild(textDiv);', hook), 'السجلّ قبل نصّ الردّ');
  assert.ok(r4.includes("sc.src = 'i18n/' + lg + '.js?v=708';"));
  const ar = read('js/app-03-i18n-data.js');
  assert.equal((ar.match(/agThought: '[^']+', agExplored: '[^']+\{n\}[^']*', agNoOutput: '[^']+'/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'ml']) {
    assert.match(read('i18n/' + lg + '.js'), /agThought: '[^']*\{n\}[^']*', agExplored: '[^']*\{n\}[^']*', agNoOutput: '[^']+'/, lg);
  }
  const css = read('css/tokens.css');
  const block = css.slice(css.indexOf('/* v-agent-log'), css.indexOf('.agPill:empty'));
  assert.ok(block.includes('.agStep{border:1px solid') && block.includes('.agRun .agTt::after'));
  assert.ok(!/animation|transition/.test(block), 'بلا حركة — لا كلفة على رسم المعالج');
  assert.ok(read('js/app.bundle.js').includes('function __agLogLive(host){'), 'الحزمة أُعيد بناؤها');
});
