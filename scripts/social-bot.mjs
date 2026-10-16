// بوت التسويق الآلي (طلب المالك): يختار فكرة، يبنيها بـ OM Ai الحقيقي على الإنتاج
// من حساب البوت، يصوّر العملية فيديو عموديًّا 1080×1920 («سوّيته في X ثانية» + الشعار)،
// ثمّ ينشره على إنستقرام وفيسبوك عبر Upload-Post. الزمن المكتوب هو الزمن الفعليّ
// من ضغطة الإرسال إلى اكتمال الموقع — لا رقم مُختلَق.
//
// البيئة:
//   UPLOAD_POST_API_KEY  مفتاح Upload-Post (بدونه: يُصنع الفيديو ولا يُنشر)
//   UPLOAD_POST_USER     ملفّ Upload-Post (الافتراضيّ omranaibuilder)
//   PLATFORMS            instagram,facebook (الافتراضيّ)
//   MONITOR_KEY          اختياريّ: يضيف حساب البوت لقائمة VIP تلقائيًّا (وإلّا يضيفه المالك من لوحة التحكّم)
//                        كلمة سرّ حساب البوت مشتقّة من UPLOAD_POST_API_KEY — لا سرّ جديد
//   BOT_USER             اسم حساب البوت (الافتراضيّ omaisocial)
//   IDEA_INDEX           رقم فكرة محدّد؛ وإلّا تدور الأفكار برقم التشغيل
//   DRY_RUN=1            صناعة الفيديو دون نشر
//   BASE                 الموقع (الافتراضيّ الإنتاج) · OUT_DIR مجلّد المخرجات · CHROME_PATH متصفّح محلّيّ
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const OUT = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'social-out'));
const DRY = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
const UP_KEY = process.env.UPLOAD_POST_API_KEY || '';
const UP_USER = process.env.UPLOAD_POST_USER || 'omranaibuilder';
const UP_API = 'https://api.upload-post.com/api';
const PLATFORMS = (process.env.PLATFORMS || 'instagram,facebook').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const MONITOR_KEY = process.env.MONITOR_KEY || '';
const BOT_USER = (process.env.BOT_USER || 'omaisocial').trim().toLowerCase();
const CHROME = process.env.CHROME_PATH || undefined;
const SITE = 'omran-ai-builder.vercel.app';

const W = 1080, H = 1920, VW = 432, VH = 768, DPR = 2.5, FPS = 30;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BUILD_TIMEOUT_MS = 300000;

const log = (...a) => console.log('[social-bot]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now() / 1000;

// ───────── الفكرة ─────────
export function pickIdea(ideas, idxRaw, runNumber, dayNumber) {
  let idx = Number.parseInt(String(idxRaw ?? '').trim(), 10);
  if (!Number.isFinite(idx)) idx = Number.parseInt(String(runNumber ?? ''), 10);
  if (!Number.isFinite(idx)) idx = dayNumber;
  const n = ideas.length;
  return { idx: ((idx % n) + n) % n, idea: ideas[((idx % n) + n) % n] };
}

// ───────── النصّ المنشور ─────────
export function secWord(n) {
  if (n === 1) return 'ثانية وحدة';
  if (n === 2) return 'ثانيتين';
  if (n >= 3 && n <= 10) return n + ' ثواني';
  return n + ' ثانية';
}

export function buildCaption(idea, secs) {
  const base = ['#ذكاء_اصطناعي', '#تصميم_مواقع', '#برمجة', '#مواقع', '#مشاريع', '#OMAi', '#AI', '#الامارات', '#السعودية', '#الكويت', '#قطر', '#عمان', '#البحرين'];
  const tags = [...new Set([...(idea.tags || []), ...base])].slice(0, 20).join(' ');
  const head = 'سوّيت موقع ' + idea.name + ' كامل في ' + secWord(secs) + ' بس 🤯';
  const body = 'كتبت جملة وحدة… وOM Ai سوّى الباقي ✨';
  const ig = [head, body, '', 'جرّب تسوّي موقعك ببلاش 👈 الرابط في البايو 🔗', '', tags].join('\n');
  const fb = [head, body, '', 'جرّب تسوّي موقعك ببلاش 👈 https://' + SITE + '/?ref=fb', '', tags].join('\n');
  return { ig, fb, head };
}

// ───────── حساب البوت ─────────
async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}

// تعليقات GitHub تظهر في ملخّص التشغيل (تُقرأ بلا صلاحية سجلّات).
const gh = (level, msg) => { if (process.env.GITHUB_ACTIONS) console.log('::' + level + ' title=social-bot::' + String(msg).replace(/\r?\n/g, ' ')); };

async function tierOf(token) {
  const r = await postJSON(BASE + '/api/points', { action: 'balance', token }).catch(() => ({ j: {} }));
  return (r.j && r.j.tier) || (r.j && r.j.vip ? 'vip' : 'free');
}

// حساب البوت ثابت: كلمة سرّه مشتقّة من سرّ موجود في المستودع (لا سرّ جديد).
// صلاحية VIP: تلقائيًّا بـ MONITOR_KEY إن وُجد، وإلّا يضيفه المالك مرّة من لوحة التحكّم ← ⭐ صلاحيات VIP.
async function botAccount() {
  const seeds = [UP_KEY, MONITOR_KEY].filter(Boolean);
  const pwOf = (seed) => 'Sb!' + createHash('sha256').update('omai-social|' + BOT_USER + '|' + seed).digest('hex').slice(0, 24);
  const diag = ['monitorKey=' + (MONITOR_KEY ? 'yes' : 'no')];
  let token = '';
  for (const seed of seeds) {
    const r = await postJSON(BASE + '/api/account?action=auth', { action: 'login', username: BOT_USER, password: pwOf(seed), lang: 'ar' });
    if (r.j.token) { token = r.j.token; diag.push('login=ok'); break; }
  }
  if (!token && seeds.length) {
    const r = await postJSON(BASE + '/api/account?action=auth', { action: 'signup', username: BOT_USER, password: pwOf(seeds[0]), lang: 'ar' });
    if (r.j.token) { token = r.j.token; diag.push('signup=ok'); } else diag.push('signup=' + r.status);
  }
  if (token) {
    if (MONITOR_KEY) {
      const v = await postJSON(BASE + '/api/account?action=vip&key=' + encodeURIComponent(MONITOR_KEY), { id: BOT_USER });
      diag.push('vipAdd=' + v.status);
      if (v.ok) await sleep(1500);
    }
    const tier = await tierOf(token);
    diag.push('tier=' + tier);
    log('bot account ' + BOT_USER + ' · ' + diag.join(' '));
    gh('notice', 'account ' + BOT_USER + ' · ' + diag.join(' '));
    return { user: BOT_USER, token, vip: tier === 'vip' || tier === 'owner', tier };
  }
  log('bot account unavailable (' + diag.join(' ') + ') — temporary free account');
  gh('warning', 'bot account unavailable · ' + diag.join(' '));
  const u = 'zzcheck' + randomBytes(3).toString('hex');
  const r = await postJSON(BASE + '/api/account?action=auth', { action: 'signup', username: u, password: 'Pp1!' + randomBytes(8).toString('hex'), lang: 'ar' });
  if (!r.j.token) throw new Error('signup failed: ' + r.status);
  return { user: u, token: r.j.token, vip: false, tier: 'free' };
}

// ───────── التصوير ─────────
async function capture(browser, acct, idea, dir) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ar', userAgent: IPHONE_UA });
  await ctx.addInitScript(([t, u]) => {
    try {
      sessionStorage.setItem('omran_sess_v1', '1');
      localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar');
      localStorage.setItem('aiapp_auth_token', t); localStorage.setItem('aiapp_username', u);
    } catch (e) { /* لا شيء */ }
  }, [acct.token, acct.user]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/?ref=bot', { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#prompt', { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    ['omranIntro', 'privacyConsent'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
    document.documentElement.classList.remove('oiOn');
    // وضوح الطلب في الفيديو فقط: خطّ أكبر قليلًا في خانة الكتابة.
    const st = document.createElement('style'); st.textContent = '#prompt{font-size:17px!important;line-height:1.45!important}'; document.head.appendChild(st);
  });
  await page.waitForTimeout(600);

  const frames = []; let seg = 'A';
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    const fn = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(fn, Buffer.from(f.data, 'base64'));
    frames.push({ t: now(), seg, fn });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const m = { a0: now() };
  await page.waitForTimeout(900);
  await page.locator('#prompt').tap().catch(() => page.locator('#prompt').click());
  await page.waitForTimeout(350);
  m.type0 = now();
  const DELAY = Math.max(28, Math.min(55, Math.round(3600 / idea.prompt.length)));
  await page.locator('#prompt').pressSequentially(idea.prompt, { delay: DELAY });
  m.type1 = now();
  m.keyDelay = DELAY / 1000;
  await page.waitForTimeout(500);
  const sb = await page.locator('#btnSend').boundingBox().catch(() => null);
  m.tap = sb ? { x: (sb.x + sb.width / 2) * DPR, y: (sb.y + sb.height / 2) * DPR } : null;
  m.send = now();
  await page.locator('#btnSend').tap().catch(() => page.locator('#btnSend').click());
  seg = 'B';

  let lastLen = 0, lastChange = m.send, doneAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < BUILD_TIMEOUT_MS) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const f = document.getElementById('previewFrame'); const b = document.getElementById('btnSend');
      return { len: f ? (f.srcdoc || '').length : 0, busy: !!(b && b.disabled) };
    });
    if (st.len !== lastLen) { lastLen = st.len; lastChange = now(); }
    if (lastLen > 1200 && !st.busy && now() - lastChange > 4) { doneAt = lastChange; break; }
  }
  if (!doneAt) throw new Error('build did not finish (len=' + lastLen + ')');
  await page.waitForTimeout(1600);
  m.b1 = now();
  m.secs = Math.max(1, Math.round(doneAt - m.send));
  await cdp.send('Page.stopScreencast').catch(() => {});
  const code = await page.evaluate(() => document.getElementById('previewFrame').srcdoc || '');
  await page.close(); await ctx.close();

  // الموقع الناتج: لقطة كاملة الطول بعرض الجوال (سياق غير «جوال» كي لا يُعرض بعرض 980 حين تغيب وسم viewport).
  const sctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, locale: 'ar' });
  const sp = await sctx.newPage();
  await sp.setContent(code, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await sp.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sp.waitForTimeout(1200);
  const fullH = await sp.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
  for (let y = 0; y < fullH; y += VH / 2) { await sp.evaluate((yy) => window.scrollTo(0, yy), y); await sp.waitForTimeout(120); }
  await sp.evaluate(() => window.scrollTo(0, 0)); await sp.waitForTimeout(800);
  const capH = Math.min(fullH, VH * 5);
  const sitePng = path.join(dir, 'site.png');
  await sp.screenshot({ path: sitePng, fullPage: true, clip: { x: 0, y: 0, width: VW, height: capH } });
  await sp.close(); await sctx.close();
  fs.writeFileSync(path.join(dir, '..', 'site.html'), code);
  log('captured frames=' + frames.length + ' build=' + m.secs + 's code=' + code.length + 'ch site=' + VW + 'x' + capH);
  return { frames, m, sitePng, siteH: Math.round(capH * DPR), codeLen: code.length };
}

// ───────── المونتاج (صفحة استوديو تُرسم إطارًا إطارًا: العربيّة صحيحة الشكل) ─────────
function studioHTML(idea, secs) {
  const icon = pathToFileURL(path.join(ROOT, 'icons/icon-512-v2.png')).href;
  const brand = pathToFileURL(path.join(ROOT, 'icons/brand-om-s.png')).href;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:Tajawal,'Noto Sans Arabic',sans-serif;color:#fff}
#stage{position:fixed;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden}
#bg,#site,#end{position:absolute;inset:0}
#bg{width:${W}px;height:${H}px;object-fit:cover;transform-origin:50% 86%}
#site{overflow:hidden;display:none;background:#fff}
#siteImg{position:absolute;top:0;left:0;width:${W}px;transform-origin:50% 0}
.gold{background:linear-gradient(180deg,#ffe9a8,#e7b54a 55%,#b9822a);-webkit-background-clip:text;background-clip:text;color:transparent}
#hook{position:absolute;top:150px;left:60px;right:60px;padding:38px 40px;border-radius:44px;background:rgba(10,10,12,.82);border:3px solid rgba(231,181,74,.75);box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}
#hook .s{font-size:46px;font-weight:700;color:#e8e2d0;margin-bottom:10px}
#hook .b{font-size:74px;font-weight:900;line-height:1.25}
#hook .b .ln{display:block;white-space:nowrap;overflow:hidden}
#timer{position:absolute;top:1060px;left:50%;transform:translateX(-50%);text-align:center;padding:40px 70px;border-radius:60px;background:rgba(10,10,12,.86);border:3px solid rgba(231,181,74,.8);box-shadow:0 30px 90px rgba(0,0,0,.7);min-width:620px}
#timer .n{font-size:150px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
#timer .l{font-size:50px;font-weight:700;margin-top:16px;color:#f2ecd9}
#ready{position:absolute;top:120px;left:50%;transform:translateX(-50%);white-space:nowrap;max-width:1000px;overflow:hidden;padding:26px 54px;border-radius:999px;background:rgba(10,10,12,.9);border:3px solid #e7b54a;font-size:64px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.55)}
#wm{position:absolute;top:34px;left:34px;display:flex;align-items:center;gap:18px;padding:14px 30px 14px 22px;border-radius:999px;background:rgba(0,0,0,.72);border:2px solid rgba(231,181,74,.55)}
#wm img.i{width:60px;height:60px;border-radius:14px}#wm img.t{height:50px}
#tap{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;border:8px solid rgba(255,233,168,.95);background:rgba(231,181,74,.25);opacity:0}
#flash{position:absolute;inset:0;background:#fff;opacity:0}
#end{display:none;background:radial-gradient(120% 80% at 50% 30%,#2a2113 0%,#0b0a08 60%,#000 100%);text-align:center;padding-top:300px}
#end img.i{width:360px;height:360px;border-radius:80px;box-shadow:0 0 120px rgba(231,181,74,.45)}
#end img.t{display:block;margin:50px auto 0;height:150px}
#end .h{font-size:92px;font-weight:900;margin-top:70px;line-height:1.2}
#end .s{font-size:52px;font-weight:700;color:#efe7d2;margin-top:34px}
#end .u{display:inline-block;margin-top:60px;font-size:46px;font-weight:800;padding:22px 46px;border-radius:999px;border:3px solid #e7b54a;direction:ltr;color:#ffe9a8}
</style></head><body><div id="stage">
<img id="bg"><div id="site"><img id="siteImg"></div>
<div id="hook"><div class="s">بجملة وحدة بس ✍️</div><div class="b"><span class="ln gold">موقع ${esc(idea.name)}</span><span class="ln">في ${esc(secWord(secs))} ⚡</span></div></div>
<div id="timer"><div class="n gold">0</div><div class="l">OM Ai يبني الموقع…</div></div>
<div id="ready">✅ جاهز في <span class="gold">${esc(secWord(secs))}</span></div>
<div id="wm"><img class="i" src="${icon}"><img class="t" src="${brand}"></div>
<div id="tap"></div><div id="flash"></div>
<div id="end"><img class="i" src="${icon}"><img class="t" src="${brand}"><div class="h">سوّ موقعك أنت<br><span class="gold">ببلاش</span></div><div class="s">اكتب فكرتك… والذكاء الاصطناعي يسوّيها</div><div class="u">${SITE}</div></div>
</div><script>
const $=(id)=>document.getElementById(id);
let curBg='', curSite='';
window.fitAll=()=>{document.querySelectorAll('#hook .ln,#ready').forEach((el)=>{let fs=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1&&fs>28){fs-=2;el.style.fontSize=fs+'px';}});return true;};
window.apply=async(s)=>{
  const bg=$('bg');
  if(s.bg&&s.bg!==curBg){curBg=s.bg;bg.src=s.bg;try{await bg.decode()}catch(e){}}
  bg.style.display=s.bg?'block':'none';bg.style.transform='scale('+(s.bgZ||1)+')';
  $('site').style.display=s.site?'block':'none';
  if(s.site){const im=$('siteImg');if(im.src!==s.site){im.src=s.site;try{await im.decode()}catch(e){}} im.style.transform='translateY('+(-s.siteY)+'px) scale('+s.siteZ+')';}
  const set=(id,o,tf)=>{const e=$(id);e.style.opacity=o;e.style.display=o>0?'':'none';if(tf!=null)e.style.transform=tf;};
  set('hook',s.hook,'translateY('+((1-s.hook)*-40)+'px)');
  set('timer',s.timer,'translateX(-50%) scale('+(0.92+0.08*s.timer)+')');
  $('timer').querySelector('.n').textContent=s.timerN;
  set('ready',s.ready,'translateX(-50%) scale('+(0.9+0.1*s.ready)+')');
  set('wm',s.wm,null);
  const t=$('tap');t.style.opacity=s.tap;if(s.tapXY){t.style.left=s.tapXY.x+'px';t.style.top=s.tapXY.y+'px';t.style.transform='scale('+(0.6+0.6*(1-s.tap))+')';}
  $('flash').style.opacity=s.flash;
  $('end').style.display=s.end>0?'block':'none';$('end').style.opacity=s.end;
  return true;
};
</script></body></html>`;
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const ramp = (t, a, b, fade = 0.3) => clamp(Math.min((t - a) / fade, (b - t) / fade));

function frameAt(list, r) {
  let lo = 0, hi = list.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid].t <= r) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return list[ans];
}

export function timeline(m, siteH) {
  const realA = (m.send + 0.45) - m.a0;
  const dA = Math.min(realA, 6.5);
  const dB = 3.6;
  const scroll = Math.max(0, siteH - H);
  const dC = scroll > 600 ? 8.5 : 5;
  const dD = 3.6;
  return { realA, dA, dB, dC, dD, scroll, total: dA + dB + dC + dD };
}

async function compose(browser, cap, idea, outDir) {
  const { frames, m, sitePng, siteH } = cap;
  const tl = timeline(m, siteH);
  const A = frames.filter((f) => f.seg === 'A'), B = frames.filter((f) => f.seg === 'B');
  if (!A.length || !B.length) throw new Error('no frames captured');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const sp = await ctx.newPage();
  const studio = path.join(outDir, 'studio.html');
  fs.writeFileSync(studio, studioHTML(idea, m.secs));
  await sp.goto(pathToFileURL(studio).href, { waitUntil: 'load' });
  await sp.evaluate(() => document.fonts.ready).catch(() => {});
  await sp.evaluate(() => { const r = document.getElementById('ready'); r.style.display = ''; window.fitAll(); r.style.display = 'none'; return true; });
  const fdir = path.join(outDir, 'out'); fs.mkdirSync(fdir, { recursive: true });
  const siteURL = pathToFileURL(sitePng).href;
  const tB = tl.dA, tC = tl.dA + tl.dB, tD = tC + tl.dC;
  const N = Math.round(tl.total * FPS);
  const tapT = (m.send - m.a0) * (tl.dA / tl.realA);
  const typeT = (m.type0 - m.a0) * (tl.dA / tl.realA);
  const ZOOM = 1.08, OX = W / 2, OY = H * 0.86;
  const tapXY = m.tap ? { x: OX + (m.tap.x - OX) * ZOOM, y: OY + (m.tap.y - OY) * ZOOM } : null;
  const st = (t) => {
    const s = { bg: '', bgZ: 1, site: '', siteY: 0, siteZ: 1, hook: 0, timer: 0, timerN: '0', ready: 0, wm: 0, tap: 0, tapXY, flash: 0, end: 0 };
    if (t < tC) {
      const r = t < tB ? m.a0 + t * (tl.realA / tl.dA) : (m.send + 0.45) + (t - tB) / tl.dB * (m.b1 - (m.send + 0.45));
      s.bg = pathToFileURL(frameAt(t < tB ? A : B.length ? B : A, r).fn).href;
      s.hook = t < tB ? ramp(t, 0.15, tB - 0.05, 0.35) : 0;
      s.bgZ = 1 + (ZOOM - 1) * (ease((t - (typeT - 0.5)) / 0.6) - ease((t - (tapT + 0.1)) / 0.5));
      if (t >= tB) { const p = clamp((t - tB) / (tl.dB - 0.5)); s.timer = ramp(t, tB, tC, 0.25); s.timerN = String(Math.min(m.secs, Math.round(p * m.secs))); }
      if (tapXY && t > tapT - 0.05 && t < tapT + 0.5) s.tap = clamp(1 - (t - tapT) / 0.5);
      s.wm = 1;
      if (t > tC - 0.12) s.flash = clamp((t - (tC - 0.12)) / 0.12);
    } else if (t < tD) {
      const lt = t - tC;
      s.site = siteURL;
      if (tl.scroll > 600) s.siteY = ease((lt - 1.0) / (tl.dC - 2.0)) * tl.scroll; else s.siteZ = 1 + 0.06 * ease(lt / tl.dC);
      s.ready = ramp(t, tC + 0.15, tD + 10, 0.3);
      s.wm = 1;
      s.flash = clamp(1 - lt / 0.25);
      if (t > tD - 0.3) s.end = clamp((t - (tD - 0.3)) / 0.3);
    } else {
      s.end = 1; s.site = siteURL; s.siteY = tl.scroll;
    }
    return s;
  };
  for (let i = 0; i < N; i++) {
    await sp.evaluate((s) => window.apply(s), st(i / FPS));
    await sp.screenshot({ path: path.join(fdir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 });
  }
  // الغلاف: أوّل لحظة الموقع جاهزًا مع شارة الزمن.
  await sp.evaluate((s) => window.apply(s), { ...st(tC + 0.8), flash: 0, ready: 1 });
  const cover = path.join(outDir, 'cover.jpg');
  await sp.screenshot({ path: cover, type: 'jpeg', quality: 90 });
  await ctx.close();

  const wav = path.join(outDir, 'audio.wav');
  writeAudio(wav, tl, m, tapT);
  const mp4 = path.join(outDir, 'omai-reel.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(fdir, '%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  fs.rmSync(fdir, { recursive: true, force: true });
  log('video ' + tl.total.toFixed(1) + 's → ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + 'MB)');
  return { mp4, cover, tl };
}

// ───────── صوت خفيف مُولَّد (بلا موسيقى محميّة): نقرات الكتابة + جرس الاكتمال + خلفيّة هادئة ─────────
function writeAudio(file, tl, m, tapT) {
  const SR = 44100, n = Math.ceil(tl.total * SR), buf = new Float32Array(n);
  const k = tl.dA / tl.realA;
  const add = (t0, dur, fn) => { const s = Math.floor(t0 * SR); for (let i = 0; i < dur * SR && s + i < n; i++) if (s + i >= 0) buf[s + i] += fn(i / SR); };
  const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
  for (let i = 0; i < n; i++) {
    const t = i / SR, c = chords[Math.floor(t / 2.4) % chords.length];
    const env = clamp(t / 1.5) * clamp((tl.total - t) / 1.2);
    let v = 0; for (const f of c) v += Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t);
    buf[i] += v * 0.018 * env * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const chars = Math.round((m.type1 - m.type0) / m.keyDelay);
  for (let c = 0; c < chars; c++) add((m.type0 - m.a0 + c * m.keyDelay) * k, 0.03, (x) => rnd() * 0.22 * Math.exp(-x * 160));
  add(tapT, 0.12, (x) => Math.sin(2 * Math.PI * 900 * x) * 0.25 * Math.exp(-x * 40));
  const tC = tl.dA + tl.dB;
  for (let j = 0; j < 8; j++) add(tl.dA + j * (tl.dB / 8), 0.05, (x) => Math.sin(2 * Math.PI * 1500 * x) * 0.07 * Math.exp(-x * 90));
  add(tC, 1.6, (x) => (Math.sin(2 * Math.PI * 1046.5 * x) + 0.6 * Math.sin(2 * Math.PI * 1568 * x)) * 0.2 * Math.exp(-x * 3.2));
  add(tC + tl.dC, 1.8, (x) => (Math.sin(2 * Math.PI * 784 * x) + 0.5 * Math.sin(2 * Math.PI * 1174.7 * x)) * 0.16 * Math.exp(-x * 2.6));
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(clamp(buf[i], -1, 1) * 32767), 44 + i * 2);
  fs.writeFileSync(file, pcm);
}

// ───────── النشر عبر Upload-Post ─────────
async function upFetch(p, opts = {}) {
  const r = await fetch(UP_API + p, { ...opts, headers: { Authorization: 'Apikey ' + UP_KEY, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}

async function publish(mp4, cover, cap) {
  const fd = new FormData();
  fd.append('user', UP_USER);
  for (const p of PLATFORMS) fd.append('platform[]', p);
  fd.append('title', cap.ig);
  fd.append('video', new Blob([fs.readFileSync(mp4)], { type: 'video/mp4' }), 'omai-reel.mp4');
  if (PLATFORMS.includes('instagram')) {
    fd.append('media_type', 'REELS'); fd.append('share_to_feed', 'true');
    fd.append('cover_image', new Blob([fs.readFileSync(cover)], { type: 'image/jpeg' }), 'cover.jpg');
  }
  if (PLATFORMS.includes('facebook')) {
    const pg = await upFetch('/uploadposts/facebook/pages?profile=' + encodeURIComponent(UP_USER));
    const pages = (pg.j && pg.j.pages) || [];
    const page = pages.find((x) => /om\s*ai/i.test(x.name || '')) || pages[0];
    if (page) { fd.append('facebook_page_id', String(page.id)); log('facebook page: ' + page.name); } else log('no facebook page found (' + pg.status + ')');
    fd.append('facebook_title', cap.fb); fd.append('facebook_description', cap.fb); fd.append('facebook_media_type', 'REELS');
  }
  if (PLATFORMS.includes('tiktok')) fd.append('tiktok_title', cap.ig.slice(0, 2200));
  if (PLATFORMS.includes('youtube')) { fd.append('youtube_title', (cap.head + ' #shorts').slice(0, 100)); fd.append('youtube_description', cap.fb); }
  const reqId = 'omai-' + Date.now().toString(36) + randomBytes(3).toString('hex');
  fd.append('request_id', reqId); fd.append('async_upload', 'true');
  const r = await upFetch('/upload', { method: 'POST', body: fd, headers: { 'Idempotency-Key': reqId } });
  log('upload → ' + r.status + ' ' + JSON.stringify(r.j).slice(0, 300));
  if (!r.ok && r.status !== 202) throw new Error('upload failed ' + r.status);
  const id = r.j.request_id || reqId;
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const s = await upFetch('/uploadposts/status?request_id=' + encodeURIComponent(id));
    const status = s.j && s.j.status;
    if (['completed', 'failed', 'not_found'].includes(status) || (status === 'in_progress' && i > 40)) {
      log('status: ' + status + ' ' + JSON.stringify(s.j.results || s.j).slice(0, 600));
      if (status !== 'completed') throw new Error('publish ' + status);
      return s.j;
    }
  }
  log('status still pending after 10 min — check the Upload-Post dashboard');
  return null;
}

// ───────── التشغيل ─────────
async function main() {
  const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/social-bot-ideas.json'), 'utf8'));
  const { idx, idea } = pickIdea(ideas, process.env.IDEA_INDEX, process.env.GITHUB_RUN_NUMBER, Math.floor(Date.now() / 864e5));
  log('idea #' + idx + ': ' + idea.name);
  fs.rmSync(OUT, { recursive: true, force: true });
  const fr = path.join(OUT, 'frames'); fs.mkdirSync(fr, { recursive: true });
  const acct = await botAccount();
  if (!acct.vip && !/^(1|true)$/i.test(process.env.ALLOW_WEAK || '')) {
    throw new Error('bot account "' + acct.user + '" is not VIP (tier=' + acct.tier + ') — add "' + BOT_USER + '" in Settings → owner panel → ⭐ VIP, then re-run');
  }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: CHROME, args: CHROME ? ['--no-sandbox'] : [] });
  let res;
  try {
    const cap = await capture(browser, acct, idea, fr);
    res = await compose(browser, cap, idea, OUT);
    res.secs = cap.m.secs;
    res.codeLen = cap.codeLen;
  } finally { await browser.close(); }
  fs.rmSync(fr, { recursive: true, force: true });
  const caption = buildCaption(idea, res.secs);
  fs.writeFileSync(path.join(OUT, 'caption.txt'), caption.ig + '\n');
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ idea: idx, name: idea.name, secs: res.secs, vip: acct.vip, codeLen: res.codeLen, seconds: +res.tl.total.toFixed(1) }, null, 2));
  // بوّابة الجودة: موقع هزيل (نموذج مجانيّ/ردّ قصير) لا يُنشر باسم البراند.
  const MIN_CODE = Number(process.env.MIN_CODE || 5000);
  if (res.codeLen < MIN_CODE && !/^(1|true)$/i.test(process.env.ALLOW_WEAK || '')) {
    throw new Error('quality gate: generated site too small (' + res.codeLen + ' < ' + MIN_CODE + ' chars) — not publishing');
  }
  if (DRY || !UP_KEY) { log(DRY ? 'DRY_RUN — not publishing' : 'UPLOAD_POST_API_KEY missing — not publishing'); gh('notice', 'video ready (not published) · ' + idea.name + ' · build ' + res.secs + 's · site ' + res.codeLen + ' chars'); return; }
  await publish(res.mp4, res.cover, caption);
  log('published ✓');
  gh('notice', 'published ✓ ' + idea.name + ' · ' + res.secs + 's');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((e) => { const msg = e && e.message ? e.message : String(e); console.error('[social-bot] FAILED:', msg); gh('error', msg); process.exit(1); });
}
