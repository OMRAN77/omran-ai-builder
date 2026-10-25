// tests/security-hardening.test.cjs — v-sec-* (مراجعة أمنيّة ٢٥ أكتوبر، بأمر المالك «افحص الأمان ٠→١٠»).
// يثبّت الإصلاحات القابلة للاختبار بلا شبكة: سياج جسر Claude Code، تجريد HTML الخطّيّ والقراءة المحدودة،
// حدود قنبلة الضغط في unzip، موافقة المالك قبل حقن المعرفة الجماعيّة، والمعرّف القانونيّ + تأكيد المزوّد
// قبل ردّ نقاط الفيديو. كلّ اختبار يستدعي الدالّة الحقيقيّة من المصدر بمخزن/جلب مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');

// ─── ١) سياج جسر cc-bridge: منع التنفيذ السطريّ والالتفاف على فحص git push ───
test('cc-bridge: يرفض الالتفاف ويسمح الشرعيّ', async () => {
  const { denyReason } = await import(path.join(root, 'cc-bridge/policy.mjs'));
  const block = [
    'git -c k=v push origin HEAD:main',
    "git push origin 'HEAD:main'",
    'bash -c "git push origin HEAD:main"',
    'git -c protocol.version=2 push origin feature:master',
    'node -e "require(\'child_process\').execSync(\'git push origin HEAD:main\')"',
    'python3 -c "import os"',
    'timeout 5 git push origin HEAD:main',
    'cat x | node -',
    'echo hi > .github/workflows/x.yml',
    'npx cowsay hi',
    'git push origin HEAD:main',
    'git push -f origin feature',
  ];
  const allow = [
    'git push -u origin claude/fix-1',
    'npm run ci',
    'node scripts/branch-shots.mjs',
    'git -C /work/repo push origin claude/x',
    'git push origin featureX',
    'git log --oneline',
  ];
  for (const c of block) assert.ok(denyReason(c), 'يجب أن يُرفض: ' + c);
  for (const c of allow) assert.equal(denyReason(c), '', 'يجب أن يُسمح: ' + c);
});

// ─── ٢) تجريد HTML خطّيّ + قراءة محدودة الحجم ───
test('_html-text: تجريد صحيح وخطّيّ وقراءة محدودة', async () => {
  const { htmlToText, readCappedText } = require(path.join(root, 'api/_lib/_html-text.js'));
  assert.equal(htmlToText('a<script>evil()</script>b<style>x{}</style>c <b>d</b>'), 'a b c d');
  const big = '<'.repeat(1024 * 1024); // مدخل تربيعيّ سابقًا
  const t0 = Date.now(); htmlToText(big); const dt = Date.now() - t0;
  assert.ok(dt < 1000, 'التجريد خطّيّ (' + dt + 'ms)');
  // قراءة محدودة: جسم يبثّ ٥٠ م.ب يُقطع عند السقف
  let sent = 0; const total = 50 * 1024 * 1024; const chunk = 65536;
  const resp = { body: { getReader() { return {
    async read() { if (sent >= total) return { done: true }; sent += chunk; return { done: false, value: new Uint8Array(chunk).fill(97) }; },
    async cancel() {}, releaseLock() {},
  }; } } };
  const txt = await readCappedText(resp, 2 * 1024 * 1024);
  assert.ok(txt.length <= 2 * 1024 * 1024, 'القراءة محدودة بالسقف');
});

// ─── ٣) قنبلة الضغط: unzip يحدّ المخرجات ولا يستنزف الذاكرة ───
function buildZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(e.method, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const off = offset; const block = Buffer.concat([lh, nameBuf, comp]); locals.push(block); offset += block.length;
    centrals.push({ nameBuf, comp, data: e.data, method: e.method, off });
  }
  const localPart = Buffer.concat(locals); const cdBufs = [];
  for (const c of centrals) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(c.method, 10);
    cd.writeUInt32LE(c.comp.length, 20); cd.writeUInt32LE(c.data.length, 24);
    cd.writeUInt16LE(c.nameBuf.length, 28); cd.writeUInt32LE(c.off, 42);
    cdBufs.push(Buffer.concat([cd, c.nameBuf]));
  }
  const cd = Buffer.concat(cdBufs); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length, 8); eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, cd, eocd]);
}
test('analyze-zip: ملفّ عاديّ يُقرأ وقنبلة الضغط تُتخطّى', () => {
  const { unzip } = require(path.join(root, 'api/_lib/analyze-zip.js'));
  assert.equal(unzip(buildZip([{ name: 'a.txt', method: 8, data: Buffer.from('hello world') }]))[0].data.toString(), 'hello world');
  const bomb = buildZip([{ name: 'bomb.bin', method: 8, data: Buffer.alloc(100 * 1024 * 1024, 0) }, { name: 'ok.txt', method: 8, data: Buffer.from('later') }]);
  const t0 = Date.now(); const files = unzip(bomb); const dt = Date.now() - t0;
  assert.equal(files.find((f) => f.name === 'bomb.bin'), undefined, 'القنبلة تُتخطّى (تتجاوز سقف المدخل)');
  assert.ok(files.find((f) => f.name === 'ok.txt'), 'الملفّ التالي للقنبلة يبقى مقروءًا');
  assert.ok(dt < 3000, 'لا استنزاف (' + dt + 'ms)');
});

// ─── ٤) المعرفة الجماعيّة: لا حقن بلا موافقة المالك ───
test('collective render: الحقن بعد الاعتماد فقط (لا التزكية)', () => {
  const col = require(path.join(root, 'api/_lib/collective.js'));
  // مزكّاة بحسابين لكنّها غير معتمَدة → لا تُحقَن (التزكية لم تعد كافية).
  assert.equal(col.__render({ facts: [{ k: 'f1', t: 'جملة عامّة مفيدة', v: ['a', 'b'], at: 1 }] }), '', 'غير المعتمَد لا يُحقَن');
  // معتمَدة من المالك → تُحقَن.
  assert.match(col.__render({ facts: [{ k: 'f1', t: 'جملة عامّة مفيدة', v: ['a', 'b'], at: 1, approved: true }] }), /جملة عامّة مفيدة/, 'المعتمَد يُحقَن');
});

// ─── ٥) المعرّف القانونيّ للفيديو ───
test('runway canonicalId: تهجئات مختلفة لنفس المهمّة تؤول لمعرّف واحد', () => {
  process.env.RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || 'testkey';
  const rk = require(path.join(root, 'api/_lib/runway-keys.js'));
  assert.equal(rk.canonicalId('0:abc'), '0:abc');
  assert.equal(rk.canonicalId('abc'), '0:abc', 'معرّف خام = الفهرس 0');
  assert.equal(rk.canonicalId('9:abc'), '0:abc', 'فهرس خارج المدى يؤول إلى 0 (مفتاح واحد مضبوط)');
});

// ─── ٦) تنظيف الفيديو يسأل المزوّد قبل ردّ النقاط ───
test('video-job sweep: المُسلَّم لا يُردّ، والفاشل يُردّ، وغير المحسوم يبقى', async () => {
  process.env.RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || 'testkey';
  const vj = require(path.join(root, 'api/_lib/video-job.js'));
  const mk = () => { const s = {}; return {
    _s: s,
    async kvGetJSON(k) { return s[k] ? JSON.parse(s[k]) : null; },
    async kvSetRaw(k, v) { s[k] = v; }, async kvGetRaw(k) { return s[k]; },
    async kvSetIfAbsent(k, v) { if (s[k] != null) return false; s[k] = v; return true; },
    async kvDel(k) { delete s[k]; },
  }; };
  const guard = { async releaseVideoLock() {} }; const usage = { async releaseVideo() {} };
  const now = 1000000000000; const old = now - 40 * 60 * 1000;
  const run = async (status, resOk) => {
    const kv = mk(); let refunded = 0;
    await kv.kvSetRaw('vidjob:open:bob', JSON.stringify([{ id: '1:' + status, at: old }]));
    await kv.kvSetRaw(vj.ticketKey('1:' + status), JSON.stringify({ u: 'bob', c: 55, l: true, q: true }));
    const points = { async refundPoints() { refunded += 55; } };
    const out = await vj.sweepStaleVideoJobs('bob', { kv, now, points, guard, usage, fetch: () => ({ ok: resOk !== false, json: async () => ({ status }) }) });
    const kept = JSON.parse(kv._s['vidjob:open:bob'] || '[]').length;
    return { refunded, kept, out };
  };
  assert.equal((await run('SUCCEEDED')).refunded, 0, 'المُسلَّم لا يُردّ');
  assert.equal((await run('FAILED')).refunded, 55, 'الفاشل يُردّ');
  const pend = await run('RUNNING'); assert.equal(pend.refunded, 0); assert.equal(pend.kept, 1, 'غير المحسوم يبقى');
  const unk = await run('SUCCEEDED', false); assert.equal(unk.refunded, 0); assert.equal(unk.kept, 1, 'تعذّر الوصول = يبقى بلا ردّ');
});
