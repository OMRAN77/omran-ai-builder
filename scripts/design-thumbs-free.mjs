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

// v-decor-18 (المالك ١٦ أكتوبر: «تضيف لكلّ واحد ١٨… ويكونون فيهم صور على نفس الأشياء»): صورة لكلّ خيار من أقسام
// الديكور الخمسة — الغرفة نفسها (بذرة ثابتة لكلّ قسم) والمتغيّر وحده هو الخيار، أفقيّة 16:9 كصور الإضاءة.
//   node scripts/design-thumbs-free.mjs opts                 الأقسام الخمسة
//   node scripts/design-thumbs-free.mjs opts:fabric,wall     أقسام بعينها
const ROOM = 'Photorealistic 3D interior render of a bright cozy living room, eye-level wide shot,';
const OPTS = {
  furniture: { map: 'FURNITURE_PROMPTS', seed: 3101, scene: (d) => ROOM + ' white walls, light oak floor, a large window on the left, furnished with ' + d + ', a coffee table and a potted plant, the furniture is the clear focus.' },
  flooring: { map: 'FLOORING_PROMPTS', seed: 3202, scene: (d) => ROOM + ' slightly lower camera showing a large area of the floor, the floor is ' + d + ', white walls, a beige sofa, a large window on the left.' },
  fabric: { map: 'FABRIC_PROMPTS', seed: 3303, scene: (d) => ROOM + ' white walls, light oak floor, the sofa, armchair, cushions and curtains are all upholstered in ' + d.replace(' for sofas/cushions/curtains', '') + ', the fabric color is the clear focus.' },
  wall: { map: 'WALLCOLOR_PROMPTS', seed: 3404, scene: (d) => ROOM + ' all walls painted with ' + d + ', a white sofa, light oak floor, a large window on the left, the wall color is the clear focus.' },
  curtains: { map: 'CURTAIN_PROMPTS', seed: 3505, scene: (d) => ROOM + ' a large window on the back wall dressed with ' + d + ', a beige sofa in front, white walls, light oak floor, the window treatment is the clear focus.' },
};
const OPT_FILE = { furniture: 'furniture', flooring: 'flooring', fabric: 'fabric', wall: 'wallcolor', curtains: 'curtains' };
if (MODE === 'opts' || MODE.startsWith('opts:')) {
  const want = MODE === 'opts' ? Object.keys(OPTS) : MODE.slice(5).split(',').map((x) => x.trim()).filter((x) => OPTS[x]);
  for (const sec of want) {
    const o = OPTS[sec];
    const map = grab(o.map);
    Object.entries(map).forEach(([v, desc]) => {
      if (sec === 'curtains' && v === 'remove') desc = 'no curtains at all, a bare window';
      JOBS.push({ kind: 'dopts', name: OPT_FILE[sec] + '-' + v, seed: o.seed, wide: true,
        prompt: o.scene(desc) + ' Photorealistic, soft natural light, high detail, balanced composition. No people, no text, no watermark, no logo.' });
    });
  }
}

const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(7, ' ') + 'ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('thumbs-raw', { recursive: true });
let failed = 0;
for (let i = 0; i < JOBS.length; i++) {
  const j = JOBS[i];
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(j.prompt) +
    (j.wide ? '?width=1280&height=720' : '?width=768&height=1024') + '&model=flux&nologo=true&seed=' + j.seed;
  let ok = false;
  for (let a = 1; a <= 3 && !ok; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      const buf = Buffer.from(await r.arrayBuffer());
      // صورة حقيقية لا صفحة خطأ: نتحقق من الحجم وتوقيع jpeg/png/webp.
      const sig = buf.subarray(0, 4).toString('hex');
      const isImg = buf.length > 20000 && (sig.startsWith('ffd8') || sig === '89504e47' || buf.subarray(8, 12).toString() === 'WEBP');
      if (r.ok && isImg) {
        if (j.wide) {
          // v-decor-18: 960×540 WebP مباشرة (مقاس صور الإضاءة) — لا تمرّ بتصغير البطاقات العموديّة إلى ٣٦٠.
          const sharp = (await import('sharp')).default;
          mkdirSync('thumbs/dopts', { recursive: true });
          await sharp(buf).resize(960, 540, { fit: 'cover' }).webp({ quality: 82 }).toFile('thumbs/dopts/' + j.name + '.webp');
        } else writeFileSync('thumbs-raw/' + j.kind + '-' + j.name + '.png', buf);
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
