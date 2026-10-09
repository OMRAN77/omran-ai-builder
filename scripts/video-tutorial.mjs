#!/usr/bin/env node
// scripts/video-tutorial.mjs — فيديو تعليميّ مُمنتَج (لا تسجيل شاشة خام): «كيف تصنع فيديو في ٦ خطوات».
//   ١) لقطات حادّة من صانع الفيديو الحقيقيّ بدقّة مضاعفة (DPR 2) لكلّ خطوة + موضع العنصر المقصود فيها.
//   ٢) تركيب حركيّ يُرسم إطارًا إطارًا (٣٠ إطارًا/ث، ١٩٢٠×١٠٨٠): مقدّمة بالعنوان، كلّ خطوة داخل إطار جهاز يقرّب بنعومة
//      على العنصر مع حلقة ذهبيّة، رقم الخطوة وعنوانها وشرحها بخطّ كبير على الجانب، انتقالات متلاشية، وخاتمة.
//   بلا توليد مدفوع: ردّ مساعد الكتابة وحده مُزيَّف ليظهر عمله. المخرج: media/samples/tutorial-<ar|en>.mp4 + .jpg
// الاستعمال: node scripts/video-tutorial.mjs [--lang ar|en|both] [--out media/samples]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const LANGS = opt('lang', 'both') === 'both' ? ['ar', 'en'] : [opt('lang', 'ar')];
const OUT = path.resolve(ROOT, opt('out', 'media/samples'));
const FPS = 30;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
let COMP_DIR = '';
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const base = p.startsWith('/__comp/') ? COMP_DIR : ROOT;
  const f = path.join(base, p.replace(/^\/__comp\//, '/'));
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const req = createRequire(import.meta.url);
let pw; for (const c of ['playwright', 'playwright-core']) { try { pw = await import(pathToFileURL(req.resolve(c)).href); break; } catch (e) { /* التالي */ } }
if (!pw) throw new Error('playwright غير موجود');
const chromium = pw.chromium || pw.default.chromium;
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const TXT = {
  ar: {
    dir: 'rtl', brand: 'صانع الفيديو', intro: 'كيف تصنع فيديو في ٦ خطوات', outro: 'جاهز؟ ابدأ الآن', outroSub: 'صانع الفيديو بالذكاء الاصطناعي',
    ask: 'اكتب لي قصة قصيرة عن صاحب محل قهوة يفتتح فرعًا جديدًا', nums: ['١', '٢', '٣', '٤', '٥', '٦'], stepWord: 'الخطوة', of: 'من',
    steps: [
      ['اختر القسم', '«الترندات» لفيديو جاهز بلمسة، أو أحد الأوضاع للتحكّم الكامل بالجودة والتكلفة'],
      ['اختر فكرة أو اكتب وصفك', 'الضغط على أيّ فكرة جاهزة يكتب الوصف عنك'],
      ['أضف صورة البطل', 'اختياريّ: صورتك أو صورة أيّ شخص ليظهر في الفيديو'],
      ['اطلب من المساعد', 'يكتب لك القصّة أو الحوار على قدّ مدّة الفيديو'],
      ['اختر المدّة والشكل', '٥ أو ٨ أو ١٠ ثوانٍ، عرضيّ أو طوليّ'],
      ['اضغط «إنشاء الفيديو»', 'وانتظر دقائق قليلة حتّى يجهز فيديوك'],
    ],
  },
  en: {
    dir: 'ltr', brand: 'Video Maker', intro: 'How to make a video in 6 steps', outro: 'Ready? Start now', outroSub: 'AI Video Maker',
    ask: 'Write me a short story about a coffee shop owner opening a new branch', nums: ['1', '2', '3', '4', '5', '6'], stepWord: 'Step', of: 'of',
    steps: [
      ['Pick a section', 'Trends for a one-tap video, or a mode for full control over quality and cost'],
      ['Pick an idea or describe it', 'Tapping a ready idea writes the description for you'],
      ['Add a hero photo', 'Optional: your photo or anyone you want in the video'],
      ['Ask the assistant', 'It writes the story or dialogue to fit the video length'],
      ['Choose length and shape', '5, 8 or 10 seconds, landscape or portrait'],
      ['Press Create video', 'Wait a few minutes and your video is ready'],
    ],
  },
};
const MOCK = {
  ar: { result: { scene: 'لقطة قريبة لدلّة قهوة تُسكب في فنجان داخل محل دافئ', narration: '', lines: [{ who: 'خالد', text: 'هلا والله، حياكم في فرعنا الجديد' }], onScreen: 'افتتاح الفرع' }, seconds: 8, words: 18 },
  en: { result: { scene: 'Close-up of a coffee pot pouring into a cup in a warm shop', narration: '', lines: [{ who: 'Khalid', text: 'Welcome to our new branch!' }], onScreen: 'Grand opening' }, seconds: 8, words: 18 },
};

// ١) اللقطات: حالة الصانع عند كلّ خطوة + مستطيل العنصر نسبةً إلى بطاقة الصانع
async function capture(browser, lang, dir) {
  const t = TXT[lang];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([lg, mock]) => {
    try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg); localStorage.setItem('aiapp_username', 'ahmed'); localStorage.setItem('aiapp_auth_token', 'local'); } catch (e) { /* لا شيء */ }
    const of = window.fetch;
    window.fetch = function (u) { if (String(u).indexOf('video-write') > -1) return Promise.resolve(new Response(JSON.stringify(mock), { headers: { 'Content-Type': 'application/json' } })); return of.apply(this, arguments); };
  }, [lang, MOCK[lang]]);
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
  await page.evaluate(() => document.getElementById('btnVideoMaker').click());
  await page.waitForSelector('#vmkTabs'); await page.waitForTimeout(600);
  await page.click('#vmkTabs [data-tab=omni]'); await page.waitForTimeout(500);
  const shots = [];
  const shoot = async (sel, prep) => {
    if (prep) await prep();
    await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' }); }, sel);
    await page.waitForTimeout(350);
    const geo = await page.evaluate((s) => {
      const card = document.querySelector('#videoMakerModal .vmk-studio').getBoundingClientRect();
      const el = document.querySelector(s).getBoundingClientRect();
      return { card: { x: card.left, y: Math.max(0, card.top), w: card.width, h: Math.min(card.height, innerHeight - Math.max(0, card.top)) }, el: { x: el.left - card.left, y: el.top - Math.max(0, card.top), w: el.width, h: el.height } };
    }, sel);
    const file = path.join(dir, 'shot' + shots.length + '.png');
    await page.screenshot({ path: file, clip: { x: geo.card.x, y: geo.card.y, width: geo.card.w, height: geo.card.h } });
    shots.push({ file: path.basename(file), w: geo.card.w, h: geo.card.h, rect: geo.el });
  };
  await shoot('#vmkTabs');
  await shoot('#vmkSamples', async () => { await page.click('#vmkSamples .vmk-sm:nth-child(2)'); await page.waitForTimeout(300); await page.evaluate(() => { const x = document.querySelector('.vmk-lb .vmk-lb-x'); if (x) x.click(); }); });
  await shoot('#videoMakerHeroRow');
  await shoot('#vmkWrite', async () => { await page.fill('#vmkWrite input', t.ask); await page.click('#vmkWrite .vmk-ai-go'); await page.waitForTimeout(900); });
  await shoot('.vmk-row3');
  await shoot('#videoMakerGenerateBtn');
  await ctx.close();
  return shots;
}

// ٢) التركيب: صفحة تُرسم بدالّة زمنيّة حتميّة R(t) ثمّ تُصوَّر إطارًا إطارًا
function compHtml(t, shots) {
  return `<!doctype html><html lang="${t.dir === 'rtl' ? 'ar' : 'en'}" dir="${t.dir}"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#07080c;font-family:Tajawal,system-ui,sans-serif;color:#eef1f6}
#bg{position:absolute;inset:0}
.glow{position:absolute;border-radius:50%;filter:blur(110px);opacity:.38}
.scene{position:absolute;inset:0;opacity:0}
.c{position:absolute;left:0;right:0;text-align:center}
.brand{font-weight:800;font-size:112px;letter-spacing:.5px;background:linear-gradient(180deg,#fff2d1,#e8c27a 55%,#b9873e);-webkit-background-clip:text;color:transparent}
.sub{font-weight:500;font-size:46px;color:#c9cfdb}
.line{position:absolute;left:50%;height:3px;border-radius:3px;background:linear-gradient(90deg,transparent,#e8c27a,transparent);transform:translateX(-50%)}
.frame{position:absolute;border-radius:26px;overflow:hidden;background:#0d0f14;border:1px solid rgba(232,194,122,.28);box-shadow:0 60px 120px -40px rgba(0,0,0,.95),0 0 0 10px rgba(255,255,255,.02)}
.frame .zoom{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.frame img{display:block}
.ring{position:absolute;border:4px solid #f0cf8f;border-radius:18px;box-shadow:0 0 0 10px rgba(232,194,122,.16),0 0 60px rgba(232,194,122,.55)}
.dim{position:absolute;inset:0;background:radial-gradient(transparent 0,transparent 100%)}
.panel{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:26px}
.badge{display:flex;align-items:center;gap:18px;font-weight:700;font-size:30px;color:#e8c27a;letter-spacing:.5px}
.num{width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:46px;color:#1a1408;background:linear-gradient(135deg,#f6dca2,#c9964a);box-shadow:0 14px 40px -10px rgba(232,194,122,.8)}
.title{font-weight:800;font-size:64px;line-height:1.25}
.desc{font-weight:500;font-size:36px;line-height:1.6;color:#b8c0cf}
.dots{display:flex;gap:12px;margin-top:10px}.dots i{width:44px;height:6px;border-radius:6px;background:rgba(255,255,255,.14)}.dots i.on{background:#e8c27a}
.btn{display:inline-block;margin-top:34px;padding:22px 64px;border-radius:20px;font-weight:800;font-size:44px;color:#1a1408;background:linear-gradient(135deg,#f6dca2,#c9964a);box-shadow:0 24px 60px -20px rgba(232,194,122,.8)}
</style></head><body>
<div id="bg"><div class="glow" id="g1" style="width:900px;height:900px;background:#7a5a20"></div><div class="glow" id="g2" style="width:800px;height:800px;background:#1b2a4a"></div></div>
<div class="scene" id="intro"><div class="c" style="top:360px"><div class="brand">${t.brand}</div></div><div class="line" id="iline" style="top:560px"></div><div class="c sub" id="isub" style="top:600px">${t.intro}</div></div>
${shots.map((s, i) => `<div class="scene" id="s${i}">
  <div class="frame" id="f${i}"><div class="zoom" id="z${i}"><img src="/__comp/${s.file}" style="width:${s.w}px;height:${s.h}px"><div class="ring" id="r${i}" style="left:${s.rect.x - 10}px;top:${s.rect.y - 10}px;width:${s.rect.w + 20}px;height:${s.rect.h + 20}px"></div></div></div>
  <div class="panel" id="p${i}"><div class="badge"><div class="num">${t.nums[i]}</div>${t.stepWord} ${t.nums[i]} ${t.of} ${t.nums[5]}</div><div class="title">${t.steps[i][0]}</div><div class="desc">${t.steps[i][1]}</div><div class="dots">${t.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div></div>
</div>`).join('')}
<div class="scene" id="outro"><div class="c" style="top:330px"><div class="brand" style="font-size:96px">${t.outro}</div></div><div class="c" style="top:500px"><span class="btn">${t.outroSub}</span></div></div>
<script>
const RTL = ${JSON.stringify(t.dir === 'rtl')}, SH = ${JSON.stringify(shots.map((s) => ({ w: s.w, h: s.h, r: s.rect })))};
const INTRO = 3.2, STEP = 4.8, OUTRO = 3.4, FADE = 0.55;
window.TOTAL = INTRO + SH.length * STEP + OUTRO;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => { x = clamp(x, 0, 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const $ = (id) => document.getElementById(id);
// إطار الجهاز: ١١٢٠×٧٣٠ على جهة، والنصّ على الجهة الأخرى
const FW = 1120, FH = 730, FY = 175, FX = RTL ? 80 : 1920 - 80 - FW, PX = RTL ? 1260 : 90, PW = 570;
SH.forEach((s, i) => { const f = $('f' + i); Object.assign(f.style, { left: FX + 'px', top: FY + 'px', width: FW + 'px', height: FH + 'px' }); Object.assign($('p' + i).style, { left: PX + 'px', width: PW + 'px', textAlign: RTL ? 'right' : 'left' }); });
function vis(id, a, b, t) { // ظهور متلاشٍ بين a وb
  const o = clamp((t - a) / FADE, 0, 1) * clamp((b - t) / FADE, 0, 1); $(id).style.opacity = o; return o;
}
window.R = function (t) {
  $('g1').style.transform = 'translate(' + (200 + 160 * Math.sin(t * .35)) + 'px,' + (-200 + 80 * Math.cos(t * .3)) + 'px)';
  $('g2').style.transform = 'translate(' + (1100 + 140 * Math.cos(t * .28)) + 'px,' + (420 + 90 * Math.sin(t * .4)) + 'px)';
  // المقدّمة
  const io = vis('intro', 0, INTRO, t); const ip = ease(t / 1.1);
  $('intro').style.transform = 'scale(' + (0.96 + 0.04 * ip) + ')';
  $('iline').style.width = (520 * ease((t - .5) / .9)) + 'px'; $('isub').style.opacity = ease((t - .7) / .8);
  // الخطوات
  SH.forEach((s, i) => {
    const a = INTRO + i * STEP, b = a + STEP + FADE * 0.6, lt = t - a;
    const o = vis('s' + i, a, b, t); if (o <= 0) return;
    // تقريب ناعم على العنصر: من لقطة كاملة إلى العنصر بحجم مريح
    const fit = Math.min(FW / s.w, FH / s.h);
    const zTarget = clamp(Math.min(FW / (s.r.w + 160), FH / (s.r.h + 260)), fit, fit * 2.1);
    const k = ease((lt - .35) / 1.6);
    const z = fit + (zTarget - fit) * k;
    const cx = s.r.x + s.r.w / 2, cy = s.r.y + s.r.h / 2;
    const fullX = (FW - s.w * fit) / 2, fullY = (FH - s.h * fit) / 2;
    let tx = FW / 2 - cx * z, ty = FH / 2 - cy * z;
    tx = clamp(tx, FW - s.w * z, 0); ty = clamp(ty, FH - s.h * z, 0);
    if (s.w * z < FW) tx = (FW - s.w * z) / 2; if (s.h * z < FH) ty = (FH - s.h * z) / 2;
    const X = fullX + (tx - fullX) * k, Y = fullY + (ty - fullY) * k;
    $('z' + i).style.transform = 'translate(' + X + 'px,' + Y + 'px) scale(' + z + ')';
    $('f' + i).style.transform = 'translateY(' + (24 * (1 - ease(lt / .8))) + 'px)';
    const ro = ease((lt - 1.4) / .5); const pulse = 0.5 + 0.5 * Math.sin(lt * 4);
    $('r' + i).style.opacity = ro; $('r' + i).style.boxShadow = '0 0 0 ' + (8 + 6 * pulse) + 'px rgba(232,194,122,' + (.12 + .1 * pulse) + '),0 0 60px rgba(232,194,122,.5)';
    const pp = ease((lt - .2) / .7); $('p' + i).style.opacity = pp; $('p' + i).style.transform = 'translateX(' + ((RTL ? 40 : -40) * (1 - pp)) + 'px)';
  });
  // الخاتمة
  const oa = INTRO + SH.length * STEP; vis('outro', oa, oa + OUTRO + 1, t);
  $('outro').style.transform = 'scale(' + (0.95 + 0.05 * ease((t - oa) / 1)) + ')';
};
</script></body></html>`;
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
try {
  for (const lang of LANGS) {
    const t = TXT[lang];
    COMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tutcomp-'));
    const shots = await capture(browser, lang, COMP_DIR);
    fs.writeFileSync(path.join(COMP_DIR, 'index.html'), compHtml(t, shots));
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(base + '/__comp/index.html', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => null))));
    const total = await page.evaluate(() => window.TOTAL);
    const framesDir = path.join(COMP_DIR, 'frames'); fs.mkdirSync(framesDir);
    const n = Math.round(total * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate((tt) => window.R(tt), f / FPS);
      await page.screenshot({ path: path.join(framesDir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    }
    await ctx.close();
    const mp4 = path.join(OUT, 'tutorial-' + lang + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, '%05d.jpg'), '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '5.5', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(OUT, 'tutorial-' + lang + '.jpg')]);
    console.log(lang, mp4, (fs.statSync(mp4).size / 1048576).toFixed(1) + 'MB', total.toFixed(1) + 's');
  }
} finally { await browser.close(); srv.close(); }
