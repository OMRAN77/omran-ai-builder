#!/usr/bin/env node
// store/huawei/shots.mjs — لقطات متجر هواوي الثماني من البناء الحاليّ (v-hw-resubmit-1314).
// كلّ لقطة = تشغيلة scripts/ui-shot.mjs واحدة: رابط الحزمة /?store=huawei، حساب غير المالك (المالك يرى واجهة زائدة)،
// هاتف ٣٦٠×٦٤٠ ×٣ = ١٠٨٠×١٩٢٠ (٩:١٦)، عربيّ. لا شيء يُرسم فوق التطبيق: ما في الصورة هو ما يراه المراجع.
// الاستعمال: node store/huawei/shots.mjs [--pw /path/to/node_modules/playwright-core] [--only 03-fashion,08-qibla] [--out dir]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : ''; };
const OUT = opt('out') || path.join(ROOT, 'store/huawei/screenshots');
const ONLY = (opt('only') || '').split(',').filter(Boolean);

// انتظار الخطوط وفكّ الصور الظاهرة قبل اللقطة (بسقف ٦ ث — صورة كسولة لا تعلّق التشغيلة)
const READY = 'await document.fonts.ready; const im=[...document.images].filter(i=>i.getBoundingClientRect().height>0); im.forEach(i=>{i.loading="eager"}); await Promise.race([Promise.all(im.map(i=>i.decode().catch(()=>{}))), new Promise(r=>setTimeout(r,6000))]);';
const wait = (ms) => 'await new Promise(r=>setTimeout(r,' + ms + '));';
const open = (id) => 'document.getElementById("' + id + '").click(); ' + wait(2500);
// القبلة والمواقيت تحتاج موقعًا: دبي ثابتة بدل «جارٍ تحديد موقعك…» (PITFALLS: لقطة القبلة بلا موقع)
const GEO = 'navigator.geolocation.getCurrentPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()})}; navigator.geolocation.watchPosition=function(ok){ok({coords:{latitude:25.2048,longitude:55.2708,accuracy:20},timestamp:Date.now()});return 1};';

const SHOTS = [
  // مربّع الأدوات كما يُفتح تلقائيًّا في أوّل تشغيل (v-store-showcase)
  { name: '01-tools-creative', js: '' },
  { name: '02-tools-business', js: 'document.querySelector("[data-tools-group=grpBusiness]").scrollIntoView({block:"start"}); ' + wait(500) },
  { name: '03-fashion-studio', js: open('btnFashionAI') },
  { name: '04-decor-ai', js: open('btnDesignAI') },
  // استوديو الإعلانات صفحة مستقلّة (app-18: location.href='/ad-studio.html') — النقرة تبحر فتُصوَّر الصفحة مباشرة
  { name: '05-ad-studio', path: '/ad-studio.html', js: '' },
  { name: '06-construction', js: open('btnConstruction') },
  { name: '07-education', js: open('btnOmranEdu') },
  { name: '08-qibla-prayer', js: GEO + open('btnQibla') },
];

let failed = 0;
for (const s of SHOTS) {
  if (ONLY.length && !ONLY.includes(s.name)) continue;
  const a = [path.join(ROOT, 'scripts/ui-shot.mjs'), '--out', OUT, '--user', 'reviewer', '--mobile', '--viewport', '360x640', '--scale', '3',
    '--path', s.path || '/?store=huawei', '--wait', '3500', '--name', s.name, '--settle', '600', '--eval', '(async()=>{ ' + s.js + READY + ' })()'];
  if (opt('pw')) a.push('--pw', opt('pw'));
  const r = spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8', timeout: 150000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? '✓ ' : '✗ ') + s.name + (ok ? '' : '\n' + (r.stdout || '') + (r.stderr || '')));
}
process.exit(failed ? 1 : 0);
