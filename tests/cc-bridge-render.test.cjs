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

test('٣. buildFfmpegArgs: مشهد شاشة/نموذج/عنوان بـzoompan يتبدّل اتّجاهه، صوته عليه أو صمت، ثمّ xfade+acrossfade و1080p30 H.264+AAC', async () => {
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
  const a0 = plan.segments[0].args, a1 = plan.segments[1].args, a2 = plan.segments[2].args, a3 = plan.segments[3].args;
  assert.ok(a0.includes(J('shot_0.png')) && a0.includes(J('audio_0.mp3')) && a0[a0.length - 1] === J('seg_0.mp4'));
  assert.ok(a2.includes(J('img_2.jpg')) && a2.includes('anullsrc=r=44100:cl=stereo'), 'نموذج النمط صورة jpg بلا صوت → صمت');
  const fc = (a) => a[a.indexOf('-filter_complex') + 1];
  assert.ok(fc(a0).includes("zoompan=z='1+0.08*on/120'") && fc(a0).includes(':d=120:s=1920x1080:fps=30'), 'تقريب للداخل: ١٢٠ إطارًا لـ٤ ثوانٍ');
  assert.ok(fc(a1).includes("z='1.08-0.08*on/195'"), 'المشهد الثاني يبتعد');
  assert.ok(fc(a2).includes("x='(iw-iw/zoom)*on/150'") && fc(a2).includes('gblur=sigma=40') && fc(a2).includes('overlay=(W-w)/2:(H-h)/2'), 'الثالث تحريك جانبيّ، والصورة المربّعة على خلفيّة مموّهة');
  assert.ok(fc(a3).includes("x='(iw-iw/zoom)*(1-on/210)'"), 'الرابع يعود');
  assert.ok(fc(a0).includes('scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440') && fc(a0).includes('[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]'));
  for (const a of [a0, a1, a2, a3]) {
    assert.equal(a[a.indexOf('-t') + 1], Number(manifest.scenes[[a0, a1, a2, a3].indexOf(a)].seconds).toFixed(3), 'مدّة المقطع بالضبط');
    for (const x of ['libx264', 'yuv420p', 'aac', '+faststart', '-map', '[v]', '[a]']) assert.ok(a.includes(x), x);
    assert.equal(a[a.indexOf('-r') + 1], '30');
  }
  const j = plan.join.args, jf = fc(j);
  assert.equal((j.filter((x) => x === '-i')).length, 4);
  assert.ok(jf.includes('[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3.500[v1]'), 'الانتقال الأوّل بعد ٤ − ٠٫٥');
  assert.ok(jf.includes('[v1][2:v]xfade=transition=fade:duration=0.5:offset=9.500[v2]'), 'الإزاحة تراكميّة ناقص الانتقالات');
  assert.ok(jf.includes('[v2][3:v]xfade=transition=fade:duration=0.5:offset=14.000[vout]'));
  assert.ok(jf.includes('[0:a][1:a]acrossfade=d=0.5:c1=tri:c2=tri[a1]') && jf.includes('[a2][3:a]acrossfade=d=0.5:c1=tri:c2=tri[aout]'));
  assert.ok(j.includes('[vout]') && j.includes('[aout]') && j.includes('libx264') && j.includes('aac') && j[j.length - 1] === J('video.mp4'));
  assert.equal(plan.total, 4 + 6.5 + 5 + 7 - 1.5);
  assert.ok(plan.concat.args.includes('concat') && plan.concat.args.includes(J('concat.txt')), 'احتياط اللصق المباشر');
  const one = M.buildFfmpegArgs({ lang: 'en', dir: 'ltr', scenes: [{ type: 'title', text: 'x', seconds: 3 }] }, '/w');
  assert.ok(one.join.args.includes('copy') && !one.join.args.includes('-filter_complex'), 'مشهد واحد = نسخ بلا دمج');
  // الانزلاق باتّجاه القراءة كلّ ثالث مشهد (بعيدًا عن بطاقات العناوين)
  const six = M.buildFfmpegArgs({ lang: 'en', dir: 'ltr', scenes: Array.from({ length: 6 }, (_, i) => ({ type: 'screen', seconds: 5 })) }, '/w');
  assert.ok(fc(six.join.args).includes('xfade=transition=smoothleft') && M.buildFfmpegArgs({ lang: 'ar', dir: 'rtl', scenes: six.segments.map(() => ({ type: 'screen', seconds: 5 })) }, '/w').join.args.join(' ').includes('smoothright'));
  // مدّة المشهد = مدّة صوته + نصف ثانية، محصورة
  assert.equal(M.resolveSeconds({ seconds: 8 }, 6.2), 6.7);
  assert.equal(M.resolveSeconds({ seconds: 8 }, 0), 8);
  assert.equal(M.resolveSeconds({}, 0.4), M.LIMITS.minSec);
  assert.equal(M.resolveSeconds({}, 100), M.LIMITS.maxSec);
});

test('٤. بطاقة العنوان صفحة بخطّ عربيّ (لا drawtext)، وتنظيف المنبثقات، ودوالّ الصفحة دوالّ حقيقيّة لا نصوص (Playwright لا ينادي نصًّا بمعطى)', async () => {
  const M = await R();
  const html = M.titleCardHtml({ text: 'عمران <AI>', sub: 'جولة', dir: 'rtl', lang: 'ar' });
  assert.ok(html.includes('dir="rtl"') && html.includes('عمران &lt;AI&gt;') && html.includes('Tajawal') && html.includes('width:1920px;height:1080px'));
  assert.ok(!/drawtext=/.test(read('cc-bridge/render.mjs')), 'النصّ العربيّ يُرسم في المتصفّح لا بمرشّح drawtext');
  assert.equal(typeof M.cleanPage, 'function'); assert.equal(typeof M.addCaption, 'function'); assert.equal(typeof M.focusRect, 'function');
  const src = read('cc-bridge/render.mjs');
  assert.ok(src.includes('page.evaluate(cleanPage)') && src.includes('page.evaluate(addCaption, [') && src.includes('page.evaluate(focusRect, fc.focus)'));
  assert.ok(src.includes("viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: VIEW_SCALE, colorScheme: 'dark'") && M.VIEW_W === 1280 && M.VIEW_SCALE === 3, 'التصوير ١٢٨٠×٧٢٠ ×٣ بالثيم الداكن');
  assert.ok(src.includes("localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg);"), 'بلا مقدّمة ولا إشعار خصوصيّة وباللغة المطلوبة');
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
  assert.ok(/python3 python3-pip ffmpeg fonts-noto-core/.test(docker) && docker.includes('COPY policy.mjs git.mjs watch.mjs render.mjs server.mjs entrypoint.sh ./'));
  const pol = read('cc-bridge/policy.mjs');
  assert.ok(!/render/.test(pol), 'سياج أدوات Claude Code لم يُلمس');
  assert.ok(!/console\.log\([^)]*(token|secret)/i.test(read('cc-bridge/render.mjs')), 'لا رمز ولا سرّ في السجلّ');
  const readme = read('cc-bridge/README.md');
  assert.ok(readme.includes('DIRECTOR_APP_URL') && readme.includes('/render'));
});
