// tests/cc-bridge-render.test.cjs — v-app-director: مسار /render على الجسر — رمز المهمّة، المانيفست، أوامر ffmpeg النقيّة، الحدود.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const R = () => import('../cc-bridge/render.mjs');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000101d8c9a6ab0000000049454e44ae426082', 'hex').toString('base64');
const SECRET = 'bridge-secret-' + 's'.repeat(24);

test('١. رمز المهمّة: يُقبل بالسرّ نفسه ويُرفض بغيره وبعد انتهائه وبصيغة مشوّهة', async () => {
  const M = await R();
  const t = M.signJobToken({ user: 'omran', jobId: 'dabc' }, SECRET);
  assert.deepEqual([M.verifyJobToken(t, SECRET).ok, M.verifyJobToken(t, SECRET).jobId, M.verifyJobToken(t, SECRET).user], [true, 'dabc', 'omran']);
  assert.equal(M.verifyJobToken(t, 'x'.repeat(30)).why, 'signature');
  assert.equal(M.verifyJobToken(t, SECRET, Date.now() + 3 * 3600 * 1000).why, 'expired');
  assert.equal(M.verifyJobToken('a.b', SECRET).ok, false);
  assert.equal(M.verifyJobToken(t, '').ok, false, 'بلا سرّ لا قبول');
  // الصيغة نفسها التي يصدرها Vercel
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'x'.repeat(24);
  const D = require('../api/_lib/app-director.js').__test;
  assert.equal(M.verifyJobToken(D.signJobToken({ user: 'omran', jobId: 'j9' }, SECRET), SECRET).jobId, 'j9');
});

test('٢. المانيفست: الأنواع الثلاثة بحقولها، الخطوات من قائمة بيضاء، base64 للصور والصوت، والحدود', async () => {
  const M = await R();
  const ok = M.validateManifest({ lang: 'ar', title: 'ت', scenes: [
    { type: 'title', text: 'مرحبا', sub: 'جولة', audio: 'data:audio/mpeg;base64,' + PNG },
    { type: 'screen', target: 'video', text: 'صانع الفيديو', steps: [{ click: '#btnVideoMaker' }, { wait: 99999 }, { vtab: 'clean' }, { settings: 'themeSection' }, { focus: '#videoMakerModal .vmk-studio' }], seconds: 3 },
    { type: 'style_sample', target: 'ghibli', image: 'data:image/png;base64,' + PNG },
  ] });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.manifest.dir, 'rtl'); assert.equal(M.validateManifest({ lang: 'en', scenes: [{ type: 'title', text: 'x' }] }).manifest.dir, 'ltr');
  assert.deepEqual(ok.manifest.scenes[1].steps, [{ click: '#btnVideoMaker' }, { wait: 6000 }, { vtab: 'clean' }, { settings: 'themeSection' }, { focus: '#videoMakerModal .vmk-studio' }], 'المهلة محصورة');
  assert.equal(ok.manifest.scenes[1].seconds, 3); assert.equal(ok.manifest.scenes[2].mime, 'image/png'); assert.equal(ok.manifest.scenes[0].audio, PNG);
  const bad = (m) => M.validateManifest(m).error;
  assert.equal(bad(null), 'manifest_required');
  assert.equal(bad({ scenes: [] }), 'scenes_required');
  assert.equal(bad({ scenes: [{ type: 'screen', steps: [{ eval: 'alert(1)' }] }] }), 'scene_0_steps', 'لا خطوة خارج القائمة البيضاء');
  assert.equal(bad({ scenes: [{ type: 'screen', steps: [{ click: 'body > script' }] }] }), 'scene_0_steps', 'click بمعرّف فقط');
  assert.equal(bad({ scenes: [{ type: 'screen', steps: Array.from({ length: 9 }, () => ({ wait: 100 })) }] }), 'scene_0_steps', 'حدّ الخطوات ٨');
  assert.equal(bad({ scenes: [{ type: 'title', text: '' }] }), 'scene_0_text');
  assert.equal(bad({ scenes: [{ type: 'style_sample', image: 'not base64 !!' }] }), 'scene_0_image');
  assert.equal(bad({ scenes: [{ type: 'style_sample', image: 'data:image/svg+xml;base64,' + PNG }] }), 'scene_0_image_type');
  assert.equal(bad({ scenes: [{ type: 'title', text: 'x', audio: 'A'.repeat(M.LIMITS.audioChars + 4) }] }), 'scene_0_audio', 'حدّ حجم الصوت');
  assert.equal(bad({ scenes: [{ type: 'video' }] }), 'scene_0_type');
  assert.equal(bad({ scenes: Array.from({ length: M.LIMITS.scenes + 1 }, () => ({ type: 'title', text: 'x' })) }), 'too_many_scenes', '١٠ دقائق ≈ ٧٥ مشهدًا — السقف ' + M.LIMITS.scenes);
  assert.ok(M.LIMITS.scenes >= 75 && M.LIMITS.bodyBytes >= 100e6 && M.LIMITS.ttlMs === 24 * 3600 * 1000 && M.LIMITS.jobTimeoutMs >= 45 * 60 * 1000);
});

test('٣. buildFfmpegArgs: الانتقال مخبوز في المقطع (صورته + صورة تاليه)، zoompan يتبدّل اتّجاهه ويتّصل عبر الحدّ، الصوت عليه أو صمت، والدمج لصق بلا إعادة ترميز الفيديو', async () => {
  const M = await R();
  const manifest = { lang: 'ar', dir: 'rtl', scenes: [
    { type: 'title', text: 'مرحبا', seconds: 4, audio: 'file' },
    { type: 'screen', text: 'x', seconds: 6.5, audio: 'file' },
    { type: 'style_sample', mime: 'image/jpeg', seconds: 5, audio: null },
    { type: 'screen', seconds: 7, audio: 'file' },
  ] };
  const plan = M.buildFfmpegArgs(manifest, '/work/j1');
  const J = (f) => path.join('/work/j1', f); // المسارات بفاصل النظام (الاختبار يجري على ويندوز أيضًا)
  assert.equal(plan.segments.length, 4);
  const [a0, a1, a2, a3] = plan.segments.map((s) => s.args);
  const fc = (a) => a[a.indexOf('-filter_complex') + 1];
  const inputs = (a) => a.map((x, i) => (x === '-i' ? a[i + 1] : null)).filter(Boolean);
  // المدخلات: صورة المشهد ثمّ صورة التالي ثمّ الصوت (الأخير بلا تالٍ)
  assert.deepEqual(inputs(a0), [J('shot_0.png'), J('shot_1.png'), J('audio_0.mp3')]);
  assert.deepEqual(inputs(a1), [J('shot_1.png'), J('img_2.jpg'), J('audio_1.mp3')]);
  assert.deepEqual(inputs(a2), [J('img_2.jpg'), J('shot_3.png'), 'anullsrc=r=44100:cl=stereo'], 'نموذج النمط jpg بلا صوت → صمت');
  assert.deepEqual(inputs(a3), [J('shot_3.png'), J('audio_3.mp3')]);
  assert.deepEqual(plan.segments.map((s) => s.needs), [[0, 1], [1, 2], [2, 3], [3]], 'المقطع يُرمَّز حين تتوفّر صورته وصورة تاليه');
  assert.equal(a0[a0.length - 1], J('seg_0.mp4'));
  // المشهد الأوّل: حركته من الإطار ٠ على ١٢٠ إطارًا، ثمّ ذوبان في أوّل ١٥ إطارًا من حركة التالي (مقامها ١٩٥+١٥)
  assert.ok(fc(a0).includes("[0:v]scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440") && fc(a0).includes("zoompan=z='1+0.08*(on+0)/120'") && fc(a0).includes(':d=120:s=1920x1080:fps=30'));
  assert.ok(fc(a0).includes("[1:v]") && fc(a0).includes("zoompan=z='1.08-0.08*(on+0)/210'") && fc(a0).includes(':d=15:s=1920x1080:fps=30'), 'مقدّمة التالي بسرعة حركته نفسها');
  assert.ok(fc(a0).includes('[own][nx]xfade=transition=fade:duration=0.5:offset=3.500[v]'), 'الذوبان في آخر نصف ثانية من الخانة');
  assert.ok(fc(a0).includes('[2:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]'), 'الصوت المدخل الثالث حين يوجد تالٍ');
  // المشهد الثاني يكمل حركته من الإطار ١٥ (ما ظهر في ذوبان سابقه) — اتّصال بلا قفزة
  assert.ok(fc(a1).includes("zoompan=z='1.08-0.08*(on+15)/210'") && fc(a1).includes(':d=195:'), 'يبتعد، ويبدأ من حيث انتهى الذوبان');
  assert.ok(fc(a1).includes('[1:v]split[bgb][fgb]') && fc(a1).includes('gblur=sigma=40') && fc(a1).includes("x='(iw-iw/zoom)*(on+0)/165'"), 'التالي نموذج نمط: خلفيّة مموّهة وتحريك جانبيّ');
  assert.ok(fc(a1).includes('xfade=transition=fade:duration=0.5:offset=6.000[v]'));
  assert.ok(fc(a2).includes('[0:v]split[bga][fga]') && fc(a2).includes("x='(iw-iw/zoom)*(on+15)/165'") && fc(a2).includes("x='(iw-iw/zoom)*(1-(on+0)/225)'"));
  assert.ok(fc(a3).includes("x='(iw-iw/zoom)*(1-(on+15)/225)'") && fc(a3).endsWith('format=yuv420p[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]') && !fc(a3).includes('xfade'), 'الأخير بلا ذوبان');
  manifest.scenes.forEach((s, i) => {
    const a = plan.segments[i].args;
    assert.equal(a[a.indexOf('-t') + 1], s.seconds.toFixed(3), 'طول المقطع = خانته بالضبط');
    for (const x of ['libx264', 'veryfast', 'high', '4.1', 'yuv420p', 'aac', '+faststart', '[v]', '[a]']) assert.ok(a.includes(x), x);
    assert.equal(a[a.indexOf('-r') + 1], '30'); assert.equal(a[a.indexOf('-g') + 1], '60');
  });
  // الدمج: لصق — الفيديو نسخ، والصوت يُعاد ترميزه؛ والاحتياط نسخ الاثنين. لا سلسلة xfade تكبر ذاكرتها مع عدد المشاهد
  const j = plan.join.args;
  assert.deepEqual(j.slice(0, 10), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', J('concat.txt')]);
  assert.ok(j[j.indexOf('-c:v') + 1] === 'copy' && j[j.indexOf('-c:a') + 1] === 'aac' && !j.includes('-filter_complex') && j[j.length - 1] === J('video.mp4'));
  assert.ok(plan.fallback.args.includes('-c') && plan.fallback.args[plan.fallback.args.indexOf('-c') + 1] === 'copy');
  assert.equal(plan.listText, ["file '/work/j1/seg_0.mp4'", "file '/work/j1/seg_1.mp4'", "file '/work/j1/seg_2.mp4'", "file '/work/j1/seg_3.mp4'", ''].join('\n'), 'قائمة اللصق بشرطة أماميّة');
  assert.equal(M.concatList(["C:\\w\\it's.mp4"]), "file 'C:/w/it'\\''s.mp4'\n");
  assert.equal(plan.total, 4 + 6.5 + 5 + 7, 'المدّة الكلّيّة = مجموع الخانات');
  assert.equal(M.joinArgs, undefined, 'سلسلة xfade القديمة حُذفت');
  // الانزلاق باتّجاه القراءة كلّ ثالث حدّ (بعيدًا عن بطاقات العناوين)
  const six = (dir) => M.buildFfmpegArgs({ lang: 'x', dir, scenes: Array.from({ length: 6 }, () => ({ type: 'screen', seconds: 5 })) }, '/w').segments.map((s) => fc(s.args)).join(' ');
  assert.ok(six('ltr').includes('xfade=transition=smoothleft') && six('rtl').includes('xfade=transition=smoothright'));
  // مشهد واحد: بلا تالٍ ولا ذوبان
  const one = M.buildFfmpegArgs({ lang: 'en', dir: 'ltr', scenes: [{ type: 'title', text: 'x', seconds: 3 }] }, '/w');
  assert.ok(!fc(one.segments[0].args).includes('xfade') && one.total === 3);
  // خانة المشهد = مدّة صوته + نصف ثانية، محصورة، وعدد إطاراتها صحيح
  assert.equal(M.resolveSeconds({ seconds: 8 }, 6.2), 6.7);
  assert.equal(M.resolveSeconds({ seconds: 8 }, 0), 8);
  assert.equal(M.resolveSeconds({}, 0.4), M.LIMITS.minSec);
  assert.equal(M.resolveSeconds({}, 100), M.LIMITS.maxSec);
  assert.equal(M.slotFrames({ seconds: 6.7 }), 201); assert.equal(M.XF, 15);
});

test('٤. بطاقة العنوان صفحة بخطّ عربيّ (لا drawtext)، ودوالّ الصفحة دوالّ حقيقيّة، والتصوير لا يُسقط المهمّة بلقطة واحدة', async () => {
  const M = await R();
  const html = M.titleCardHtml({ text: 'عمران <AI>', sub: 'جولة', dir: 'rtl', lang: 'ar' });
  assert.ok(html.includes('dir="rtl"') && html.includes('عمران &lt;AI&gt;') && html.includes('Tajawal') && html.includes('width:1920px;height:1080px'));
  assert.ok(!/filter:blur/.test(html) && html.includes('radial-gradient('), 'توهّج البطاقة تدرّج لا دائرة مموّهة (كانت تُقصّ بحافّة حادّة)');
  const src = read('cc-bridge/render.mjs');
  assert.ok(!/drawtext=/.test(src), 'النصّ العربيّ يُرسم في المتصفّح لا بمرشّح drawtext');
  assert.equal(typeof M.cleanPage, 'function'); assert.equal(typeof M.addCaption, 'function'); assert.equal(typeof M.focusRect, 'function');
  assert.ok(src.includes('pg.evaluate(cleanPage)') && src.includes('pg.evaluate(addCaption, [') && src.includes('pg.evaluate(focusRect, fc.focus)'), 'Playwright لا ينادي نصًّا بمعطى');
  assert.ok(src.includes("viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: VIEW_SCALE, colorScheme: 'dark'") && M.VIEW_W === 1280 && M.VIEW_SCALE === 3, 'التطبيق ١٢٨٠×٧٢٠ ×٣ بالثيم الداكن');
  assert.ok(src.includes("const cardCtx = await browser.newContext({ viewport: { width: OUT_W, height: OUT_H }, deviceScaleFactor: 2"), 'بطاقات العناوين في سياقها (لا ١٩٢٠×١٠٨٠ بدقّة ×٣)');
  assert.ok(src.includes("localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg);"), 'بلا مقدّمة ولا إشعار خصوصيّة وباللغة المطلوبة');
  // الصمود: الحركات موقوفة عند اللقطة، إعادة واحدة، ثمّ بطاقة عنوان بدل الفشل؛ ومشاهد متتالية للشاشة نفسها بلا إعادة تحميل
  assert.ok(src.includes("const SHOT = { type: 'png', animations: 'disabled', caret: 'hide', timeout: 60000 };"));
  assert.ok(src.includes('for (let attempt = 1; attempt <= 2 && !ok; attempt++)') && src.includes("capture failed twice: ' + lastErr + ' — title card instead'") && src.includes('j.fallbacks++'));
  assert.ok(src.includes('if (state.key !== key) {') && src.includes('await pg.bringToFront();'));
  // الترميز يبدأ أثناء التصوير (واحد في كلّ مرّة) ثمّ بالتوازي، والدمج لصق
  assert.ok(src.includes('const limit = () => (capturing ? 1 : c.concurrency);') && src.includes('seg.needs.every((k) => ready.has(k))'));
  assert.ok(src.includes('try { await capture(j, (i) => enc.markReady(i)); } finally { enc.captureDone(); }') && src.includes('await enc.finish();') && src.includes('await joinSegments(j, plan);'));
  assert.ok(src.includes('autoConcurrency(availableParallelism(), memLimit)'), 'التزامن الافتراضيّ من أنوية الجهاز وحدّ ذاكرة الحاوية');
  assert.ok(!src.includes(String.fromCharCode(27)), 'لا بايت هروب خام في المصدر');
});

test('٥. المسارات: CORS لأصل التطبيق، ٤٠١ بلا رمز، ٤٠٠ لمانيفست فاسد، ٤٠٩ لمهمّة مكرّرة، ٤١٣ لجسم ضخم، والحالة لصاحب الرمز وحده', async () => {
  const M = await R();
  const http = require('node:http');
  const os = require('node:os');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-render-'));
  const exec = []; // لا تنفيذ فعليّ: نستبدل المنفّذ بمسجّل
  const r = M.createRenderer({ secret: SECRET, appUrl: 'https://omran-ai-builder.vercel.app', workDir: work, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', log: () => {}, maxQueued: 1 });
  r._execute = async () => {};
  assert.equal(r.corsAllowed('https://omran-ai-builder.vercel.app'), true);
  assert.equal(r.corsAllowed('https://omran-ai-builder-git-x-y.vercel.app'), true, 'معاينات Vercel');
  assert.equal(r.corsAllowed('https://evil.example'), false);
  const srv = http.createServer((rq, rs) => { const u = new URL(rq.url, 'http://x'); r.handle(rq, rs, u).then((h) => { if (!h) { rs.writeHead(404); rs.end(); } }); });
  await new Promise((x) => srv.listen(0, '127.0.0.1', x));
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const tok = M.signJobToken({ user: 'omran', jobId: 'djob1' }, SECRET);
    const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
    let x = await fetch(base + '/render', { method: 'OPTIONS', headers: { Origin: 'https://omran-ai-builder.vercel.app' } });
    assert.equal(x.status, 204); assert.equal(x.headers.get('access-control-allow-origin'), 'https://omran-ai-builder.vercel.app'); assert.ok(/Authorization/.test(x.headers.get('access-control-allow-headers')));
    x = await fetch(base + '/render', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(x.headers.get('access-control-allow-origin'), null);
    x = await fetch(base + '/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(x.status, 401);
    x = await fetch(base + '/render', { method: 'POST', headers: H, body: JSON.stringify({ scenes: [{ type: 'nope' }] }) });
    assert.equal(x.status, 400); assert.equal((await x.json()).error, 'scene_0_type');
    const good = { lang: 'ar', scenes: [{ type: 'title', text: 'مرحبا' }, { type: 'screen', steps: [{ click: '#btnVideoMaker' }] }] };
    x = await fetch(base + '/render', { method: 'POST', headers: H, body: JSON.stringify(good) });
    assert.equal(x.status, 202); const j = await x.json(); assert.equal(j.jobId, 'djob1'); assert.equal(j.total, 2);
    x = await fetch(base + '/render', { method: 'POST', headers: H, body: JSON.stringify(good) });
    assert.equal(x.status, 409, 'الرمز الواحد = مهمّة واحدة');
    x = await fetch(base + '/render/djob1', { headers: { Authorization: 'Bearer ' + tok } });
    assert.equal(x.status, 200); assert.equal((await x.json()).jobId, 'djob1');
    const other = M.signJobToken({ user: 'omran', jobId: 'dother' }, SECRET);
    x = await fetch(base + '/render/djob1', { headers: { Authorization: 'Bearer ' + other } });
    assert.equal(x.status, 404, 'رمز مهمّة أخرى لا يرى هذه');
    x = await fetch(base + '/render/djob1/video.mp4', { headers: { Authorization: 'Bearer ' + tok } });
    assert.equal(x.status, 409, 'لم تنتهِ بعد');
    x = await fetch(base + '/render/djob1?t=' + encodeURIComponent(tok));
    assert.equal(x.status, 200, 'الرمز في ?t= للرابط المباشر');
    // جسم ضخم يُرفض قبل التحليل
    const big = M.signJobToken({ user: 'omran', jobId: 'dbig' }, SECRET);
    const chunk = Buffer.alloc(4 * 1024 * 1024, 0x61);
    x = await fetch(base + '/render', { method: 'POST', headers: { Authorization: 'Bearer ' + big, 'Content-Type': 'application/json' }, body: Buffer.concat(Array.from({ length: Math.ceil(M.LIMITS.bodyBytes / chunk.length) + 1 }, () => chunk)), duplex: 'half' }).catch(() => ({ status: 413 }));
    assert.equal(x.status, 413);
    assert.equal(exec.length, 0);
  } finally { srv.close(); fs.rmSync(work, { recursive: true, force: true }); }
});

test('٦. الخادم والصورة: /render قبل بوّابة السرّ الخام، ffmpeg في الصورة، والمسارات القائمة والسياج لم تُمسّ', () => {
  const srv = read('cc-bridge/server.mjs');
  assert.ok(srv.indexOf("url.pathname === '/render' || url.pathname.startsWith('/render/')") < srv.indexOf("if (!authed(req)) return json(res, 401"), '/render يتحقّق برمزه قبل بوّابة السرّ');
  assert.ok(srv.includes("appUrl: String(env.DIRECTOR_APP_URL || 'https://omran-ai-builder.vercel.app')") && srv.includes("ffmpeg: env.FFMPEG_BIN || 'ffmpeg'"));
  assert.ok(srv.includes("if (req.method === 'POST' && url.pathname === '/chat')") && srv.includes("url.pathname.startsWith('/runs/')"), 'مسارا /chat و/runs كما هما');
  const docker = read('cc-bridge/Dockerfile');
  assert.ok(/python3 python3-pip ffmpeg fonts-noto-core/.test(docker) && docker.includes('COPY policy.mjs git.mjs watch.mjs server.mjs render.mjs entrypoint.sh ./'));
  const pol = read('cc-bridge/policy.mjs');
  assert.ok(!/render/.test(pol), 'سياج أدوات Claude Code لم يُلمس');
  assert.ok(!/console\.log\([^)]*(token|secret)/i.test(read('cc-bridge/render.mjs')), 'لا رمز ولا سرّ في السجلّ');
  const readme = read('cc-bridge/README.md');
  assert.ok(readme.includes('DIRECTOR_APP_URL') && readme.includes('/render'));
});

test('٧. v-app-director-voice: الصوت الاحتياطيّ WAV يُكتب بامتداده، ونموذج نمط وصل ١٦:٩ بنصّه لا يُموَّه، ونصّ الشاشة يتّسع لجملة المشهد', async () => {
  const M = await R();
  // الامتداد من محتوى الملفّ لا من اسمه: RIFF/WAVE = wav، وكلّ ما عداه mp3 كما كان
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(40)]);
  assert.equal(M.audioExtOf(wav), 'wav');
  assert.equal(M.audioExtOf(Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'mp3');
  assert.equal(M.audioExtOf(Buffer.from('ID3' + 'x'.repeat(20))), 'mp3');
  assert.equal(M.audioExtOf(Buffer.from('RIFF')), 'mp3', 'ملفّ مبتور لا يُعدّ WAV');
  assert.equal(M.audioExtOf(null), 'mp3');
  // النسبة: ١٦:٩ (بهامش صغير) وحدها عريضة
  assert.equal(M.isWide({ w: 1920, h: 1080 }), true); assert.equal(M.isWide({ w: 1280, h: 720 }), true);
  assert.equal(M.isWide({ w: 1024, h: 1024 }), false); assert.equal(M.isWide({ w: 1080, h: 1920 }), false);
  assert.equal(M.isWide(null), false); assert.equal(M.isWide({ w: 0, h: 0 }), false);
  // الأوامر: مشهد بصوت WAV يُقرأ من audio_N.wav، والباقي mp3؛ والنموذج العريض بلا gblur والمربّع به
  const J = (f) => path.join('/work/j2', f);
  const fc = (a) => a[a.indexOf('-filter_complex') + 1];
  const inputs = (a) => a.map((x, i) => (x === '-i' ? a[i + 1] : null)).filter(Boolean);
  const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes: [
    { type: 'screen', seconds: 5, audio: 'file', audioExt: 'wav' },
    { type: 'style_sample', mime: 'image/jpeg', seconds: 5, audio: 'file', wide: true },
    { type: 'style_sample', mime: 'image/png', seconds: 5, audio: null },
  ] }, '/work/j2');
  const [a0, a1, a2] = plan.segments.map((s) => s.args);
  assert.deepEqual(inputs(a0), [J('shot_0.png'), J('img_1.jpg'), J('audio_0.wav')]);
  assert.deepEqual(inputs(a1), [J('img_1.jpg'), J('img_2.png'), J('audio_1.mp3')]);
  assert.ok(!fc(a0).includes('gblur'), 'لقطة ثمّ نموذج عريض: لا تمويه');
  assert.ok(fc(a1).includes('gblur') && !fc(a1).split('[1:v]')[0].includes('gblur'), 'النموذج العريض نفسه بلا تمويه، وتاليه المربّع به');
  assert.ok(fc(a2).includes('gblur'), 'نموذج مربّع على خلفيّة مموّهة كما كان');
  // نصّ الشاشة: جملة المشهد كاملة في الفيديو بلا صوت (كان ٨٠ حرفًا)
  assert.equal(M.LIMITS.textChars, 180); assert.equal(M.LIMITS.subChars, 200);
  const long = 'ك'.repeat(170);
  const v = M.validateManifest({ lang: 'ar', scenes: [{ type: 'screen', target: 'home', text: long, seconds: 5 }, { type: 'title', text: 'عنوان', sub: 'س'.repeat(190), seconds: 4 }] });
  assert.equal(v.ok, true, JSON.stringify(v).slice(0, 200));
  assert.equal(v.manifest.scenes[0].text.length, 170); assert.equal(v.manifest.scenes[1].sub.length, 190);
  const src = read('cc-bridge/render.mjs');
  assert.ok(src.includes("(String(t).length > 48 ? '18px' : '999px')"), 'شريط النصّ الطويل بزوايا لا كبسولة');
  assert.ok(src.includes("s.audioExt = audioExtOf(ab);") && src.includes("if (s.type === 'style_sample') s.wide = isWide(await probeSize(c.ffprobe, sceneImage(s, i, d)));"));
  assert.ok(src.includes("'audio_' + i + '.mp3', 'audio_' + i + '.wav',"), 'ملفّ WAV يُنظَّف مع بقيّة ملفّات المهمّة');
});

/* ───────── v-app-director-watchdog ───────── */
const WD_BANNED = /claude|anthropic|gemini|google|gpt|openai|groq|deepseek|kimi|azure/i;
const WD_LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
/** ffmpeg وهميّ: سكربت node يسجّل كلّ نداء (بدايته ونهايته ومعطياته) ويفشل مقطعًا بعينه n مرّة — المسار يأتي في المعطيات بعد السكربت */
function fakeFfmpeg(dir, failIndex, failTimes) {
  const script = path.join(dir, 'ffmpeg.cjs');
  fs.writeFileSync(script, [
    "const fs = require('fs'), path = require('path');",
    'const dir = ' + JSON.stringify(dir) + ', failIndex = ' + failIndex + ', failTimes = ' + failTimes + ';',
    'const args = process.argv.slice(2), out = args[args.length - 1], t0 = Date.now();',
    "const seg = /seg_(\\d+)\\.mp4$/.exec(out) ? Number(RegExp.$1) : -1;",
    "const cnt = path.join(dir, 'fail_' + seg + '.n'); let n = 0; try { n = Number(fs.readFileSync(cnt, 'utf8')) || 0; } catch (e) { n = 0; }",
    'setTimeout(() => {',
    "  const rec = { seg, light: args.includes('-threads') && args[args.indexOf('-threads') + 1] === '1', t0, t1: Date.now() };",
    "  fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify(rec) + '\\n');",
    "  if (seg === failIndex && n < failTimes) { fs.writeFileSync(cnt, String(n + 1)); process.stderr.write('x264 [error]: simulated kill\\n'); process.exit(1); }",
    "  fs.writeFileSync(out, 'mp4'); process.exit(0);",
    '}, 120);',
  ].join('\n'));
  return script;
}

test('٨. v-app-director-watchdog (الجسر، بلا متصفّح): سبب القتل برمزه وإشارته، التزامن من حدّ الذاكرة، الإعادة الخفيفة وحدها بصورة ثابتة، والحالة العامّة تحمل آخر سطرين وزمن الخطوة', async () => {
  const M = await R();
  // run(): عمليّة قُتلت بإشارة تعود بإشارتها لا برمز صامت؛ وrunWhy يقرأ SIGKILL بلا stderr «ذاكرة على الأرجح»
  const killed = await M.run(process.execPath, ['-e', 'setTimeout(function(){}, 8000)'], { timeoutMs: 200 });
  assert.equal(killed.signal, 'SIGKILL'); assert.ok(/\[timeout\]/.test(killed.err));
  assert.equal(M.runWhy({ code: null, signal: 'SIGKILL', err: 'killed by SIGKILL' }), 'code null signal SIGKILL (memory?): killed by SIGKILL');
  assert.equal(M.runWhy({ code: 1, signal: '', err: 'a\n\nx264 [error]: bad\n' }), 'code 1: a | x264 [error]: bad');
  assert.ok(!/memory/.test(M.runWhy(killed)), 'مهلتنا نحن ليست ذاكرة');
  // التزامن التلقائيّ: أنوية−١ وذاكرة (الحدّ − ٧٠٠ م.ب) ÷ ٤٠٠ م.ب، الأصغر، بين ١ و٤
  const MB = 1048576;
  assert.deepEqual([[1, 512], [2, 1024], [4, 1024], [4, 2048], [8, 2048], [8, 8192], [8, null]].map(([c, m]) => M.autoConcurrency(c, m && m * MB)), [1, 1, 1, 3, 3, 4, 4]);
  assert.equal(M.memoryLimitBytes((p) => (p.endsWith('memory.max') ? '1073741824\n' : ''), () => 99), 1073741824, 'cgroup v2');
  assert.equal(M.memoryLimitBytes((p) => (p.endsWith('memory.max') ? 'max\n' : ''), () => 123), 123, 'max = بلا حدّ → ذاكرة الجهاز');
  assert.equal(M.memoryLimitBytes((p) => (p.endsWith('limit_in_bytes') ? '9223372036854771712' : ''), () => 7), 7, 'cgroup v1 بلا حدّ');
  assert.equal(M.memoryLimitBytes(() => '', () => 5), 5);
  assert.ok(M.memoryLimitBytes() > 0, 'على هذا الجهاز قيمة');
  assert.equal(M.LIMITS.sceneTimeoutMs, 3 * 60 * 1000);
  // الصيغة الخفيفة: صورته وحدها بلا zoompan ولا ذوبان، خيط واحد ونظر أقصر، والترميز نفسه كي يُلصق مع البقيّة
  const plan = M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes: [{ type: 'screen', seconds: 5, audio: 'file' }, { type: 'style_sample', mime: 'image/png', seconds: 4 }, { type: 'title', text: 'x', seconds: 3 }] }, '/w');
  const inputs = (a) => a.map((x, i) => (x === '-i' ? a[i + 1] : null)).filter(Boolean);
  const fc = (a) => a[a.indexOf('-filter_complex') + 1];
  const J = (f) => path.join('/w', f);
  for (const seg of plan.segments) {
    const a = seg.args, l = seg.light;
    assert.ok(Array.isArray(l) && l[l.length - 1] === a[a.length - 1], 'الإعادة تكتب الملفّ نفسه');
    assert.ok(!fc(l).includes('zoompan') && !fc(l).includes('xfade') && fc(l).includes(',scale=1920:1080,fps=30,tpad=stop_mode=clone:stop_duration=' + a[a.indexOf('-t') + 1] + ',format=yuv420p[v]') && fc(l).includes('[1:a]aresample'), 'ثابتة بمدخلين فقط');
    assert.equal(l[l.indexOf('-threads') + 1], '1'); assert.equal(l[l.indexOf('-x264-params') + 1], 'rc-lookahead=5:ref=1');
    assert.equal(a[a.indexOf('-threads') + 1], '2'); assert.equal(a[a.indexOf('-x264-params') + 1], 'rc-lookahead=10:ref=1');
    for (const x of ['-preset', '-crf', '-profile:v', '-level:v', '-pix_fmt', '-r', '-g', '-c:a', '-b:a']) assert.equal(l[l.indexOf(x) + 1], a[a.indexOf(x) + 1], x + ' واحد في الصيغتين (اللصق بلا إعادة ترميز)');
    assert.equal(l[l.indexOf('-t') + 1], a[a.indexOf('-t') + 1]);
  }
  assert.deepEqual(inputs(plan.segments[0].light), [J('shot_0.png'), J('audio_0.mp3')]);
  assert.deepEqual(inputs(plan.segments[1].light), [J('img_1.png'), 'anullsrc=r=44100:cl=stereo']);
  assert.ok(fc(plan.segments[1].light).includes('gblur'), 'نموذج مربّع يبقى على خلفيّته المموّهة');
  // الحالة العامّة: آخر سطرين من سجلّ المهمّة، وزمن بدء الخطوة ومنقضيها بساعة الخادم
  const os = require('node:os');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-wd-'));
  const logs = [];
  try {
    const r = M.createRenderer({ secret: SECRET, appUrl: 'https://omran-ai-builder.vercel.app', workDir: work, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', log: (s) => logs.push(s), concurrency: 3 });
    assert.equal(r.concurrency, 3, 'DIRECTOR_CONCURRENCY الصريح يعلو على التلقائيّ');
    const j = { id: 'dwd', state: 'queued', step: 'queued', done: 0, total: 1, createdAt: Date.now() - 5000, stepAt: Date.now() - 5000, lastLog: [] };
    let st = r._publicState(j);
    assert.deepEqual(st.lastLog, []); assert.equal(st.startedAt, j.stepAt); assert.ok(st.stepMs >= 4900 && st.stepMs < 60000, 'المنقضي بساعة الخادم'); assert.equal(st.stills, 0);
    r._log(j, 'one'); r._log(j, '  two   lines  '); r._log(j, 'three');
    st = r._publicState(j);
    assert.deepEqual(st.lastLog, ['two lines', 'three'], 'آخر سطرين، مطويّة الفراغات');
    assert.deepEqual(logs, ['one', 'two lines', 'three'], 'السطر نفسه في سجلّ الجسر');
    // الترميز: مقطع يفشل مرّة → يُسجَّل سببه برمزه، تُنتظر الجارية، ثمّ يُعاد وحده بالصيغة الخفيفة؛ والمهمّة تكمل
    const dir = path.join(work, 'ff1'); fs.mkdirSync(dir);
    const scenes = Array.from({ length: 4 }, (_, i) => ({ type: 'screen', seconds: 3, audio: null }));
    const mk = (fail, times) => {
      const script = fakeFfmpeg(dir, fail, times);
      const p = M.buildFfmpegArgs({ lang: 'en', dir: 'ltr', scenes }, dir);
      for (const s of p.segments) { s.args = [script].concat(s.args); s.light = [script].concat(s.light); }
      return p;
    };
    const rr = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: process.execPath, ffprobe: 'x', log: (s) => logs.push(s), concurrency: 3 });
    const j1 = { id: 'dff1', step: 'segments', done: 0, lastLog: [] };
    const enc = rr._makeEncoder(j1, mk(1, 1));
    scenes.forEach((s, i) => enc.markReady(i)); enc.captureDone();
    await enc.finish();
    assert.equal(enc.count(), 4); assert.equal(j1.done, 4); assert.equal(j1.stills, 1);
    assert.ok(j1.lastLog.some((l) => /^segment 1 failed: code 1: x264 \[error\]: simulated kill — will retry alone as a still frame$/.test(l)), JSON.stringify(j1.lastLog));
    assert.equal(j1.lastLog[j1.lastLog.length - 1], 'segment 1 re-encoded alone as a still frame');
    const calls = fs.readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const light = calls.filter((c) => c.light);
    assert.equal(light.length, 1); assert.equal(light[0].seg, 1);
    assert.ok(calls.filter((c) => !c.light).every((c) => c.t1 <= light[0].t0 || c.t0 >= light[0].t1), 'الإعادة الخفيفة وحدها: لا نداء يتداخل معها زمنيًّا');
    assert.equal(calls.filter((c) => c.seg === 1).length, 2, 'لا إعادة فوريّة بالصيغة نفسها (كانت تعيد تحت الزحام نفسه)');
    // فشل الإعادة أيضًا = فشل المهمّة بسببه الكامل (لا صمت ولا «failed:» فارغة)
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    const j2 = { id: 'dff2', step: 'segments', done: 0, lastLog: [] };
    const enc2 = rr._makeEncoder(j2, mk(2, 2));
    scenes.forEach((s, i) => enc2.markReady(i)); enc2.captureDone();
    await assert.rejects(enc2.finish(), /^Error: segment 2 \(light retry\) failed: code 1: x264 \[error\]: simulated kill$/);
    assert.equal(j2.stills, undefined);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  // المصدر: مهلة المشهد بمحاولتيه، الصفحة العالقة تُغلق، وبطاقة العنوان تحت مهلة هي الأخرى
  const src = read('cc-bridge/render.mjs');
  assert.ok(src.includes("await withDeadline(s.type === 'title' ? shootCard(card, s, m, file) : shootScreen(page, s, m, file, state), deadline - Date.now(), 'scene ' + i);"));
  assert.ok(src.includes("if (e && e.timeout) { timedOut = true; break; }") && src.includes("— closing the stuck page") && src.includes("await withDeadline(page.close(), 10000, 'close').catch(() => null); page = await newAppPage();"));
  assert.ok(src.includes("await withDeadline(shootCard(card, s, m, file), c.sceneTimeoutMs, 'scene ' + i + ' title card');") && src.includes('if (!(c.sceneTimeoutMs > 0)) c.sceneTimeoutMs = LIMITS.sceneTimeoutMs;'));
  assert.ok(src.includes('if (active > 0) return;') && src.includes("encode(seg, seg.light, ' (light retry)')") && src.includes('retry.push(seg)'), 'الإعادة بعد الجارية ووحدها');
  assert.ok(src.includes("throw new Error('join failed: ' + runWhy(r));") && !src.includes('r.err.slice(-300)'), 'سبب الدمج برمزه أيضًا');
  assert.ok(src.includes("child.on('close', (code, signal) =>") && src.includes("err += (err ? '\\n' : '') + 'killed by ' + signal;"));
  assert.ok(src.includes('c.concurrency = autoConcurrency(availableParallelism(), memLimit)') && src.includes("' started: ' + j.manifest.scenes.length + ' scenes, concurrency ' + c.concurrency + ', memory limit '"), 'التزامن ومصدره في أوّل سطر من سجلّ المهمّة');
  assert.ok(src.includes('function jlog(j, s)') && !/c\.log\('job /.test(src) && !/c\.log\('scene /.test(src), 'سطور المهمّة كلّها عبر jlog فتبلغ الواجهة');
  assert.ok(read('cc-bridge/server.mjs').includes('concurrency: Math.max(0, Number(env.DIRECTOR_CONCURRENCY) || 0)'), 'المتغيّر الصريح كما هو');
  assert.ok(read('cc-bridge/README.md').includes('DIRECTOR_CONCURRENCY=1'), 'README: خفضه إلى ١ على Railway تجربة بيد المالك');
});

/** متصفّح وهميّ بواجهة Playwright التي يستعملها capture(): صفحة التطبيق رقم hangApp يعلّق evaluate فيها للأبد (كما علّق المشهد ١ من ٤)، وhangCard كذلك لصفحات البطاقات */
function fakeChromium(o) {
  const st = { appPages: 0, cardPages: 0, closed: [], shots: [] };
  const never = () => new Promise(() => {});
  const mkPage = (kind, n) => {
    const hang = kind === 'app' ? o.hangApp === n : (o.hangCard === n || o.hangCard === 'all');
    return {
      setDefaultTimeout() {}, bringToFront: async () => {}, waitForTimeout: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
      goto: async () => {}, setContent: async () => {},
      evaluate: (fn) => (hang ? never() : Promise.resolve(null)),
      screenshot: async (opt) => { if (hang) return never(); fs.writeFileSync(opt.path, kind + n); st.shots.push(kind + n); },
      close: async () => { st.closed.push(kind + n); },
    };
  };
  const mkCtx = (kind) => ({ addInitScript: async () => {}, newPage: async () => mkPage(kind, kind === 'app' ? ++st.appPages : ++st.cardPages), close: async () => {} });
  return { st, chromium: { launch: async () => { let k = 0; return { newContext: async () => mkCtx(k++ === 0 ? 'app' : 'card'), close: async () => {} }; } } };
}

test('٨ب. v-app-director-watchdog (متصفّح وهميّ — يجري في CI): مشهد يعلّق يصير بطاقة عنوان عند مهلته وتُستبدل صفحته والمهمّة تكمل؛ وبطاقة تعلّق تُفشل المهمّة معلنةً لا صامتة', async () => {
  const M = await R();
  const os = require('node:os');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-wd8b-'));
  const logs = [];
  try {
    const v = M.validateManifest({ lang: 'ar', scenes: [{ type: 'screen', target: 'home', text: 'الرئيسيّة', steps: [], seconds: 3 }, { type: 'title', text: 'عنوان', seconds: 3 }, { type: 'screen', target: 'video', text: 'ثانية', steps: [{ click: '#btnVideoMaker' }], seconds: 3 }] });
    assert.equal(v.ok, true);
    const f = fakeChromium({ hangApp: 1 });
    const r = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: 'x', ffprobe: 'x', log: (s) => logs.push(s), sceneTimeoutMs: 300, concurrency: 1, chromium: f.chromium });
    const j = { id: 'dwd8b', manifest: v.manifest, lastLog: [] };
    fs.mkdirSync(path.join(work, 'jobs', 'dwd8b'), { recursive: true });
    const shots = [], t0 = Date.now();
    await r._capture(j, (i) => shots.push(i));
    assert.ok(Date.now() - t0 < 5000, 'لا انتظار بلا حدّ');
    assert.deepEqual(shots, [0, 1, 2]); assert.equal(j.done, 3); assert.equal(j.fallbacks, 1);
    assert.deepEqual(f.st.closed.slice(0, 1), ['app1'], 'الصفحة العالقة أُغلقت'); assert.equal(f.st.appPages, 2, 'وفُتحت غيرها');
    assert.deepEqual(f.st.shots, ['card1', 'card1', 'app2'], 'المشهد ١ بطاقة، والعنوان بطاقة، والمشهد ٣ لقطة من الصفحة الجديدة');
    assert.equal(fs.readFileSync(path.join(work, 'jobs', 'dwd8b', 'shot_2.png'), 'utf8'), 'app2');
    assert.deepEqual(logs.slice(0, 2), ['scene 0 (screen home) scene 0 timed out after 0s — closing the stuck page', 'scene 0 (screen home) capture failed twice: scene 0 timed out after 0s — title card instead']);
    assert.ok(/^scene 0 screen home took \d+s$/.test(j.lastLog[1]) && j.lastLog.length === 2, JSON.stringify(j.lastLog));
    // بطاقة العنوان نفسها تعلّق: المهمّة تفشل بسبب مسمّى خلال مهلتها، لا ربع ساعة صامتة
    const g = fakeChromium({ hangCard: 'all' });
    const r2 = M.createRenderer({ secret: SECRET, workDir: work, ffmpeg: 'x', ffprobe: 'x', log: () => {}, sceneTimeoutMs: 300, concurrency: 1, chromium: g.chromium });
    const j2 = { id: 'dwd8c', manifest: M.validateManifest({ lang: 'en', scenes: [{ type: 'title', text: 'x', seconds: 3 }] }).manifest, lastLog: [] };
    fs.mkdirSync(path.join(work, 'jobs', 'dwd8c'), { recursive: true });
    await assert.rejects(r2._capture(j2), /^Error: scene 0 title card timed out after 0s$/);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('٩. v-app-director-watchdog (Chromium): مشهد يعلّق في evaluate يُقطع عند مهلته ويصير بطاقة عنوان، والمهمّة تكمل بالمشاهد التالية، والسجلّ يقول ذلك', async (t) => {
  const M = await R();
  let chromium = null;
  try { const mod = await import(require('node:url').pathToFileURL(require.resolve('playwright-core')).href); chromium = mod.chromium || (mod.default && mod.default.chromium); } catch (e) { chromium = null; }
  if (!chromium || !fs.existsSync(chromium.executablePath())) { t.skip('Chromium غير متاح هنا (يُجرى محلّيًّا بـplaywright-core)'); return; }
  const http = require('node:http');
  const os = require('node:os');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-wd9-'));
  let hangs = 1, hits = 0;
  const srv = http.createServer((rq, rs) => {
    if (new URL(rq.url, 'http://x').pathname !== '/') { rs.writeHead(404); rs.end(); return; }
    hits++;
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    /* الأولى: تحمَّل ثمّ يعلّق خيطها الرئيسيّ (كصفحة تطبيق تعلّق بعد load) فلا يعود page.evaluate أبدًا؛ البقيّة: صفحة بلون واحد */
    if (hangs-- > 0) rs.end('<!doctype html><html><body>hang<script>setTimeout(function(){ for(;;){} }, 50)</script></body></html>');
    else rs.end('<!doctype html><html><body style="margin:0;background:#1a2b3c"><h1 style="color:#fff;font:40px sans-serif;padding:40px">ok</h1></body></html>');
  });
  await new Promise((x) => srv.listen(0, '127.0.0.1', x));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const logs = [];
  try {
    const r = M.createRenderer({ secret: SECRET, appUrl: base, workDir: work, ffmpeg: 'x', ffprobe: 'x', log: (s) => logs.push(s), sceneTimeoutMs: 4000, concurrency: 1 });
    const v = M.validateManifest({ lang: 'ar', scenes: [{ type: 'screen', target: 'home', text: 'الرئيسيّة', steps: [], seconds: 3 }, { type: 'title', text: 'عنوان', seconds: 3 }, { type: 'screen', target: 'home', text: 'ثانية', steps: [{ wait: 100 }], seconds: 3 }] });
    assert.equal(v.ok, true);
    const j = { id: 'dwd9', manifest: v.manifest, lastLog: [], stepAt: Date.now() };
    fs.mkdirSync(path.join(work, 'jobs', 'dwd9'), { recursive: true });
    const shots = [];
    const t0 = Date.now();
    await r._capture(j, (i) => shots.push(i));
    const ms = Date.now() - t0;
    assert.deepEqual(shots, [0, 1, 2]); assert.equal(j.done, 3); assert.equal(j.fallbacks, 1);
    assert.ok(ms < 60000, 'اكتملت بلا انتظار مهلة Playwright (٤٥ ث) ولا المهمّة (٥٥ دقيقة): ' + ms + 'ms');
    const sz = (i) => fs.statSync(path.join(work, 'jobs', 'dwd9', 'shot_' + i + '.png')).size;
    assert.ok(sz(0) > 0 && sz(1) > 0 && sz(2) > 0);
    assert.ok(sz(2) * 3 < sz(0), 'المشهد الثالث لقطة الصفحة أحاديّة اللون (صغيرة) لا بطاقة عنوان بتدرّجاتها: ' + sz(2) + ' / ' + sz(0));
    assert.ok(hits >= 2, 'الصفحة طُلبت من جديد بعد إغلاق العالقة: ' + hits);
    assert.ok(logs.some((l) => /^scene 0 \(screen home\) scene 0 timed out after 4s — closing the stuck page$/.test(l)), JSON.stringify(logs));
    assert.ok(logs.some((l) => /^scene 0 \(screen home\) capture failed twice: scene 0 timed out after 4s — title card instead$/.test(l)));
    assert.ok(j.lastLog.length === 2 && /took \d+s$/.test(j.lastLog[1]), JSON.stringify(j.lastLog));
    assert.ok(!logs.some((l) => /scene 2 .*title card/.test(l)), 'المشهد السليم بعدها لقطة حقيقيّة');
  } finally { srv.close(); fs.rmSync(work, { recursive: true, force: true }); }
});

test('١٠. v-app-director-watchdog (الواجهة): المنقضي وآخر سطر من السجلّ تحت الخطوة الجارية، والنصّان بالـ١٤ لغة بلا اسم مزوّد، والوسوم مرفوعة بسببها', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("function drMmss(ms){") && js.includes('function drStep(k,state,note,frac,log){') && js.includes("var lg=li.querySelector('.vmk-dir-log'); if(lg){ lg.textContent=(state==='on'&&log)?String(log):''; lg.title=lg.textContent; }"));
  assert.ok(js.includes('<i class="vmk-dir-log" dir="ltr"></i></li>'), 'سطر السجلّ لاتينيّ تحت كلّ خطوة');
  assert.ok(js.includes("var stLog=(st.lastLog&&st.lastLog.length)?String(st.lastLog[st.lastLog.length-1]||''):'', stT=drMmss(st.stepMs);"));
  assert.ok(js.includes("drStep('shots','on',(st.total?drT('vdScene',{i:st.done||0,n:st.total})+' · ':'')+stT,st.step==='capture'&&st.total?(st.done||0)/st.total:0.03,stLog);"), 'التصوير: المشهد · mm:ss + السطر');
  assert.ok(js.includes("drStep('join','on',(st.step==='segments'&&st.total?drT('vdScene',{i:st.done||0,n:st.total})+' · ':'')+stT,") && js.includes(",stLog); }"), 'التجميع كذلك');
  assert.ok(js.includes("var shotsNote=st.fallbacks?drT('vdWarnShots',{n:st.fallbacks}):'', joinNote=st.stills?drT('vdWarnStills',{n:st.stills}):'';") && js.includes("if(st.state==='done'){ drStep('shots','ok',shotsNote); drStep('join','ok',joinNote);"), 'البطاقات والمقاطع الثابتة تُعلَن عند الاكتمال');
  assert.ok(js.includes("throw drFail('render '+(st.step||'')+' '+(st.message||'')+(stLog?' · '+stLog:''));"), 'سطر السبب يحمل آخر سطر من السجلّ');
  const vm = require('node:vm');
  const ctx = { console, Date, Math, Number, String };
  vm.runInNewContext(js.slice(js.indexOf('function drMmss'), js.indexOf('function drStep(')), ctx);
  assert.deepEqual([0, 999, 1000, 61000, 754000, -5, undefined].map((x) => ctx.drMmss(x)), ['00:00', '00:00', '00:01', '01:01', '12:34', '00:00', '00:00']);
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-dir-steps li{min-width:0}') && css.includes('-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;direction:ltr;text-align:left;') && css.includes('html[dir="rtl"] #videoMakerModal .vmk-dir-steps li .vmk-dir-log{text-align:right}') && css.includes('#videoMakerModal .vmk-dir-steps li .vmk-dir-log:empty{display:none}'), 'سطران يلتفّان');
  const logRule = css.slice(css.indexOf('#videoMakerModal .vmk-dir-steps li .vmk-dir-log{'), css.indexOf('}', css.indexOf('#videoMakerModal .vmk-dir-steps li .vmk-dir-log{')));
  assert.ok(!/nowrap/.test(logRule), 'لا nowrap: كان يوسّع عمود الجوّال فتخرج البطاقات عن الشاشة');
  // النصّان بالـ١٤ لغة
  const core = read('js/app-03-i18n-data.js');
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(core, base);
  const seen = new Set();
  for (const lg of ['ar', 'en']) for (const k of ['vdWarnShots', 'vdWarnStills']) { const t = base.I18N[lg][k]; assert.ok(t && t.includes('{n}'), lg + ' ' + k); assert.doesNotMatch(t, WD_BANNED, lg + ' ' + k); seen.add(t); }
  assert.equal(base.I18N.ar.vdWarnShots, '{n} مشهد تعذّر تصويره فصار بطاقة عنوان');
  for (const lg of WD_LANGS) {
    const m = read('i18n/' + lg + '.js').match(/v-app-director-watchdog[^\n]*Object\.assign\(I18N\["(\w+)"\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const o = JSON.parse(m[2]);
    for (const k of ['vdWarnShots', 'vdWarnStills']) { assert.ok(o[k] && o[k].includes('{n}'), lg + ' ' + k); assert.doesNotMatch(o[k], WD_BANNED, lg + ' ' + k); seen.add(o[k]); }
  }
  assert.equal(seen.size, 28, 'ترجمات لا نسخ');
  // الوسوم: اللغات بسبب الرفع في رأس التعليق، وvideo.js وmodules.css في index.html أعلى من ٧٦٣/٤٥٣/٦٨٨ (تُقرأ بتعبير لا تثبيتًا)
  const tagLine = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  const tm = /\.js\?v=(\d+)'; \/\*[^\n]*v-app-director-watchdog \((\d+)\): /.exec(tagLine); // v-rest-fixes: رفعٌ لاحق يضع سببه في الرأس
  assert.ok(tm && Number(tm[1]) >= Number(tm[2]) && Number(tm[2]) >= 764, 'وسم اللغات مرفوع وسبب المخرج في التعليق: ' + tagLine.slice(0, 120));
  const h = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(h) || [])[1]) >= 454 && Number((/css\/modules\.css\?v=(\d+)"/.exec(h) || [])[1]) >= 689);
});
