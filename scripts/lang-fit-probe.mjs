#!/usr/bin/env node
// scripts/lang-fit-probe.mjs — هل تتّسع نصوص الواجهة بلغةٍ ما؟ (v-ml-fit)
// يفتح التطبيق محلّيًّا كما يفعل ui-shot.mjs (المستودع ثابتًا، /api/* = {}) ويقيس في المواضع الستّة التي ظهرت مقصوصة
// بالمالايالاميّة: نصّ يفيض عن صندوقه (قصّ «…» أو فيض فوق الجار)، وسطر مخفيّ بحدّ الأسطر، وكلمة مكسورة في منتصفها
// بين سطرين، ونصّ خارج دائرة الحلقة أو لوحة الرفع، وتلاصق تسميات تذييل الشريط. ويصوّر كلّ موضع مع قصّ مكبّر لكلّ نصّ.
//
//   node scripts/lang-fit-probe.mjs --lang ml --out <dir> [--pw <playwright-core>] [--scale 3] [--only home,style]
//        [--mobile]      تخطيط الجوّال (٤٠٠×٨٦٠ لمس) بدل الحاسوب: الشريط السفليّ بدل تذييل الجانبيّ (v-ml-fit-mobile)
//        [--width <px>]  عرض الجوّال بدل ٤٠٠ (هاتف المالك المطويّ ~٣٥٤، والمفتوح ~٧٣٢)
//        [--android]     خطّ Noto Sans Malayalam (خطّ أندرويد) بدل خطّ النظام (ويندوز: Nirmala UI) — من Google Fonts بنسخة مخبَّأة
//        [--fonts <dir>] مجلّد الخطوط المخبَّأة (الافتراضيّ <out>/../gfonts-cache)
// يحفظ <out>/<lang>[-mobile[<width>]][-android]/report.json ولقطة لكلّ موضع وقصًّا لكلّ نصّ، وينتهي بالرمز 1 إن بقيت علّة أو خطأ في الصفحة.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const LANG = /^[a-z]{2,3}$/.test(String(opt('lang', 'ml'))) ? String(opt('lang', 'ml')) : 'ml';
const ANDROID = !!opt('android', false);
const MOBILE = !!opt('mobile', false);
const MW = Math.max(280, Math.min(860, Number(opt('width', 400)) || 400));
const OUT = path.resolve(String(opt('out', path.join(ROOT, '.shots', 'lang-fit'))));
const DIR = path.join(OUT, LANG + (MOBILE ? '-mobile' + (MW !== 400 ? MW : '') : '') + (ANDROID ? '-android' : ''));
const SCALE = Number(opt('scale', 2)) || 2;
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const FCACHE = path.resolve(String(opt('fonts', path.join(OUT, '..', 'gfonts-cache'))));

// المواضع: كلّ نصّ (sel) يُقاس مقابل صندوقه — العنصر نفسه إن كان يقصّ (overflow أو «…»)، وclip = سلفٌ يقصّه أو يجاوره؛
// circle = سلف دائريّ يقصّ بنصف قطره، plate = مستطيل بنسب من سلف (لوحة الرفع في الصورة)، row = تسميات صفّ واحد يُقاس ما بينها.
// واجهة اللوحة الذهبيّة في style.webp: ٣٨–٦٢٪ عرضًا و٦٧–٨٣٪ ارتفاعًا (css/رفع-الصور.css، v-style-plate-fit) — نِسب من الصورة نفسها
// (٢:١، background:center/cover): الخانة الأطول من ٢:١ (المالايالاميّة على الهاتف ٧:٥) تقصّ جانبَي الصورة فتتّسع اللوحة فيها
const STYLE_PLATE = { of: '.omUpStyle', img: 2, x: [0.38, 0.62], y: [0.67, 0.83] };
const NAV_ROWS = [
  { sel: '#omranSidebarFoot .omNavBtn > span, #omranSidebarFoot .omModeNavLabel', clip: 'button', row: true },
  // الجوّال: تبويبات الشريط السفليّ الخمسة (#omranBottomNav، وزرّ الوضع يُلحق به خامسًا — app-05-ui.js v-mode-nav)
  // وتسميته سطر واحد: الشريط ثابت الارتفاع والتفاف تسمية يطيله كلّه فوق المحتوى (تذييل الحاسوب يلفّ «ലൈറ്റ് / മോഡ്» عمدًا، #1343)
  { sel: '#omranBottomNav .omNavBtn > span, #omranBottomNav .omModeNavLabel', clip: 'button', row: true, oneLine: true }];
const JOBS = [
  { name: 'home', vp: [900, 581], targets: NAV_ROWS },
  // الوضع الفاتح: زرّ الوضع يقول «الوضع الداكن» — أطول بالمالايالاميّة («ഡാർക്ക് മോഡ്» ٨em مقابل «ലൈറ്റ് മോഡ്» ٧em)
  { name: 'homeLight', vp: [900, 581], eval: 'window.omToggleMode()', settle: 900, targets: NAV_ROWS },
  { name: 'style', vp: [900, 581], eval: "document.getElementById('btnStudioAI').click()", settle: 3000, targets: [
    { sel: '.omUpStyle .omUpB', plate: STYLE_PLATE }] },
  // «دمج صور»: الخانتان جنبًا إلى جنب (#studioAiSlots.two) — كلّ لوحة نصف عرضها
  { name: 'merge', vp: [900, 581], eval: "document.getElementById('btnStudioAI').click(); setTimeout(() => document.querySelector('.studioAiTabBtn[data-feature=\"merge\"]').click(), 1200)", settle: 3200, targets: [
    { sel: '#studioAiSlots.two .omUpStyle .omUpB', plate: STYLE_PLATE }] },
  { name: 'portrait', vp: [900, 581], eval: "document.getElementById('btnPortraitStyle').click()", settle: 3000, targets: [
    { sel: '#portraitStyleHero .pstyleHeroT > i', circle: '.pstyleHeroT' }] },
  { name: 'video', vp: [900, 581], eval: "document.getElementById('btnVideoMaker').click()", settle: 3000, targets: [
    { sel: '#vmkTabs .vmk-tab-lbl', clip: '.vmk-tab' }] },
  { name: 'tools', vp: [1240, 800], eval: "document.getElementById('sectionsToolsOverlay').classList.add('show')", settle: 2500, targets: [
    { sel: '#sectionsToolsPopup .ptSectionsView .ptGrid .btn.hasToolPhoto .btnLabel', clip: '.btn' }] },
  { name: 'themes', vp: [900, 581], eval: "(() => { const d = document.getElementById('settingsDialog'); try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } renderSettingsNavList(); showSettingsPage('bgImgSection'); })()", settle: 1500, targets: [
    { sel: '.bgImgGrid .bgImgOpt.bgImgNone, .bgImgGrid .bgImgOpt.bgImgAdd', clip: '.bgImgOpt' }] },
].filter((j) => !ONLY || ONLY.includes(j.name));

// يُنفَّذ في الصفحة. نطاقات النصّ (Range) تعيد صناديق السطور كلّها حتّى ما أخفاه «…» أو حدّ الأسطر، فيُقاس الفيض لا ما رُسم.
function measurePage(targets) {
  const px = (v) => parseFloat(v) || 0;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const textNodes = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) if (n.nodeValue.trim()) a.push(n); return a; };
  const rectsOf = (node, s, e) => { const rg = document.createRange(); rg.setStart(node, s); rg.setEnd(node, e); return Array.from(rg.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5); };
  const lineYs = (rs) => { const ys = []; rs.forEach((r) => { const c = r.top + r.height / 2; if (!ys.some((y) => Math.abs(y - c) < Math.max(3, r.height * 0.4))) ys.push(c); }); return ys; };
  // الكلمات: ما بين الفراغات والفاصل الصفريّ U+200B (موضع كسر مقصود، كـ«Comic/Manga» في الحلقة)
  const words = (s) => { const out = []; let st = -1; for (let i = 0; i <= s.length; i++) { const ch = s.charAt(i); const sep = i === s.length || ch.trim() === '' || ch.charCodeAt(0) === 0x200B;
    if (!sep && st < 0) st = i; if (sep && st >= 0) { out.push([st, i]); st = -1; } } return out; };
  const r2 = (v) => Math.round(v * 10) / 10;
  const out = [];
  for (const t of targets) {
    const els = Array.from(document.querySelectorAll(t.sel)).filter(vis);
    els.forEach((el, idx) => {
      const nodes = textNodes(el); if (!nodes.length) return;
      let rs = []; const broken = [];
      nodes.forEach((n) => {
        rs = rs.concat(rectsOf(n, 0, n.nodeValue.length));
        words(n.nodeValue).forEach(([s, e]) => { if (lineYs(rectsOf(n, s, e)).length > 1) broken.push(n.nodeValue.slice(s, e)); });
      });
      if (!rs.length) return;
      const tx = { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top)), b: Math.max(...rs.map((r) => r.bottom)) };
      const cs = getComputedStyle(el), own = el.getBoundingClientRect();
      const pad = { l: own.left + px(cs.borderLeftWidth), r: own.right - px(cs.borderRightWidth), t: own.top + px(cs.borderTopWidth), b: own.bottom - px(cs.borderBottomWidth) };
      const content = { l: pad.l + px(cs.paddingLeft), r: pad.r - px(cs.paddingRight), t: pad.t + px(cs.paddingTop), b: pad.b - px(cs.paddingBottom) };
      // صناديق القصّ: «…» يبدأ عند حدّ المحتوى، وoverflow عند حدّ الحشوة، والسلف (clip) بحدّه كلّه — أو بحشوته إن كان العنصر نفسه
      const boxes = [];
      if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible') boxes.push(content);
      else if (cs.overflowX !== 'visible') boxes.push(pad);
      const anc = t.clip ? el.closest(t.clip) : null;
      if (anc) { const a = anc.getBoundingClientRect(); boxes.push(anc === el ? pad : { l: a.left, r: a.right, t: a.top, b: a.bottom }); }
      let cutX = 0; boxes.forEach((c) => { cutX = Math.max(cutX, c.l - tx.l, tx.r - c.r); });
      const ys = lineYs(rs);
      const hidden = ys.filter((y) => boxes.some((c) => y < c.t || y > c.b)).length; // سطر مركزه خارج الصندوق = مخفيّ (حدّ الأسطر)
      let circleOut, plateOut;
      if (t.circle) { // الدائرة تقصّ بحافّتها الداخليّة (overflow:hidden + border-radius:50%)؛ يُقاس الشريط الأوسط من السطر (الحبر لا ارتفاع السطر)
        const c = el.closest(t.circle), cr = c.getBoundingClientRect(), bw = px(getComputedStyle(c).borderLeftWidth);
        const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2, R = Math.min(cr.width, cr.height) / 2 - bw;
        circleOut = 0;
        rs.filter((r) => boxes.every((b) => r.top + r.height / 2 >= b.t && r.top + r.height / 2 <= b.b)).forEach((r) => {
          const y1 = r.top + r.height * 0.15, y2 = r.bottom - r.height * 0.15, dy = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); // الوتر يضيق بالبعد: الطرف الأبعد
          const half = Math.sqrt(Math.max(0, R * R - dy * dy)); circleOut = Math.max(circleOut, cx - half - r.left, r.right - (cx + half)); });
        circleOut = r2(Math.max(0, circleOut));
      }
      if (t.plate) { // نِسب اللوحة من الصورة؛ الصورة مغطّية (cover) موسّطة: تُقصّ من الجانبين أو من فوق وتحت بحسب نسبة الخانة
        const pr = el.closest(t.plate.of).getBoundingClientRect();
        const iw = Math.max(pr.width, pr.height * (t.plate.img || pr.width / pr.height)), ih = iw / (t.plate.img || pr.width / pr.height);
        const il = pr.left + (pr.width - iw) / 2, it = pr.top + (pr.height - ih) / 2;
        const P = { l: il + iw * t.plate.x[0], r: il + iw * t.plate.x[1], t: it + ih * t.plate.y[0], b: it + ih * t.plate.y[1] };
        plateOut = r2(Math.max(0, P.l - tx.l, tx.r - P.r, P.t - tx.t, tx.b - P.b));
      }
      const B = boxes[boxes.length - 1] || content;
      out.push({ sel: t.sel, i: idx, text: nodes.map((n) => n.nodeValue).join('').trim().slice(0, 60), fs: cs.fontSize, lh: cs.lineHeight,
        lines: ys.length, hidden, cutX: r2(cutX), broken, circleOut, plateOut,
        box: [r2(B.l), r2(B.t), r2(B.r - B.l), r2(B.b - B.t)], tx: [r2(tx.l), r2(tx.t), r2(tx.r - tx.l), r2(tx.b - tx.t)], row: !!t.row, oneLine: !!t.oneLine });
    });
  }
  // تسميات الصفّ الواحد (كلّ محدِّد صفّ وحده): المسافة بين نصّ كلّ تسمية والتالية بترتيبها البصريّ (سالبة = تداخل)
  new Set(out.filter((m) => m.row).map((m) => m.sel)).forEach((sel) => {
    const rows = out.filter((m) => m.row && m.sel === sel).sort((a, b) => a.tx[0] - b.tx[0]);
    for (let k = 1; k < rows.length; k++) rows[k].gapBefore = r2(rows[k].tx[0] - (rows[k - 1].tx[0] + rows[k - 1].tx[2]));
  });
  return out;
}

async function loadPlaywright() {
  const explicit = opt('pw', '');
  const cands = explicit ? [String(explicit)] : ['playwright', 'playwright-core'];
  const req = createRequire(import.meta.url);
  for (const c of cands) { try { return await import(pathToFileURL(req.resolve(c)).href); } catch (e) { /* التالي */ } }
  throw new Error('playwright غير موجود — مرّر --pw مسار playwright-core');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };
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

// Google Fonts يعلّق أحيانًا من جهاز المالك فيحجب الصفحة — نسخة مخبَّأة (كمسبار التباين)، وإلّا خطّ احتياطيّ
fs.mkdirSync(FCACHE, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function cachedCss(file, url) {
  const f = path.join(FCACHE, file);
  if (!fs.existsSync(f)) {
    try { const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) }); if (r.ok) fs.writeFileSync(f, await r.text()); }
    catch (e) { console.error('gfonts: بلا شبكة — ' + file); }
  }
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}
const appCssUrl = ((fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/) || [])[0] || '').replace(/&amp;/g, '&');
const APP_CSS = appCssUrl ? await cachedCss('gfonts.css', appCssUrl) : '';
// --android: وجوه Noto Sans Malayalam بمدى المالايالام وحده تحت أسماء خطوط التطبيق — اللاتينيّ كما هو والمالايالاميّ بخطّ أندرويد
let ANDROID_CSS = '';
if (ANDROID) {
  const css = await cachedCss('noto-ml.css', 'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;500;600;700;800;900&display=swap');
  const faces = (css.match(/@font-face\s*{[^}]*}/g) || []).filter((f) => /U\+0?D00/i.test(f));
  if (!faces.length) { console.error('--android: تعذّر جلب Noto Sans Malayalam'); process.exit(2); }
  // خطوط النظام (Arial وTahoma — اسم بطاقات الأدوات مثلًا) يحجبها @font-face بالاسم نفسه: وجهها المحلّيّ أوّلًا بالمدى كلّه، ثمّ وجه
  // المالايالام بعده فيغلبه في مداه وحده (الوجه الأخير يغلب في المدى المتداخل)
  for (const fam of ['Arial', 'Tahoma']) ANDROID_CSS += "@font-face{font-family:'" + fam + "';src:local('" + fam + "');font-weight:100 600;}\n@font-face{font-family:'" + fam + "';src:local('" + fam + " Bold');font-weight:700 900;}\n";
  for (const fam of ['Inter', 'Tajawal', 'Plus Jakarta Sans', 'IBM Plex Sans Arabic', 'Arial', 'Tahoma']) ANDROID_CSS += faces.map((f) => f.replace(/font-family:\s*'[^']+'/, "font-family:'" + fam + "'")).join('\n') + '\n';
}

const pwMod = await loadPlaywright();
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
const browser = await chromium.launch({ args: LANG === 'ar' ? [] : ['--lang=en-US'] });
fs.mkdirSync(DIR, { recursive: true });
const report = { lang: LANG, mobile: MOBILE, android: ANDROID, base, out: DIR, jobs: {}, pageErrors: [], bad: 0 };
try {
  for (const job of JOBS) {
    const vp = MOBILE ? [MW, 860] : job.vp;
    const ctx = await browser.newContext(Object.assign({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: SCALE, locale: LANG === 'ar' ? 'ar' : 'en-US' },
      MOBILE ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' } : {}));
    await ctx.addInitScript(({ l }) => {
      try { sessionStorage.setItem('omran_sess_v1', '1'); } catch (e) { /* لا شيء */ }
      try { localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', l);
        localStorage.setItem('aiapp_username', 'saif'); localStorage.setItem('aiapp_auth_token', 'local'); } catch (e) { /* لا شيء */ }
    }, { l: LANG });
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: APP_CSS + ANDROID_CSS }));
    await ctx.route(/fonts\.gstatic\.com/, async (r) => {
      const u = r.request().url(); const f = path.join(FCACHE, u.replace(/[^\w.-]+/g, '_').slice(-150));
      const ok = (b) => r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: b });
      if (fs.existsSync(f)) return ok(fs.readFileSync(f));
      try { const res = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!res.ok) throw new Error(String(res.status)); const b = Buffer.from(await res.arrayBuffer()); fs.writeFileSync(f, b); return ok(b); }
      catch (e) { return r.abort(); }
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(job.name + ': ' + String(e && e.message || e).slice(0, 200)));
    for (let k = 0; k < 3; k++) { try { await page.goto(base + '/', { waitUntil: 'load', timeout: 90000 }); break; } catch (e) { console.error('goto retry', k); } }
    await page.waitForTimeout(2500);
    await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
    if (job.eval) { await page.evaluate(job.eval); await page.waitForTimeout(job.settle || 1500); }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const ms = await page.evaluate(measurePage, job.targets);
    await page.screenshot({ path: path.join(DIR, job.name + '.png') });
    for (const [k, m] of ms.entries()) { // قصّ مكبّر: صندوق النصّ مع صندوقه وهامش ٦px
      const x = Math.max(0, Math.min(m.box[0], m.tx[0]) - 6), y = Math.max(0, Math.min(m.box[1], m.tx[1]) - 6);
      const x2 = Math.min(vp[0], Math.max(m.box[0] + m.box[2], m.tx[0] + m.tx[2]) + 6), y2 = Math.min(vp[1], Math.max(m.box[1] + m.box[3], m.tx[1] + m.tx[3]) + 6);
      if (x2 - x > 2 && y2 - y > 2) { m.crop = job.name + '-' + String(k).padStart(2, '0') + '.png'; await page.screenshot({ path: path.join(DIR, m.crop), clip: { x, y, width: x2 - x, height: y2 - y } }); }
      // الفجوة بين تسميتين متجاورتين أقلّ من ٠٫٨em (نحو ثلاثة فراغات بين كلمتين) تُقرأ معها جملة واحدة: «ക്രമീകരണങ്ങൾ ലൈറ്റ് മോഡ്»؛
      // وتسمية الشريط السفليّ سطر واحد: «ഡാർക്ക് മോഡ്» ملتفّة سطرين على ٣٥٤ أطالت الشريط كلّه ٤٤←٥٦px
      m.gapMin = Math.round(Math.max(4, 0.8 * parseFloat(m.fs)) * 10) / 10;
      m.bad = m.cutX > 0.5 || m.hidden > 0 || m.broken.length > 0 || (m.circleOut || 0) > 0.5 || (m.plateOut || 0) > 0.5 ||
        (m.gapBefore != null && m.gapBefore < m.gapMin) || (m.oneLine && m.lines > 1);
      if (m.bad) report.bad++;
    }
    report.jobs[job.name] = ms;
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 1));
for (const [name, ms] of Object.entries(report.jobs)) {
  console.log('— ' + name + ': ' + ms.length + ' نصًّا، ' + ms.filter((m) => m.bad).length + ' فيه علّة');
  ms.filter((m) => m.bad).forEach((m) => console.log('   ✗ «' + m.text + '» fs=' + m.fs + ' lines=' + m.lines + (m.hidden ? ' hidden=' + m.hidden : '') + (m.cutX ? ' cutX=' + m.cutX : '') +
    (m.broken.length ? ' broken=' + m.broken.join('|') : '') + (m.circleOut ? ' circle=' + m.circleOut : '') + (m.plateOut ? ' plate=' + m.plateOut : '') + (m.gapBefore != null ? ' gap=' + m.gapBefore : '')));
}
if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors);
console.log(JSON.stringify({ lang: LANG, mobile: MOBILE, android: ANDROID, bad: report.bad, out: DIR }));
if (report.bad || report.pageErrors.length) process.exit(1);
