// tests/cc-bridge-disk.test.cjs — v-bridge-disk (لقطة المالك ٨ نوفمبر: «render join failed: … No space left on device» بعد أن رُسمت
// مشاهد قصّة «الحمرية» وسُجّل صوتها): قرص الجسر (/work على Railway) يحمل المستودع والجلسات وكلّ مهمّات المخرج، والمحاولات ملأته.
// الآن: المدخلات تُمسح أوّلًا بأوّل، والمهمّة الفاشلة تُمسح فورًا، والمهمّة الجديدة تمسح ما بقي من غيرها، والدمج يتأكّد من المساحة ويعيد
// مرّة بعد المسح، ورمز المهمّة يرفض قبل أيّ إنفاق إن لم يكفِ القرص — برسالة بالـ١٤ لغة لا خطأ ffmpeg.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const R = () => import('../cc-bridge/render.mjs');
const SECRET = 'bridge-secret-' + 's'.repeat(24);
const MB = 1048576;
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const settle = () => new Promise((r) => setTimeout(r, 80)); // المسح غير منتظَر (rm(...).catch)

/** ffmpeg وهميّ: يرفض إن غاب أيّ مدخل -i (مسحٌ مبكّر = فشل)، ويكتب الإخراج. opt.fail = رقم مقطع يفشل أوّل مرّة؛ opt.enospcJoin = أوّل دمج «No space left» */
function fakeFfmpeg(dir, opt) {
  const script = path.join(dir, 'ffmpeg.cjs');
  fs.writeFileSync(script, [
    "const fs = require('fs'), path = require('path');",
    'const dir = ' + JSON.stringify(dir) + ', opt = ' + JSON.stringify(opt || {}) + ';',
    'const args = process.argv.slice(2), out = args[args.length - 1];',
    "const ins = args.map((x, i) => (x === '-i' ? args[i + 1] : null)).filter((x) => x && !/=/.test(x));",
    "for (const f of ins) if (!fs.existsSync(f)) { process.stderr.write('missing input ' + path.basename(f) + '\\n'); process.exit(1); }",
    "const seg = /seg_(\\d+)\\.mp4$/.exec(out) ? Number(RegExp.$1) : -1;",
    "const cnt = path.join(dir, (seg >= 0 ? 'seg' + seg : 'join') + '.n'); let n = 0; try { n = Number(fs.readFileSync(cnt, 'utf8')) || 0; } catch (e) { n = 0; }",
    'fs.writeFileSync(cnt, String(n + 1));',
    "if (seg >= 0 && opt.fail === seg && n === 0) { process.stderr.write('x264 [error]: simulated\\n'); process.exit(1); }",
    "if (seg < 0 && opt.enospcJoin && n === 0) { fs.writeFileSync(out, 'partial'); process.stderr.write('av_interleaved_write_frame(): No space left on device\\n'); process.exit(1); }",
    "fs.writeFileSync(out, seg >= 0 ? 'seg' : 'video');",
  ].join('\n'));
  return script;
}

test('١. المدخلات تُمسح أوّلًا بأوّل: صورة المشهد بعد مقطعيها وصوته بعد مقطعه، والمقطع الفاشل تبقى مدخلاته لإعادته', async () => {
  const M = await R();
  const work = tmp('disk-enc-');
  try {
    const dir = path.join(work, 'jobs', 'j1'); fs.mkdirSync(dir, { recursive: true });
    const scenes = Array.from({ length: 4 }, () => ({ type: 'style_sample', mime: 'image/png', seconds: 3, audio: 'file', audioExt: 'mp3' }));
    for (let i = 0; i < 4; i++) { fs.writeFileSync(path.join(dir, 'img_' + i + '.png'), 'png'); fs.writeFileSync(path.join(dir, 'audio_' + i + '.mp3'), 'mp3'); }
    const script = fakeFfmpeg(dir, { fail: 2 });
    const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes }, dir);
    assert.deepEqual(plan.segments.map((s) => [path.basename(s.inputs.image), path.basename(s.inputs.audio)]),
      [['img_0.png', 'audio_0.mp3'], ['img_1.png', 'audio_1.mp3'], ['img_2.png', 'audio_2.mp3'], ['img_3.png', 'audio_3.mp3']]);
    for (const s of plan.segments) { s.args = [script].concat(s.args); s.light = [script].concat(s.light); }
    const r = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: process.execPath, ffprobe: 'x', log: () => {}, concurrency: 2 });
    const j = { id: 'j1', step: 'segments', done: 0, lastLog: [] };
    const enc = r._makeEncoder(j, plan);
    scenes.forEach((s, i) => enc.markReady(i)); enc.captureDone();
    await enc.finish();
    await settle();
    assert.equal(j.stills, 1, 'المقطع ٢ فشل ثمّ أُعيد خفيفًا — ومدخلاته كانت باقية له (الوهميّ يرفض المدخل الغائب)');
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /^(img|audio)_/.test(f)), [], 'لا صورة ولا صوت بعد أن رُمّزت المقاطع كلّها');
    assert.equal(fs.readdirSync(dir).filter((f) => /^seg_\d+\.mp4$/.test(f)).length, 4, 'المقاطع باقية للدمج');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('٢. مهمّة جديدة تمسح ما بقي من غيرها (الفاشلة واليتيمة والناجحة التي مضت عليها ساعة) لا الجارية ولا الحديثة؛ والصحّة تعرف ما يُمسح؛ والممسوح ٤١٠', async () => {
  const M = await R();
  const work = tmp('disk-rc-');
  const r = M.createRenderer({ secret: SECRET, appUrl: 'https://omran-ai-builder.vercel.app', workDir: work, ffmpeg: 'x', ffprobe: 'x', log: () => {}, concurrency: 1 });
  const srv = http.createServer((rq, rs) => { const u = new URL(rq.url, 'http://x'); r.handle(rq, rs, u).then((h) => { if (!h) { rs.writeHead(404); rs.end(); } }); });
  await new Promise((x) => srv.listen(0, '127.0.0.1', x));
  try {
    const mk = (id, files) => { const d = path.join(work, 'jobs', id); fs.mkdirSync(d, { recursive: true }); for (const [f, n] of Object.entries(files)) fs.writeFileSync(path.join(d, f), Buffer.alloc(n)); return d; };
    const now = Date.now();
    mk('err1', { 'shot_0.png': 5 * MB, 'seg_0.mp4': 2 * MB });
    const oldDir = mk('old1', { 'video.mp4': 3 * MB });
    const newDir = mk('new1', { 'video.mp4': 1 * MB });
    mk('orph1', { 'shot_0.png': 4 * MB });
    mk('cur1', { 'img_0.png': 1 * MB });
    r.jobs.set('err1', { id: 'err1', state: 'error', createdAt: now - 1000, lastLog: [] });
    r.jobs.set('old1', { id: 'old1', state: 'done', file: path.join(oldDir, 'video.mp4'), doneAt: now - M.LIMITS.doneKeepMs - 1000, lastLog: [] });
    r.jobs.set('new1', { id: 'new1', state: 'done', file: path.join(newDir, 'video.mp4'), doneAt: now - 1000, lastLog: [] });
    r.jobs.set('cur1', { id: 'cur1', state: 'running', lastLog: [] });
    const dk = await r.disk();
    assert.equal(dk.reclaimMB, 14, 'الفاشلة ٧ + الناجحة القديمة ٣ + اليتيمة ٤ — لا الحديثة ولا الجارية');
    assert.ok(dk.freeMB > 0 && dk.totalMB > 0, JSON.stringify(dk));
    assert.equal(await r._reclaim('cur1', M.LIMITS.doneKeepMs), 3);
    assert.deepEqual(fs.readdirSync(path.join(work, 'jobs')).sort(), ['cur1', 'new1']);
    assert.deepEqual([r.jobs.get('old1').file, r.jobs.get('old1').purged], ['', true]);
    assert.equal(r.jobs.get('err1').state, 'error', 'سجلّ الفاشلة يبقى للحالة');
    const base = 'http://127.0.0.1:' + srv.address().port;
    let x = await fetch(base + '/render/old1/video.mp4', { headers: { Authorization: 'Bearer ' + M.signJobToken({ user: 'omran', jobId: 'old1' }, SECRET) } });
    assert.equal(x.status, 410); assert.equal((await x.json()).error, 'gone');
    x = await fetch(base + '/render/new1/video.mp4', { headers: { Authorization: 'Bearer ' + M.signJobToken({ user: 'omran', jobId: 'new1' }, SECRET) } });
    assert.equal(x.status, 200, 'الحديث يُنزَّل');
  } finally { srv.close(); fs.rmSync(work, { recursive: true, force: true }); }
});

test('٣. الدمج يتأكّد من المساحة قبله: الضيّق بعد المسح رسالة بالأرقام لا خطأ ffmpeg؛ والامتلاء أثناءه مسحٌ ومحاولة واحدة', async () => {
  const M = await R();
  const work = tmp('disk-join-');
  try {
    const dir = path.join(work, 'jobs', 'jn1'); fs.mkdirSync(dir, { recursive: true });
    const scenes = Array.from({ length: 3 }, () => ({ type: 'title', text: 'x', seconds: 3 }));
    const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes }, dir);
    for (const s of plan.segments) fs.writeFileSync(s.out, Buffer.alloc(2 * MB));
    fs.mkdirSync(path.join(work, 'jobs', 'orph'), { recursive: true }); fs.writeFileSync(path.join(work, 'jobs', 'orph', 'seg_0.mp4'), Buffer.alloc(MB));
    let free = 20 * MB;
    const r = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: process.execPath, ffprobe: 'x', log: () => {}, concurrency: 1, diskFree: async () => free });
    const script = fakeFfmpeg(work, {});
    plan.join.args = [script].concat(plan.join.args); plan.fallback.args = [script].concat(plan.fallback.args);
    const j = { id: 'jn1', step: 'join', done: 0, lastLog: [] };
    await assert.rejects(r._joinSegments(j, plan), (e) => /^disk_full: مساحة القرص على الجسر ما تكفي لتجميع الفيديو — المتاح 20 م\.ب ويلزم نحو 70 م\.ب\. كبّر قرص Railway \(Volume\) أو أعد المحاولة بعد قليل\.$/.test(e.message) || assert.fail(e.message));
    assert.ok(!fs.existsSync(path.join(work, 'jobs', 'orph')), 'مسح ما يمكن قبل أن يحكم');
    assert.ok(j.lastLog.some((l) => /^disk: 20 MB free after clearing 1 old job folder\(s\); the join needs ~70 MB$/.test(l)), JSON.stringify(j.lastLog));
    assert.ok(!fs.existsSync(path.join(work, 'join.n')), 'ffmpeg لم يُشغَّل على قرص لا يكفي');
    // مساحة كافية لكنّ الدمج امتلأ أثناءه (كتب غيرنا): يُمسح الناقص ويُعاد مرّة فينجح
    free = 500 * MB;
    fakeFfmpeg(work, { enospcJoin: true });
    const out = await r._joinSegments(j, plan);
    await settle();
    assert.equal(fs.readFileSync(out, 'utf8'), 'video');
    assert.equal(fs.readFileSync(path.join(work, 'join.n'), 'utf8'), '2', 'محاولتان: الممتلئة والناجحة');
    assert.ok(j.lastLog.some((l) => /^join ran out of disk \(code 1: av_interleaved_write_frame\(\): No space left on device\) — clearing old jobs and retrying once$/.test(l)), JSON.stringify(j.lastLog));
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /^seg_/.test(f)), [], 'المقاطع تُمسح بعد الدمج');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('٤. مهمّة فشلت تُمسح ملفّاتها الآن، وسطر بدئها يقول المتاح على القرص، و«No space left» يصير رسالة القرص', async () => {
  const M = await R();
  const work = tmp('disk-ex-');
  try {
    const logs = [];
    const failing = (err) => ({ launch: async () => { throw err; } });
    const v = M.validateManifest({ lang: 'ar', scenes: [{ type: 'title', text: 'مرحبا' }] });
    assert.ok(v.ok);
    const job = (id) => ({ id, user: 'omran', state: 'queued', step: 'queued', done: 0, total: 1, manifest: JSON.parse(JSON.stringify(v.manifest)), createdAt: Date.now(), stepAt: Date.now(), lastLog: [] });
    const r = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: 'x', ffprobe: 'x', log: (s) => logs.push(s), concurrency: 1, chromium: failing(new Error('browser crashed')), diskFree: async () => 900 * MB });
    const j = job('ex1'); r.jobs.set(j.id, j);
    await r._execute(j);
    assert.deepEqual([j.state, j.message], ['error', 'browser crashed']);
    assert.ok(!fs.existsSync(path.join(work, 'jobs', 'ex1')), 'لا ملفّات تبقى لمهمّة فاشلة');
    assert.ok(logs.some((l) => /^job ex1 started: 1 scenes, concurrency 1, memory limit [^,]+, disk free 900 MB$/.test(l)), logs.join('\n'));
    const r2 = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: 'x', ffprobe: 'x', log: () => {}, concurrency: 1, chromium: failing(new Error('ENOSPC: no space left on device, write')), diskFree: async () => 3 * MB });
    const j2 = job('ex2'); r2.jobs.set(j2.id, j2);
    await r2._execute(j2);
    assert.equal(j2.message, 'disk_full: مساحة القرص على الجسر ما تكفي لتجميع الفيديو — المتاح 3 م.ب. كبّر قرص Railway (Volume) أو أعد المحاولة بعد قليل.');
    assert.ok(!fs.existsSync(path.join(work, 'jobs', 'ex2')));
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('٥. رمز المهمّة يرفض قبل أيّ إنفاق إن لم يكفِ قرص الجسر حتّى بعد المسح؛ والجسر القديم بلا قرص والقرص المجهول لا يُمنعان؛ والواجهة تقول السبب', async () => {
  const D = require('../api/_lib/app-director.js').__test;
  const reply = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });
  assert.equal(D.BRIDGE_MIN_DISK_MB, 500);
  let r = await D.probeBridge('https://b.example', { fetchImpl: reply({ ok: true, busy: false, renderJobs: 3, disk: { freeMB: 120, totalMB: 5000, reclaimMB: 200 } }) });
  assert.deepEqual(r, { ok: false, error: 'bridge_disk_full', why: 'free 120 MB + 200 MB to clear of 5000 MB' });
  r = await D.probeBridge('https://b.example', { fetchImpl: reply({ ok: true, busy: false, renderJobs: 3, disk: { freeMB: 300, totalMB: 5000, reclaimMB: 250 } }) });
  assert.deepEqual(r, { ok: true, renderJobs: 3, busy: false, disk: { freeMB: 300, totalMB: 5000, reclaimMB: 250 } }, 'المسح يكفيه');
  r = await D.probeBridge('https://b.example', { fetchImpl: reply({ ok: true, busy: false, renderJobs: 0 }) });
  assert.deepEqual(r, { ok: true, renderJobs: 0, busy: false }, 'جسر قبل هذا التغيير: لا قرص في صحّته = لا منع');
  r = await D.probeBridge('https://b.example', { fetchImpl: reply({ ok: true, busy: false, renderJobs: 0, disk: { freeMB: -1, totalMB: -1, reclaimMB: 0 } }) });
  assert.equal(r.ok, true, 'لا يُعرف = لا يُمنع');
  const js = read('js/video.js');
  assert.ok(js.includes("var key=/disk_full/.test(code)?'vdFailDisk':"), 'رمز الرفض (token … bridge_disk_full) ورسالة الدمج (render join disk_full) ← رسالة القرص');
  const srv = read('cc-bridge/server.mjs');
  assert.ok(srv.includes('renderJobs: renderer.jobs.size, disk: await renderer.disk().catch(() => null)'), 'القرص في الصحّة، وrenderJobs باقٍ رقمًا');
});

test('٦. رسالة «قرص الجسر» بالـ١٤ لغة بلا اسم مزوّد ذكاء، والوسوم مرفوعة بسببها', () => {
  const { dictFor } = require('./_owner-vm.cjs');
  const BANNED = /claude|anthropic|gemini|google|\bgpt|openai|runway|\bveo\b|kling|minimax|\bluma\b|\bsora\b/i;
  const seen = new Set();
  for (const lg of ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const v = dictFor(lg).vdFailDisk;
    assert.ok(v && v.length > 10, lg); assert.doesNotMatch(v, BANNED, lg); assert.match(v, /Railway/, lg + ': أين يُكبَّر القرص');
    seen.add(v);
  }
  assert.equal(seen.size, 14, 'ترجمات لا نسخ');
  const tag = read('js/app-04-i18n-state.js').match(/\.js\?v=(\d+)';[^\n]* v-bridge-disk \((\d+)\): [^\n]*\*\//);
  assert.ok(tag && Number(tag[1]) >= 790 && Number(tag[2]) === 790, 'وسم اللغات وسببه');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(read('index.html')) || [])[1]) >= 466, 'وسم video.js');
});
