// scripts/design-thumbs-free.mjs — بطاقات الديكور بصور شبه حقيقية عبر مولّد
// مجاني (Flux) — لا يحتاج رصيد OpenAI أو Gemini. يعمل من بيئة الووركفلو
// (الشبكة مفتوحة هناك). الأوصاف نفسها من design-create لتطابق الإنتاج.
//
//   node scripts/design-thumbs-free.mjs [styles|places|all]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const MODE = process.argv[2] || 'all';

// نقرأ خرائط الأوصاف من الخادم نفسه — مصدر واحد للحقيقة.
const src = readFileSync('api/_lib/design-create.js', 'utf8');
const grab = (name) => new Function('return {' + src.match(new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};'))[1] + '}')();
const STYLE_PROMPTS = grab('STYLE_PROMPTS');
const PLACE_PROMPTS = grab('PLACE_PROMPTS');

const LOOK = ' Professional architectural photography, photorealistic, warm elegant lighting,' +
  ' balanced composition, high detail. No people, no text, no watermark, no logo.';

const JOBS = [];
if (MODE === 'styles' || MODE === 'all') {
  Object.entries(STYLE_PROMPTS).forEach(([v, desc], i) => JOBS.push({
    kind: 'dstyle', name: v, seed: v === 'minimalwhite' ? 777 : 100 + i,
    prompt: 'Photorealistic interior design photograph of a living room decorated in ' + desc + '.' + LOOK,
  }));
}
if (MODE === 'places' || MODE === 'all') {
  Object.entries(PLACE_PROMPTS).forEach(([v, desc], i) => JOBS.push({
    kind: 'dplace', name: v, seed: 500 + i,
    prompt: 'Photorealistic interior design photograph of ' + desc + ', tasteful modern decor.' + LOOK,
  }));
}

const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(7, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('thumbs-raw', { recursive: true });
let failed = 0;
for (let i = 0; i < JOBS.length; i++) {
  const j = JOBS[i];
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(j.prompt) +
    '?width=768&height=1024&model=flux&nologo=true&seed=' + j.seed;
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      const buf = Buffer.from(await r.arrayBuffer());
      // صورة حقيقية لا صفحة خطأ: نتحقق من الحجم وتوقيع jpeg/png/webp.
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
  await sleep(5000); // احترام حدّ الخدمة المجانية
}
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exitCode = failed === JOBS.length ? 2 : 0; }
console.log('✓ ' + (JOBS.length - failed) + '/' + JOBS.length + ' صورة جاهزة');
