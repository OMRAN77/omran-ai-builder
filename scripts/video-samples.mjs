#!/usr/bin/env node
// scripts/video-samples.mjs — يولّد نماذج الجودة (٢ لكلّ وضع) من محرّكات صانع الفيديو الحقيقيّة على الموقع المنشور،
// بتشغيل الصانع نفسه في متصفّح (Playwright) بحساب المالك — فلا تُخمَّن واجهات الخادم، وكلّ ما يجري هو ما يجري للمستخدم.
// ⚠ يصرف على محرّكات الفيديو (Runway/Veo/…) ونقاط الحساب — لا يُشغَّل إلّا بأمر المالك (workflow_dispatch بتأكيد صريح).
//
// البيئة:  SAMPLE_TOKEN (رمز جلسة المالك: aiapp_auth_token)، SAMPLE_USER (الافتراضيّ omran)، BASE (الافتراضيّ الموقع المنشور)
// الاستعمال: node scripts/video-samples.mjs [--modes runway,minimax,omni,hybrid,veo,actor] [--per 2] [--out media/samples] [--timeout 14]
//            node scripts/video-samples.mjs --local --modes canvas   ← كانفا مجّانيّ: يولّده الصانع محلّيًّا داخل المتصفّح بلا مفاتيح ولا صرف
//            node scripts/video-samples.mjs --dry   ← يخدم المستودع محلّيًّا ويتحقّق من الاختيارات حتّى زرّ «إنشاء» دون ضغطه (لا صرف)
// المخرج: <الوضع>-<١|٢>.mp4 (٩٦٠ عرضًا) + .jpg غلاف + index.json (القائمة التي يقرؤها الصانع فيظهر الفيديو في بطاقته).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const DRY = !!opt('dry', false);
const LOCAL = DRY || !!opt('local', false); // --local: الصانع محلّيًّا (بلا خادم) — يكفي لوضع كانفا لأنّه يُرسم ويُسجَّل داخل المتصفّح بلا محرّك ولا صرف
const MODES = String(opt('modes', 'runway,minimax,omni,hybrid,veo,actor')).split(',').map((s) => s.trim()).filter(Boolean);
const PER = Math.min(2, Math.max(1, Number(opt('per', 2)) || 2));
const OUT = path.resolve(ROOT, String(opt('out', 'media/samples')));
const TIMEOUT = (Number(opt('timeout', 14)) || 14) * 60 * 1000;
const USER = process.env.SAMPLE_USER || 'omran';
const TOKEN = process.env.SAMPLE_TOKEN || (LOCAL ? 'local' : '');
if (!LOCAL && !TOKEN) { console.error('SAMPLE_TOKEN مفقود — رمز جلسة المالك (aiapp_auth_token) كسرّ في المستودع.'); process.exit(2); }
const ACTOR_LINE = 'هلا والله! حياكم في تطبيق عمران، أسهل طريقة تسوّي فيديو بالذكاء الاصطناعي.';

let base = process.env.BASE || 'https://omran-ai-builder.vercel.app', srv = null;
if (LOCAL) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
  srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + srv.address().port;
}
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', 'playwright-core']) { try { pw = await import(pathToFileURL(req.resolve(c)).href); break; } catch (e) { /* التالي */ } }
if (!pw) throw new Error('playwright غير موجود');
const chromium = pw.chromium || pw.default.chromium;
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

fs.mkdirSync(OUT, { recursive: true });
const indexFile = path.join(OUT, 'index.json');
const index = (() => { try { return JSON.parse(fs.readFileSync(indexFile, 'utf8')) || {}; } catch (e) { return {}; } })();
const browser = await chromium.launch({ executablePath: exe });
let ok = 0, fail = 0;

async function runOne(mode, n) {
  const key = mode + '-' + n;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([u, t]) => {
    try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', u); localStorage.setItem('aiapp_auth_token', t); } catch (e) { /* لا شيء */ }
  }, [USER, TOKEN]);
  const page = await ctx.newPage();
  try {
    await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    await page.evaluate(() => document.getElementById('btnVideoMaker').click()); await page.waitForSelector('#vmkTabs', { timeout: 15000 });
    await page.click('#vmkTabs [data-tab="' + mode + '"]'); await page.waitForTimeout(500);
    const card = page.locator('#vmkSamples .vmk-sm').nth(n); // ٠ = الفيديو التعليميّ، ثمّ المثالان
    await card.waitFor({ timeout: 8000 });
    const idea = (await card.locator('b').innerText()).trim();
    await card.click(); await page.waitForTimeout(300);
    if (mode === 'actor') await page.fill('#videoMakerActorSpeech', ACTOR_LINE);
    const prompt = await page.inputValue('#videoMakerPrompt');
    if (!prompt.trim()) throw new Error('الوصف فارغ بعد اختيار البطاقة');
    console.log('·', key, '←', idea);
    if (DRY) { const btn = await page.locator('#videoMakerGenerateBtn').isVisible(); if (!btn) throw new Error('زرّ الإنشاء غير ظاهر'); return 'dry'; }
    await page.click('#videoMakerGenerateBtn');
    const t0 = Date.now(); let src = '', lastSt = '';
    while (Date.now() - t0 < TIMEOUT) {
      await page.waitForTimeout(6000);
      src = await page.evaluate(() => { const v = document.getElementById('videoMakerResult'); return v && getComputedStyle(v).display !== 'none' ? (v.currentSrc || v.getAttribute('src') || '') : ''; }); // العنصر نفسه هو <video>
      if (src) break;
      const st = await page.evaluate(() => (document.getElementById('videoMakerStatus') || {}).innerText || '');
      if (st && st !== lastSt) { lastSt = st; console.log('   حالة:', st.replace(/\s+/g, ' ').slice(0, 120)); }
      if (/❌|تعذّر|خطأ|فشل|error|failed/i.test(st)) throw new Error('الصانع أعلن فشلًا: ' + st.slice(0, 160));
    }
    if (!src) throw new Error('انتهت المهلة بلا فيديو');
    // جلب البايتات من داخل الصفحة (جلستها وCORS الخاصّة بها): blob/نفس الأصل مباشرة، وغيرهما عبر وسيط التنزيل
    const b64 = await page.evaluate(async ([s, tk]) => {
      const direct = /^blob:/.test(s) || s.startsWith(location.origin) || s.startsWith('/');
      const url = direct ? s : '/api/video-download?url=' + encodeURIComponent(s);
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
      if (!r.ok) throw new Error('تنزيل ' + r.status);
      const buf = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [src, TOKEN]);
    const raw = path.join(os.tmpdir(), 'sample-' + key + '.mp4'); fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
    const mp4 = path.join(OUT, key + '.mp4');
    const hasAudio = /audio/i.test(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', raw], { encoding: 'utf8' }));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', 'scale=960:-2,fps=24', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'].concat(hasAudio ? ['-c:a', 'aac', '-b:a', '64k'] : ['-an'], [mp4]));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '5', path.join(OUT, key + '.jpg')]);
    index[key] = true; fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
    console.log('✓', key, (fs.statSync(mp4).size / 1024).toFixed(0) + 'KB', hasAudio ? 'مع صوت' : 'بلا صوت');
    return 'ok';
  } finally { await ctx.close(); }
}

try {
  for (const mode of MODES) for (let n = 1; n <= PER; n++) {
    try { await runOne(mode, n); ok++; } catch (e) { fail++; console.error('✗', mode + '-' + n, String(e && e.message || e).slice(0, 220)); }
  }
} finally { await browser.close(); if (srv) srv.close(); }
console.log(`النتيجة: ${ok} نجح · ${fail} فشل` + (DRY ? ' (تجريبيّ — لا توليد)' : ''));
process.exit(ok > 0 || DRY && fail === 0 ? 0 : 1);
