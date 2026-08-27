// scripts/wardrobe-thumbs-free.mjs — النماذج الناقصة للأزياء (٧٨ ستايل) وخيارات
// ستايل الذكاء الاصطناعي، بصور شبه حقيقية عبر المولّد المجاني (Flux) — لا يحتاج
// أي رصيد. يولّد الناقص فقط (الموجود في assets/ يُترك كما هو).
//
//   node scripts/wardrobe-thumbs-free.mjs [fashion|studio|all]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const MODE = process.argv[2] || 'all';

// أوصاف الأزياء من الخادم نفسه — مصدر واحد للحقيقة.
const fsrc = readFileSync('api/_lib/fashion-create.js', 'utf8');
const grab = (name) => new Function('return {' + fsrc.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};'))[1] + '}')();
const WOMEN = grab('STYLE_PROMPTS');
const MEN = grab('STYLE_PROMPTS_MEN');
const KIDS = grab('STYLE_PROMPTS_KIDS');

// خيارات الستايل من الواجهة (ar/en) — نلتقط الكائن بموازنة الأقواس.
function grabStudioOptions() {
  const s = readFileSync('js/app-13-stocks-init.js', 'utf8');
  const i = s.indexOf('const STUDIO_OPTIONS = {');
  let depth = 0, j = i + 'const STUDIO_OPTIONS = '.length;
  for (; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') { depth--; if (!depth) break; }
  }
  return new Function('return ' + s.slice(i + 'const STUDIO_OPTIONS = '.length, j + 1))();
}

const LOOK = ' Professional fashion catalog photography, luxury studio, warm golden rim lighting,' +
  ' dark elegant backdrop, full body, photorealistic, high detail. No text, no watermark, no logo.';

const PERSON = {
  women: 'an elegant modest Middle Eastern woman model wearing ',
  men: 'a well-groomed Middle Eastern man model wearing ',
  kids: 'a happy child model wearing ',
};

// قوالب خيارات الستايل: كل ميزة تُصوَّر بلقطتها الصحيحة.
const FEAT_SHOT = {
  hair: (l) => 'studio beauty portrait of a woman with ' + l + ' hairstyle, focus on the hair,',
  nails: (l) => 'close-up of an elegant hand showing ' + l + ' manicure nails,',
  makeup: (l) => 'studio beauty portrait of a woman with ' + l + ' makeup look,',
  beard: (l) => 'studio portrait of a Middle Eastern man with a ' + l + ' beard style,',
  skin: (l) => 'studio beauty portrait showing ' + l + ' skin finish,',
  glasses: (l) => 'studio portrait of a person wearing ' + l + ' eyeglasses,',
  tattoo: (l) => 'close-up of a forearm with a ' + l + ' style tattoo design,',
  anime: (l) => l + ' anime art style illustrated portrait of a young character,',
  heritage: (l) => 'studio portrait of a person in ' + l + ' traditional heritage attire,',
};
const FEAT_LOOK = ' Professional studio photography, warm golden lighting, dark elegant backdrop,' +
  ' photorealistic, high detail. No text, no watermark, no logo.';

const JOBS = [];
if (MODE === 'fashion' || MODE === 'all') {
  for (const [g, map] of [['women', WOMEN], ['men', MEN], ['kids', KIDS]]) {
    Object.entries(map).forEach(([v, desc], i) => {
      if (existsSync('assets/fashion/looks/' + g + '/' + v + '.webp')) return; // الموجود لا يُعاد
      JOBS.push({ kind: g, name: v, seed: 1000 + (g === 'men' ? 200 : g === 'kids' ? 400 : 0) + i,
        prompt: 'Fashion catalog photo of ' + PERSON[g] + desc + '.' + LOOK });
    });
  }
}
if (MODE === 'studio' || MODE === 'all') {
  const OPTS = grabStudioOptions();
  Object.entries(OPTS).forEach(([feat, list]) => {
    if (!Array.isArray(list) || !FEAT_SHOT[feat]) return;
    list.forEach((o, i) => {
      const file = feat + '-' + o.value;
      if (existsSync('assets/studio/options/' + file + '.webp')) return;
      JOBS.push({ kind: 'studioopt', name: file, seed: 3000 + i * 7 + feat.length,
        prompt: FEAT_SHOT[feat](o.en || o.value) + FEAT_LOOK });
    });
  });
}

console.log('المطلوب توليده: ' + JOBS.length + ' صورة (الناقص فقط)');
// ميزانية وقت داخلية: نتوقف بأمان قبل مهلة الووركفلو فيُدفع ما أُنجز بدل ضياعه.
const BUDGET_MS = (Number(process.env.THUMBS_BUDGET_MIN) || 300) * 60000;
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(7, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('thumbs-raw', { recursive: true });
let failed = 0;
let stopped = 0;
for (let i = 0; i < JOBS.length; i++) {
  if (Date.now() - t0 > BUDGET_MS) { stopped = JOBS.length - i; console.log('⏱️ الميزانية انتهت — تبقّى ' + stopped + ' للتشغيلة القادمة'); break; }
  const j = JOBS[i];
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(j.prompt) +
    '?width=768&height=1024&model=flux&nologo=true&seed=' + j.seed;
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      const buf = Buffer.from(await r.arrayBuffer());
      const sig = buf.subarray(0, 4).toString('hex');
      const isImg = buf.length > 20000 && (sig.startsWith('ffd8') || sig === '89504e47' || buf.subarray(8, 12).toString() === 'WEBP');
      if (r.ok && isImg) {
        writeFileSync('thumbs-raw/' + j.kind + '-' + j.name + '.png', buf);
        console.log(el(), '✓ ' + j.kind + '/' + j.name + ' — ' + Math.round(buf.length / 1024) + 'KB');
        ok = true;
      } else {
        console.log(el(), '… ' + j.kind + '/' + j.name + ' محاولة ' + a + ' — HTTP ' + r.status + ' ' + buf.length + 'b');
        await sleep(8000 * a);
      }
    } catch (e) {
      console.log(el(), '… ' + j.kind + '/' + j.name + ' محاولة ' + a + ' — ' + (e && e.message));
      await sleep(8000 * a);
    }
  }
  if (!ok) failed++;
  await sleep(2500); // احترام حدّ الخدمة المجانية
}
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exitCode = failed === JOBS.length && JOBS.length ? 2 : 0; }
console.log('✓ ' + (JOBS.length - failed) + '/' + JOBS.length + ' صورة جاهزة');
