#!/usr/bin/env node
// scripts/bridge-smoke.mjs — يشغّل صورة الجسر (cc-bridge/Dockerfile، مبنيّة مسبقًا) ويصوّر فيديو قصيرًا داخلها.
//
// لماذا: «مخرج التطبيق» جُرّب على جهاز تطوير بـffmpeg ثابت حديث وخادم محلّيّ، والحاوية التي تُنشر على Railway
// (ffmpeg من apt، Chromium من Playwright، خطوط Noto، مستخدم غير root، قرص مركَّب لـroot) لم يُصوَّر داخلها شيء قطّ.
// هذا السكربت يصنع ذلك الشيء نفسه في CI: يقلع الحاوية كما تُقلع هناك، يرسل مانيفستًا حقيقيًّا إلى /render،
// ينتظر الفيديو، ثمّ يفحصه بـffprobe الحاوية نفسها — ويتأكّد أنّ في الصورة خطًّا لكلّ لغة من لغات الواجهة الأربع عشرة.
//
//   docker build -t omran-cc-bridge cc-bridge
//   node scripts/bridge-smoke.mjs [--image omran-cc-bridge] [--out smoke-out]
//
// يحتاج Docker وشبكة المضيف (لينكس). لا مفاتيح: السرّ يُولَّد لكلّ تشغيل، ومفتاح النموذج نصّ بديل لا يُنادى به شيء.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { signJobToken } from '../cc-bridge/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const IMAGE = arg('image', 'omran-cc-bridge');
const OUT = path.resolve(arg('out', 'smoke-out'));
const NAME = 'cc-bridge-smoke';
const BRIDGE_PORT = Number(arg('port', 18787));
export const UI_LANGS = ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
const fail = (m) => { const e = new Error(m); e.smoke = true; throw e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (args, opts) => spawnSync('docker', args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, opts || {}));

/** WAV ‏24kHz أحاديّ ١٦ بت (شكل الصوت الاحتياطيّ) — نغمة قصيرة */
export function toneWav(seconds) {
  const rate = 24000, n = Math.round(rate * seconds), pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / rate) * Math.min(1, i / 600, (n - i) / 600)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** PNG ملوَّن بلا مكتبة (نموذج نمط مربّع تجريبيّ) */
export function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = (x * 255 / w) | 0; raw[o + 2 + x * 3] = (y * 255 / h) | 0; raw[o + 3 + x * 3] = 160; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }

/** المانيفست: بطاقة عنوان عربيّة بصوت، شاشتان حقيقيّتان بخطواتهما من الكتالوج، نموذج نمط، وبطاقة ختام — يمرّ على كلّ نوع مشهد */
export function smokeManifest(catalog) {
  const screen = (id) => { const s = (catalog.screens || []).find((x) => x.id === id); if (!s) fail('لا شاشة «' + id + '» في الكتالوج'); return s; };
  return { lang: 'ar', title: 'فحص الجسر', scenes: [
    { type: 'title', text: 'عمران AI', sub: 'فحص صورة الجسر', audio: toneWav(1.6).toString('base64'), seconds: 3 },
    { type: 'screen', target: 'home', text: 'الصفحة الرئيسيّة', steps: screen('home').steps || [], seconds: 3 },
    { type: 'screen', target: 'video', text: 'صانع الفيديو', steps: screen('video').steps || [], seconds: 3 },
    { type: 'style_sample', target: 'sample', text: 'نموذج', image: gradientPng(512, 512).toString('base64'), mime: 'image/png', seconds: 3 },
    { type: 'title', text: '应用导演 · हिन्दी · বাংলা', sub: 'മലയാളം · اردو · Русский · नेपाली · Türkçe', seconds: 2 }, /* خطوط اللغات غير اللاتينيّة في إطار واحد يُرى في لوحة الإطارات */
    { type: 'title', text: 'جرّبه الآن', sub: '', seconds: 2 },
  ] };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
/** التطبيق الذي يصوّره الجسر: هذه الشجرة نفسها بخادم ثابت (نداءات /api تردّ فارغة — زائر بلا خادم) */
function serveApp() {
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname);
    if (p.startsWith('/api/')) { rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end('{}'); return; }
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rs);
  });
  return new Promise((r) => srv.listen(0, '0.0.0.0', () => r(srv)));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const report = { image: IMAGE, steps: [] };
  const step = (name, data) => { report.steps.push(Object.assign({ name }, data || {})); console.log('✓ ' + name + (data ? ' ' + JSON.stringify(data) : '')); };
  if (docker(['image', 'inspect', IMAGE]).status !== 0) fail('الصورة «' + IMAGE + '» غير مبنيّة: docker build -t ' + IMAGE + ' cc-bridge');

  // القرص كما يركّبه Railway: مجلّد فارغ مملوك لغير المستخدم agent، وفيه مستودع (حتّى لا يستنسخ المدخل المستودع كلّه في الفحص)
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-smoke-'));
  fs.mkdirSync(path.join(work, 'repo'), { recursive: true });
  execFileSync('git', ['init', '-q', path.join(work, 'repo')]);
  const app = await serveApp();
  const secret = crypto.randomBytes(24).toString('hex');
  docker(['rm', '-f', NAME]);
  const run = docker(['run', '-d', '--name', NAME, '--network', 'host', '-v', work + ':/work',
    '-e', 'PORT=' + BRIDGE_PORT, '-e', 'CC_BRIDGE_SECRET=' + secret, '-e', 'ANTHROPIC_API_KEY=smoke-placeholder-not-a-key',
    '-e', 'DIRECTOR_APP_URL=http://127.0.0.1:' + app.address().port, '-e', 'CC_PULSE_URL=off', IMAGE]);
  if (run.status !== 0) fail('تعذّر تشغيل الحاوية: ' + run.stderr);
  const bridge = 'http://127.0.0.1:' + BRIDGE_PORT;
  let ok = false;
  try {
    // ١) الإقلاع: /health يحمل renderJobs (الحقل الذي يفحصه خادم التطبيق قبل إصدار الرمز)
    let health = null;
    for (let i = 0; i < 90 && !health; i++) { await sleep(2000); try { const r = await fetch(bridge + '/health'); const d = await r.json(); if (d && d.ok === true) health = d; } catch (e) { /* لم يقلع بعد */ } }
    if (!health) fail('الحاوية لم تقلع خلال ٣ دقائق');
    if (typeof health.renderJobs !== 'number') fail('/health بلا renderJobs: ' + JSON.stringify(health));
    step('boot', health);

    // ٢) ما في الصورة: ffmpeg، ومستخدم التشغيل، وخطّ لكلّ لغة واجهة
    const ex = (args) => { const r = docker(['exec', NAME].concat(args)); return { code: r.status, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() }; };
    step('ffmpeg', { version: (ex(['ffmpeg', '-version']).out.split('\n')[0] || '').slice(0, 60) });
    // خادم الجسر ينزل من root إلى المستخدم agent (المدخل يملّك القرص ثمّ ينزل): نقرأ مالك عمليّة node من /proc
    const uidNode = ex(['sh', '-c', 'for p in /proc/[0-9]*; do if [ "$(readlink $p/exe 2>/dev/null)" = "$(command -v node)" ]; then grep ^Uid: $p/status | cut -f2; fi; done | sort -u | tr "\n" " "']).out.trim();
    const uidAgent = ex(['id', '-u', 'agent']).out;
    if (!uidAgent || uidNode !== uidAgent) fail('خادم الجسر يعمل بالمعرّف «' + uidNode + '» والمتوقَّع معرّف agent «' + uidAgent + '»');
    step('user', { nodeUid: uidNode, agentUid: uidAgent });
    if (ex(['sh', '-c', 'command -v fc-list']).code !== 0) fail('fc-list غير موجود في الصورة: لا يمكن فحص الخطوط');
    const fonts = {};
    for (const lg of UI_LANGS) { const f = ex(['fc-list', ':lang=' + (lg === 'zh' ? 'zh-cn' : lg), 'family']).out.split('\n').filter(Boolean); fonts[lg] = f.length ? f[0].split(',')[0] : ''; }
    const bare = UI_LANGS.filter((lg) => !fonts[lg]);
    if (bare.length) fail('لا خطّ في الصورة للغات: ' + bare.join(', ') + ' — بطاقات عناوينها ستظهر مربّعات فارغة');
    step('fonts', fonts);

    // ٣) المهمّة: مانيفست حقيقيّ برمز موقَّع بالسرّ نفسه، كما يرسله المتصفّح
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(24).toString('hex'); /* الكتالوج يحمّل وحدات تطلبه عند التحميل */
    const catalog = createRequire(import.meta.url)('../api/_lib/app-catalog.js').buildCatalog({ lang: 'ar' });
    const manifest = smokeManifest(catalog);
    const jobId = 'smoke' + Date.now().toString(36);
    const auth = { Authorization: 'Bearer ' + signJobToken({ user: 'omran', jobId }, secret) };
    const pre = await fetch(bridge + '/render', { method: 'OPTIONS', headers: { Origin: 'https://omran-ai-builder.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    if (pre.status !== 204 || pre.headers.get('access-control-allow-origin') !== 'https://omran-ai-builder.vercel.app') fail('إذن المتصفّح (CORS) مرفوض: ' + pre.status);
    step('cors', { status: pre.status });
    const post = await fetch(bridge + '/render', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(manifest) });
    const pj = await post.json().catch(() => null);
    if (post.status !== 202 || !pj || pj.jobId !== jobId) fail('الجسر رفض المانيفست: ' + post.status + ' ' + JSON.stringify(pj));
    let st = pj; const t0 = Date.now();
    while (st.state !== 'done' && st.state !== 'error') {
      if (Date.now() - t0 > 12 * 60 * 1000) fail('المهمّة لم تنتهِ خلال ١٢ دقيقة (آخر حالة: ' + st.step + ')');
      await sleep(2000);
      st = await (await fetch(bridge + '/render/' + jobId, { headers: auth })).json();
    }
    if (st.state !== 'done') fail('المهمّة فشلت عند «' + st.step + '»: ' + st.message);
    step('render', { seconds: st.seconds, fallbacks: st.fallbacks, tookSec: Math.round((Date.now() - t0) / 1000) });
    if (st.fallbacks) fail(st.fallbacks + ' شاشة لم تُصوَّر وصارت بطاقة عنوان');

    // ٤) الفيديو: يُنزَّل كما ينزّله المتصفّح، ويُفحص بـffprobe الحاوية
    const dl = await fetch(bridge + st.url, { headers: auth });
    const mp4 = Buffer.from(await dl.arrayBuffer());
    fs.writeFileSync(path.join(OUT, 'video.mp4'), mp4);
    if (dl.status !== 200 || mp4.length < 100 * 1024) fail('الفيديو لم يُنزَّل أو صغير جدًّا: ' + dl.status + ' ' + mp4.length);
    docker(['cp', path.join(OUT, 'video.mp4'), NAME + ':/tmp/smoke.mp4']);
    const pr = JSON.parse(ex(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate:format=duration', '-of', 'json', '/tmp/smoke.mp4']).out || '{}');
    const v = (pr.streams || []).find((s) => s.codec_type === 'video'), a = (pr.streams || []).find((s) => s.codec_type === 'audio'), dur = Number((pr.format || {}).duration);
    if (!v || v.codec_name !== 'h264' || v.width !== 1920 || v.height !== 1080 || v.pix_fmt !== 'yuv420p') fail('مسار الفيديو غير متوقَّع: ' + JSON.stringify(v));
    if (!a || a.codec_name !== 'aac') fail('لا مسار صوت AAC: ' + JSON.stringify(a));
    if (!(Math.abs(dur - st.seconds) < 0.75)) fail('المدّة ' + dur + ' ث والمتوقَّع ' + st.seconds + ' ث');
    step('video', { bytes: mp4.length, duration: dur, video: v.codec_name + ' ' + v.width + 'x' + v.height + ' ' + v.r_frame_rate, audio: a.codec_name });
    // لوحة إطارات (إطار من منتصف كلّ مشهد) تُرفع مع نتائج الفحص ليراها إنسان: الخطّ العربيّ، الشاشات، النموذج
    const n = manifest.scenes.length;
    const sheet = ex(['ffmpeg', '-y', '-loglevel', 'error', '-i', '/tmp/smoke.mp4', '-vf', 'fps=' + (n / dur).toFixed(4) + ',scale=640:-1,tile=' + n + 'x1', '-frames:v', '1', '/tmp/sheet.png']);
    if (sheet.code === 0) { docker(['cp', NAME + ':/tmp/sheet.png', path.join(OUT, 'sheet.png')]); step('sheet', { file: 'sheet.png' }); }
    ok = true;
  } finally {
    fs.writeFileSync(path.join(OUT, 'bridge.log'), String(docker(['logs', NAME]).stdout || '') + String(docker(['logs', NAME]).stderr || ''));
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(Object.assign(report, { ok }), null, 1));
    docker(['rm', '-f', NAME]); app.close();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* الحاوية ملّكت القرص لمستخدمها: يُترك لمنظّف المشغِّل */ }
  }
  console.log('✓ صورة الجسر تقلع وتصوّر وتدمج: ' + path.join(OUT, 'video.mp4'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('✗ ' + (e && e.message)); if (!(e && e.smoke)) console.error(e && e.stack); try { console.error(fs.readFileSync(path.join(OUT, 'bridge.log'), 'utf8').split('\n').slice(-40).join('\n')); } catch (z) { /* لا سجلّ */ } process.exit(1); });
}
