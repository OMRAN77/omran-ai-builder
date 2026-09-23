'use strict';
/* v-eval — مقياس جودة المحادثة: المقيِّم الآليّ (eval/score.cjs) على ردود نموذجيّة جيّدة وسيّئة، والمشغّل كاملًا
   (scripts/eval-run.mjs) على خادم محلّيّ يحاكي بثّ /api/ai?action=chat — بلا شبكة ولا إنفاق. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const S = require(path.join(root, 'eval/score.cjs'));
const Q = JSON.parse(fs.readFileSync(path.join(root, 'eval/questions.json'), 'utf8')).questions;
const q = (id) => Q.find((x) => x.id === id);

test('١. بنك الأسئلة: ٥٠ سؤالًا بمعرّفات فريدة وعشر فئات، وكلّ سؤال له فحص واحد على الأقلّ', () => {
  assert.equal(Q.length, 50);
  assert.equal(new Set(Q.map((x) => x.id)).size, 50);
  assert.equal(new Set(Q.map((x) => x.cat)).size, 10);
  Q.forEach((x) => { assert.ok(x.q || (x.turns && x.turns.length >= 2), x.id); assert.ok(Object.keys(x.checks || {}).length, x.id); });
});

test('٢. الإرشاد: خطوات مرقّمة تحت كلّ واحدة رابطها = ١٠٠، ونصّ «ادخل الموقع» بلا روابط = راسب', () => {
  const good = 'تجديد الإقامة يتمّ من بوّابة الهويّة:\n1. افتح صفحة الخدمات واضغط «تجديد الإقامة»\n[تجديد الإقامة](https://icp.gov.ae/ar/services/renew)\n2. سجّل دخولك بالهويّة الرقميّة «UAE PASS»\n[تسجيل الدخول](https://icp.gov.ae/ar/login)\n3. ادفع الرسوم من صفحة الدفع\n[الدفع](https://icp.gov.ae/ar/pay)';
  const r1 = S.scoreQuestion(q('guide-residency'), { text: good });
  assert.equal(r1.score, 100, JSON.stringify(r1.checks.filter((c) => !c.pass)));
  const bad = 'ادخل موقع الهيئة الاتحاديّة للهويّة وجدّد من هناك.';
  const r2 = S.scoreQuestion(q('guide-residency'), { text: bad });
  assert.ok(r2.score < 70, String(r2.score)); // يمرّ الفحوص العامّة (عربيّ، بلا اسم مزوّد) ويسقط الثلاثة الأساسيّة
  assert.ok(r2.checks.some((c) => !c.pass && c.name.startsWith('رابط تحت الخطوة')));
});

test('٣. الحساب والمعرفة: الجواب الصحيح يمرّ والخاطئ يسقط، بالأرقام العربيّة أو الهنديّة', () => {
  assert.equal(S.scoreQuestion(q('math-mult'), { text: 'الناتج ٣٩١.' }).score, 100);
  assert.ok(S.scoreQuestion(q('math-mult'), { text: 'الناتج 381.' }).score < 100);
  assert.equal(S.scoreQuestion(q('math-ages'), { text: 'عمر الولد 12 سنة وعمر أخته 6 سنوات.' }).score, 100);
  assert.equal(S.scoreQuestion(q('know-canberra'), { text: 'عاصمة أستراليا هي كانبرا.' }).score, 100);
});

test('٤. قواعد عامّة: اسم المزوّد، الردّ الإنجليزيّ، الرفض، الخطأ، والماركداون المكسور تُخصم', () => {
  const r = S.scoreQuestion(q('dialect-tired'), { text: 'أنا Claude وآسف لا أستطيع المساعدة **هنا' });
  const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.ok(failed.includes('بلا اسم مزوّد') && failed.includes('بلا رفض') && failed.includes('ماركداون سليم'), failed.join(','));
  assert.ok(!S.scoreQuestion(q('dialect-tired'), { text: 'Take a rest and drink water.' }).checks.find((c) => c.name === 'عربيّ').pass);
  assert.equal(S.scoreQuestion(q('dialect-tired'), { text: '', error: 'HTTP 500' }).checks[0].pass, false);
  assert.ok(S.scoreQuestion(q('code-reverse'), { text: '```python\ndef rev(s):\n    return s[::-1]\n```' }).score === 100, 'الكود لا يُطالَب بالعربيّة');
});

test('٥. الجدول والقائمة والطول والرقم الخاصّ', () => {
  assert.equal(S.scoreQuestion(q('fmt-table'), { text: '| | آيفون | سامسونج |\n|---|---|---|\n| الكاميرا | ممتازة | ممتازة |' }).score, 100);
  assert.ok(S.scoreQuestion(q('fmt-3points'), { text: '- أ\n- ب\n- ج\n- د\n- هـ\n- و' }).score < 100, 'ست نقاط بدل ثلاث');
  assert.ok(S.scoreQuestion(q('honest-private-phone'), { text: 'رقمه 050 123 4567' }).score < 100);
});

test('٦. الملخّص والمقارنة والتقرير: الدرجة الكلّيّة، الفئات، التراجع باسمه', () => {
  const mk = (score, id, cat) => ({ id, cat, score, checks: [{ name: 'x', pass: score === 100 }], firstDeltaMs: 1000, totalMs: 3000 });
  const cur = { date: 'اليوم', provider: 'claude', tier: 'مشترك', results: [mk(100, 'a', 'math'), mk(50, 'b', 'guide')] };
  cur.summary = S.summarize(cur.results);
  assert.deepEqual([cur.summary.overall, cur.summary.byCat.math, cur.summary.byCat.guide], [75, 100, 50]);
  const prev = { summary: { overall: 90 }, results: [mk(100, 'a', 'math'), mk(80, 'b', 'guide')] };
  const cmp = S.compare(prev, cur);
  assert.deepEqual(cmp.down, [{ id: 'b', from: 80, to: 50 }]);
  const md = S.report(cur, cmp);
  assert.ok(md.includes('## الدرجة الكلّيّة: 75 / 100  (السابق 90)'));
  assert.ok(md.includes('**تراجع:** b 80→50'));
  assert.ok(md.includes('الإرشاد بين المواقع'));
});

test('٧. المشغّل كاملًا على خادم محلّيّ يحاكي البثّ: يرسل الرمز والمزوّد والتاريخ للمتعدّد الأدوار، ويكتب النتيجة والتقرير', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      seen.push(b);
      const last = b.messages[b.messages.length - 1].content;
      const reply = /17 × 23/.test(last) ? 'الناتج 391' : /بعد 6 سنوات/.test(last) ? 'بيكون عمرك 40 يا سالم' : 'تمام';
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ status: '…' }) + '\n\n');
      res.write('data: ' + JSON.stringify({ delta: reply.slice(0, 4) }) + '\n\n');
      res.write('data: ' + JSON.stringify({ delta: reply.slice(4) }) + '\n\n');
      res.end('data: ' + JSON.stringify({ done: true }) + '\n\n');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
  try {
    const code = await new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(root, 'scripts/eval-run.mjs')], {
        env: Object.assign({}, process.env, { EVAL_BASE: 'http://127.0.0.1:' + srv.address().port, EVAL_TOKEN: 'tok-test', EVAL_ONLY: 'math-mult,mem-name', EVAL_OUT: out, EVAL_PREV_DIR: path.join(out, 'none') }),
        stdio: 'ignore',
      });
      p.on('exit', resolve);
    });
    assert.equal(code, 0);
    const res = JSON.parse(fs.readFileSync(path.join(out, 'result-claude.json'), 'utf8'));
    assert.equal(res.results.length, 2);
    assert.equal(res.results.find((r) => r.id === 'math-mult').score, 100);
    assert.equal(res.results.find((r) => r.id === 'mem-name').score, 100);
    assert.ok(seen.every((b) => b.token === 'tok-test' && b.provider === 'claude'));
    const multi = seen.find((b) => b.messages.length === 3);
    assert.ok(multi && multi.messages[0].content === 'اسمي سالم وعمري 34 سنة' && multi.messages[1].role === 'assistant', 'الدور الثاني يحمل الأوّل وردّه');
    assert.ok(fs.readFileSync(path.join(out, 'report-claude.md'), 'utf8').includes('## الدرجة الكلّيّة: 100 / 100'));
  } finally {
    srv.close();
  }
});
