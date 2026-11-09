#!/usr/bin/env node
// scripts/video-anime-tour.mjs — فيديو جولة «أنمي» في التطبيق كلّه (~٢:٤٠): مها بشكل أنمي تدخل كلّ مكان وتشرحه بجملة.
//   ١) capture: لقطات حادّة (DPR 2) من التطبيق الحقيقيّ لكلّ مكان — المحادثة، تطبيق مبنيّ، الكود، مها، الأدوات الخمس عشرة،
//      الثيمات. بلا شبكة ولا توليد مدفوع: الخادم المحلّيّ يردّ {} وردود الأسهم بيانات توضيحيّة (الرسم برسّام التطبيق نفسه).
//   ٢) render: تركيب أنمي يُرسم بدالّة زمنيّة حتميّة R(t) ويُصوَّر إطارًا إطارًا (٣٠/ث، ١٩٢٠×١٠٨٠): شخصيّة مها «تشيبي» SVG مرسومة
//      باليد (لا صورة مولَّدة)، خطوط سرعة، نقاط هافتون، بطاقات عناوين بحدود سميكة، فقاعات كلام عربيّة بخطّ حادّ.
//   ٣) audio: موسيقى افتتاحيّة أنمي مولَّدة بالكود (تتابع IV–V–iii–vi، ١٤٠ نبضة) ومؤثّرات (هبّة، لمعة، ضربة) على مواضع المشاهد.
//   ٤) encode: ffmpeg ‏H.264 ‏crf 26 ‏tune animation + AAC (قِيس: نصّ اللقطة والفقاعة كما في crf 20 بنصف الحجم تقريبًا).
// الاستعمال: node scripts/video-anime-tour.mjs [--stage all|capture|render|audio|encode] [--work DIR] [--out video/final/anime-tour-ar.mp4]
//            [--from 0 --to 30]  (معاينة مقطع) [--patch] (إعادة رسم المقطع فوق الإطارات الموجودة)  [--frames 12.5,40]  (إطارات مفردة للفحص)
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
const STAGE = opt('stage', 'all');
const WORK = path.resolve(opt('work', path.join(os.tmpdir(), 'anime-tour')));
const OUT = path.resolve(ROOT, opt('out', 'video/final/anime-tour-ar.mp4'));
const FPS = 30;
const SHOTS = path.join(WORK, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const base = p.startsWith('/__work/') ? WORK : ROOT;
  const f = path.join(base, p.replace(/^\/__work\//, '/'));
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

// ───────────────────────── ١) اللقطات ─────────────────────────
// بيانات توضيحيّة لشاشة الأسهم وحدها (الخادم المحلّيّ بلا شبكة): مسار سعر صاعد هادئ يرسمه رسّام التطبيق نفسه
function stocksMock(mode) {
  if (mode === 'quote') return { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', currency: 'USD', price: 231.4, change: 2.86, changePct: 1.25, open: 228.9, high: 232.1, low: 228.2, volume: 48210000 };
  if (mode === 'series') {
    const values = []; let c = 198; const d0 = Date.UTC(2026, 7, 10);
    for (let i = 0; i < 64; i++) { c += Math.sin(i * 0.7) * 2.1 + Math.cos(i * 0.23) * 1.4 + 0.52; values.push({ t: new Date(d0 + i * 86400000).toISOString().slice(0, 10), c: Math.round(c * 100) / 100 }); }
    return { values };
  }
  if (mode === 'ticker') return { items: [['AAPL', 231.4, 1.25], ['MSFT', 498.2, 0.84], ['NVDA', 182.7, 2.1], ['TSLA', 342.5, -0.9], ['AMZN', 228.3, 0.6], ['GOOGL', 201.9, 1.1]].map(([s, p, c]) => ({ symbol: s, price: p, change: p * c / 100, changePct: c })) };
  if (mode === 'gold') return {};
  return {};
}

// كلّ مكان: كيف يُفتح، ومستطيل التركيز (بكسلات CSS في نافذة ١٢٨٠×٨٠٠) الذي تقترب منه الكاميرا
const PLACES = [
  { id: 'home', prep: async (p) => { await p.fill('#prompt', 'سوّ لي لعبة ذاكرة للأطفال'); }, focus: '#prompt' },
  { id: 'built', prep: async (p) => { await p.evaluate(() => buildDemoProject()); await p.waitForTimeout(1600); }, focus: '#workarea' },
  { id: 'code', prep: async (p) => { await p.evaluate(() => buildDemoProject()); await p.waitForTimeout(900); await p.evaluate(() => document.querySelector('.tab[data-tab=code]').click()); await p.waitForTimeout(600); }, focus: '#workarea' },
  { id: 'maha', prep: async (p) => { await p.evaluate(() => showMahaDemo()); await p.waitForTimeout(900); }, focus: '#mahaCallScreen' },
  { id: 'tools', prep: async (p) => { await openTools(p); }, focus: '#sectionsToolsPopup' },
  ...['btnPortraitStyle', 'btnVideoMaker', 'btnDesignAI', 'btnFashionAI', 'btnStudioAI', 'btnAdStudio', 'btnStocks', 'btnDocs', 'btnEmailAssist', 'btnConstruction', 'btnQibla', 'btnOmranEdu', 'btnReligion', 'btnFeedback']
    .map((b) => ({ id: b, prep: async (p) => { await openTools(p); await p.evaluate((x) => document.getElementById(x).click(), b); await p.waitForTimeout(b === 'btnAdStudio' ? 2600 : 2200); if (EXTRA[b]) await EXTRA[b](p); }, focus: null })),
  { id: 'themes', prep: async (p) => { await p.evaluate(() => { window.خلفيات.طبّق(window.خلفيات.ثيم('أنمي-نيون')); }); await p.waitForTimeout(1400); }, focus: null },
];
const EXTRA = {
  btnStocks: async (p) => {
    await p.evaluate(() => { const g = document.getElementById('stockGlobalWrap'); if (g) g.style.display = 'none'; });
    await p.evaluate(() => { const s = document.getElementById('stocksSearchBtn'); if (s) s.click(); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { const i = document.getElementById('stockSymbolInput'); i.value = 'AAPL'; document.getElementById('stockLoadBtn').click(); });
    await p.waitForTimeout(1200);
  },
  // الترندات صورها من الخادم؛ قسم «سينمائي» فيه الصانع كاملًا (الوصف، صورة البطل، مساعد الكتابة، المدّة، الشكل)
  btnVideoMaker: async (p) => { await p.evaluate(() => { const b = document.querySelector('#vmkTabs [data-tab=veo]'); if (b) b.click(); }); await p.waitForTimeout(1800); },
};

async function openTools(p) { await p.evaluate(() => document.querySelector('.omDeskNav[data-omnav=tools]').click()); await p.waitForTimeout(700); }

async function capture() {
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const meta = [];
  try {
    const only = (opt('only', '') || '').split(',').filter(Boolean);
    const old = fs.existsSync(path.join(SHOTS, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(SHOTS, 'meta.json'), 'utf8')) : [];
    for (const pl of PLACES) {
      if (only.length && !only.includes(pl.id)) { const o = old.find((m) => m.id === pl.id); if (o) meta.push(o); continue; }
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'ar', geolocation: { latitude: 25.2048, longitude: 55.2708 }, permissions: ['geolocation'], timezoneId: 'Asia/Dubai' });
      await ctx.addInitScript(() => {
        try { sessionStorage.setItem('omran_sess_v1', '1'); localStorage.setItem('aiapp_intro', '0'); localStorage.setItem('aiapp_privacy_ack', '1'); localStorage.setItem('aiapp_lang', 'ar'); localStorage.setItem('aiapp_username', 'ahmed'); localStorage.setItem('aiapp_auth_token', 'local'); } catch (e) { /* لا شيء */ }
        // مشروع توضيحيّ: طلب المستخدم وردّ قصير وكود لعبة الذاكرة من قوالب التطبيق نفسها
        window.buildDemoProject = () => {
          const tpl = (window.TEMPLATES || (typeof TEMPLATES !== 'undefined' ? TEMPLATES : [])).find((x) => x.id === 'memory');
          const id = 'p_demo';
          state.projects = state.projects.filter((x) => x.id !== id);
          state.projects.push({ id, title: 'لعبة الذاكرة', messages: [
            { role: 'user', content: 'سوّ لي لعبة ذاكرة للأطفال' },
            { role: 'assistant', content: 'جاهزة! لعبة ذاكرة فيها ١٦ بطاقة وزرّ «لعبة جديدة» — جرّبها في المعاينة.' },
          ], code: tpl ? tpl.code : '<h1>Demo</h1>' });
          state.currentId = id; renderAll();
        };
        window.showMahaDemo = () => {
          const s = document.getElementById('mahaCallScreen'); s.style.display = 'flex';
          Object.assign(s.style, { left: '50%', top: '50%', right: 'auto', bottom: 'auto', transform: 'translate(-50%,-50%)' });
          const w = document.getElementById('mahaGoldWave'); if (w) w.style.display = 'block';
          const o = document.getElementById('mahaOrb'); if (o) o.style.display = 'none';
          const st = document.getElementById('mahaStateLabel'); if (st) st.textContent = 'أسمعك…';
        };
      });
      await ctx.route('**/api/tools?action=stocks', async (route) => {
        let mode = ''; try { mode = JSON.parse(route.request().postData() || '{}').mode; } catch (e) { /* لا شيء */ }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stocksMock(mode)) });
      });
      // مواقيت الصلاة تأتي من خدمة خارجيّة: أوقات دبي التقريبيّة لهذا الموسم (توضيحيّة) بشكل ردّها نفسه
      await ctx.route('https://api.aladhan.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: {
        timings: { Fajr: '05:08', Sunrise: '06:23', Dhuhr: '12:03', Asr: '15:13', Sunset: '17:42', Maghrib: '17:42', Isha: '18:57', Imsak: '04:58', Midnight: '00:03' },
        date: { hijri: { day: '28', month: { number: 5, en: 'Jumādá al-ūlá', ar: 'جُمادى الأولى' }, year: '1448' } } } }) }));
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
      await page.goto(base + '/', { waitUntil: 'load' });
      await page.waitForTimeout(1600);
      await page.evaluate(() => { ['omranIntro', 'privacyConsent'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); }); });
      await pl.prep(page);
      await page.waitForTimeout(500);
      let focus = null;
      if (pl.focus) focus = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, pl.focus);
      const file = pl.id + '.png';
      await page.screenshot({ path: path.join(SHOTS, file) });
      meta.push({ id: pl.id, file, focus, errs });
      console.log('📸', pl.id, focus ? JSON.stringify(focus) : '', errs.length ? '⚠️ ' + errs.join(' | ') : '');
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(SHOTS, 'meta.json'), JSON.stringify(meta, null, 1));
}

// ───────────────────────── ٢) السيناريو ─────────────────────────
// الزمن بالمازورة: ١٤٠ نبضة، المازورة ٤ نبضات = ١٫٧١٤ث — كلّ قطع على رأس مازورة فيقع على إيقاع الموسيقى.
const BPM = 140, BAR = 240 / BPM;
const CHAP = {
  sky: { a: '#2b6fd6', b: '#9fd6ff', ac: '#ffd166' },
  home: { a: '#140d02', b: '#4a3208', ac: '#f2c94c', name: 'البداية' },
  create: { a: '#22072f', b: '#7a1d86', ac: '#ff5fa2', name: 'إبداع' },
  work: { a: '#04142e', b: '#0b5aa0', ac: '#39c6ff', name: 'أعمال' },
  life: { a: '#032019', b: '#0f7a5c', ac: '#3ee6a8', name: 'حياة يومية' },
  style: { a: '#1d0b33', b: '#b23a7a', ac: '#ffb86b', name: 'المظهر' },
  sunset: { a: '#3b2a7a', b: '#ff7a8a', ac: '#ffd166' },
};
// f = نقطة التقريب (نسبة من اللقطة)، z = مقدار التقريب في آخر المشهد — أو r = مستطيل المحتوى [x0,y0,x1,y1] يملأ الإطار في آخره
// (للشاشات القليلة المحتوى: يقرّب على ما فيها بلا قصّ)، eyes = تعبير مها بعد الجملة
const SCENES = [
  { k: 'intro', bars: 4, chap: 'sky', lines: ['هلا والله! أنا مها', 'تعال أوريك OM Ai كلّه… مكان مكان!'] },
  { k: 'title', bars: 2, chap: 'sky' },
  { k: 'shot', shot: 'home', bars: 4, chap: 'home', title: 'الشاشة الرئيسية', line: 'اكتب طلبك عادي بالعربي… مثل ما تكلّم صاحبك', f: [0.56, 0.9], z: 1.7 },
  { k: 'shot', shot: 'built', bars: 4, chap: 'home', title: 'يبنيه قدّامك!', line: 'وخلال ثواني يصير عندك تطبيق شغّال تجرّبه على طول', f: [0.22, 0.42], z: 1.35, eyes: 'star' },
  { k: 'shot', shot: 'code', bars: 3, chap: 'home', title: 'الكود', line: 'تبي الكود؟ موجود… تعدّله وتنزّله', f: [0.2, 0.3], z: 1.3 },
  { k: 'shot', shot: 'maha', bars: 4, chap: 'home', title: 'مها', line: 'وهذي أنا! كلّمني بصوتك وأساعدك في كلّ شي', f: [0.5, 0.45], z: 1.45, eyes: 'happy' },
  { k: 'shot', shot: 'tools', bars: 4, chap: 'home', title: 'الأدوات', line: '١٤ أداة في ٣ أقسام… يلا ندخلها وحدة وحدة!', f: [0.5, 0.4], z: 1.12 },
  { k: 'chapter', bars: 2, chap: 'create', title: 'إبداع', sub: '٥ أدوات تطلّع الفنّان اللي فيك', shout: 'يلا!' },
  // ex = مثال حقيقيّ بعد اللقطة: ba قبل/بعد من خطّ الإنتاج نفسه (portrait-thumbs: نفس الصورة المصدر لكلّ ستايل)، clip فيديو
  // صنعه التطبيق (media/samples/index.json)، gallery أمثلة خيارات من التطبيق (تُسمّى «أمثلة» لا «صورتك»). الأسماء بلا علامات تجاريّة.
  { k: 'shot', shot: 'btnPortraitStyle', bars: 6, chap: 'create', title: 'أنماط الصور', line: 'صورتك بأكثر من ٩٠ ستايل… ونفس وجهك في كلّها', f: [0.45, 0.6], z: 1.25,
    ex: { at: 3.6, kind: 'ba', line: 'شوف: نفس الصورة… بخمس ستايلات!', before: 'assets/portrait/before.webp', items: [['assets/portrait/styles/ghibli.webp', 'أنمي'], ['assets/portrait/styles/disney.webp', 'ثلاثي الأبعاد'], ['assets/portrait/styles/figurine.webp', 'مجسّم في علبة'], ['assets/portrait/styles/ukiyoe.webp', 'فن ياباني'], ['assets/portrait/styles/neonsign.webp', 'نيون']] }, eyes: 'star' },
  { k: 'shot', shot: 'btnVideoMaker', bars: 6, chap: 'create', title: 'صانع الفيديو', line: 'اكتب فكرتك، وخلّ صورتك بطل الفيلم!', f: [0.6, 0.35], z: 1.25,
    ex: { at: 3.6, kind: 'clip', line: 'كتبت جملة وحدة… وهذا الفيديو طلع من التطبيق!', prompt: 'صقر يطير فوق صحراء الإمارات وقت الغروب', clip: 'media/samples/runway-1.mp4', from: 0.4 }, eyes: 'star' },
  { k: 'shot', shot: 'btnDesignAI', bars: 5, chap: 'create', title: 'ديكور AI', line: 'صوّر غرفتك… وشوفها بتصميم جديد قبل ما تغيّر شي', f: [0.5, 0.4], z: 1.2,
    ex: { at: 3.6, kind: 'gallery', line: 'أو اختر النمط: إماراتي، نجدي، أندلسي…', w: 210, h: 282, items: [['assets/design/styles/emirati.webp', 'إماراتي معاصر'], ['assets/design/styles/najdi.webp', 'نجدي'], ['assets/design/styles/andalusi.webp', 'أندلسي'], ['assets/design/styles/modern.webp', 'عصري'], ['assets/design/styles/luxury.webp', 'فخم']] } },
  { k: 'shot', shot: 'btnFashionAI', bars: 5, chap: 'create', title: 'أزياء AI', line: 'صورتك + ذوقك = إطلالات تختار منها جنب بعض', f: [0.5, 0.4], z: 1.2,
    ex: { at: 3.6, kind: 'gallery', line: 'إطلالة لكلّ مناسبة: عباية، زفاف، كاجوال…', w: 180, h: 270, items: [['assets/fashion/looks/abaya.webp', 'عباية'], ['assets/fashion/looks/wedding.webp', 'زفاف'], ['assets/fashion/looks/traditional.webp', 'تقليدي'], ['assets/fashion/looks/casual.webp', 'كاجوال']] } },
  { k: 'shot', shot: 'btnStudioAI', bars: 5, chap: 'create', title: 'ستايل AI', line: 'جرّب الشعر والمكياج والنظارات والحنّاء على صورتك', f: [0.5, 0.45], z: 1.2, eyes: 'happy',
    ex: { at: 3.6, kind: 'gallery', line: 'هذي بعض الخيارات… وفيه أكثر بكثير!', w: 200, h: 268, items: [['assets/studio/options/hair-red.webp', 'شعر أحمر'], ['assets/studio/options/hair-blonde.webp', 'أشقر'], ['assets/studio/options/makeup-smokey.webp', 'مكياج سموكي'], ['assets/studio/options/glasses-sunglasses.webp', 'نظارة شمسية'], ['assets/studio/options/heritage-emirati.webp', 'زيّ تراثي']] } },
  { k: 'chapter', bars: 2, chap: 'work', title: 'أعمال', sub: 'شغلك أسرع وأذكى', shout: 'يلا نشتغل!' },
  { k: 'shot', shot: 'btnAdStudio', bars: 4, chap: 'work', title: 'استوديو الإعلانات', line: 'احكِ عن إعلانك بكلامك… وتطلع لك تصاميم جاهزة تختار منها', f: [0.6, 0.4], z: 1.2 },
  { k: 'shot', shot: 'btnStocks', bars: 4, chap: 'work', title: 'سوق الأسهم', line: 'أسعار ورسم بياني… ومحفظة تتعلّم فيها التداول', f: [0.5, 0.55], z: 1.22 },
  { k: 'shot', shot: 'btnDocs', bars: 3, chap: 'work', title: 'مساعد المستندات', line: 'ارفع عقد أو فاتورة… ويحلّلها لك', r: [0.06, 0.03, 0.94, 0.45] },
  { k: 'shot', shot: 'btnEmailAssist', bars: 3, chap: 'work', title: 'مساعد البريد', line: 'يجهّز ردود إيميلاتك… وما يرسل شي إلا بموافقتك', r: [0.06, 0.02, 0.95, 0.3] },
  { k: 'shot', shot: 'btnConstruction', bars: 4, chap: 'work', title: 'المقاولات والبناء', line: 'وصف بسطر واحد ← تصوّر معماري وقائمة مواد وتقدير تكلفة', f: [0.6, 0.45], z: 1.2 },
  { k: 'chapter', bars: 2, chap: 'life', title: 'حياة يومية', sub: 'معك في يومك كلّه', shout: 'يلا!' },
  { k: 'shot', shot: 'btnQibla', bars: 3, chap: 'life', title: 'القبلة والمواقيت', line: 'مواقيت الصلاة واتجاه القبلة حسب موقعك', f: [0.5, 0.4], z: 1.25 },
  { k: 'shot', shot: 'btnOmranEdu', bars: 4, chap: 'life', title: 'التعليم', line: 'ارفع محاضرتك أو اختر درس من المنهج… وذاكر بالألعاب', f: [0.55, 0.3], z: 1.25, eyes: 'star' },
  { k: 'shot', shot: 'btnReligion', bars: 3, chap: 'life', title: 'التفسير الديني', line: 'تفسير آية، بحث حديث، وتفسير الأحلام', r: [0.06, 0.02, 0.95, 0.35] },
  { k: 'shot', shot: 'btnFeedback', bars: 3, chap: 'life', title: 'رأيك يهمّنا', line: 'قيّمنا بنجمة… وكلمتك توصل لنا مباشرة', f: [0.5, 0.5], z: 1.3, eyes: 'happy' },
  { k: 'shot', shot: 'themes', bars: 4, chap: 'style', title: 'الثيمات', line: 'وغيّر شكل التطبيق بثيمات… حتى أنمي! ويدعم ١٤ لغة', f: [0.5, 0.45], z: 1.12, eyes: 'star' },
  // الخاتمة: باركود صفحة التحميل الرسميّ (icons/omran-qr-code.png ← /download، نفس باركود الإعدادات) ظاهر ٨ ثوانٍ ليُمسح من الشاشة
  { k: 'outro', bars: 7, chap: 'sunset', lines: ['شفت؟ كلّ هذا في تطبيق واحد!', 'امسح الباركود وحمّله… وأنا معك!'] },
];
{
  let t0 = 0; const chapIdx = {};
  SCENES.forEach((s, i) => {
    s.start = t0; s.dur = s.bars * BAR; t0 += s.dur;
    const prev = SCENES[i - 1];
    s.wipe = i > 0 && !(prev.k === 'shot' && s.k === 'shot' && prev.chap === s.chap);
    if (s.k === 'shot' && CHAP[s.chap].name) { chapIdx[s.chap] = (chapIdx[s.chap] || 0) + 1; s.idx = chapIdx[s.chap]; }
  });
  SCENES.forEach((s) => { if (s.k === 'shot') s.of = chapIdx[s.chap]; });
}
const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);

// ─── شخصيّة مها (تُحقن في الصفحة كما هي) ───
function MAHA_LIB() {
  window.mahaSVG = function (id) {
    const eye = (side) => {
      const flip = side === 'R' ? ' scale(-1,1)' : '';
      return `<g id="${id}-eye${side}" transform="translate(${side === 'L' ? 163 : 237},240)${flip}">
        <g class="open">
          <path d="M-27 -20 C-12 -31 14 -31 27 -19 C31 2 24 27 0 28 C-23 28 -31 4 -27 -20 Z" fill="#fff"/>
          <ellipse cx="2" cy="3" rx="18.5" ry="24.5" fill="url(#${id}-iris)" stroke="#24120a" stroke-width="2"/>
          <ellipse cx="2" cy="5" rx="8.5" ry="12.5" fill="#1a0d06"/>
          <ellipse cx="2" cy="16" rx="12" ry="6" fill="#ffd27a" opacity=".55"/>
          <g class="hl"><circle cx="-6" cy="-8" r="7.5" fill="#fff"/><circle cx="10" cy="11" r="3.6" fill="#fff"/><circle cx="11" cy="-12" r="2.2" fill="#fff"/></g>
          <path class="star" d="M2 -15 L6 -3 L18 0 L6 3 L2 15 L-2 3 L-14 0 L-2 -3 Z" fill="#fff" opacity="0"/>
          <path d="M-31 -16 C-15 -33 14 -34 30 -21 L36 -27 L31 -13 C14 -26 -14 -26 -29 -9 Z" fill="#1d120c"/>
          <path d="M-17 26 C-6 30 8 30 17 25" stroke="#3a2418" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>
          <path d="M-22 -36 C-6 -42 12 -42 24 -34" stroke="#3a2418" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
        </g>
        <path class="closed" d="M-27 2 C-12 12 12 12 27 1" stroke="#1d120c" stroke-width="5" fill="none" stroke-linecap="round" opacity="0"/>
        <path class="happy" d="M-25 8 C-13 -14 13 -14 25 8" stroke="#1d120c" stroke-width="5.5" fill="none" stroke-linecap="round" opacity="0"/>
      </g>`;
    };
    return `<svg id="${id}" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;width:100%;height:100%">
    <defs>
      <linearGradient id="${id}-iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22110a"/><stop offset=".45" stop-color="#6e3a17"/><stop offset="1" stop-color="#e2a64c"/></linearGradient>
      <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b2546"/><stop offset=".55" stop-color="#1d1932"/><stop offset="1" stop-color="#14111f"/></linearGradient>
      <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".5" stop-color="#e9c46a"/><stop offset="1" stop-color="#b8862f"/></linearGradient>
    </defs>
    <ellipse id="${id}-shadow" cx="200" cy="586" rx="112" ry="13" fill="rgba(0,0,0,.28)"/>
    <g id="${id}-bob">
      <path d="M126 230 C106 300 116 370 142 410 L258 410 C284 370 294 300 274 230 Z" fill="#17142a" stroke="#0c0a16" stroke-width="4"/>
      <path d="M152 352 C136 400 120 478 113 560 Q200 584 287 560 C280 478 264 400 248 352 Z" fill="url(#${id}-cloth)" stroke="#0c0a16" stroke-width="4" stroke-linejoin="round"/>
      <path d="M232 380 C250 430 262 500 268 566 Q282 563 287 560 C280 478 264 400 248 352 Z" fill="#0f0d1a" opacity=".7"/>
      <path d="M200 372 L200 572" stroke="url(#${id}-gold)" stroke-width="5" stroke-linecap="round"/>
      <path d="M117 552 Q200 575 283 552" stroke="url(#${id}-gold)" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="170" cy="575" rx="22" ry="9" fill="#2a2334" stroke="#0c0a16" stroke-width="3"/>
      <ellipse cx="230" cy="575" rx="22" ry="9" fill="#2a2334" stroke="#0c0a16" stroke-width="3"/>
      <path d="M248 360 C280 380 292 430 288 470 L260 474 C255 440 245 410 235 385 Z" fill="url(#${id}-cloth)" stroke="#0c0a16" stroke-width="4" stroke-linejoin="round"/>
      <path d="M262 470 L288 467" stroke="url(#${id}-gold)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="276" cy="482" r="13" fill="#ffe4d0" stroke="#3a2418" stroke-width="3"/>
      <g id="${id}-head" transform="rotate(0 200 345)">
        <path d="M200 90 C284 90 323 156 318 236 C314 298 291 344 258 364 L142 364 C109 344 86 298 82 236 C77 156 116 90 200 90 Z" fill="url(#${id}-cloth)" stroke="#0c0a16" stroke-width="4.5"/>
        <path d="M114 150 C134 114 166 100 200 100 C176 106 144 124 128 160 Z" fill="#4a4278" opacity=".7"/>
        <path d="M102 272 C110 310 124 334 144 350" stroke="#0c0a16" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>
        <path d="M298 272 C290 310 276 334 256 350" stroke="#0c0a16" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>
        <path d="M126 202 C124 272 160 318 200 323 C240 318 276 272 274 202 C274 160 240 140 200 140 C160 140 126 160 126 202 Z" fill="#ffe4d0" stroke="#3a2418" stroke-width="3.2"/>
        <path d="M128 222 C140 196 168 184 200 184 C232 184 260 196 272 222 L272 205 C258 186 232 176 200 176 C168 176 142 186 128 205 Z" fill="#f4c3a6"/>
        <path d="M117 224 C115 154 160 130 200 130 C240 130 285 154 283 224 C271 190 240 176 200 177 C160 176 129 190 117 224 Z" fill="url(#${id}-cloth)" stroke="#0c0a16" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M121 216 C134 188 162 178 200 179 C238 178 266 188 279 216" stroke="url(#${id}-gold)" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <circle cx="294" cy="300" r="10" fill="url(#${id}-gold)" stroke="#7a5518" stroke-width="2"/>
        <path d="M294 292 L296 298 L302 300 L296 302 L294 308 L292 302 L286 300 L292 298 Z" fill="#fff"/>
        <path id="${id}-browL" d="M150 203 C157 198 167 197 176 199" stroke="#3b2416" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        <path id="${id}-browR" d="M250 203 C243 198 233 197 224 199" stroke="#3b2416" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        ${eye('L')}${eye('R')}
        <g opacity=".85"><ellipse cx="146" cy="281" rx="17" ry="8" fill="#ff8fa3" opacity=".5"/><ellipse cx="254" cy="281" rx="17" ry="8" fill="#ff8fa3" opacity=".5"/>
        <path d="M138 284 L142 277 M146 285 L150 278 M154 284 L158 277 M246 284 L250 277 M254 285 L258 278 M262 284 L266 277" stroke="#ff6f8a" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>
        <path d="M199 268 L202 273" stroke="#d79b7f" stroke-width="2.4" stroke-linecap="round"/>
        <path id="${id}-mouth" d="M188 288 C194 294 206 294 212 288" stroke="#7a3326" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <ellipse id="${id}-tongue" cx="200" cy="296" rx="6" ry="3" fill="#ff8a8a" opacity="0"/>
      </g>
      <g id="${id}-arm" transform="rotate(0 156 368)">
        <path d="M156 362 C126 382 112 430 114 470 L142 474 C146 440 156 410 168 386 Z" fill="url(#${id}-cloth)" stroke="#0c0a16" stroke-width="4" stroke-linejoin="round"/>
        <path d="M113 467 L140 470" stroke="url(#${id}-gold)" stroke-width="4" stroke-linecap="round"/>
        <rect id="${id}-finger" x="120" y="486" width="9" height="24" rx="4.5" fill="#ffe4d0" stroke="#3a2418" stroke-width="2.6" opacity="0"/>
        <circle cx="126" cy="483" r="13" fill="#ffe4d0" stroke="#3a2418" stroke-width="3"/>
      </g>
    </g>
  </svg>`;
  };
  // s = { t, talk 0..1, eyes: open|closed|happy|star, arm: درجات (0 لأسفل، 100 تشير يسارًا، 112–128 تلوّح), point, tilt, bob }
  window.mahaPose = function (id, s) {
    const q = (x) => document.getElementById(id + '-' + x);
    const bob = s.bob == null ? Math.sin(s.t * 2.6) * 5 : s.bob;
    q('bob').setAttribute('transform', `translate(0 ${bob.toFixed(2)})`);
    q('head').setAttribute('transform', `rotate(${(s.tilt == null ? Math.sin(s.t * 1.4) * 3 : s.tilt).toFixed(2)} 200 345)`);
    q('arm').setAttribute('transform', `rotate(${(s.arm || 0).toFixed(2)} 156 368)`);
    q('finger').setAttribute('opacity', s.point ? 1 : 0);
    const m = Math.max(0, Math.min(1, s.talk || 0));
    if (m < 0.08) { q('mouth').setAttribute('d', 'M188 288 C194 294 206 294 212 288'); q('mouth').setAttribute('fill', 'none'); q('tongue').setAttribute('opacity', 0); }
    else {
      const y = 288 + 14 * m, w = 11 - 2 * m;
      q('mouth').setAttribute('d', `M${200 - w} 286 C${200 - w + 2} ${y} ${200 + w - 2} ${y} ${200 + w} 286 Z`);
      q('mouth').setAttribute('fill', '#8a2f2f'); q('tongue').setAttribute('opacity', m > 0.35 ? 1 : 0);
      q('tongue').setAttribute('cy', (284 + 12 * m).toFixed(1));
    }
    const mode = s.eyes || 'open';
    ['L', 'R'].forEach((k) => {
      const e = q('eye' + k);
      e.querySelector('.open').setAttribute('opacity', mode === 'open' || mode === 'star' ? 1 : 0);
      e.querySelector('.closed').setAttribute('opacity', mode === 'closed' ? 1 : 0);
      e.querySelector('.happy').setAttribute('opacity', mode === 'happy' ? 1 : 0);
      e.querySelector('.star').setAttribute('opacity', mode === 'star' ? 1 : 0);
      e.querySelector('.hl').setAttribute('opacity', mode === 'star' ? 0.35 : 1);
    });
    const by = mode === 'happy' ? -4 : 0;
    q('browL').setAttribute('transform', `translate(0 ${by})`); q('browR').setAttribute('transform', `translate(0 ${by})`);
  };
}

// ─── منطق الصفحة: R(t) حتميّة تامّة (لا Date ولا Math.random) ───
function PAGE_MAIN(SC, CH, TOTAL, BAR, SHOTS, CLIP_N) {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const eOut = (x) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
  const eIn = (x) => { x = clamp(x, 0, 1); return x * x * x; };
  const eBack = (x) => { x = clamp(x, 0, 1); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const W = 1920, H = 1080;
  const fx = $('fx').getContext('2d');
  const CUES = [];
  const cue = (t, type, v) => CUES.push({ t: +t.toFixed(3), type, v: v || 1 });
  // «OM Ai» كلمة واحدة في الفقاعة (مسافة غير فاصلة + اتّجاه LTR) — وإلّا يقلبها RTL إلى «Ai OM»
  const tokens = (line) => line.replace(/OM Ai/g, 'OM\u00a0Ai').split(' ');
  const clipAt = (e) => 0.4 + tokens(e.prompt).length * 0.12 + 0.35; // ظهور الفيديو بعد كتابة الوصف
  // أحداث الصوت تُحسب من الجدول نفسه لا من الرسم
  SC.forEach((s, i) => {
    if (s.wipe) cue(s.start - 0.3, 'whoosh');
    const words = (line, at, per) => tokens(line).forEach((w, j) => cue(at + j * per, 'tick', 0.5 + 0.5 * ((j * 7) % 5) / 4));
    if (s.k === 'shot') {
      if (!s.wipe) cue(s.start, 'drop');
      cue(s.start + 0.33, 'slam', 0.8); cue(s.start + 0.47, 'pop'); words(s.line, s.start + 0.62, 0.12);
      const e = s.ex;
      if (e) {
        const a = s.start + e.at;
        cue(a - 0.2, 'whoosh', 0.6); cue(a + 0.25, 'pop'); words(e.line, a + 0.4, 0.12);
        if (e.kind === 'ba') { cue(a + 0.25, 'slam', 0.5); cue(a + 0.6, 'sparkle'); e.items.forEach((_, k) => cue(a + 0.8 + k * 0.3, 'pop', 0.55)); }
        if (e.kind === 'gallery') e.items.forEach((_, k) => cue(a + 0.4 + k * 0.25, 'pop', 0.55));
        if (e.kind === 'clip') { words(e.prompt, a + 0.4, 0.12); cue(a + clipAt(e), 'sparkle'); }
      }
    }
    if (s.k === 'chapter') { cue(s.start + 0.36, 'impact'); cue(s.start + 0.75, 'sparkle'); }
    if (s.k === 'intro') { cue(s.start + 1.15, 'impact'); cue(s.start + 2.0, 'jump'); cue(s.start + 2.72, 'pop'); words(s.lines[0], s.start + 2.85, 0.13); cue(s.start + 4.47, 'pop'); words(s.lines[1], s.start + 4.6, 0.13); }
    if (s.k === 'title') { cue(s.start + 0.38, 'slam'); cue(s.start + 0.6, 'sparkle'); }
    if (s.k === 'outro') { cue(s.start + 0.6, 'sparkle'); cue(s.start + 1.02, 'pop'); words(s.lines[0], s.start + 1.15, 0.13); cue(s.start + 3.3, 'slam', 0.7); cue(s.start + 3.45, 'sparkle'); cue(s.start + 3.62, 'pop'); words(s.lines[1], s.start + 3.75, 0.13); cue(s.start + 5.85, 'impact'); }
  });
  window.CUES = CUES;
  const sceneAt = (t) => { for (let i = SC.length - 1; i >= 0; i--) if (t >= SC[i].start) return i; return 0; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  // خلفيّة: تدرّج اللون + خطوط سرعة + لمعات ذهبيّة
  function drawFx(t, s, lt) {
    const c = CH[s.chap];
    if (s.k === 'intro' || s.k === 'title' || s.k === 'outro') { fx.clearRect(0, 0, W, H); }
    else {
      const g = fx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c.a); g.addColorStop(1, c.b);
      fx.fillStyle = g; fx.fillRect(0, 0, W, H);
      // خطوط السرعة: من خلف مها في المشاهد، ومن المركز في بطاقة الفصل
      const chapter = s.k === 'chapter';
      const cx = chapter ? 1180 : 1640, cy = chapter ? 520 : 760;
      const N = chapter ? 120 : 84, rot = t * (chapter ? 0.06 : 0.025);
      fx.save(); fx.translate(cx, cy);
      for (let k = 0; k < N; k++) {
        const a = k / N * Math.PI * 2 + rot + rnd(k) * 0.04, w = 0.004 + rnd(k + 9) * (chapter ? 0.016 : 0.01);
        const r0 = chapter ? 260 + rnd(k + 3) * 220 + 30 * Math.sin(t * 9 + k) : 180 + rnd(k + 5) * 260;
        fx.beginPath(); fx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        fx.lineTo(Math.cos(a - w) * 2600, Math.sin(a - w) * 2600); fx.lineTo(Math.cos(a + w) * 2600, Math.sin(a + w) * 2600); fx.closePath();
        fx.fillStyle = chapter ? `rgba(255,255,255,${0.18 + rnd(k + 1) * 0.22})` : `rgba(255,255,255,${0.035 + rnd(k + 1) * 0.05})`;
        fx.fill();
      }
      fx.restore();
      // وهج خلف مها
      const rg = fx.createRadialGradient(cx, cy, 0, cx, cy, chapter ? 700 : 520);
      rg.addColorStop(0, rgba(c.ac, chapter ? 0.55 : 0.32)); rg.addColorStop(1, rgba(c.ac, 0));
      fx.fillStyle = rg; fx.fillRect(0, 0, W, H);
    }
    // لمعات نجميّة تطفو
    const n = s.k === 'chapter' ? 26 : 34;
    for (let k = 0; k < n; k++) {
      const x = ((rnd(k + 40) * W + t * (18 + rnd(k) * 30)) % (W + 80)) - 40;
      const y = ((rnd(k + 70) * H - t * (24 + rnd(k + 2) * 40)) % (H + 80) + H + 80) % (H + 80) - 40;
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + rnd(k) * 3) + k), r = (3 + rnd(k + 8) * 7) * (0.4 + 0.6 * tw);
      fx.save(); fx.translate(x, y); fx.rotate(t * 0.5 + k);
      fx.fillStyle = `rgba(255,${220 + Math.round(rnd(k + 4) * 35)},${150 + Math.round(rnd(k + 6) * 80)},${0.35 + 0.5 * tw})`;
      fx.beginPath();
      for (let p = 0; p < 8; p++) { const rr = p % 2 ? r * 0.28 : r; const aa = p * Math.PI / 4; fx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
      fx.closePath(); fx.fill(); fx.restore();
    }
  }

  // بناء الطبقات
  const shotIdx = SC.map((s, i) => s.k === 'shot' ? i : -1).filter((i) => i >= 0);
  function wordsHtml(line) { return tokens(line).map((w) => `<span class="w"${/[A-Za-z]/.test(w) ? ' dir="ltr"' : ''}>${w}</span>`).join(' '); }
  shotIdx.forEach((i) => {
    const s = SC[i], m = SHOTS[s.shot];
    const pn = document.createElement('div'); pn.className = 'panel'; pn.id = 'pn' + i;
    pn.innerHTML = `<div class="kb" id="kb${i}"><img src="/__work/shots/${m.file}" alt=""></div>`;
    $('panels').appendChild(pn);
    const tt = document.createElement('div'); tt.className = 'ttl'; tt.id = 'tt' + i;
    tt.innerHTML = `<div class="tt">${s.title}</div><div class="tag" style="background:${CH[s.chap].ac}">${CH[s.chap].name}${s.idx && s.of > 1 ? ' — ' + ['', '١', '٢', '٣', '٤', '٥', '٦'][s.idx] + ' من ' + ['', '١', '٢', '٣', '٤', '٥', '٦'][s.of] : ''}</div>`;
    $('titles').appendChild(tt);
    const bb = document.createElement('div'); bb.className = 'bubble'; bb.id = 'bb' + i;
    bb.innerHTML = `<div class="btxt">${wordsHtml(s.line)}</div>`;
    $('bubbles').appendChild(bb);
    const e = s.ex; if (!e) return;
    const bx = document.createElement('div'); bx.className = 'bubble'; bx.id = 'bx' + i;
    bx.innerHTML = `<div class="btxt">${wordsHtml(e.line)}</div>`;
    $('bubbles').appendChild(bx);
    const bd = document.createElement('div'); bd.className = 'board'; bd.id = 'bd' + i;
    bd.style.background = `radial-gradient(circle at 62% 42%, ${rgba(CH[s.chap].ac, 0.32)}, transparent 62%), linear-gradient(135deg, ${CH[s.chap].a}, #09090d)`;
    const real = e.kind === 'gallery' ? 'أمثلة من التطبيق' : 'مثال حقيقي من التطبيق';
    let h = `<div class="bdots"></div><div class="real">${real}</div>`;
    if (e.kind === 'ba') {
      h += `<div class="pill" style="left:1022px;top:146px">قبل</div><div class="card before" id="bf${i}" style="left:880px;top:200px"><img src="/${e.before}" style="width:270px;height:405px"></div>`;
      h += `<svg class="arrow" id="ar${i}" viewBox="0 0 140 90" style="left:742px;top:370px;width:140px;height:90px"><path d="M135 30 L55 30 L55 6 L5 45 L55 84 L55 60 L135 60 Z" fill="#ffd166" stroke="#111" stroke-width="6" stroke-linejoin="round"/></svg>`;
      h += `<div class="pill" style="left:386px;top:170px">بعد</div>`;
      e.items.forEach((it, k) => { h += `<div class="card" id="it${i}_${k}" style="left:${24 + k * 148}px;top:${255 + Math.abs(k - 2) * 14}px"><img src="/${it[0]}" style="width:132px;height:197px"><div class="lbl sm">${it[1]}</div></div>`; });
    } else if (e.kind === 'gallery') {
      const n = e.items.length, gap = 26, tw = n * e.w + (n - 1) * gap, x0 = (1230 - tw) / 2, y0 = Math.round((761 - e.h - 70) / 2) + 26;
      e.items.forEach((it, k) => { h += `<div class="card" id="it${i}_${k}" style="left:${x0 + k * (e.w + gap)}px;top:${y0}px"><img src="/${it[0]}" style="width:${e.w}px;height:${e.h}px"><div class="lbl">${it[1]}</div></div>`; });
    } else if (e.kind === 'clip') {
      h += `<div class="prompt" id="pr${i}"><div class="btxt">${wordsHtml(e.prompt)}</div><div class="send"></div></div>`;
      h += `<div class="card vid" id="vd${i}" style="left:215px;top:222px"><img id="cf${i}" src="/__work/clip/0001.jpg" style="width:800px;height:450px"><div class="pill vpill">النتيجة</div></div>`;
    }
    bd.innerHTML = h;
    pn.appendChild(bd);
  });
  SC.forEach((s, i) => {
    if (s.k !== 'chapter') return;
    const cc = document.createElement('div'); cc.className = 'chap'; cc.id = 'ch' + i;
    cc.innerHTML = `<div class="cnum">الفصل ${['', '١', '٢', '٣'][SC.slice(0, i + 1).filter((x) => x.k === 'chapter').length]}</div><div class="ctitle" style="text-shadow:10px 10px 0 ${rgba(CH[s.chap].a, 1)}">${s.title}</div><div class="csub"><span>${s.sub}</span></div>`;
    $('chapters').appendChild(cc);
    const sh = document.createElement('div'); sh.className = 'shout'; sh.id = 'sh' + i; sh.innerHTML = `<span>${s.shout}</span>`;
    $('chapters').appendChild(sh);
  });
  ['intro', 'outro'].forEach((k) => {
    const s = SC.find((x) => x.k === k);
    s.lines.forEach((l, j) => { const b = document.createElement('div'); b.className = 'bubble big'; b.id = k + 'b' + j; b.innerHTML = `<div class="btxt">${wordsHtml(l)}</div>`; $('bubbles').appendChild(b); });
  });
  $('mM').innerHTML = mahaSVG('mm'); $('mB').innerHTML = mahaSVG('mb'); $('mI').innerHTML = mahaSVG('mi');

  // كشف الكلمات واحدة واحدة مع حركة الفم
  function reveal(el, lt, start, per) {
    const ws = el.querySelectorAll('.w'); let talking = false;
    ws.forEach((w, j) => {
      const p = eBack((lt - start - j * per) / 0.22);
      w.style.opacity = clamp((lt - start - j * per) / 0.12, 0, 1);
      w.style.transform = `translateY(${(1 - p) * 14}px) scale(${0.7 + 0.3 * p})`;
    });
    const end = start + ws.length * per + 0.15;
    if (lt > start && lt < end) talking = true;
    return { talking, end };
  }
  const talkAmt = (t) => 0.25 + 0.75 * Math.abs(Math.sin(t * 19)) * (0.6 + 0.4 * Math.sin(t * 7.3));
  const blink = (t, off) => ((t + off) % 3.4) < 0.11;
  function bubbleIn(el, lt, at, out) {
    const p = eBack((lt - at) / 0.32);
    const o = lt < at ? 0 : (out != null && lt > out ? clamp(1 - (lt - out) / 0.18, 0, 1) : 1);
    el.style.opacity = o; el.style.transform = `scale(${lt < at ? 0.2 : 0.2 + 0.8 * p})`;
    return o > 0;
  }

  // العنوان سطر واحد: يصغر الخطّ حتّى يتّسع للعمود (يُستدعى بعد تحميل الخطوط)
  window.FIT = function () {
    document.querySelectorAll('.tt').forEach((el) => { let f = 96; el.style.fontSize = f + 'px'; while (el.scrollWidth > 540 && f > 52) { f -= 4; el.style.fontSize = f + 'px'; } });
    // الصيحة داخل وسط النجمة (المسنّنات تأكل الأطراف): لا تتجاوز ٢٤٠px
    document.querySelectorAll('.shout span').forEach((el) => { let f = 74; el.style.fontSize = f + 'px'; while (el.getBoundingClientRect().width > 240 && f > 36) { f -= 2; el.style.fontSize = f + 'px'; } });
  };
  // تقريب كين برنز داخل الإطار عند التقدّم zp (0..1)
  function kbAt(kb, s, zp) {
    if (!s.r) { kb.style.transformOrigin = `${s.f[0] * 100}% ${s.f[1] * 100}%`; kb.style.transform = `scale(${1 + (s.z - 1) * zp})`; return; }
    const [x0, y0, x1, y1] = s.r, Z = Math.min(1 / (x1 - x0), 1 / (y1 - y0)), PW = 1230, PH = 761;
    const tx = clamp(PW / 2 - (x0 + x1) / 2 * PW * Z, PW - PW * Z, 0), ty = clamp(PH / 2 - (y0 + y1) / 2 * PH * Z, PH - PH * Z, 0);
    kb.style.transformOrigin = '0 0'; kb.style.transform = `translate(${tx * zp}px,${ty * zp}px) scale(${1 + (Z - 1) * zp})`;
  }
  const ROT = [-7, -3.5, 0, 3.5, 7];
  const CLIP = {}; // الإطار المعروض لكلّ مشهد فيديو
  function exPose(i, s, lt, waits) {
    const e = s.ex; if (!e) return { talking: false, end: 0, on: false };
    const bd = $('bd' + i), el = lt - e.at, sp = eOut(el / 0.45);
    bd.style.visibility = el > 0 ? 'visible' : 'hidden';
    bd.style.transform = `translateX(${(1 - sp) * -105}%)`;
    const pop = (c, at, rot) => { const p = eOut((el - at) / 0.32); c.style.opacity = clamp((el - at) / 0.12, 0, 1); c.style.transform = `translateY(${(1 - p) * 70}px) rotate(${rot}deg) scale(${0.6 + 0.4 * p})`; };
    if (e.kind === 'ba') {
      pop($('bf' + i), 0.25, 4);
      const ar = $('ar' + i); ar.style.opacity = clamp((el - 0.6) / 0.2, 0, 1); ar.style.transform = `translateX(${Math.sin(lt * 7) * 9}px)`;
      e.items.forEach((_, k) => pop($('it' + i + '_' + k), 0.8 + k * 0.3, ROT[k]));
    } else if (e.kind === 'gallery') {
      e.items.forEach((_, k) => pop($('it' + i + '_' + k), 0.4 + k * 0.25, k % 2 ? 2.5 : -2.5));
    } else if (e.kind === 'clip') {
      const pr = $('pr' + i); pr.style.opacity = clamp((el - 0.2) / 0.2, 0, 1);
      reveal(pr, el, 0.4, 0.12);
      const va = clipAt(e), vd = $('vd' + i), vp = eOut((el - va) / 0.4);
      vd.style.opacity = clamp((el - va) / 0.15, 0, 1); vd.style.transform = `scale(${0.7 + 0.3 * vp})`;
      const n = Math.max(1, Math.min(CLIP_N, 1 + Math.floor(Math.max(0, el - va) * 30)));
      const img = $('cf' + i);
      if (CLIP[i] !== n) { CLIP[i] = n; img.src = '/__work/clip/' + String(n).padStart(4, '0') + '.jpg'; waits.push(img.decode().catch(() => null)); }
    }
    const bx = $('bx' + i); bubbleIn(bx, lt, e.at + 0.25);
    const r = reveal(bx, lt, e.at + 0.4, 0.12);
    return { talking: r.talking, end: r.end, on: el > 0 };
  }
  window.TOTAL = TOTAL;
  window.R = function (t) {
    const waits = [];
    const i = sceneAt(t), s = SC[i], lt = t - s.start, c = CH[s.chap];
    drawFx(t, s, lt);
    const isSky = s.k === 'intro' || s.k === 'title' || s.k === 'outro';
    $('sky').style.opacity = isSky ? 1 : 0;
    $('dots').style.opacity = isSky ? 0 : 1;
    $('dots').style.backgroundPosition = `${(t * 14) % 26}px ${(t * 9) % 26}px`;
    // السماء: غيوم بتوازي حركيّ، وألوان الغروب في الخاتمة
    const sunset = s.k === 'outro';
    $('sky').className = sunset ? 'sunset' : '';
    $('cl1').style.transform = `translateX(${-((t * 22) % 2600) + 300}px)`;
    $('cl2').style.transform = `translateX(${-((t * 40 + 900) % 2800) + 600}px)`;
    $('cl3').style.transform = `translateX(${-((t * 65 + 400) % 3000) + 900}px)`;
    $('city').style.transform = `translateY(${s.k === 'intro' ? 60 * (1 - eOut(lt / 1.2)) : 0}px)`;

    // ── المقدّمة ──
    const intro = s.k === 'intro';
    $('logo').style.opacity = 0; $('flash').style.opacity = 0;
    if (intro) {
      const lp = eOut((lt - 0.95) / 0.4), up = ease((lt - 2.0) / 0.6), shake = lt > 1.3 && lt < 1.6 ? Math.sin(lt * 90) * 6 * (1.6 - lt) / 0.3 : 0;
      $('logo').style.opacity = lt > 0.95 ? 1 : 0;
      $('logo').style.transform = `translate(-50%,-50%) translate(${shake}px,${-150 * up}px) scale(${(0.3 + 0.7 * lp) * (1 - 0.18 * up)}) rotate(${(1 - lp) * -8}deg)`;
      $('flash').style.opacity = lt > 0.95 && lt < 1.25 ? 0.85 * (1 - (lt - 0.95) / 0.3) : 0;
    }
    [0, 0.7, 1.4].forEach((d, k) => { const w = 0.5 + 0.5 * Math.sin((t - d) * 4.2); const st = $('ls' + k); st.style.opacity = 0.45 + 0.55 * w; st.setAttribute('transform', st.dataset.base + ` scale(${0.75 + 0.25 * w})`); });
    // ── بطاقة الحلقة ──
    const title = s.k === 'title';
    $('ep').style.opacity = title ? 1 : 0;
    if (title) {
      const p = eBack((lt - 0.15) / 0.4), q = eOut((lt - 0.05) / 0.5);
      $('epband').style.transform = `skewY(-6deg) scaleX(${q})`;
      $('epnum').style.opacity = clamp((lt - 0.4) / 0.2, 0, 1); $('epnum').style.transform = `translateX(${(1 - eOut((lt - 0.4) / 0.4)) * -120}px)`;
      $('eptitle').style.transform = `scale(${lt < 0.15 ? 0 : 2 - p}) rotate(-3deg)`; $('eptitle').style.opacity = lt > 0.15 ? 1 : 0;
      $('epsub').style.opacity = clamp((lt - 0.9) / 0.3, 0, 1);
    }
    $('letter').style.opacity = title ? 1 : 0;

    // ── مشاهد اللقطات ──
    shotIdx.forEach((j) => { $('pn' + j).style.visibility = 'hidden'; $('tt' + j).style.opacity = 0; $('bb' + j).style.opacity = 0; if (SC[j].ex) { $('bx' + j).style.opacity = 0; $('bd' + j).style.visibility = 'hidden'; } });
    $('mM').style.opacity = 0;
    if (s.k === 'shot') {
      const prev = SC[i - 1];
      // اللوحة السابقة تطير يسارًا إن لم يكن قطع بمسح
      if (!s.wipe && prev && prev.k === 'shot' && lt < 0.45) {
        const p = eIn(lt / 0.4), pe = $('pn' + (i - 1));
        pe.style.visibility = 'visible';
        pe.style.transform = `translate(${-1700 * p}px, ${120 * p}px) rotate(${-1.2 - 14 * p}deg)`;
        kbAt($('kb' + (i - 1)), prev, 1);
        exPose(i - 1, prev, prev.dur, waits);
      }
      const pn = $('pn' + i), kb = $('kb' + i);
      pn.style.visibility = 'visible';
      if (s.wipe) { const p = eBack((lt - 0.05) / 0.4); pn.style.transform = `scale(${1.12 - 0.12 * p}) rotate(-1.2deg)`; }
      else { const at = 0.12, p = eBack((lt - at) / 0.42); pn.style.transform = lt < at ? 'translateY(-1300px)' : `translateY(${-1300 * (1 - p)}px) rotate(${-1.2 - 5 * (1 - p)}deg)`; }
      kbAt(kb, s, ease((lt - 0.3) / (s.dur - 0.5)));
      // العنوان يُضرب ضربًا
      const tt = $('tt' + i), tp = eBack((lt - 0.15) / 0.35);
      tt.style.opacity = lt > 0.15 ? 1 : 0;
      tt.style.transform = `scale(${2.2 - 1.2 * tp}) rotate(${-3 * tp}deg)`;
      // الفقاعة والكلمات
      const bb = $('bb' + i);
      bubbleIn(bb, lt, 0.45, s.ex ? s.ex.at : null);
      const r = reveal(bb, lt, 0.62, 0.12);
      const x = exPose(i, s, lt, waits);
      // مها: تشير إلى اللوحة وهي تتكلّم، ثمّ التعبير الخاصّ بالمشهد
      $('mM').style.opacity = 1;
      const hop = !s.wipe && lt < 0.5 ? -Math.sin(clamp(lt / 0.5, 0, 1) * Math.PI) * 26 : (s.wipe ? -Math.sin(clamp(lt / 0.45, 0, 1) * Math.PI) * 40 : 0);
      $('mM').style.transform = `translateY(${hop}px)`;
      const win = (a, b) => clamp((lt - a) / 0.3, 0, 1) * clamp((b - lt) / 0.3, 0, 1);
      const armT = Math.max(win(0.5, r.end + 0.6), s.ex ? win(s.ex.at + 0.3, x.end + 0.6) : 0);
      const after = s.ex ? lt > x.end + 0.2 : lt > r.end + 0.2;
      let eyes = blink(t, i * 0.7) ? 'closed' : 'open';
      if (after && s.eyes) eyes = s.eyes;
      mahaPose('mm', { t, talk: (r.talking || x.talking) ? talkAmt(t) : 0, eyes, arm: 100 * eOut(armT) + Math.sin(t * 6) * 3 * armT, point: armT > 0.5 });
    }

    // ── بطاقة الفصل ──
    SC.forEach((x, j) => { if (x.k === 'chapter') { $('ch' + j).style.opacity = 0; $('sh' + j).style.opacity = 0; } });
    $('mB').style.opacity = 0;
    if (s.k === 'chapter') {
      const ch = $('ch' + i), p = eBack((lt - 0.12) / 0.4);
      ch.style.opacity = lt > 0.1 ? 1 : 0;
      ch.querySelector('.ctitle').style.transform = `scale(${lt < 0.12 ? 0 : 2.6 - 1.6 * p}) rotate(-4deg)`;
      ch.querySelector('.cnum').style.transform = `translateX(${(1 - eOut((lt - 0.3) / 0.4)) * 200}px)`;
      ch.querySelector('.cnum').style.opacity = clamp((lt - 0.3) / 0.2, 0, 1);
      ch.querySelector('.csub').style.transform = `skewX(-10deg) scaleX(${eOut((lt - 0.55) / 0.35)})`;
      ch.querySelector('.csub span').style.opacity = clamp((lt - 0.75) / 0.2, 0, 1);
      const sh = $('sh' + i), sp = eBack((lt - 0.7) / 0.3);
      sh.style.opacity = lt > 0.7 ? 1 : 0; sh.style.transform = `scale(${lt < 0.7 ? 0 : sp}) rotate(${-8 + Math.sin(t * 20) * 1.5}deg)`;
      $('mB').style.opacity = 1;
      const jin = eBack(lt / 0.45);
      $('mB').style.transform = `translateX(${(1 - jin) * -700}px)`;
      mahaPose('mb', { t, talk: lt > 0.7 && lt < 1.3 ? talkAmt(t) : 0, eyes: lt > 0.6 ? 'star' : 'open', arm: 118 + Math.sin(t * 14) * 10, tilt: Math.sin(t * 3) * 5 });
    }

    // ── المقدّمة والخاتمة: مها كبيرة مع فقاعتين ──
    $('mI').style.opacity = 0; $('outroTxt').style.opacity = 0; $('qr').style.opacity = 0;
    ['introb0', 'introb1', 'outrob0', 'outrob1'].forEach((id) => { $(id).style.opacity = 0; });
    if (intro) {
      const jt = (lt - 2.0) / 0.55;
      if (lt > 2.0) {
        $('mI').style.opacity = 1;
        const arc = jt < 1 ? -Math.sin(clamp(jt, 0, 1) * Math.PI) * 260 + (1 - clamp(jt, 0, 1)) * 700 : 0;
        const land = jt > 1 && jt < 1.5 ? Math.sin((jt - 1) / 0.5 * Math.PI) : 0;
        $('mI').style.left = '1180px'; $('mI').style.top = '420px';
        $('mI').style.transform = `translateY(${arc}px) scale(${1 + land * 0.06}, ${1 - land * 0.08})`;
        const b0 = $('introb0'), b1 = $('introb1');
        b0.style.left = '560px'; b0.style.top = '560px'; b1.style.left = '560px'; b1.style.top = '560px';
        const on0 = bubbleIn(b0, lt, 2.7, 4.3), r0 = reveal(b0, lt, 2.85, 0.13);
        const on1 = bubbleIn(b1, lt, 4.45), r1 = reveal(b1, lt, 4.6, 0.13);
        mahaPose('mi', { t, talk: (r0.talking || r1.talking) ? talkAmt(t) : 0, eyes: lt < 4.3 ? 'happy' : (blink(t, 0.3) ? 'closed' : 'open'), arm: lt < 4.4 ? 118 + Math.sin(t * 14) * 10 : 100, point: lt >= 4.4 });
      }
    }
    if (sunset) {
      $('mI').style.opacity = 1;
      const jin = eBack(lt / 0.5);
      $('mI').style.left = '1200px'; $('mI').style.top = '430px';
      $('mI').style.transform = `translateY(${(1 - jin) * 600}px)`;
      const b0 = $('outrob0'), b1 = $('outrob1');
      b0.style.left = '780px'; b0.style.top = '320px'; b1.style.left = '780px'; b1.style.top = '320px';
      const out = s.dur - 0.9;
      bubbleIn(b0, lt, 1.0, 3.45); const r0 = reveal(b0, lt, 1.15, 0.13);
      bubbleIn(b1, lt, 3.6, out); const r1 = reveal(b1, lt, 3.75, 0.13);
      // الباركود: يدخل من ٠٫٤ إلى ١ بلا ارتداد (لا تكبير فوق مقاسه)، ومها تشير إليه وهي تقول «امسحه»
      const qp = eOut((lt - 3.3) / 0.45), qr = $('qr');
      qr.style.opacity = clamp((lt - 3.3) / 0.15, 0, 1);
      qr.style.transform = `translate(-50%,0) scale(${0.4 + 0.6 * qp}) rotate(${(1 - qp) * -6}deg)`;
      const point = lt > 3.5;
      mahaPose('mi', { t, talk: (r0.talking || r1.talking) ? talkAmt(t) : 0, eyes: lt > 6.5 ? 'happy' : (blink(t, 0.9) ? 'closed' : 'open'), arm: point ? 100 + Math.sin(t * 6) * 3 : 118 + Math.sin(t * 13) * 12, point });
      const lp = eOut((lt - 0.35) / 0.45);
      $('logo').style.opacity = lt > 0.35 ? 1 : 0;
      $('logo').style.transform = `translate(-50%,-50%) translate(-440px,-355px) scale(${lt < 0.35 ? 0 : 0.3 + 0.7 * lp})`;
      $('outroTxt').style.opacity = clamp((lt - 5.85) / 0.3, 0, 1);
      $('outroTxt').style.transform = `scale(${0.6 + 0.4 * eBack((lt - 5.85) / 0.4)})`;
      $('fade').style.opacity = clamp((lt - (s.dur - 0.7)) / 0.7, 0, 1);
    } else $('fade').style.opacity = 0;
    // دخول المقدّمة من السواد
    if (intro) $('fade').style.opacity = clamp(1 - lt / 0.6, 0, 1);

    // ── المسح بين الأقسام: شريط مائل بثلاثة ألوان يعبر من اليمين لليسار ──
    let wx = 99999, wc = c.ac;
    for (let j = 1; j < SC.length; j++) {
      if (!SC[j].wipe) continue;
      const d = t - SC[j].start;
      if (d > -0.32 && d < 0.32) { const p = (d + 0.32) / 0.64; wx = 2400 - p * (2400 + 3300); wc = CH[SC[j].chap].ac; }
    }
    $('wipe').style.transform = `translateX(${wx}px) skewX(-18deg)`;
    $('wipeA').style.background = wc;
    return waits.length ? Promise.all(waits) : undefined;
  };
}

function compHtml(shotsMeta, clipN) {
  const SHOTS = Object.fromEntries(shotsMeta.map((m) => [m.id, { file: m.file }]));
  const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="cshade"><ellipse cx="0" cy="30" rx="210" ry="48"/></g><g class="cfill"><circle cx="-120" cy="0" r="70"/><circle cx="-40" cy="-40" r="95"/><circle cx="60" cy="-55" r="110"/><circle cx="150" cy="-5" r="75"/><ellipse cx="10" cy="20" rx="200" ry="45"/></g><g class="chi"><circle cx="40" cy="-95" r="40"/><circle cx="-60" cy="-70" r="30"/></g></g>`;
  const towers = () => { let s = ''; let x = 0; let k = 0; while (x < 3900) { const w = 60 + ((k * 37) % 70), h = 90 + ((k * 53) % 230) + (k % 7 === 0 ? 260 : 0); s += `<rect x="${x}" y="${300 - h}" width="${w}" height="${h + 10}" rx="3"/>`; if (k % 7 === 0) s += `<path d="M${x + w / 2 - 6} ${300 - h} L${x + w / 2} ${300 - h - 120} L${x + w / 2 + 6} ${300 - h} Z"/>`; x += w + 6; k++; } return s; };
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Lalezar&family=Baloo+Bhaijaan+2:wght@600;800&family=Tajawal:wght@700;800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#000;font-family:'Baloo Bhaijaan 2',Tajawal,sans-serif}
#fx{position:absolute;inset:0}
#dots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.09) 2.2px,transparent 2.8px);background-size:26px 26px;mix-blend-mode:screen}
#sky{position:absolute;inset:0;background:linear-gradient(180deg,#1f63d1 0%,#4f9cf0 38%,#a9dcff 72%,#fff1d8 100%)}
#sky.sunset{background:linear-gradient(180deg,#2a2370 0%,#7b4fb3 30%,#ff7a8a 62%,#ffc371 100%)}
#sky svg{position:absolute;left:0;top:0}
#sky #city{top:auto;left:-200px;bottom:-10px}
#sky .cfill{fill:#fff}#sky .cshade{fill:#d6e6fb}#sky .chi{fill:#fff;opacity:.9}
#sky.sunset .cfill{fill:#ffe1e6}#sky.sunset .cshade{fill:#e7a3c4}#sky.sunset .chi{fill:#fff4d6}
#sun{position:absolute;left:260px;top:120px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,240,.95) 0,rgba(255,240,200,.55) 18%,rgba(255,230,180,0) 60%)}
#city{position:absolute;left:-200px;bottom:-10px;fill:#173a7a;opacity:.92}
#sky.sunset #city{fill:#2b1d55}
#logo{position:absolute;left:960px;top:470px;width:488px;height:126px;opacity:0}
#logo .plate{position:absolute;inset:-34px -70px;border-radius:90px;background:linear-gradient(135deg,#0d1238,#1b2a6b 60%,#24357f);border:7px solid #e9c46a;outline:7px solid #111;box-shadow:14px 14px 0 rgba(0,0,0,.35)}
#logo img{position:absolute;left:0;top:0;width:422px;height:126px}
#logo svg{position:absolute;left:418px;top:0;width:66px;height:126px;overflow:visible}
#flash{position:absolute;inset:0;background:#fff;opacity:0}
#fade{position:absolute;inset:0;background:#000;opacity:0}
.panel{position:absolute;left:60px;top:160px;width:1250px;height:781px;border:10px solid #fff;outline:5px solid #111;box-shadow:18px 18px 0 rgba(0,0,0,.55);background:#000;overflow:hidden;visibility:hidden;transform-origin:50% 50%}
.panel .kb{position:absolute;inset:0;transform-origin:50% 50%}
.panel img{display:block;width:1230px;height:761px}
.ttl{position:absolute;left:1340px;top:120px;width:540px;text-align:center;opacity:0;transform-origin:50% 60%}
.tt{direction:rtl;white-space:nowrap;font-family:Lalezar,Tajawal,sans-serif;font-size:96px;line-height:1.05;color:#fff;-webkit-text-stroke:14px #111;paint-order:stroke fill;text-shadow:7px 8px 0 rgba(0,0,0,.55)}
.tag{direction:rtl;display:inline-block;margin-top:12px;padding:4px 26px 8px;border:4px solid #111;border-radius:40px;color:#111;font:800 32px 'Baloo Bhaijaan 2';box-shadow:5px 5px 0 #111}
.bubble{position:absolute;left:1350px;top:345px;width:520px;min-height:150px;display:flex;align-items:center;justify-content:center;background:#fff;border:6px solid #111;border-radius:42px;padding:22px 28px;box-shadow:8px 8px 0 rgba(0,0,0,.45);opacity:0;transform-origin:62% 112%}
.bubble:after{content:"";position:absolute;bottom:-38px;left:58%;width:44px;height:44px;background:#fff;border-right:6px solid #111;border-bottom:6px solid #111;transform:skewX(25deg) rotate(45deg) translateY(-6px)}
.bubble.big{width:600px;min-height:170px;transform-origin:90% 110%}
.bubble.big:after{left:78%}
.btxt{direction:rtl;font-weight:800;font-size:44px;line-height:1.38;color:#151515;text-align:center}
.bubble.big .btxt{font-size:52px}
.btxt .w{display:inline-block;opacity:0}
.maha{position:absolute;width:400px;height:600px;transform-origin:50% 100%}
#mM{left:1430px;top:535px;width:360px;height:540px}
#mB{left:110px;top:250px;width:560px;height:840px}
#mI{left:1180px;top:420px;width:420px;height:630px}
.chap{position:absolute;inset:0;opacity:0}
.cnum{direction:rtl;position:absolute;right:170px;top:200px;padding:6px 30px 10px;background:#111;color:#fff;font:800 46px 'Baloo Bhaijaan 2';transform-origin:100% 50%}
.ctitle{direction:rtl;position:absolute;right:120px;top:300px;width:1100px;text-align:right;font-family:Lalezar,Tajawal,sans-serif;font-size:250px;line-height:1.1;color:#fff;-webkit-text-stroke:22px #111;paint-order:stroke fill;transform-origin:80% 50%}
.csub{direction:rtl;position:absolute;right:120px;top:640px;padding:14px 46px 22px;background:#111;transform-origin:100% 50%}
.csub span{display:block;color:#fff;font:800 56px 'Baloo Bhaijaan 2';transform:skewX(10deg)}
.shout{position:absolute;left:470px;top:150px;width:440px;height:290px;display:flex;align-items:center;justify-content:center;opacity:0;
  clip-path:polygon(50% 0,60% 22%,84% 6%,78% 32%,100% 36%,82% 54%,98% 76%,72% 72%,66% 100%,50% 80%,32% 100%,28% 74%,2% 80%,18% 56%,0 36%,22% 30%,14% 6%,40% 22%);background:#fff}
.shout span{direction:rtl;white-space:nowrap;font-family:Lalezar,Tajawal,sans-serif;font-size:74px;color:#111;margin-top:6px}
#ep{position:absolute;inset:0;opacity:0;direction:rtl}
#epband{position:absolute;left:-100px;right:-100px;top:330px;height:420px;background:linear-gradient(90deg,#0d1238,#1b2a6b 40%,#b8862f 100%);box-shadow:0 0 0 8px #fff,0 0 0 14px #111;transform-origin:100% 50%}
#epnum{position:absolute;right:220px;top:370px;font:800 64px 'Baloo Bhaijaan 2';color:#ffd166}
#eptitle{position:absolute;left:0;right:0;top:445px;text-align:center;font-family:Lalezar,Tajawal,sans-serif;font-size:150px;color:#fff;-webkit-text-stroke:16px #111;paint-order:stroke fill;text-shadow:8px 10px 0 #b8862f}
#epsub{position:absolute;left:0;right:0;top:650px;text-align:center;font:800 46px 'Baloo Bhaijaan 2';color:#fff}
#letter{position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow:inset 0 110px 0 #000,inset 0 -110px 0 #000}
#outroTxt{direction:rtl;position:absolute;left:110px;top:826px;width:820px;text-align:center;opacity:0}
#qr{position:absolute;left:520px;top:238px;padding:16px;background:#fff;border:7px solid #e9c46a;outline:7px solid #111;border-radius:26px;box-shadow:14px 14px 0 rgba(0,0,0,.4);opacity:0;transform-origin:50% 50%}
#qr img{display:block;width:440px;height:440px}
#qr .qlbl{direction:rtl;margin-top:8px;text-align:center;font:800 38px 'Baloo Bhaijaan 2';color:#111}
#outroTxt .made{font:800 40px 'Baloo Bhaijaan 2';color:#fff;text-shadow:3px 3px 0 #2a1d55}
#outroTxt .cta{display:inline-block;margin-top:14px;padding:10px 60px 18px;border-radius:60px;background:linear-gradient(135deg,#fff0c2,#e9c46a 55%,#b8862f);border:6px solid #111;box-shadow:8px 8px 0 #111;font-family:Lalezar,Tajawal,sans-serif;font-size:70px;color:#111}
/* لوحة المثال داخل إطار اللقطة */
.board{position:absolute;inset:0;visibility:hidden;overflow:hidden;direction:ltr}
.board .bdots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.08) 2px,transparent 2.6px);background-size:22px 22px}
.board .real{position:absolute;right:18px;top:16px;direction:rtl;padding:4px 18px 8px;border-radius:30px;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.5);color:#fff;font:800 24px 'Baloo Bhaijaan 2'}
.board .pill{position:absolute;z-index:3;direction:rtl;padding:4px 24px 8px;background:#111;color:#fff;border:3px solid #fff;border-radius:30px;font:800 32px 'Baloo Bhaijaan 2';transform:translateX(-50%)}
.board .card{position:absolute;background:#fff;padding:7px;outline:4px solid #111;box-shadow:10px 10px 0 rgba(0,0,0,.5);opacity:0}
.board .card img{display:block;object-fit:cover}
.board .card .lbl{position:absolute;left:50%;bottom:-48px;transform:translateX(-50%);white-space:nowrap;direction:rtl;font:800 28px 'Baloo Bhaijaan 2';color:#fff;-webkit-text-stroke:7px #111;paint-order:stroke fill}
.board .card.before{box-shadow:14px 14px 0 rgba(0,0,0,.5)}
.board .card .lbl.sm{font-size:23px;bottom:-42px;-webkit-text-stroke:6px #111}
.board .vpill{left:auto;right:-18px;top:-30px;transform:none;z-index:2}
.board .arrow{position:absolute;opacity:0}
.board .prompt{position:absolute;left:60px;top:74px;width:1110px;height:100px;display:flex;align-items:center;justify-content:flex-end;padding:0 34px 0 110px;background:#fff;border:6px solid #111;border-radius:52px;box-shadow:8px 8px 0 rgba(0,0,0,.45);opacity:0}
.board .prompt .btxt{font-size:40px}
.board .prompt .send{position:absolute;left:18px;top:13px;width:62px;height:62px;border-radius:50%;background:linear-gradient(135deg,#fff0c2,#e9c46a 55%,#b8862f);border:4px solid #111}
.board .vid{transform-origin:50% 40%}
#wipe{position:absolute;top:-60px;left:0;width:3300px;height:1200px;display:flex;transform:translateX(99999px)}
#wipe div{height:100%}
</style></head><body>
<canvas id="fx" width="1920" height="1080"></canvas>
<div id="dots"></div>
<div id="sky"><div id="sun"></div>
  <svg width="1920" height="1080" style="position:absolute;inset:0"><g id="cl1">${cloud(300, 250, 1.1)}${cloud(1500, 200, 0.8)}${cloud(2400, 300, 1.2)}</g><g id="cl2">${cloud(800, 520, 0.9)}${cloud(2000, 600, 1.0)}${cloud(3000, 480, 0.8)}</g><g id="cl3">${cloud(200, 820, 1.4)}${cloud(1700, 900, 1.6)}${cloud(3100, 860, 1.3)}</g></svg>
  <svg id="city" width="4000" height="320" viewBox="0 0 4000 320">${towers()}</svg>
</div>
<div id="ep"><div id="epband"></div><div id="epnum">الحلقة ١</div><div id="eptitle">جولة في <bdi dir="ltr">OM Ai</bdi></div><div id="epsub">كلّ مكان في التطبيق… في أقلّ من ٣ دقائق</div></div>
<div id="panels"></div>
<div id="titles"></div>
<div id="chapters"></div>
<div class="maha" id="mB"></div>
<div class="maha" id="mM"></div>
<div id="logo"><div class="plate"></div><img src="/icons/brand-om-s.png" alt="OM Ai"><svg viewBox="0 0 22 42"><g id="ls0" data-base="translate(7.5 14) scale(0.42)" transform="translate(7.5 14) scale(0.42)"><path fill="#04BAEC" d="M0-12C1-4 4-1 12 0C4 1 1 4 0 12C-1 4-4 1-12 0C-4-1-1-4 0-12Z"/></g><g id="ls1" data-base="translate(15 19) scale(0.62)" transform="translate(15 19) scale(0.62)"><path fill="#FEED01" d="M0-12C1-4 4-1 12 0C4 1 1 4 0 12C-1 4-4 1-12 0C-4-1-1-4 0-12Z"/></g><g id="ls2" data-base="translate(7.5 28) scale(0.38)" transform="translate(7.5 28) scale(0.38)"><path fill="#F049D7" d="M0-12C1-4 4-1 12 0C4 1 1 4 0 12C-1 4-4 1-12 0C-4-1-1-4 0-12Z"/></g></svg></div>
<div class="maha" id="mI"></div>
<div id="bubbles"></div>
<div id="qr"><img src="/icons/omran-qr-code.png" alt=""><div class="qlbl">امسح وحمّل <bdi dir="ltr">OM Ai</bdi></div></div>
<div id="outroTxt"><div class="made">صُنع في الإمارات</div><div class="cta">ابدأ مجانًا</div></div>
<div id="letter"></div>
<div id="wipe"><div id="wipeA" style="width:120px"></div><div style="width:40px;background:#fff"></div><div style="width:2900px;background:#111"></div><div style="width:40px;background:#fff"></div><div style="width:200px;background:#000;opacity:0"></div></div>
<div id="flash"></div>
<div id="fade"></div>
<script>(${MAHA_LIB.toString()})();</script>
<script>(${PAGE_MAIN.toString()})(${JSON.stringify(SCENES)}, ${JSON.stringify(CHAP)}, ${TOTAL}, ${BAR}, ${JSON.stringify(SHOTS)}, ${clipN || 1});</script>
</body></html>`;
}

async function openComp(browser) {
  const meta = JSON.parse(fs.readFileSync(path.join(SHOTS, 'meta.json'), 'utf8'));
  // إطارات الفيديو الحقيقيّ للمثال (٣٠/ث بمقاسه الأصليّ ١٢٨٠×٧٢٠) — تُعرض صورةً صورة فيتزامن مع التصوير الحتميّ
  const cs = SCENES.find((x) => x.ex && x.ex.kind === 'clip'), clipDir = path.join(WORK, 'clip');
  if (cs && !fs.existsSync(path.join(clipDir, '0001.jpg'))) {
    fs.mkdirSync(clipDir, { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(cs.ex.from || 0), '-i', path.join(ROOT, cs.ex.clip), '-t', '7', '-vf', 'fps=30', '-q:v', '2', path.join(clipDir, '%04d.jpg')]);
  }
  const clipN = fs.existsSync(clipDir) ? fs.readdirSync(clipDir).filter((f) => f.endsWith('.jpg')).length : 0;
  fs.writeFileSync(path.join(WORK, 'comp.html'), compHtml(meta, clipN));
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  await page.goto(base + '/__work/comp.html', { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(['96px Lalezar', '800 44px "Baloo Bhaijaan 2"', '600 44px "Baloo Bhaijaan 2"', '800 40px Tajawal'].map((f) => document.fonts.load(f, 'عمران مها'))));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((im) => im.decode().catch(() => null))));
  await page.evaluate(() => window.FIT());
  if (errs.length) throw new Error('أخطاء في صفحة التركيب: ' + errs.join(' | '));
  const fontsOk = await page.evaluate(() => ['Lalezar', 'Baloo Bhaijaan 2'].every((f) => document.fonts.check('40px "' + f + '"', 'عمران')));
  if (!fontsOk) console.warn('⚠️ خطوط Google لم تُحمَّل — النصّ سيظهر بخطّ بديل');
  return { ctx, page };
}

async function render() {
  const browser = await chromium.launch({ executablePath: exe });
  try {
    const { ctx, page } = await openComp(browser);
    const cues = await page.evaluate(() => window.CUES);
    fs.writeFileSync(path.join(WORK, 'cues.json'), JSON.stringify({ total: TOTAL, bpm: BPM, cues, scenes: SCENES.map((s) => ({ k: s.k, start: s.start, dur: s.dur, chap: s.chap })) }, null, 1));
    const frames = opt('frames', '');
    if (frames) { // إطارات مفردة للفحص بالعين
      for (const tt of frames.split(',').map(Number)) { await page.evaluate((x) => window.R(x), tt); await page.screenshot({ path: path.join(WORK, 'f-' + tt + '.png') }); }
      console.log('إطارات:', frames); await ctx.close(); return;
    }
    const from = Number(opt('from', 0)), to = Math.min(TOTAL, Number(opt('to', TOTAL)));
    // --patch يعيد رسم المقطع [from,to) فوق الإطارات الموجودة بأرقامها المطلقة (تعديل نصّ بلا إعادة الكلّ)
    const dir = path.join(WORK, 'frames'), patch = args.includes('--patch');
    if (!patch) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir); }
    const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS); const t0 = Date.now();
    for (let f = n0; f < n1; f++) {
      await page.evaluate((x) => window.R(x), f / FPS);
      await page.screenshot({ path: path.join(dir, String(patch ? f : f - n0).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
      if ((f - n0) % 300 === 0) console.log('🎞️', f, '/', n1, Math.round((Date.now() - t0) / 1000) + 's');
    }
    await ctx.close();
  } finally { await browser.close(); }
}

// ───────────────────────── ٣) الصوت ─────────────────────────
// موسيقى افتتاحيّة أنمي مولَّدة بالكود (لا ملفّات ولا رخص): ري الكبير، تتابع IV–V–iii–vi (G–A–F#m–Bm) مازورةً لكلّ وتر،
// طبول ٨ ضربات، باص، وسادة «سوبرسو»، نقر أرپيج، ولحن في الفصول المرحة؛ والمؤثّرات على أحداث الجدول (cues.json).
function synthAudio() {
  const SR = 44100;
  const cfg = JSON.parse(fs.readFileSync(path.join(WORK, 'cues.json'), 'utf8'));
  const total = cfg.total, N = Math.ceil((total + 0.2) * SR);
  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const B = { drums: bus(), bass: bus(), pad: bus(), pluck: bus(), lead: bus(), sfx: bus(), rev: bus() };
  let seed = 12345; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const TAU = Math.PI * 2;
  function put(b, i, v, pan, send) {
    if (i < 0 || i >= N) return;
    const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4);
    b[0][i] += v * l; b[1][i] += v * r;
    if (send) { B.rev[0][i] += v * l * send; B.rev[1][i] += v * r * send; }
  }
  // مرشّح ثنائيّ القطب (RBJ)
  function biquad(type, f, q) {
    const w = TAU * f / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    const k = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  const saw = (ph, dt) => { let v = 2 * ph - 1; if (ph < dt) { const x = ph / dt; v -= x + x - x * x - 1; } else if (ph > 1 - dt) { const x = (ph - 1) / dt; v -= x * x + x + x + 1; } return v; };
  // نغمة عامّة: موجة منشار/نبض بمغلّف ADSR ومرشّح
  function tone(b, t0, dur, midi, o) {
    const f = mtof(midi), i0 = Math.round(t0 * SR), len = Math.round((dur + (o.rel || 0.05)) * SR);
    const lp = biquad('lp', o.cut || 3000, 0.8), det = o.det || [0];
    const ph = det.map(() => rand());
    for (let n = 0; n < len; n++) {
      const tt = n / SR;
      let env = Math.min(1, tt / (o.att || 0.005));
      if (o.dec) env *= Math.exp(-tt / o.dec);
      if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / (o.rel || 0.05));
      const vib = o.vib && tt > 0.18 ? 1 + 0.004 * Math.sin(TAU * 5.5 * tt) : 1;
      let v = 0;
      for (let d = 0; d < det.length; d++) {
        const fd = f * Math.pow(2, det[d] / 1200) * vib, dt = fd / SR;
        ph[d] = (ph[d] + dt) % 1;
        v += o.wave === 'sq' ? (saw(ph[d], dt) - saw((ph[d] + 0.5) % 1, dt)) * 0.5 : saw(ph[d], dt);
      }
      put(b, i0 + n, lp(v / Math.sqrt(det.length)) * env * o.g, o.pan || 0, o.send || 0);
    }
  }
  function noise(b, t0, dur, o) {
    const i0 = Math.round(t0 * SR), len = Math.round(dur * SR);
    const f1 = o.type ? biquad(o.type, o.f || 3000, o.q || 0.8) : (x) => x;
    for (let n = 0; n < len; n++) {
      const tt = n / SR; let env = o.env ? o.env(tt, dur) : Math.exp(-tt / (o.dec || 0.1));
      put(b, i0 + n, f1(rand() * 2 - 1) * env * o.g, o.pan || 0, o.send || 0);
    }
  }
  function sine(b, t0, dur, f0, f1, o) {
    const i0 = Math.round(t0 * SR), len = Math.round(dur * SR); let ph = 0;
    for (let n = 0; n < len; n++) {
      const tt = n / SR, f = f0 * Math.pow(f1 / f0, Math.min(1, tt / (o.sweep || dur)));
      ph += TAU * f / SR;
      const env = Math.min(1, tt / (o.att || 0.002)) * Math.exp(-tt / (o.dec || 0.2));
      put(b, i0 + n, Math.sin(ph) * env * o.g, o.pan || 0, o.send || 0);
    }
  }
  const bell = (b, t0, midi, g, pan) => { // جرس FM
    const i0 = Math.round(t0 * SR), len = Math.round(1.2 * SR), f = mtof(midi);
    for (let n = 0; n < len; n++) { const tt = n / SR; const m = Math.sin(TAU * f * 3.5 * tt) * 2.2 * Math.exp(-tt / 0.25); put(b, i0 + n, Math.sin(TAU * f * tt + m) * Math.exp(-tt / 0.45) * g, pan, 0.45); }
  };

  // الطبول
  const kickTimes = [];
  const kick = (t, g = 1) => { kickTimes.push(t); sine(B.drums, t, 0.35, 165, 52, { sweep: 0.06, dec: 0.14, g: 0.62 * g }); noise(B.drums, t, 0.012, { dec: 0.004, g: 0.25 * g, type: 'hp', f: 3000 }); };
  const snare = (t, g = 1) => { noise(B.drums, t, 0.25, { dec: 0.07, g: 0.5 * g, type: 'bp', f: 2200, q: 0.7, send: 0.18 }); sine(B.drums, t, 0.12, 220, 170, { dec: 0.05, g: 0.35 * g }); };
  const hat = (t, g = 1, open) => noise(B.drums, t, open ? 0.3 : 0.06, { dec: open ? 0.12 : 0.022, g: 0.16 * g, type: 'hp', f: 7500, pan: 0.25 });
  const crash = (t, g = 1) => noise(B.drums, t, 2.2, { dec: 0.7, g: 0.32 * g, type: 'hp', f: 4200, send: 0.3, pan: -0.15 });

  const PROG = [[55, 59, 62, 66], [57, 61, 64, 67], [54, 57, 61, 64], [59, 62, 66, 69]]; // G△7 A7 F#m7 Bm7
  const ROOT = [43, 45, 42, 47];
  const MEL = [
    [71, '-', 74, '-', 76, 74, 71, 69], [69, '-', '-', 73, 76, '-', 74, 73], [73, '-', 69, '-', 78, '-', 76, '-'], [74, '-', '-', 71, '-', '-', '-', null],
    [74, 76, 78, '-', 76, 74, 71, '-'], [73, 74, 76, '-', 81, '-', 78, 76], [78, '-', 76, 73, '-', 69, 73, 76], [74, '-', '-', '-', '-', null, null, null],
  ];
  const beat = BAR / 4, e8 = beat / 2, s16 = beat / 4;
  const nBars = Math.round(total / BAR);
  const sceneAtBar = (b) => { const t = b * BAR + 0.01; let s = cfg.scenes[0]; for (const x of cfg.scenes) if (x.start <= t) s = x; return s; };
  for (let b = 0; b < nBars; b++) {
    const t0 = b * BAR, s = sceneAtBar(b), lb = Math.round((t0 - s.start) / BAR), nb = Math.round(s.dur / BAR);
    const last = b === nBars - 1;
    let ci = b % 4; if (last) ci = -1;
    const chord = ci >= 0 ? PROG[ci] : [50, 54, 57, 62], root = ci >= 0 ? ROOT[ci] : 38;
    const k = s.k, chap = s.chap;
    const lead = k === 'outro' || (k === 'shot' && (chap === 'create' || chap === 'life' || chap === 'style'));
    const groove = k === 'shot' || k === 'title' || (k === 'outro' && !last);
    // الوسادة
    const padG = k === 'intro' ? 0.12 * Math.min(1, (lb + 0.3) / 2) : (k === 'chapter' ? 0.13 : 0.13);
    chord.forEach((m, j) => tone(B.pad, t0, last ? 3.4 : BAR, m, { det: [-14, -6, 0, 7, 15], cut: k === 'intro' ? 1400 + lb * 500 : 2600, att: 0.03, rel: 0.25, g: padG, pan: (j - 1.5) * 0.25, send: 0.35 }));
    if (last) { crash(t0, 1.2); kick(t0); chord.forEach((m) => bell(B.pluck, t0, m + 12, 0.07, 0)); continue; }
    // أرپيج نقريّ ١٦ـيّات
    if (!(k === 'intro' && lb === 0) && k !== 'chapter') {
      const pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
      for (let q = 0; q < 16; q++) tone(B.pluck, t0 + q * s16, s16 * 0.9, chord[pat[q]] + 12, { dec: 0.09, cut: 3800, g: (q % 4 === 0 ? 0.12 : 0.085) * (k === 'intro' ? 0.8 : 1), pan: q % 2 ? 0.35 : -0.35, send: 0.25 });
    }
    // بطاقة الفصل: ضربة ثمّ بناء
    if (k === 'chapter') {
      if (lb === 0) { crash(t0); kick(t0); chord.forEach((m) => tone(B.pluck, t0, 0.5, m + 12, { dec: 0.35, cut: 4500, g: 0.08, send: 0.4 })); }
      else { for (let q = 0; q < 16; q++) snare(t0 + q * s16, 0.25 + 0.75 * q / 15); noise(B.sfx, t0, BAR, { env: (tt, d) => Math.pow(tt / d, 2), g: 0.12, type: 'bp', f: 2500, q: 0.5 }); }
      continue;
    }
    // المقدّمة: بلا طبول في أوّل مازورتين، ثمّ رباعيّات، ثمّ دحرجة سنير
    if (k === 'intro') {
      if (lb === 2) for (let q = 0; q < 4; q++) kick(t0 + q * beat, 0.8);
      if (lb === 3) { for (let q = 0; q < 4; q++) kick(t0 + q * beat, 0.9); for (let q = 0; q < 16; q++) snare(t0 + q * s16, 0.2 + 0.8 * q / 15); }
      if (lb >= 2) noise(B.sfx, t0, BAR, { env: (tt, d) => Math.pow((tt + (lb - 2) * d) / (2 * d), 2.2), g: 0.1, type: 'bp', f: 1800 + lb * 600, q: 0.6 });
      continue;
    }
    if (groove) {
      if (lb === 0) crash(t0, s.k === 'title' ? 1.1 : 0.55);
      const fill = (lb === nb - 1) && (nb >= 3);
      [0, 3, 4].forEach((q) => kick(t0 + q * e8));
      if (!fill || true) { snare(t0 + 2 * e8); }
      if (fill) { for (let q = 12; q < 16; q++) snare(t0 + q * s16, 0.45 + 0.15 * (q - 12)); } else snare(t0 + 6 * e8);
      for (let q = 0; q < 8; q++) hat(t0 + q * e8, q % 2 ? 1 : 0.6, q === 7 && !fill);
      // الباص: ثُمنيّات بنبض أوكتاف
      for (let q = 0; q < 8; q++) tone(B.bass, t0 + q * e8, e8 * 0.85, root + (q % 2 ? 12 : 0) - 12, { wave: 'sq', det: [0, 8], cut: 900, dec: 0.25, rel: 0.02, g: 0.11 });
    }
    if (lead) {
      const ph = MEL[b % 8];
      for (let q = 0; q < 8; q++) {
        const m = ph[q]; if (typeof m !== 'number') continue;
        let len = 1; while (q + len < 8 && ph[q + len] === '-') len++;
        tone(B.lead, t0 + q * e8, len * e8 * 0.95, m, { wave: 'sq', det: [-5, 5], cut: 3400, att: 0.012, rel: 0.09, vib: 1, g: 0.15, pan: 0.05, send: 0.3 });
        tone(B.lead, t0 + q * e8, len * e8 * 0.95, m + 12, { det: [0], cut: 5000, att: 0.012, rel: 0.09, g: 0.04, send: 0.3 });
      }
    }
  }
  // المؤثّرات على أحداث الصورة
  for (const c of cfg.cues) {
    const t = c.t;
    if (c.type === 'whoosh') noise(B.sfx, t, 0.64, { env: (tt, d) => Math.sin(Math.PI * tt / d) ** 2, g: 0.5, type: 'bp', f: 1400, q: 0.5, pan: 0.3, send: 0.2 });
    else if (c.type === 'drop') { noise(B.sfx, t, 0.38, { env: (tt, d) => Math.sin(Math.PI * tt / d) ** 2, g: 0.28, type: 'bp', f: 900, q: 0.6 }); sine(B.sfx, t + 0.36, 0.25, 120, 60, { dec: 0.09, g: 0.45 }); }
    else if (c.type === 'slam') { sine(B.sfx, t, 0.35, 110, 45, { dec: 0.12, g: 0.55 * c.v }); noise(B.sfx, t, 0.08, { dec: 0.025, g: 0.4 * c.v, type: 'bp', f: 1800, send: 0.15 }); }
    else if (c.type === 'impact') { sine(B.sfx, t, 0.9, 90, 32, { sweep: 0.3, dec: 0.35, g: 0.8 }); noise(B.sfx, t, 1.6, { dec: 0.45, g: 0.35, type: 'hp', f: 2500, send: 0.4 }); }
    else if (c.type === 'pop') sine(B.sfx, t, 0.09, 520, 1250, { sweep: 0.05, dec: 0.04, g: 0.32, pan: 0.2 });
    else if (c.type === 'tick') sine(B.sfx, t, 0.035, 1250 + 260 * c.v, 1250 + 260 * c.v, { dec: 0.012, g: 0.09, pan: 0.2 });
    else if (c.type === 'jump') sine(B.sfx, t, 0.3, 280, 1000, { sweep: 0.22, dec: 0.12, g: 0.3 });
    else if (c.type === 'sparkle') [86, 90, 93, 98, 102].forEach((m, j) => bell(B.sfx, t + j * 0.055, m, 0.06, -0.3 + j * 0.15));
  }
  // الضغط الجانبيّ من الركلة على الوسادة والباص
  const duck = new Float32Array(N).fill(1);
  for (const kt of kickTimes) { const i0 = Math.round(kt * SR); for (let n = 0; n < 0.25 * SR && i0 + n < N; n++) duck[i0 + n] = Math.min(duck[i0 + n], 1 - 0.5 * Math.exp(-n / SR / 0.09)); }
  // صدى بسيط (شرويدر) على قناة الإرسال، وصدى مؤخَّر للّحن (ثُمن منقوط)
  const reverb = (x, off) => {
    const combs = [1116, 1188, 1277, 1356].map((d) => ({ b: new Float32Array(d + off), i: 0, s: 0 }));
    const aps = [556, 441].map((d) => ({ b: new Float32Array(d + off), i: 0 }));
    const y = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      let o = 0; const inp = x[n] * 0.3;
      for (const c of combs) { const v = c.b[c.i]; c.s = v * 0.6 + c.s * 0.4; c.b[c.i] = inp + c.s * 0.8; c.i = (c.i + 1) % c.b.length; o += v; }
      for (const a of aps) { const v = a.b[a.i]; const w = o + v * 0.5; a.b[a.i] = w; a.i = (a.i + 1) % a.b.length; o = v - w * 0.5; }
      y[n] = o * 0.5;
    }
    return y;
  };
  const rv = [reverb(B.rev[0], 0), reverb(B.rev[1], 23)];
  const dly = Math.round(beat * 0.75 * SR);
  for (let ch = 0; ch < 2; ch++) { const L = B.lead[ch]; for (let n = dly; n < N; n++) L[n] += L[n - dly] * 0.32 * (ch ? 1 : 0.8); }
  const out = [new Float32Array(N), new Float32Array(N)];
  const fadeOut = Math.round(0.7 * SR);
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    for (let n = 0; n < N; n++) {
      const music = B.drums[ch][n] * 0.9 + (B.bass[ch][n] + B.pad[ch][n]) * duck[n] + B.pluck[ch][n] + B.lead[ch][n] + rv[ch][n];
      let v = music * 0.62 + B.sfx[ch][n] * 0.85;
      if (n > N - fadeOut) v *= (N - n) / fadeOut;
      v = Math.tanh(v * 1.1);
      out[ch][n] = v; peak = Math.max(peak, Math.abs(v));
    }
  }
  const g = 0.89 / peak;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let n = 0; n < N; n++) for (let ch = 0; ch < 2; ch++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[ch][n] * g * 32767))), 44 + n * 4 + ch * 2);
  fs.writeFileSync(path.join(WORK, 'audio.wav'), buf);
  console.log('🎵 audio.wav', total.toFixed(1) + 's');
}

// ───────────────────────── ٤) الترميز ─────────────────────────
function encode() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(WORK, 'frames', '%05d.jpg'), '-i', path.join(WORK, 'audio.wav'),
    '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest', '-movflags', '+faststart', OUT]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '44.4', '-i', OUT, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', OUT.replace(/\.mp4$/, '.jpg')]);
  console.log('🎬', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1) + 'MB');
}

try {
  if (STAGE === 'all' || STAGE === 'capture') await capture();
  if (STAGE === 'all' || STAGE === 'render') await render();
  if (STAGE === 'all' || STAGE === 'audio') synthAudio();
  if (STAGE === 'all' || STAGE === 'encode') encode();
} finally { srv.close(); }
