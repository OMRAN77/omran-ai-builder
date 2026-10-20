// tests/director-render-robust.test.cjs — v-director-render-robust: «مخرج التطبيق» على الجسر لا يصمت ولا يسقط بلا سبب.
//
// العرض (لقطتا المالك ١٢ أكتوبر ٢٠٢٦): «يصوّر شاشات التطبيق · المشهد ١ من ٤» ربع ساعة بلا حراك، ثمّ
// «render segments segment 2 failed:» وبعدها لا شيء. السبب المقيس: ffmpeg مقتول بإشارة على حاوية Railway الصغيرة
// (مقطع واحد ٢٥٠–٣٩٠ م.ب وحتّى أربعة بالتوازي مع كروميوم)، وrun() كان يبتلع الإشارة، وpage.evaluate بلا مهلة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const R = () => import(require('node:url').pathToFileURL(path.join(root, 'cc-bridge', 'render.mjs')).href);
const MB = 1024 * 1024;
const SECRET = 'x'.repeat(40);

test('١. run() يقول الإشارة التي قتلت العمليّة، وexplainRun لا يعيد سببًا فارغًا أبدًا', async () => {
  const M = await R();
  const r = await M.run(process.execPath, ['-e', "process.kill(process.pid, 'SIGKILL')"], { timeoutMs: 20000 });
  assert.notEqual(r.code, 0);
  assert.equal(typeof r.signal, 'string', 'الحقل موجود دائمًا');
  if (process.platform !== 'win32') assert.equal(r.signal, 'SIGKILL');
  assert.equal(M.explainRun({ code: -1, signal: 'SIGKILL', err: '' }), 'ffmpeg killed by SIGKILL — memory pressure likely');
  assert.equal(M.explainRun({ code: 1, signal: '', err: '' }), 'ffmpeg exit 1 without output');
  assert.equal(M.explainRun({ code: 1, signal: '', err: 'x'.repeat(400) + 'TAIL' }).length, 300, 'آخر ٣٠٠ حرف من stderr كما كان');
  assert.ok(M.explainRun({ code: 1, err: '  Unknown encoder  ' }).includes('Unknown encoder'));
  const ok = await M.run(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs: 20000 });
  assert.equal(ok.code, 0); assert.equal(ok.signal, '');
});

test('٢. التزامن من ذاكرة الحاوية: ١ على ٥١٢ م.ب و١ غ.ب، ٣ على ٢ غ.ب، وسقف الأنوية ثمّ ٤؛ وحدّ cgroup يُقرأ وإلّا ذاكرة الجهاز', async () => {
  const M = await R();
  assert.equal(M.autoConcurrency(512 * MB, 3), 1);
  assert.equal(M.autoConcurrency(1024 * MB, 3), 1);
  assert.equal(M.autoConcurrency(2048 * MB, 3), 3);
  assert.equal(M.autoConcurrency(2048 * MB, 2), 2, 'سقف الأنوية');
  assert.equal(M.autoConcurrency(8192 * MB, 8), 4, 'سقف أربعة');
  assert.equal(M.autoConcurrency(NaN, 3), 1, 'قيمة فاسدة = واحد');
  assert.equal(M.parseMemLimit('max\n', 999), 999, 'cgroup v2 بلا حدّ');
  assert.equal(M.parseMemLimit('9223372036854771712', 999), 999, 'cgroup v1 بلا حدّ (رقم خرافيّ)');
  assert.equal(M.parseMemLimit('536870912\n', 8e9), 536870912);
  assert.equal(M.parseMemLimit('', 123), 123);
  const here = M.memoryLimitBytes();
  assert.ok(here > 0 && here <= os.totalmem(), 'الحدّ لا يتجاوز ذاكرة الجهاز');
  const r = M.createRenderer({ secret: SECRET, workDir: path.join(os.tmpdir(), 'drr-' + process.pid), log: () => {}, memoryLimitBytes: 512 * MB });
  assert.equal(r._makeEncoder.length, 2);
  const src = read('cc-bridge/render.mjs');
  assert.ok(src.includes('autoConcurrency(c.memoryLimitBytes || memoryLimitBytes(), Math.max(1, Math.min(4, availableParallelism() - 1)))'), 'الصريح DIRECTOR_CONCURRENCY يعلو، والتلقائيّ من الذاكرة والأنوية معًا');
  assert.ok(read('cc-bridge/server.mjs').includes('concurrency: Math.max(0, Number(env.DIRECTOR_CONCURRENCY) || 0)'), 'الخادم ما زال يمرّر المتغيّر');
});

test('٣. أوامر ffmpeg: الترميز الافتراضيّ أخفّ، lightArgs أخفّ منه، والاحتياط الثابت بلا حركة ولا ذوبان وبالملفّ الشخصيّ نفسه', async () => {
  const M = await R();
  const scenes = [{ type: 'screen', seconds: 4 }, { type: 'screen', seconds: 5 }];
  const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes }, '/w');
  const a0 = plan.segments[0].args;
  assert.equal(a0[a0.indexOf('-threads') + 1], '2');
  assert.equal(a0[a0.indexOf('-x264-params') + 1], 'rc-lookahead=10:ref=1');
  assert.ok(a0.includes('veryfast') && a0.some((x) => /zoompan=/.test(x)), 'الحركة باقية في الافتراضيّ');
  const l = M.lightArgs(a0);
  assert.equal(l[l.indexOf('-preset') + 1], 'veryfast', 'الملفّ الشخصيّ نفسه: ultrafast كان يُسقط CABAC فيصير Baseline ويختلف SPS بين المقاطع');
  assert.equal(l[l.indexOf('-threads') + 1], '1');
  assert.equal(l[l.indexOf('-x264-params') + 1], 'rc-lookahead=5:ref=1');
  assert.deepEqual(a0.filter((x) => /zoompan|xfade/.test(x)).length, l.filter((x) => /zoompan|xfade/.test(x)).length, 'الأخفّ يحتفظ بالحركة والذوبان');
  assert.notEqual(a0, l); assert.equal(a0[a0.indexOf('-preset') + 1], 'veryfast', 'الأصل لا يُعدَّل');
  const p = plan.segments[0].plain;
  assert.ok(Array.isArray(p) && !p.includes('-loop'), 'الصورة تُفكّ مرّة واحدة لا لكلّ إطار');
  const pf = p[p.indexOf('-filter_complex') + 1];
  assert.ok(pf.includes("zoompan=z='1':x=0:y=0:d=120:s=1920x1080:fps=30") && !/xfade|z='1\+|z='1\.0|iw\/zoom/.test(pf), 'ثابت: zoompan بلا تكبير ولا انزلاق ولا ذوبان، وإطاراته = خانته');
  assert.equal(p.filter((x) => x === '-i').length, 2, 'صورته وصوته فقط (لا صورة التالي)');
  assert.equal(p[p.indexOf('-t') + 1], '4.000', 'طول الخانة نفسه فلا يختلّ التوقيت');
  for (const x of ['libx264', 'veryfast', 'high', '4.1', 'yuv420p', 'aac', '+faststart']) assert.ok(p.includes(x), x);
  assert.ok(!p.includes('ultrafast') && !M.lightArgs(a0).includes('ultrafast'), 'لا ultrafast في أيّ مسار');
  assert.equal(p[p.indexOf('-r') + 1], '30'); assert.equal(p[p.indexOf('-g') + 1], '60');
  assert.equal(p[p.length - 1], a0[a0.length - 1], 'الملفّ الناتج نفسه فيدخل قائمة اللصق كما هو');
  assert.ok(pf.startsWith('[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080') && pf.includes(',format=yuv420p[v];[1:a]'), 'يُقاس إلى الإخراج مباشرة (لا مقاس عمل أكبر)');
  const sp = M.plainSceneArgs([{ type: 'style_sample', seconds: 3, wide: false }], 0, { image: '/w/img_0.jpg', audio: '', out: '/w/seg_0.mp4' });
  assert.ok(sp[sp.indexOf('-filter_complex') + 1].includes('gblur=sigma=40') && sp[sp.indexOf('-filter_complex') + 1].includes("zoompan=z='1'"), 'نموذج النمط بخلفيّته المموّهة ثمّ ثابت');
  const last = plan.segments[1];
  assert.equal(last.plain.filter((x) => x === '-i').length, 2); assert.ok(last.plain[last.plain.indexOf('-i') + 3] === 'lavfi' || last.plain.includes('anullsrc=r=44100:cl=stereo'), 'بلا صوت → صمت');
});

test('٤. المرمّز: مقطع يفشل مرّتين يُعاد وحده أخفّ بعد خلوّ الترميز، وإن فشل ثانية فصورة ثابتة — والفيديو يكتمل مع سببٍ في السجلّ', async () => {
  const M = await R();
  const calls = [];
  let active = 0, maxActive = 0;
  const run = async (bin, args) => {
    active++; maxActive = Math.max(maxActive, active);
    const out = args[args.length - 1];
    const fcs = String(args[args.indexOf('-filter_complex') + 1] || ''), plain = fcs.includes("zoompan=z='1':x=0:y=0"), light = !plain && args[args.indexOf('-x264-params') + 1] === 'rc-lookahead=5:ref=1';
    calls.push({ out: path.basename(out), light, plain, active });
    await new Promise((r) => setTimeout(r, 15));
    active--;
    if (/seg_1\.mp4$/.test(out) && !plain) return { code: -1, signal: 'SIGKILL', out: '', err: '' }; /* المقطع ١ يُقتل إلّا ثابتًا */
    if (/seg_2\.mp4$/.test(out) && !light && !plain) return { code: -1, signal: 'SIGKILL', out: '', err: '' }; /* المقطع ٢ ينجح أخفّ */
    return { code: 0, signal: '', out: '', err: '' };
  };
  const r = M.createRenderer({ secret: SECRET, workDir: path.join(os.tmpdir(), 'drr-' + process.pid), log: () => {}, concurrency: 4, run });
  const scenes = Array.from({ length: 4 }, () => ({ type: 'screen', seconds: 3 }));
  const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes }, '/w');
  const j = { id: 'j1', step: 'segments', manifest: { scenes } };
  const enc = r._makeEncoder(j, plan);
  scenes.forEach((s, i) => enc.markReady(i)); enc.captureDone();
  await enc.finish();
  assert.equal(enc.count(), 4, 'المقاطع الأربعة اكتملت');
  const seg1 = calls.filter((c) => c.out === 'seg_1.mp4'), seg2 = calls.filter((c) => c.out === 'seg_2.mp4');
  assert.deepEqual(seg1.map((c) => [c.light, c.plain]), [[false, false], [false, false], [true, false], [false, true]], 'المقطع ١: مرّتان، ثمّ أخفّ، ثمّ ثابت');
  assert.deepEqual(seg2.map((c) => [c.light, c.plain]), [[false, false], [false, false], [true, false]], 'المقطع ٢: مرّتان ثمّ أخفّ ونجح');
  for (const c of calls) if (c.light || c.plain) assert.equal(c.active, 1, 'الإعادة وحدها بلا ترميز موازٍ');
  assert.ok(maxActive >= 2, 'الترميز العاديّ كان متوازيًا');
  assert.equal(j.segFallbacks, 1, 'صورة ثابتة واحدة');
  const st = r._publicState(j);
  assert.equal(st.segFallbacks, 1);
  assert.ok(/segment 1 failed twice \(ffmpeg killed by SIGKILL — memory pressure likely\)/.test(j.logs.join('\n')), 'السبب في السجلّ لا فارغًا');
  assert.ok(st.lastLog.includes('still picture instead of camera motion'), 'آخر سطرين في الحالة العامّة');
  assert.equal(st.lastLog.split(' · ').length, 2);
  // فشل نهائيّ: ثابت أيضًا يفشل → الخطأ يحمل السبب
  const run2 = async () => ({ code: -1, signal: 'SIGKILL', out: '', err: '' });
  const r2 = M.createRenderer({ secret: SECRET, workDir: path.join(os.tmpdir(), 'drr-' + process.pid), log: () => {}, concurrency: 1, run: run2 });
  const j2 = { id: 'j2', step: 'segments', manifest: { scenes } };
  const enc2 = r2._makeEncoder(j2, plan);
  scenes.forEach((s, i) => enc2.markReady(i)); enc2.captureDone();
  await assert.rejects(enc2.finish(), /segment \d failed: ffmpeg killed by SIGKILL — memory pressure likely/);
});

test('٥. مهلة المشهد: raceTimeout يقول إن انقضت، والتصوير يستبدل الصفحة المعلّقة ببطاقة عنوان، وزمن الخطوة في الحالة', async () => {
  const M = await R();
  assert.equal(await M.raceTimeout(new Promise((r) => setTimeout(r, 120)), 30), true);
  assert.equal(await M.raceTimeout(new Promise((r) => setTimeout(r, 10)), 200), false);
  assert.equal(await M.raceTimeout(Promise.reject(new Error('x')), 200), false, 'الرفض ليس مهلة');
  assert.equal(M.LIMITS.sceneTimeoutMs, 3 * 60 * 1000);
  const src = read('cc-bridge/render.mjs');
  assert.ok(src.includes('const timedOut = await raceTimeout((async () => {') && src.includes('})(), LIMITS.sceneTimeoutMs);'), 'المحاولتان داخل المهلة');
  assert.ok(src.includes("lastErr = 'scene timeout ' + Math.round(LIMITS.sceneTimeoutMs / 1000) + 's'; state.key = '';") && src.includes('page = await appCtx.newPage(); page.setDefaultTimeout(45000);'), 'صفحة جديدة بعد المعلّقة');
  assert.ok(src.includes('let page = await appCtx.newPage();') && src.includes('if (gen !== shotGen) return;'), 'محاولة متأخّرة من صفحة قديمة لا تكتب فوق البطاقة');
  const r = M.createRenderer({ secret: SECRET, workDir: path.join(os.tmpdir(), 'drr-' + process.pid), log: () => {}, concurrency: 1 });
  const j = { id: 'j3', state: 'running', step: 'assets', manifest: { scenes: [] } };
  r._set(j, { step: 'capture', total: 4, done: 1 });
  const st = r._publicState(j);
  assert.equal(typeof st.stepSeconds, 'number'); assert.ok(st.stepSeconds >= 0 && st.stepSeconds < 5);
  assert.equal(st.lastLog, ''); assert.equal(st.segFallbacks, 0);
  r._set(j, { done: 2 }); assert.equal(j.stepAt > 0, true, 'زمن الخطوة لا يُعاد مع تقدّم العدّ في الخطوة نفسها');
});

test('٦. الواجهة: ملاحظة الخطوة تعرض الزمن المنقضي بعد ٢٠ ث وآخر سطر من سجلّ الجسر، في التصوير والدمج، والوسم مرفوع', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("function drNote(st,base){ var s=Number(st&&st.stepSeconds)||0, t=base||''; if(s>=20) t+=(t?' · ':'')+Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); if(st&&st.lastLog) t+=(t?' — ':'')+String(st.lastLog).slice(0,160); return t; }"));
  assert.ok(js.includes("drStep('shots','on',drNote(st,st.total?drT('vdScene',{i:st.done||0,n:st.total}):''),"));
  assert.ok(js.includes("drStep('join','on',drNote(st,st.step==='segments'&&st.total?drT('vdScene',{i:st.done||0,n:st.total}):''),"));
  const vm = require('node:vm');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(js.match(/function drNote\(st,base\)\{[^\n]*\}/)[0] + '; this.drNote = drNote;', ctx);
  assert.equal(ctx.drNote({ stepSeconds: 5 }, 'المشهد 1 من 4'), 'المشهد 1 من 4');
  assert.equal(ctx.drNote({ stepSeconds: 95 }, 'المشهد 1 من 4'), 'المشهد 1 من 4 · 1:35');
  assert.equal(ctx.drNote({ stepSeconds: 0, lastLog: '12:00:01 segment 2 failed twice' }, ''), '12:00:01 segment 2 failed twice');
  assert.equal(ctx.drNote({ stepSeconds: 61, lastLog: 'x' }, 'a'), 'a · 1:01 — x');
  assert.ok(Number((read('index.html').match(/\/js\/video\.js\?v=(\d+)/) || [])[1]) >= 454, 'وسم video.js رُفع (يُقرأ لا يُثبَّت — سقّاطة vPinTests)');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.test.includes('node tests/director-render-robust.test.cjs'), 'الاختبار مسجَّل');
});
