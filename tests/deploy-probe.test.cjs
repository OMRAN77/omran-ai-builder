// tests/deploy-probe.test.cjs — v-deploy-probe (أمر المالك ١٨ أكتوبر: «deploy-probe.txt: خلّه يثبت النشر فعلًا. كل دمج
// يكتب فيه رقم الكوميت، وفحص النشر يقارنه بالموقع الحي ويفشل إذا ما تطابق. إذا ما تقدر، احذف هالخطوة بدل ما تعطي نجاح
// كاذب»): الملفّ كان ثابتًا (commit=fe5ea5a منذ أغسطس) وsmoke.mjs يقارنه بنسخته المحلّيّة — نفسه — فينجح دائمًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handler = require('../api/_lib/deploy-probe.js');

function run(env) {
  const saved = process.env.VERCEL_GIT_COMMIT_SHA;
  if (env === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = env;
  const res = { code: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; } };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {} }, res)).then(() => {
    if (saved === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = saved;
    return res;
  });
}

test('١. المِجسّ يعلن التزام النشرة نفسها من Vercel — وبلا رقم صالح 503 لا رقمًا قديمًا', async () => {
  const sha = '9fe34c121ac55a24ea39da2a771bbe89e6fc95ac';
  const r = await run(sha.toUpperCase());
  assert.equal(r.code, 200);
  assert.match(r.body, new RegExp('commit=' + sha + '\\n'));
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.headers['content-type'], /^text\/plain/);
  for (const bad of [undefined, '', 'main', 'fe5ea5a; rm', 'xyz1234']) {
    const b = await run(bad);
    assert.equal(b.code, 503, String(bad));
    assert.match(b.body, /commit=unknown/);
  }
});

test('٢. /deploy-probe.txt يمرّ إلى الدالّة: إعادة كتابة في vercel.json، وموجّه system، ولا ملفّ ثابت يحجبها', () => {
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const rw = (vj.rewrites || []).find((r) => r.source === '/deploy-probe.txt');
  assert.ok(rw, 'إعادة الكتابة');
  assert.equal(rw.destination, '/api/system?action=deploy-probe');
  // Vercel يخدم الملفّ الثابت قبل إعادة الكتابة — ملفّ في الجذر يعيد الرقم الثابت والنجاح الكاذب.
  assert.equal(fs.existsSync(path.join(ROOT, 'deploy-probe.txt')), false, 'لا ملفّ ثابت في الجذر');
  const sys = fs.readFileSync(path.join(ROOT, 'api', 'system.js'), 'utf8');
  assert.ok(sys.includes("case 'deploy-probe': return require('./_lib/deploy-probe.js');"));
});

// ٣. الدخان نفسه على خادم محلّيّ: يطابق الالتزام المنتظَر أو يفشل — رقم آخر، غياب، أو ملفّ أغسطس الثابت.
function serve(probeStatus, probeBody) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/deploy-probe.txt') { res.writeHead(probeStatus, { 'content-type': 'text/plain' }); res.end(probeBody); return; }
      res.writeHead(404); res.end('');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function smoke(base, expect) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, { MONITOR_KEY: '', SMOKE_FETCH: '0' });
    if (expect === null) delete env.EXPECT_COMMIT; else env.EXPECT_COMMIT = expect;
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'smoke.mjs'), base], { env, cwd: ROOT, timeout: 60000 }, (err, stdout) => {
      const lines = String(stdout).split('\n');
      const i = lines.findIndex((l) => l.includes('مِجسّ النشرة'));
      resolve(i === -1 ? '' : lines[i + 1] || '');
    });
  });
}

test('٣. smoke.mjs: ✓ عند تطابق الالتزام فقط، ✗ لرقم آخر أو غياب أو الملفّ الثابت القديم', async () => {
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const cases = [
    [200, 'omran-deploy-probe\ncommit=' + A + '\n', A, /✓ المِجسّ يطابق: commit=aaaaaaa/],
    [200, 'omran-deploy-probe\ncommit=' + A + '\n', B, /✗ المِجسّ من نشرة أخرى/],
    [503, 'omran-deploy-probe\ncommit=unknown\n', A, /✗ المِجسّ → 503/],
    [404, '', A, /✗ المِجسّ → 404/],
    [200, 'omran-deploy-probe\nmark=v2-20260825-composer\nnote=… إن رأيت commit=fe5ea5a فالعنوان عالق', A, /✗ المِجسّ من نشرة أخرى/],
    [200, 'omran-deploy-probe\ncommit=' + A + '\n', 'not-a-sha', /✗ لا التزام منتظَر/],
  ];
  for (const [st, body, expect, want] of cases) {
    const srv = await serve(st, body);
    const line = await smoke('http://127.0.0.1:' + srv.address().port, expect);
    srv.close();
    assert.match(line, want, st + ' ' + expect + ' → ' + line);
  }
});

test('٤. بلا EXPECT_COMMIT يُنتظر HEAD النسخة (smoke.yml يسحب deployment.sha)', async () => {
  let head = '';
  try { head = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (e) { head = ''; }
  if (!/^[0-9a-f]{40}$/.test(head)) return; // نسخة بلا git: البند ٣ يغطّي المنطق
  const srv = await serve(200, 'omran-deploy-probe\ncommit=' + head + '\n');
  const line = await smoke('http://127.0.0.1:' + srv.address().port, null);
  srv.close();
  assert.match(line, new RegExp('✓ المِجسّ يطابق: commit=' + head.slice(0, 7)));
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'smoke.yml'), 'utf8');
  assert.ok(yml.includes('ref: ${{ github.event.deployment.sha || github.sha }}'), 'الدخان يسحب التزام النشرة');
});

test('٥. (مراجعة النقض) دمجان متتاليان: النطاق على نشرة أحدث تحوي الالتزام = ✓؛ نشرة أقدم أو غريبة = ✗', async () => {
  const git = (c) => { try { return require('child_process').execSync('git ' + c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
  const head = git('rev-parse HEAD'), prev = git('rev-parse HEAD~1');
  if (!/^[0-9a-f]{40}$/.test(prev)) return; // نسخة ضحلة بلا أب: البند ٣ يغطّي المطابقة والرفض
  const run = async (live, expect) => { const srv = await serve(200, 'omran-deploy-probe\ncommit=' + live + '\n'); const l = await smoke('http://127.0.0.1:' + srv.address().port, expect); srv.close(); return l; };
  assert.match(await run(head, prev), /✓ المِجسّ: نشرة أحدث تحوي الالتزام/, 'الأحدث يحوي الدمج');
  assert.match(await run(prev, head), /✗ المِجسّ من نشرة أخرى/, 'الأقدم لا يحويه');
});
