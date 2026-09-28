// scripts/studio-previews.mjs — v-studio-more-looks (أمر المالك «ولّد المعاينات»):
// تسخين معاينات خيارات ستوديو AI مرّة واحدة بعد النشر، بدل أن ينتظرها أوّل مستخدم.
// يطلب /api/studio-preview لكلّ ميزة وكلّ خيار؛ الموجود في الكاش يرجع فورًا بلا توليد،
// والجديد يُولَّد على الخادم ويُحفظ في Redis فيُقدَّم للجميع بعدها فورًا.
//
//   node scripts/studio-previews.mjs [BASE_URL] [feature|all]
//
// ملاحظة: كلّ خيار جديد = صورة واحدة تُولَّد مرّة واحدة في العمر (مفتاح المالك).
import { readFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://omran-ai-builder.vercel.app').replace(/\/$/, '');
const ONLY = process.argv[3] || 'all';
const CONCURRENCY = 2;

/* خيارات الميزات الأساسيّة والـ١٤ من ملفّي البيانات نفسيهما — لا قائمة ثانية تتعفّن */
const { STYLE_TEXT } = await import('../api/_lib/studio-styles.js').then((m) => m.default || m);
const morePath = new URL('../js/app-12-studio-more.js', import.meta.url);
const moreSrc = readFileSync(morePath, 'utf8');
const win = {};
// eslint-disable-next-line no-new-func
new Function('window', moreSrc)(win);

const jobs = [];
for (const [feature, map] of Object.entries(STYLE_TEXT)) {
  for (const value of Object.keys(map)) jobs.push({ feature, value });
}
for (const [feature, list] of Object.entries(win.__STUDIO_MORE.options)) {
  for (const o of list) jobs.push({ feature, value: o.value });
}
const todo = jobs.filter((j) => ONLY === 'all' || j.feature === ONLY);
console.log('المعاينات المطلوبة: ' + todo.length + ' على ' + BASE);

let done = 0; let made = 0; let failed = 0;
async function run(job) {
  const url = BASE + '/api/studio-preview?feature=' + encodeURIComponent(job.feature) + '&value=' + encodeURIComponent(job.value);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
    const ms = Date.now() - t0;
    if (r.ok) { if (ms > 4000) made++; console.log('✓ ' + job.feature + '/' + job.value + ' (' + ms + 'ms)'); }
    else { failed++; console.log('✗ ' + job.feature + '/' + job.value + ' HTTP ' + r.status); }
  } catch (e) { failed++; console.log('✗ ' + job.feature + '/' + job.value + ' ' + (e && e.message)); }
  done++;
}
const queue = todo.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await run(queue.shift());
}));
console.log('انتهى: ' + done + ' خيارًا، مولّد جديد ≈' + made + '، فشل ' + failed);
if (failed) process.exitCode = 1;
