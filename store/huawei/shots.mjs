#!/usr/bin/env node
// store/huawei/shots.mjs — لقطات متجر هواوي الثماني من البناء الحاليّ (v-hw-resubmit-1313، اللغات الثلاث v-hw-resubmit-2).
// كلّ لقطة = تشغيلة scripts/ui-shot.mjs واحدة: رابط الحزمة /?store=huawei، حساب غير المالك (المالك يرى واجهة زائدة)،
// هاتف ٣٦٠×٦٤٠ ×٣ = ١٠٨٠×١٩٢٠ (٩:١٦). لا شيء يُرسم فوق التطبيق: ما في الصورة هو ما يراه المراجع.
// v-hw-resubmit-2: التطبيق يتبع لغة الهاتف ومراجع هواوي على هاتف صينيّ أو إنجليزيّ، فاللقطات بثلاث لغات: العربيّة في المجلّد نفسه،
// والإنجليزيّة في en/ والصينيّة في zh/ — كلّ مجموعة تُرفع تحت لغتها في AGC.
// الاستعمال: node store/huawei/shots.mjs [--pw /path/to/node_modules/playwright-core] [--only 05-fashion-studio,08-qibla-prayer] [--langs ar,en,zh] [--out dir]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : ''; };
const OUT = opt('out') || path.join(ROOT, 'store/huawei/screenshots');
const ONLY = (opt('only') || '').split(',').filter(Boolean);
const LANGS = (opt('langs') || 'ar,en,zh').split(',').filter((l) => /^(ar|en|zh)$/.test(l));
const dirFor = (lang) => (lang === 'ar' ? OUT : path.join(OUT, lang));

// انتظار الخطوط وفكّ الصور الظاهرة قبل اللقطة (بسقف ٦ ث — صورة كسولة لا تعلّق التشغيلة)
const READY = 'await document.fonts.ready; const im=[...document.images].filter(i=>i.getBoundingClientRect().height>0); im.forEach(i=>{i.loading="eager"}); await Promise.race([Promise.all(im.map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,6000))]);';
const wait = (ms) => 'await new Promise(r=>setTimeout(r,' + ms + '));';
const open = (id) => 'document.getElementById("' + id + '").click(); ' + wait(2500);
// v-hw-1316: مربّع الأدوات يُفتح وحده بعد ~٢٫٥ ث (selfdiag)؛ صوره كسولة فيطول بعد فكّها — يُنتظر ثمّ يُصحَّح التمرير
const TOUR = 'const __t0=Date.now(); while(!document.querySelector("#sectionsToolsOverlay.show") && Date.now()-__t0<14000) await new Promise(r=>setTimeout(r,200));';
const PANEL = 'const __pi=[...document.querySelectorAll("#sectionsToolsPopup img")]; __pi.forEach(i=>{i.loading="eager"}); await Promise.race([Promise.all(__pi.map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,8000))]);';
const group = (g) => TOUR + PANEL + 'const __p=document.getElementById("sectionsToolsPopup"), __s=document.querySelector("[data-tools-group=' + g + ']"); for(let k=0;k<3;k++){ __p.scrollTop += __s.getBoundingClientRect().top - __p.getBoundingClientRect().top; ' + wait(400) + ' }';
// القبلة والمواقيت تحتاج موقعًا: دبي ثابتة بدل «جارٍ تحديد موقعك…» (PITFALLS: لقطة القبلة بلا موقع)
const GEO = 'navigator.geolocation.getCurrentPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()})}; navigator.geolocation.watchPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()});return 1};';

/* v-hw-1316 (رفض 1.3.15 بالقاعدة 1.14): الشاشة الرئيسيّة — المحادثة — لم تكن في أيّ لقطة، والمربّع ظهر نصفه. المجموعة الجديدة:
   الرئيسيّة كما يراها المراجع بعد إغلاق المربّع (✕ مخفيّ على الهاتف؛ الرجوع والسحب ينتهيان إلى نقرته)، والمربّع بأقسامه الثلاثة، وأربع
   أدوات. سقطت الإعلانات (صفحة مستقلّة تُصوَّر خارج الحزمة) والتعليم (بطاقته في الرئيسيّة وقسم «الحياة اليوميّة»). */
const SHOTS = [
  { name: '01-home-chat', js: TOUR + 'document.getElementById("stpCloseBtn").click(); ' + wait(900) },
  // مربّع الأدوات كما يُفتح تلقائيًّا في أوّل تشغيل (v-store-showcase)
  { name: '02-tools-creative', js: TOUR + PANEL },
  { name: '03-tools-business', js: group('grpBusiness') },
  { name: '04-tools-life', js: group('grpLife') },
  { name: '05-fashion-studio', js: open('btnFashionAI') },
  { name: '06-decor-ai', js: open('btnDesignAI') },
  { name: '07-construction', js: open('btnConstruction') },
  { name: '08-qibla-prayer', js: GEO + open('btnQibla') },
];

let failed = 0;
for (const lang of LANGS) {
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.includes(s.name)) continue;
    const a = [path.join(ROOT, 'scripts/ui-shot.mjs'), '--out', dirFor(lang), '--user', 'reviewer', '--mobile', '--viewport', '360x640', '--scale', '3', '--lang', lang,
      '--path', s.path || '/?store=huawei', '--wait', '3500', '--name', s.name, '--settle', '600', '--eval', '(async()=>{ ' + s.js + READY + ' })()'];
    if (opt('pw')) a.push('--pw', opt('pw'));
    const r = spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8', timeout: 150000 });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log((ok ? '✓ ' : '✗ ') + lang + '/' + s.name + (ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')));
  }
}
process.exit(failed ? 1 : 0);
