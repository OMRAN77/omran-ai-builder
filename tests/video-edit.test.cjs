// v-video-edit (طلب عمران «كتابة وصوت على الفيديو — في المحادثة ومع الفيديوات»):
// المحرّر يبني أوامر ffmpeg.wasm من دوالّ خالصة — نختبرها هنا، ومعها مقاطع /api/stt الزمنيّة.
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const V = require('../js/video-edit.js');

// ── أبعاد المخرج: الضلع القصير ≤٧٢٠ (أو ١٠٨٠ بالجودة العالية)، بلا تكبير، وأعداد زوجيّة ──
assert.deepEqual(V.outDims(1080, 1920, false), { w: 720, h: 1280 });
assert.deepEqual(V.outDims(1080, 1920, true), { w: 1080, h: 1920 });
assert.deepEqual(V.outDims(3840, 2160, false), { w: 1280, h: 720 });
assert.deepEqual(V.outDims(640, 360, false), { w: 640, h: 360 }, 'لا تكبير');
assert.deepEqual(V.outDims(0, 0, false), { w: 720, h: 1280 }, 'أبعاد مجهولة = عموديّ');
{ const d = V.outDims(721, 1283, false); assert.equal(d.w % 2, 0); assert.equal(d.h % 2, 0); }

// ── قراءة سجلّ ffmpeg ──
{
  const log = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':",
    '  Duration: 00:01:05.50, start: 0.000000, bitrate: 3209 kb/s',
    '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1080x1920 [SAR 1:1 DAR 9:16], 3000 kb/s, 59.94 fps, 60 tbr',
    '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s',
  ].join('\n');
  const p = V.parseProbe(log);
  assert.equal(p.dur, 65.5); assert.equal(p.vcodec, 'h264'); assert.equal(p.w, 1080); assert.equal(p.h, 1920);
  assert.equal(p.fps, 59.94); assert.equal(p.hasAudio, true);
  assert.equal(V.parseProbe('Duration: 00:00:04.00\n  Stream #0:0: Video: vp9, yuv420p, 640x360, 30 fps').hasAudio, false);
}

// ── لفّ الأسطر والتخطيط (قياس وهميّ: ١٠ بكسل لكلّ حرف) ──
const meas = (s, px) => String(s).length * px * 0.5;
assert.deepEqual(V.wrapLines('aaa bbb ccc', 75, (s) => s.length * 10), ['aaa bbb', 'ccc']);
assert.deepEqual(V.wrapLines('سطر\nثاني', 1000, (s) => s.length), ['سطر', 'ثاني'], 'السطر الجديد يُحترم');
assert.equal(V.wrapLines('a b c d e f g h i j', 1, (s) => s.length * 10, 3).length, 3, 'حدّ الأسطر');
{
  const it = { text: 'مرحبا بكم في التجربة', pos: 'bottom', size: 'm', color: '#ffffff', box: true };
  const L = V.layoutItem(it, 720, 1280, meas);
  assert.ok(L.y + L.h <= 1280 && L.y > 1280 / 2, 'تحت داخل الإطار');
  assert.equal(L.x % 2, 0); assert.equal(L.y % 2, 0); assert.equal(L.w % 2, 0); assert.equal(L.h % 2, 0);
  const top = V.layoutItem(Object.assign({}, it, { pos: 'top' }), 720, 1280, meas);
  assert.ok(top.y < 1280 * 0.2, 'فوق');
  const big = V.layoutItem(Object.assign({}, it, { text: 'ك'.repeat(200) }), 720, 1280, meas);
  assert.ok(big.w <= 720 && big.fs < V.fontPx('m', 720, 1280), 'كلمة طويلة تصغّر الخطّ ولا تخرج');
  assert.equal(V.layoutItem(Object.assign({}, it, { text: '   ' }), 720, 1280, meas), null);
}
assert.equal(V.isRtl('مرحبا'), true); assert.equal(V.isRtl('hello'), false);

// ── v2: المكان الحرّ بالسحب (px/py مركز نسبيّ) — داخل الإطار دائمًا ──
{
  const it = { text: 'مرحبا بكم', size: 'm', color: '#ffffff', box: true };
  const c = V.layoutItem(Object.assign({}, it, { px: 0.5, py: 0.5 }), 720, 1280, meas);
  assert.ok(Math.abs(c.x + c.w / 2 - 360) <= 2 && Math.abs(c.y + c.h / 2 - 640) <= 2, 'المركز حيث سُحب');
  const tl = V.layoutItem(Object.assign({}, it, { px: 0, py: 0 }), 720, 1280, meas);
  assert.equal(tl.x, 0); assert.equal(tl.y, 0);
  const br = V.layoutItem(Object.assign({}, it, { px: 1, py: 1 }), 720, 1280, meas);
  assert.equal(br.x + br.w, 720); assert.equal(br.y + br.h, 1280);
  const q = V.layoutItem(Object.assign({}, it, { px: 0.3, py: 0.2 }), 720, 1280, meas);
  assert.equal(q.x % 2, 0); assert.equal(q.y % 2, 0);
  // بلا px/py: يرجع لـpos (الترجمة التلقائيّة تحت)
  assert.ok(V.layoutItem(Object.assign({}, it, { pos: 'bottom' }), 720, 1280, meas).y > 640);
}

// ── v2: خطوط التطبيق نفسها، والزخرفيّة بسطر أطول ──
{
  const ids = V.FONTS.map((f) => f.id);
  ['default', 'tajawal', 'cairo', 'almarai', 'readex', 'notokufi', 'vazir', 'messiri', 'kufi', 'naskh', 'naskh2', 'thuluth', 'farsi', 'diwani', 'ruqaa', 'quran']
    .forEach((id) => assert.ok(ids.includes(id), 'خط ' + id));
  assert.equal(V.fontById('thuluth').url, '/assets/fonts/tholoth.woff2');
  assert.equal(V.fontById('diwani').url, '/assets/fonts/ukij-diwani-tom.woff2');
  assert.equal(V.fontById('nope').id, 'default');
  assert.ok(V.fontCss(40, 'farsi').startsWith('400 40px "Gulzar"'), 'الخطوط ذات الوزن الواحد ٤٠٠');
  assert.ok(V.fontCss(40, 'cairo').startsWith('700 40px "Cairo"'));
  // كلّ خطّ في app-19-fonts موجود هنا
  const app = fs.readFileSync(path.join(root, 'js/app-19-fonts.js'), 'utf8');
  const fams = [...app.matchAll(/\{id:'[^']+'[^\n]*?family:"'([^']+)'"/g)].map((m) => m[1]);
  assert.ok(fams.length >= 16);
  fams.forEach((fam) => assert.ok(V.FONTS.some((f) => f.fam === fam), 'الخط ' + fam));
  const it = { text: 'سطر أول\nسطر ثاني', size: 'm', color: '#ffffff', box: true };
  assert.ok(V.layoutItem(Object.assign({ font: 'farsi' }, it), 720, 1280, meas).h > V.layoutItem(it, 720, 1280, meas).h, 'الفارسي أطول سطرًا');
  let gotFont = '';
  V.layoutItem(Object.assign({ font: 'ruqaa' }, it), 720, 1280, (s, px, f) => { gotFont = f; return s.length * px * 0.5; });
  assert.equal(gotFont, 'ruqaa', 'القياس بالخط المختار');
}

// ── v2: مناطق الكتابة القديمة → بكسلات زوجيّة داخل الإطار (المسح بهامش ٢) ──
{
  const e = V.regionPx({ x: 0, y: 0, w: 1, h: 0.1, kind: 'erase' }, 720, 1280);
  assert.ok(e.x >= 2 && e.y >= 2 && e.x + e.w <= 718 && e.y + e.h <= 1278, 'delogo داخل الإطار');
  const c = V.regionPx({ x: 0, y: 0.9, w: 1, h: 0.2, kind: 'color' }, 720, 1280);
  assert.equal(c.x, 0); assert.equal(c.w, 720); assert.ok(c.y + c.h <= 1280);
  const o = V.regionPx({ x: 0.3333, y: 0.4141, w: 0.2222, h: 0.0533, kind: 'blur' }, 720, 1280);
  [o.x, o.y, o.w, o.h].forEach((n) => assert.equal(n % 2, 0));
  const tiny = V.regionPx({ x: 0.999, y: 0.999, w: 0, h: 0, kind: 'erase' }, 720, 1280);
  assert.ok(tiny.w >= 4 && tiny.h >= 4 && tiny.x + tiny.w <= 718 && tiny.y + tiny.h <= 1278);
  assert.equal(V.hexColor('#a1b2c3'), '0xA1B2C3'); assert.equal(V.hexColor('red;x'), 'black');
}

// ── مقاطع Whisper → أسطر ترجمة ──
{
  const rows = V.segToTexts([
    { start: 0.2, end: 2.4, text: ' السلام عليكم ' },
    { start: 3, end: 9, text: 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12' },
    { start: 5, end: 6, text: '   ' },
    { start: 200, end: 202, text: 'بعد الحدّ' },
  ], 180);
  assert.equal(rows[0].text, 'السلام عليكم'); assert.equal(rows[0].a, 0.2); assert.equal(rows[0].b, 2.4);
  assert.equal(rows.length, 3, 'المقطع الطويل قُسم لسطرين والفارغ وما بعد الحدّ سقطا');
  assert.equal(rows[1].a, 3); assert.equal(rows[2].b, 9); assert.ok(rows[1].b === rows[2].a);
  assert.ok(V.segToTexts(Array.from({ length: 100 }, (_, i) => ({ start: i, end: i + 1, text: 'x' + i })), 180).length <= V.MAX_TEXTS);
}

// ── أوامر ffmpeg ──
const has = (a, ...seq) => a.join('\u0001').includes(seq.join('\u0001'));
{
  const a = V.buildArgs({ inName: 'in.mp4', dur: 12, W: 720, H: 1280, fps: 60, overlays: [{ name: 't0.png', x: 20, y: 1000, a: 0, b: 2.5 }, { name: 't1.png', x: 40, y: 80, a: 1, b: 12 }],
    audio: null, hasAudio: true, copyVideo: false, out: 'out.mp4' });
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.ok(fc.startsWith('[0:v]scale=720:1280,setsar=1,fps=30[v0]'), '٦٠ إطارًا → ٣٠ للسرعة');
  assert.ok(fc.includes("[v0][1:v]overlay=20:1000:enable='between(t,0,2.5)'[v1]"));
  assert.ok(fc.includes("[v1][2:v]overlay=40:80:enable='between(t,1,12)'[v2]"));
  assert.ok(fc.endsWith('[v2]format=yuv420p[vout]'));
  assert.ok(has(a, '-map', '[vout]') && has(a, '-map', '0:a?') && has(a, '-c:v', 'libx264') && has(a, '-c:a', 'aac'));
  assert.ok(has(a, '-t', '12') && a[a.length - 1] === 'out.mp4' && has(a, '-movflags', '+faststart'));
}
{
  const a = V.buildArgs({ inName: 'in.mov', dur: 400, W: 720, H: 1280, overlays: [], audio: { name: 'add.mp3', mode: 'replace', loop: true, vol: 0.8 },
    hasAudio: true, copyVideo: true, vcodec: 'hevc', out: 'out.mp4' });
  assert.ok(has(a, '-stream_loop', '-1', '-i', 'add.mp3'), 'التكرار قبل مدخل الصوت');
  assert.ok(has(a, '-filter_complex', '[1:a]volume=0.8[aout]'));
  assert.ok(has(a, '-map', '0:v:0') && has(a, '-map', '[aout]') && has(a, '-c:v', 'copy') && has(a, '-tag:v', 'hvc1'));
  assert.ok(has(a, '-t', '180'), 'أطول من ٣ دقائق = أوّل ٣ دقائق');
  assert.ok(!a.includes('0:a?'));
}
{
  const a = V.buildArgs({ inName: 'in.mp4', dur: 8, W: 720, H: 1280, overlays: [], audio: { name: 'add.m4a', mode: 'mix', loop: false, vol: 0.45, origVol: 1 },
    hasAudio: true, copyVideo: true, vcodec: 'h264' });
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.equal(fc, '[0:a]volume=1[a0];[1:a]volume=0.45[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]');
  assert.ok(!a.includes('-stream_loop'));
  const noA = V.buildArgs({ inName: 'in.mp4', dur: 8, W: 720, H: 1280, overlays: [], audio: { name: 'add.mp3', mode: 'mix', vol: 0.5 }, hasAudio: false, copyVideo: true });
  assert.ok(noA[noA.indexOf('-filter_complex') + 1] === '[1:a]volume=0.5[aout]', 'فيديو بلا صوت: المزج يصير استبدالًا');
  const mute = V.buildArgs({ inName: 'in.mp4', dur: 8, W: 720, H: 1280, overlays: [], audio: null, mute: true, hasAudio: true, copyVideo: true, vcodec: 'h264' });
  assert.ok(mute.includes('-an') && !mute.includes('-filter_complex') && !mute.includes('0:a?'));
}

// ── v2: الإخفاء قبل الكتابة (تُكتب الجديدة مكان القديمة)، ولا نسخ للفيديو مع مناطق ──
{
  const regions = [
    { x: 100, y: 1000, w: 520, h: 80, a: 0, b: 8, kind: 'erase' },
    { x: 40, y: 200, w: 300, h: 60, a: 1, b: 3.5, kind: 'blur' },
    { x: 0, y: 0, w: 720, h: 100, a: 0, b: 8, kind: 'color', color: '#112233' },
  ];
  const a = V.buildArgs({ inName: 'in.mp4', dur: 8, W: 720, H: 1280, fps: 30, regions, overlays: [{ name: 't0.png', x: 120, y: 1004, a: 0, b: 8 }],
    audio: null, hasAudio: true, copyVideo: true, vcodec: 'h264' });
  const fc = a[a.indexOf('-filter_complex') + 1];
  assert.ok(fc.startsWith('[0:v]scale=720:1280,setsar=1[v0];'));
  assert.ok(fc.includes("[v0]delogo=x=100:y=1000:w=520:h=80:enable='between(t,0,8)'[v1]"));
  assert.ok(fc.includes('[v1]split[v2m][v2c];[v2c]crop=300:60:40:200,gblur=sigma=20[v2b];'));
  assert.ok(fc.includes("[v2m][v2b]overlay=40:200:enable='between(t,1,3.5)'[v2]"));
  assert.ok(fc.includes("[v2]drawbox=x=0:y=0:w=720:h=100:color=0x112233:t=fill:enable='between(t,0,8)'[v3]"));
  assert.ok(fc.includes("[v3][1:v]overlay=120:1004:enable='between(t,0,8)'[v4]"), 'الكتابة بعد الإخفاء');
  assert.ok(fc.endsWith('[v4]format=yuv420p[vout]'));
  assert.ok(has(a, '-c:v', 'libx264') && !a.includes('copy'), 'المناطق تحتاج ترميزًا');
  const only = V.buildArgs({ inName: 'in.mp4', dur: 8, W: 720, H: 1280, regions: [regions[0]], overlays: [], audio: null, hasAudio: true, copyVideo: true, vcodec: 'h264' });
  assert.ok(has(only, '-map', '[vout]'), 'مسح فقط بلا كتابة يكفي للتصدير');
}

// ── الصفحة: السكربت محمَّل (الرقم لا يُثبَّت حرفيًّا) ──
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<script defer src="\/js\/video-edit\.js\?v=\d+"><\/script>/);
  const src = fs.readFileSync(path.join(root, 'js/video-edit.js'), 'utf8');
  assert.ok(src.includes("getElementById('plusToolsPopup')") && src.includes("getElementById('vmkTabs')"), 'نقطتا الدخول: المحادثة وصانع الفيديو');
  assert.ok(!/drawtext/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'الكتابة canvas لا drawtext (العربيّة)');
  assert.ok(src.includes('touch-action:none') && !/<video[^>]*\scontrols[^>]*><\/video><canvas>/.test(src), 'المعاينة تستقبل السحب (أزرار تشغيل خاصّة)');
  assert.ok(!/border(-top)?:1px solid rgba\(255,255,255/.test(src), 'بلا خطوط حدود في المحرّر');
}

// ── v3 مربّع «اختر الفيديو» بصورة المالك: النصّ HTML بالـ١٤ لغة فوق صورة بلا نصّ، والصورة ملفّ CSS يُحمَّل عند الفتح ──
{
  const L = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml'];
  assert.deepEqual(Object.keys(V.PICK).sort(), L.slice().sort(), 'الـ١٤ لغة');
  for (const l of L) { assert.equal(V.PICK[l].length, 3); assert.ok(V.PICK[l][2].includes('{n}'), 'الحدّ برقمه: ' + l); }
  for (let i = 0; i < 3; i++) assert.ok(new Set(L.map((l) => V.PICK[l][i])).size >= 13, 'ترجمات لا نسخ: ' + i);
  assert.equal(V.pickText('ar', 0, 80), 'اختر الفيديو');
  assert.equal(V.pickText('ar', 1, 80), 'اختر فيديو من جهازك');
  assert.equal(V.pickText('ar', 2, 80), 'حتى 80 ميغا');
  assert.equal(V.pickText('xx', 2, 200), 'Up to 200 MB', 'لغة مجهولة = إنجليزيّ');
  const src = fs.readFileSync(path.join(root, 'js/video-edit.js'), 'utf8');
  assert.ok(src.includes("'/css/ved-art.css?v="), 'الصورة تُحمَّل عند الفتح');
  assert.ok(src.includes('aspect-ratio:1280/585') && src.includes('container-type:inline-size'), 'مقاس صورة المالك والنصّ بعرضها');
  assert.ok(/Q\('\.ved-pick'\)\.onclick/.test(src), 'المربّع كلّه يضغط');
  const art = fs.readFileSync(path.join(root, 'css/ved-art.css'), 'utf8');
  const m = art.match(/url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\)/);
  assert.ok(m, 'WebP مضمّنة');
  const buf = Buffer.from(m[1], 'base64');
  assert.equal(buf.toString('latin1', 0, 4) + buf.toString('latin1', 8, 12), 'RIFFWEBP');
  assert.ok(buf.length > 60000 && buf.length < 260000, 'حجم معقول: ' + buf.length);
}

// ── /api/stt: segments:true يعيد المقاطع بتوقيتها، مرشّحة، بلا تصحيح LLM ──
process.env.GROQ_API_KEY = 'test-groq-key';
const usagePath = require.resolve('../api/_lib/_usage.js');
require.cache[usagePath] = { id: usagePath, filename: usagePath, loaded: true,
  exports: { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 20, clientIp: () => '1.1.1.1' } };
const chainPath = require.resolve('../api/_lib/free-chain.js');
let llmCalls = 0;
require.cache[chainPath] = { id: chainPath, filename: chainPath, loaded: true, exports: { completeJson: async () => { llmCalls++; return { ok: false }; } } };
function makeRes() {
  return { statusCode: 200, payload: null, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, send(p) { this.payload = p; return this; }, end() {} };
}
(async () => {
  let sentName = '';
  global.fetch = async (url, opt) => {
    const f = opt.body.get('file'); sentName = f && f.name;
    return { ok: true, status: 200, text: async () => JSON.stringify({ text: 'السلام عليكم ورحمة الله وبركاته اشتركوا في القناة', language: 'ar', segments: [
      { start: 0.234, end: 2.4, text: ' السلام عليكم', no_speech_prob: 0.01, avg_logprob: -0.2 },
      { start: 2.5, end: 4, text: 'ورحمة الله وبركاته', no_speech_prob: 0.05, avg_logprob: -0.3 },
      { start: 4, end: 6, text: 'اشتركوا في القناة', no_speech_prob: 0.1, avg_logprob: -0.3 },
      { start: 6, end: 8, text: 'همهمة', no_speech_prob: 0.9, avg_logprob: -0.3 },
    ] }) };
  };
  delete require.cache[require.resolve('../api/_lib/stt.js')];
  const handler = require('../api/_lib/stt.js');
  const res = makeRes();
  await handler({ method: 'POST', headers: {}, body: { audioBase64: 'YQ==', mimeType: 'audio/mpeg', segments: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sentName, 'audio.mp3', 'mp3 يُرسل بامتداده');
  assert.deepEqual(res.payload.segments, [
    { start: 0.23, end: 2.4, text: 'السلام عليكم' },
    { start: 2.5, end: 4, text: 'ورحمة الله وبركاته' },
  ], 'الهلوسة والصمت يسقطان');
  assert.equal(llmCalls, 0, 'لا تصحيح LLM مع المقاطع');
  // الطلب العاديّ (بلا segments) لا يتغيّر: لا مفتاح segments في الردّ
  const res2 = makeRes();
  await handler({ method: 'POST', headers: {}, body: { audioBase64: 'YQ==' } }, res2);
  assert.equal(res2.payload.segments, undefined);
  assert.ok(llmCalls >= 1, 'المسار العاديّ يبقى بالتصحيح');
  console.log('video-edit: ok');
})().catch((e) => { console.error(e); process.exit(1); });
