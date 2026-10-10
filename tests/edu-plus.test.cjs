'use strict';
/* v-edu-plus + v-edu-render + v-edu-algo — فحص قسم التعليم (٢٣ سبتمبر) ثمّ «صلحها كلها مرة وحدة»:
   العارض (كود/جداول/معادلات)، المعلّم، حلّ المسائل، المراجعة المتباعدة، التقدّم وخطّة الامتحان،
   الاستماع، ومسار «خوارزميات الألعاب» بثماني ألعاب. هنا تُشغَّل الدوالّ الحقيقيّة لا وجود نصّها فقط. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = (p) => path.join(__dirname, '..', p);
/* كائنات vm من نطاق آخر — تُطبَّع قبل المقارنة */
const N = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, m) => assert.deepStrictEqual(N(a), N(b), m);
const ndeq = (a, b, m) => assert.notDeepStrictEqual(N(a), N(b), m);
const read = (p) => fs.readFileSync(R(p), 'utf8');
const edu = read('js/edu.js'), plus = read('js/edu-plus.js'), algo = read('js/edu-algo.js'), html = read('index.html');

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
function loadWindowScript(src) {
  const window = {};
  const ctx = { window, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({}), head: { appendChild() {} }, createElement: () => ({}) }, Math, Date, JSON, Object, Array, String, Number, isNaN, Infinity, __swallow() {} };
  vm.runInNewContext(src, ctx);
  return window;
}

/* ---------- العارض ---------- */
const mdCtx = {};
vm.runInNewContext(extract(edu, 'function esc(s)') + '\n' + edu.slice(edu.indexOf('var MATH_SYM='), edu.indexOf('function mathHtml(')) + extract(edu, 'function mathHtml(src)') + '\n' + extract(edu, 'function md(src)') + ';this.md=md;', mdCtx);
const md = mdCtx.md;

test('العارض: صندوق كود بلغته، والكود مهرَّب', () => {
  const out = md('قبل\n```js\nif (a < b) { alert("<script>") }\n```\nبعد');
  assert.ok(out.includes('<pre class="eduCode" dir="ltr">') && out.includes('<span class="eduCodeLang">js</span>'));
  assert.ok(out.includes('if (a &lt; b)') && !out.includes('<script>'), 'لا حقن من داخل الكود');
  assert.ok(out.includes('<p>قبل</p>') && out.includes('<p>بعد</p>'));
});

test('العارض: جدول ماركداون بعناوينه وصفوفه', () => {
  const out = md('| الطريقة | ٦٠ |\n|---|---|\n| `x += 4` | **٢٤٠** |\n| <b>x</b> | ٨٠ |');
  assert.ok(out.includes('<table class="eduTbl">') && out.includes('<th>الطريقة</th>'));
  assert.ok(out.includes('<code dir="ltr">x += 4</code>') && out.includes('<b>٢٤٠</b>'));
  assert.ok(out.includes('&lt;b&gt;x&lt;/b&gt;'), 'HTML الخام داخل الجدول مهرَّب');
});

test('العارض: معادلات — كسر مكدّس، أسّ، جذر، رموز، وكتلة $$', () => {
  const out = md('القانون $h = \\frac{v^2}{2g}$ و $\\sqrt{x} \\times \\pi$\n$$x_{new} = x + v \\times dt$$');
  assert.ok(out.includes('<span class="eduFrac"><span>v<sup>2</sup></span><span>2g</span></span>'), out);
  assert.ok(out.includes('√<span class="eduSqrt">x</span> × π'));
  assert.ok(out.includes('<div class="eduMathBlock" dir="ltr">x<sub>new</sub> = x + v × dt</div>'));
  assert.ok(!/\\frac|\\times/.test(out), 'لا أوامر خام');
});

test('العارض: علامة $ في الأسعار لا تتحوّل معادلة، والحقن داخل المعادلة مهرَّب', () => {
  const price = md('الباقة 10$ والأخرى 20$ شهريًّا');
  assert.ok(!price.includes('eduMath'), price);
  const bad = md('$<img src=x onerror=alert(1)>$');
  assert.ok(!bad.includes('<img') && bad.includes('&lt;img'));
});

test('العارض: القديم باقٍ (عناوين، قوائم، خطّ عريض، اقتباس)', () => {
  const out = md('## عنوان\n- أ\n- ب\n1. ج\n> ملاحظة **مهمّة**');
  assert.ok(out.includes('<h4>عنوان</h4>') && out.includes('<ul><li>أ</li><li>ب</li></ul>') && out.includes('<ol><li>ج</li></ol>'));
  assert.ok(out.includes('<blockquote>ملاحظة <b>مهمّة</b></blockquote>'));
});

/* ---------- خوارزميّات المسار ---------- */
const A = loadWindowScript(algo).__eduAlgo;

test('المسار: ثمانية دروس كاملة — شرح بالعربيّة والإنجليزيّة، لعبة، تحدٍّ، ٣ أسئلة صحيحة الشكل', () => {
  assert.strictEqual(A.lessons.length, 8);
  const ids = A.lessons.map((l) => l.id);
  deq(ids, ['loop', 'physics', 'collide', 'path', 'fsm', 'minimax', 'random', 'cups']);
  A.lessons.forEach((l) => {
    ['t', 'sub', 'body', 'task'].forEach((k) => assert.ok(l[k].ar && l[k].en, l.id + '.' + k));
    assert.ok(/هل تقدر تغلبها/.test(l.body.ar) && /Can you beat it/.test(l.body.en), l.id + ': سؤال «هل تقدر تغلبها؟»');
    assert.ok(new RegExp("\\n  " + l.id + ": function").test(algo), l.id + ': لعبة حيّة');
    assert.strictEqual(l.quiz.length, 3);
    l.quiz.forEach((q) => { assert.strictEqual(q.o.ar.length, 4); assert.strictEqual(q.o.en.length, 4); assert.ok(q.c >= 0 && q.c < 4 && q.x.ar && q.x.en); });
  });
});

test('المسار: A* وBFS يجدان أقصر طريق نفسه، وA* يفحص أقلّ على شبكة مفتوحة', () => {
  const L = A.lib;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let t = 0; t < 60; t++) {
    const grid = []; for (let r = 0; r < 9; r++) { grid.push([]); for (let c = 0; c < 16; c++) grid[r].push(rnd() < 0.28 ? 1 : 0); }
    grid[4][1] = 0; grid[4][14] = 0;
    const b = L.gridSearch(grid, [4, 1], [4, 14], 'bfs'), a = L.gridSearch(grid, [4, 1], [4, 14], 'astar');
    assert.strictEqual(!!a.path, !!b.path, 'كلاهما يجد أو كلاهما لا');
    if (b.path) {
      assert.strictEqual(a.path.length, b.path.length, 'نفس الطول الأقصر');
      for (let i = 1; i < a.path.length; i++) assert.strictEqual(Math.abs(a.path[i][0] - a.path[i - 1][0]) + Math.abs(a.path[i][1] - a.path[i - 1][1]), 1);
      a.path.forEach((p) => assert.strictEqual(grid[p[0]][p[1]], 0, 'لا يمرّ بجدار'));
    }
  }
  const open = Array.from({ length: 9 }, () => Array(16).fill(0));
  const b = L.gridSearch(open, [4, 1], [4, 14], 'bfs'), a = L.gridSearch(open, [4, 1], [4, 14], 'astar');
  assert.strictEqual(a.path.length - 1, 13);
  assert.ok(a.visited.length < b.visited.length / 3, 'A* ' + a.visited.length + ' مقابل BFS ' + b.visited.length);
});

test('المسار: Minimax لا يخسر أبدًا — كلّ ألعاب إكس-أو الممكنة ضدّه', () => {
  const L = A.lib;
  let games = 0, losses = 0;
  function playX(b) {
    const w = L.winner(b);
    if (w) { games++; if (w === 'X') losses++; return; }
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      const c = b.slice(); c[i] = 'X';
      if (L.winner(c)) { games++; if (L.winner(c) === 'X') losses++; continue; }
      c[L.bestMove(c).move] = 'O';
      playX(c);
    }
  }
  playX(['', '', '', '', '', '', '', '', '']);
  const first = ['', '', '', '', '', '', '', '', '']; first[L.bestMove(first).move] = 'O'; playX(first);
  assert.ok(games > 100, 'فُحصت ' + games + ' لعبة');
  assert.strictEqual(losses, 0, 'الكمبيوتر لم يخسر أيّ لعبة');
  const threat = ['X', 'X', '', 'O', '', '', '', '', ''];
  assert.strictEqual(L.bestMove(threat).move, 2, 'يسدّ خطّ الفوز');
  const win = ['O', 'O', '', 'X', 'X', '', 'X', '', ''];
  assert.strictEqual(L.bestMove(win).move, 2, 'يفوز حين يستطيع');
});

test('المسار: العشوائيّة المزيّفة — نفس البذرة نفس السلسلة والخريطة، وكسر البذرة يتوقّع القادم', () => {
  const L = A.lib;
  deq(L.lcgSeq(42, 10, 100), L.lcgSeq(42, 10, 100));
  ndeq(L.lcgSeq(42, 10, 100), L.lcgSeq(43, 10, 100));
  deq(L.caveMap(42, 48, 27), L.caveMap(42, 48, 27));
  ndeq(L.caveMap(42, 48, 27), L.caveMap(43, 48, 27));
  for (const secret of [5, 137, 999]) {
    const seen = L.lcgSeq(secret, 3, 100), found = L.crackSeed(seen, 1000, 100);
    assert.ok(found >= 0);
    deq(L.lcgSeq(found, 5, 100).slice(3), L.lcgSeq(secret, 5, 100).slice(3), 'التوقّع يطابق الحقيقة');
  }
});

test('المسار: تتبّع الأكواب = محاكاة الأكواب فعليًّا، والتصادم وآلة الحالات والفيزياء', () => {
  const L = A.lib;
  for (let seed = 1; seed < 200; seed++) {
    const swaps = L.cupsSwaps(seed, 12), start = seed % 3;
    swaps.forEach((s) => assert.ok(s[0] !== s[1] && s[0] >= 0 && s[1] <= 2));
    const cups = [0, 1, 2].map((p) => p === start);
    swaps.forEach(([a, b]) => { const t = cups[a]; cups[a] = cups[b]; cups[b] = t; });
    assert.strictEqual(L.cupsTrack(start, swaps), cups.indexOf(true));
  }
  assert.strictEqual(L.cupsTrack(1, [[0, 2], [1, 2], [0, 1], [2, 0]]), 0, 'مثال الدرس: ٢ ← ٣ ← ١');
  deq(L.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 20, w: 10, h: 10 }), { x: true, y: false, hit: false });
  assert.strictEqual(L.aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }).hit, true);
  assert.strictEqual(L.fsmNext('patrol', 180, false), 'patrol');
  assert.strictEqual(L.fsmNext('patrol', 140, false), 'chase');
  assert.strictEqual(L.fsmNext('chase', 180, false), 'chase', 'التباطؤ: لا يخرج قبل ٢٢٠');
  assert.strictEqual(L.fsmNext('chase', 230, false), 'patrol');
  assert.strictEqual(L.fsmNext('chase', 50, true), 'flee');
  let p = { y: 0, vy: -600 }, top = 0;
  for (let i = 0; i < 2000; i++) { p = L.physicsStep(p, 1200, 0.0005, 1e9); top = Math.min(top, p.y); }
  assert.ok(Math.abs(-top - 600 * 600 / (2 * 1200)) < 2, 'أقصى ارتفاع = v²/2g');
});

/* ---------- المراجعة المتباعدة وخطّة الامتحان ---------- */
const P = loadWindowScript(plus);

test('المراجعة المتباعدة: يوم ← ٣ ← ٧ ← ١٤ ← ٣٠، و«أراجعه» تعيدها للأوّل الآن', () => {
  const L = P.__eduPlus.lib, DAY = 86400000, now = 1e12;
  let e = null; const days = [];
  for (let i = 0; i < 6; i++) { e = L.srsNext(e, true, now); days.push((e.due - now) / DAY); }
  deq(days, [1, 3, 7, 14, 30, 30]);
  deq(L.srsNext({ box: 4 }, false, now), { box: 1, due: now });
  const due = L.srsDue({ a: { due: now - 5 }, b: { due: now + 5 }, c: { due: now - 50 } }, now);
  deq(due.map((x) => x.key), ['c', 'a'], 'المستحقّة فقط، الأقدم أوّلًا');
});

test('خطّة الامتحان: الأضعف أوّلًا، موزّعة على الأيّام، واليوم الأخير مراجعة شاملة', () => {
  const L = P.__eduPlus.lib, DAY = 86400000, now = new Date('2026-09-23T10:00:00').getTime();
  const lessons = [{ id: 'a', bestScore: 90 }, { id: 'b', bestScore: 40 }, { id: 'c' }, { id: 'd', bestScore: 70 }, { id: 'e', bestScore: 55 }];
  const plan = L.buildExamPlan(lessons, new Date('2026-09-26T00:00:00').getTime(), now);
  assert.strictEqual(plan.length, 3);
  deq(plan.map((d) => d.kind), ['study', 'study', 'review']);
  deq(plan[0].ids, ['c', 'b', 'e'], 'غير المختبَر ثمّ الأضعف');
  deq(plan[1].ids, ['d', 'a']);
  assert.strictEqual(plan[2].ids.length, 5);
  const one = L.buildExamPlan(lessons, now + DAY, now);
  deq(one.map((d) => d.kind), ['review'], 'يوم واحد = مراجعة شاملة');
});

test('الاستماع: نصّ الدرس بلا رموز ماركداون ولا كود', () => {
  const t = P.__eduPlus.lib.plainText('## عنوان\n- **نقطة** `x`\n```js\ncode()\n```\n| أ | ب |');
  assert.ok(!/[#*`|]/.test(t) && !t.includes('code()') && t.includes('عنوان') && t.includes('نقطة'));
});

/* ---------- اللغات والأسماء ---------- */
test('كلّ نصّ واجهة جديد مترجم للغات الإحدى عشرة (والعربيّ/الأرديّ والإنجليزيّ في المصدر)', () => {
  const XL2 = P.__EDU_XL2, langs = ['fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
  const keys = new Set(['💬 اسأل المعلّم']);
  for (const src of [plus, algo]) {
    const re = /\bL\(\s*'((?:[^'\\]|\\.)*)'\s*,/g; let m;
    while ((m = re.exec(src))) keys.add(m[1]);
  }
  assert.ok(keys.size > 100);
  for (const k of keys) { assert.ok(XL2[k], 'بلا ترجمة: ' + k); langs.forEach((l) => assert.ok(XL2[k][l], k + ' ← ' + l)); }
  assert.ok(edu.includes('window.__EDU_XL2[ar]'), 'eduL يقرأ الجدول');
});

test('لا اسم مزوّد أو نموذج في أيّ نصّ يراه المستخدم', () => {
  const RE = /\b(Claude|Anthropic|OpenAI|GPT|Gemini|Groq|Sonnet|Haiku|Opus|Mistral|DeepSeek)\b|كلود|جيمناي/i;
  const Lx = A.lessons.map((l) => JSON.stringify(l)).join(' ');
  assert.ok(!RE.test(Lx), 'محتوى المسار');
  assert.ok(!RE.test(JSON.stringify(P.__EDU_XL2)), 'نصوص الواجهة');
  const srv = read('api/edu.js');
  const tutor = srv.slice(srv.indexOf("if (action === 'tutor')"), srv.indexOf("if (action === 'solve')"));
  const solve = srv.slice(srv.indexOf("if (action === 'solve')"), srv.indexOf('// ---------------- persistence actions'));
  assert.ok(/لا تذكر اسم أيّ نموذج/.test(tutor) && /لا تذكر اسم أيّ نموذج/.test(solve), 'التعليمات تمنع ذكر الأسماء');
});

/* ---------- الربط ---------- */
test('الربط: edu-plus بعد edu، والخطافات، وبلا سقف ١٥، واسم القسم القديم، وحفظ تجربة الضيف', () => {
  const i1 = html.indexOf('/js/edu.js?v='), i2 = html.indexOf('/js/edu-plus.js?v=');
  assert.ok(i1 > 0 && i2 > i1, 'الترتيب');
  assert.ok(!html.includes('/js/edu.js?v=664'), 'وسم edu.js رُفع');
  assert.ok(edu.includes('window.__eduCore={') && edu.includes('<div id="eduPlusHome"></div>') && edu.includes("data-tab=\"tutor\""));
  assert.ok(edu.includes('window.__eduPlus.srsMark(lesson,c,ok)') && edu.includes('window.__eduPlus.listenBtn(pane,lesson.summary)'));
  assert.ok(!edu.includes('>=15){ finish()'), 'لا سقف ١٥ سؤالًا');
  assert.ok(!edu.includes('دورات وشروحات') && edu.includes("oldEdu:'🎬 صانع الفيديو والشرائح التعليميّة'"));
  assert.strictEqual((edu.match(/oldEdu:'🎬/g) || []).length, 14, 'الاسم الجديد بالـ14 لغة');
  assert.ok(edu.includes('x.__labHtml=j.html; }); saveLocalLessons(arr);'), 'تجربة الضيف تُحفظ');
  assert.ok(plus.includes("s.src = '/js/edu-algo.js?v="), 'المسار يُحمَّل عند الطلب');
});

/* ---------- الخادم ---------- */
test('الخادم: المعلّم يرى الدرس والمحادثة ويردّ، والحلّ يُنقّى، والسقف يعمل', async () => {
  const rp = (p) => require.resolve(R(p));
  const counts = {};
  require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true,
    exports: { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvIncr: async (k) => (counts[k] = (counts[k] || 0) + 1), kvExpire: async () => {} } };
  const sent = [];
  let replyText = '{"reply":"اشرحها هكذا: $\\\\frac{1}{2}$"}';
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: replyText }] }) }; };
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete require.cache[rp('api/edu.js')];
  const h = require(R('api/edu.js'));
  const call = (body) => new Promise((resolve) => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); }, end() { resolve({ code: this.code }); } };
    h({ method: 'POST', body, headers: { 'x-forwarded-for': '9.9.9.9' }, query: {} }, res);
  });
  const r1 = await call({ action: 'tutor', title: 'الجاذبيّة', summary: 'ملخّص الجاذبيّة', history: [{ role: 'user', text: 'سؤال سابق' }, { role: 'assistant', text: 'ردّ سابق' }], question: 'ما فهمت', lang: 'ar' });
  assert.strictEqual(r1.code, 200); assert.ok(r1.j.reply.includes('اشرحها'));
  const u = JSON.stringify(sent[0].messages);
  assert.ok(u.includes('ملخّص الجاذبيّة') && u.includes('سؤال سابق') && u.includes('ردّ سابق') && u.includes('ما فهمت'));
  assert.strictEqual((await call({ action: 'tutor', question: '  ' })).code, 400);
  for (let i = 0; i < 9; i++) await call({ action: 'tutor', title: 't', summary: 's', question: 'q' });
  assert.strictEqual((await call({ action: 'tutor', title: 't', summary: 's', question: 'q' })).code, 402, 'الضيف: ١٠ في اليوم');

  replyText = JSON.stringify({ problem: '2x+3=7', topic: 'معادلة', steps: [{ hint: 'اطرح ٣', work: '2x=4' }, { hint: '', work: 'x=2' }, { junk: 1 }], answer: 'x=2', check: '2·2+3=7', tip: 'اعزل المجهول' });
  const r2 = await call({ action: 'solve', text: '2x+3=7' });
  assert.strictEqual(r2.code, 200);
  assert.strictEqual(r2.j.solution.steps.length, 2, 'الخطوة الفارغة أُسقطت');
  assert.strictEqual(r2.j.solution.answer, 'x=2');
  const r3 = await call({ action: 'solve', image: { base64: 'AAAA', mime: 'text/html' } });
  const imgBlock = sent[sent.length - 1].messages[0].content[0];
  assert.strictEqual(imgBlock.type, 'image'); assert.strictEqual(imgBlock.source.media_type, 'image/jpeg', 'نوع غير صورة يُستبدل');
  assert.strictEqual(r3.code, 200);
  assert.strictEqual((await call({ action: 'solve' })).code, 400);
  replyText = '{"error":"الصورة غير واضحة"}';
  const r4 = await call({ action: 'solve', text: 'x' });
  assert.strictEqual(r4.code, 422); assert.ok(r4.j.error.includes('غير واضحة'));
});
