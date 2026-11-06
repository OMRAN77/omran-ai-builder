#!/usr/bin/env node
// store/microsoft/shots.mjs — لقطات Microsoft Store لتطبيق «Om ai» (PWA على ويندوز) من البناء الحاليّ (v-ms-shots).
// رفض مايكروسوفت ٢٢ أكتوبر ٢٠٢٦ (10.1.1.3 Inaccurate Representation): لقطات القائمة الإنجليزيّة «show non-Windows UI or devices» —
// كانت لقطات جوّال. هنا التطبيق نفسه في نافذة حاسوب ١٩٢٠×١٠٨٠ (ضمن حدود المتجر 1366×768 … 3840×2160، PNG): رابط الموقع العامّ
// كما تحمّله الحزمة (بلا ?store=)، حساب غير المالك، ولا شيء يُرسم فوق التطبيق ولا إطار جهاز.
// كلّ لغة في مجلّدها (en/ وar/) — تُرفع تحت لغتها في Partner Center ← Store listings.
// الاستعمال: node store/microsoft/shots.mjs [--pw /path/to/node_modules/playwright-core] [--only 01-home-chat] [--langs en,ar] [--out dir]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : ''; };
const OUT = opt('out') || path.join(ROOT, 'store/microsoft/screenshots');
const ONLY = (opt('only') || '').split(',').filter(Boolean);
const LANGS = (opt('langs') || 'en,ar').split(',').filter((l) => /^(ar|en)$/.test(l));

// انتظار الخطوط وفكّ الصور الظاهرة قبل اللقطة (بسقف ٦ ث — صورة كسولة لا تعلّق التشغيلة)
const READY = 'await document.fonts.ready; const im=[...document.images].filter(i=>i.getBoundingClientRect().height>0); im.forEach(i=>{i.loading="eager"}); await Promise.race([Promise.all(im.map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,6000))]);';
const wait = (ms) => 'await new Promise(r=>setTimeout(r,' + ms + '));';
// تلميح أوّل زيارة فوق صندوق الكتابة ليس من الواجهة الثابتة — يُغلق كما يغلقه المستخدم بنقرة
const CLEAN = 'const __h=document.getElementById("askAllHintTip"); if(__h) __h.click(); ' + wait(300);
const open = (id) => CLEAN + 'document.getElementById("' + id + '").click(); ' + wait(2500);
// مربّع الأدوات: زرّ «الأدوات» نفسه، وصوره الكسولة تُفكّ قبل اللقطة
const TOOLS = CLEAN + 'document.getElementById("btnToolsBox").click(); const __t0=Date.now(); while(!document.querySelector("#sectionsToolsOverlay.show") && Date.now()-__t0<8000) await new Promise(r=>setTimeout(r,200)); const __pi=[...document.querySelectorAll("#sectionsToolsPopup img")]; __pi.forEach(i=>{i.loading="eager"}); await Promise.race([Promise.all(__pi.map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,8000))]); ' + wait(600);
// القبلة والمواقيت تحتاج موقعًا: دبي ثابتة بدل «جارٍ تحديد موقعك…» (PITFALLS: لقطة القبلة بلا موقع)
const GEO = 'navigator.geolocation.getCurrentPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()})}; navigator.geolocation.watchPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()});return 1};';

const SHOTS = [
  { name: '01-home-chat', js: CLEAN },
  { name: '02-tools', js: TOOLS },
  { name: '03-fashion-studio', js: open('btnFashionAI') },
  { name: '04-decor-ai', js: open('btnDesignAI') },
  { name: '05-construction', js: open('btnConstruction') },
  { name: '06-qibla-prayer', js: GEO + open('btnQibla') },
];

let failed = 0;
for (const lang of LANGS) {
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.includes(s.name)) continue;
    const a = [path.join(ROOT, 'scripts/ui-shot.mjs'), '--out', path.join(OUT, lang), '--user', 'reviewer', '--desktop', '--viewport', '1920x1080', '--scale', '1', '--lang', lang,
      '--path', '/', '--wait', '3500', '--name', s.name, '--settle', '600', '--eval', '(async()=>{ ' + s.js + READY + ' })()'];
    if (opt('pw')) a.push('--pw', opt('pw'));
    const r = spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8', timeout: 150000 });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log((ok ? '✓ ' : '✗ ') + lang + '/' + s.name + (ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')));
  }
}
process.exit(failed ? 1 : 0);
