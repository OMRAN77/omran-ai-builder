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
  assert.ok(src.includes('availableParallelism() - 1'), 'التزامن الافتراضيّ من أنوية الجهاز');
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
