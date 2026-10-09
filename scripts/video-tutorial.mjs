#!/usr/bin/env node
// scripts/video-tutorial.mjs — يسجّل فيديو تعليميًّا حقيقيًّا من شاشة صانع الفيديو نفسه (بلا توليد مدفوع):
//   كيف تصنع فيديو في ٦ خطوات، بشرح مكتوب وإطار ذهبيّ على كلّ عنصر، بدقّة ١٩٢٠×١٠٨٠. المخرج: media/samples/tutorial-<ar|en>.mp4 + .jpg (غلاف).
// الاستعمال: node scripts/video-tutorial.mjs [--lang ar|en|both] [--out media/samples]
// يخدم المستودع ثابتًا ويردّ على /api/* بـ{} (لا شبكة) ويزيّف ردّ مساعد الكتابة وحده ليظهر عمله في التسجيل.
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
const W = 1280, H = 720, DPR = 1.5; // يُلتقط بدقّة الجهاز ١٩٢٠×١٠٨٠ عبر CDP (تسجيل Playwright المدمج ضبابيّ)

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
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
    s0: 'كيف تصنع فيديو في ٦ خطوات', s1: '١  اختر القسم: «الترندات» لفيديو جاهز بلمسة، أو وضعًا للتحكّم الكامل', s2: '٢  اختر الوضع حسب الجودة والتكلفة',
    s3: '٣  اضغط فكرة جاهزة لتعبئة الوصف، أو اكتب وصفك بنفسك', s4: '٤  أضف صورة البطل (اختياري)', s5: '٥  اطلب من المساعد أن يكتب لك القصّة أو الحوار',
    s6: '٦  اختر المدّة والشكل', s7: 'ثمّ اضغط «إنشاء الفيديو» وانتظر دقائق قليلة', ask: 'اكتب لي قصة قصيرة عن صاحب محل قهوة يفتتح فرعًا جديدًا',
  },
  en: {
    s0: 'How to make a video in 6 steps', s1: '1  Pick a section: Trends for a ready-made video, or a mode for full control', s2: '2  Pick the mode by quality and cost',
    s3: '3  Tap a ready idea to fill the description, or write your own', s4: '4  Add a hero photo (optional)', s5: '5  Ask the writing assistant for a story or dialogue',
    s6: '6  Choose the length and shape', s7: 'Then press Create video and wait a few minutes', ask: 'Write me a short story about a coffee shop owner opening a new branch',
  },
};
const MOCK = { result: { scene: 'Close-up of a coffee pot pouring into a cup, warm light.', narration: '', lines: [{ who: '', text: 'Welcome to our new branch.' }], onScreen: '' }, seconds: 8, words: 18 };
const MOCK_AR = { result: { scene: 'لقطة قريبة لدلّة قهوة تُسكب في فنجان داخل محل دافئ', narration: '', lines: [{ who: 'خالد', text: 'هلا والله، حياكم في فرعنا الجديد' }], onScreen: 'افتتاح الفرع' }, seconds: 8, words: 18 };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
try {
  for (const lang of LANGS) {
    const t = TXT[lang];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tut-'));
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    await ctx.addInitScript(([lg, mock]) => {
      try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', lg); localStorage.setItem('aiapp_username', 'ahmed'); localStorage.setItem('aiapp_auth_token', 'local'); } catch (e) { /* لا شيء */ }
      const of = window.fetch;
      window.fetch = function (u) { if (String(u).indexOf('video-write') > -1) return Promise.resolve(new Response(JSON.stringify(mock), { headers: { 'Content-Type': 'application/json' } })); return of.apply(this, arguments); };
    }, [lang, lang === 'ar' ? MOCK_AR : MOCK]);
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    // أدوات الشرح: شريط مكتوب سفليّ وإطار ذهبيّ على العنصر
    await page.evaluate((rtl) => {
      const cap = document.createElement('div'); cap.id = 'tutCap';
      cap.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483000;max-width:86%;padding:13px 26px;border-radius:99px;background:rgba(10,12,18,.92);border:1px solid rgba(232,194,122,.7);color:#f3dcaa;font:700 20px/1.6 system-ui,Segoe UI,Tahoma,sans-serif;text-align:center;box-shadow:0 18px 50px -12px rgba(0,0,0,.9);direction:' + (rtl ? 'rtl' : 'ltr') + ';opacity:0;transition:opacity .35s';
      const ring = document.createElement('div'); ring.id = 'tutRing';
      ring.style.cssText = 'position:fixed;z-index:2147482999;border:3px solid #e8c27a;border-radius:16px;box-shadow:0 0 0 6px rgba(232,194,122,.18),0 0 40px rgba(232,194,122,.35);pointer-events:none;opacity:0;transition:all .35s';
      document.body.appendChild(ring); document.body.appendChild(cap);
      window.__tut = (text, sel) => {
        cap.textContent = text; cap.style.opacity = text ? '1' : '0';
        const el = sel && document.querySelector(sel);
        if (!el) { ring.style.opacity = '0'; return; }
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        Object.assign(ring.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px', opacity: '1' });
      };
    }, lang === 'ar');
    const cdp = await ctx.newCDPSession(page); const frames = [];
    cdp.on('Page.screencastFrame', async (f) => { frames.push({ ts: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) { /* انتهت الجلسة */ } });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(W * DPR), maxHeight: Math.round(H * DPR), everyNthFrame: 1 });
    const say = async (text, sel, ms) => { await page.evaluate(([a, b]) => window.__tut(a, b), [text, sel || '']); await page.waitForTimeout(ms); };
    await say(t.s0, '', 2200);
    await page.evaluate(() => document.getElementById('btnVideoMaker').click()); await page.waitForTimeout(900);
    await page.click('#vmkTabs [data-tab=runway]'); await page.waitForTimeout(500);
    await say(t.s1, '#vmkTabs', 3600);
    await page.click('#vmkTabs [data-tab=omni]'); await page.waitForTimeout(500);
    await say(t.s2, '#vmkTabs', 3200);
    await say(t.s3, '#vmkSamples', 2400);
    await page.click('#vmkSamples .vmk-sm:nth-child(2)'); await page.waitForTimeout(400);
    await say(t.s3, '#videoMakerPrompt', 2600);
    await say(t.s4, '#videoMakerHeroRow', 3200);
    await say(t.s5, '#vmkWrite', 1800);
    await page.fill('#vmkWrite input', ''); await page.type('#vmkWrite input', t.ask, { delay: 38 });
    await page.waitForTimeout(500); await page.click('#vmkWrite .vmk-ai-go'); await page.waitForTimeout(1500);
    await say(t.s5, '#vmkWrite', 3000);
    await say(t.s6, '.vmk-row3', 3200);
    await say(t.s7, '#videoMakerGenerateBtn', 3600);
    await say('', '', 400);
    await cdp.send('Page.stopScreencast'); const tEnd = Date.now() / 1000;
    await ctx.close();
    // الإطارات تصل عند التغيّر فقط: كلّ إطار يدوم حتّى التالي (قائمة concat بمدد)
    let list = '';
    frames.forEach((fr, k) => {
      const fn = path.join(tmp, 'f' + String(k).padStart(5, '0') + '.jpg'); fs.writeFileSync(fn, Buffer.from(fr.data, 'base64'));
      const next = k + 1 < frames.length ? frames[k + 1].ts : Math.max(fr.ts + 0.5, tEnd);
      list += "file '" + fn + "'\nduration " + Math.max(0.01, next - fr.ts).toFixed(3) + '\n';
      if (k + 1 === frames.length) list += "file '" + fn + "'\n";
    });
    fs.writeFileSync(path.join(tmp, 'list.txt'), list);
    const mp4 = path.join(OUT, 'tutorial-' + lang + '.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '9.5', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(OUT, 'tutorial-' + lang + '.jpg')]);
    console.log(lang, mp4, (fs.statSync(mp4).size / 1024).toFixed(0) + 'KB');
  }
} finally { await browser.close(); srv.close(); }
