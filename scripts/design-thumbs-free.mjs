// scripts/design-thumbs-free.mjs — بطاقات الديكور بصور شبه حقيقية عبر مولّد
// مجاني (Flux) — لا يحتاج رصيد OpenAI أو Gemini. يعمل من بيئة الووركفلو
// (الشبكة مفتوحة هناك). الأوصاف نفسها من design-create لتطابق الإنتاج.
//
//   node scripts/design-thumbs-free.mjs [styles|places|all]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

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
// v-decor-18b: الموديل المجّانيّ يضعف أمام الوصف الطويل — المتغيّر (اللون/الأرضيّة/الستارة) أوّل الجملة ومكرّر بصيغة صريحة،
// وبقيّة الغرفة ثابتة. وصورة موجودة في assets/design/decor-opts لا تُعاد (تشغيل يكمل ما نقص لا يكرّر ما نجح).
const ROOM = 'cozy modern living room interior, eye-level wide shot, photorealistic 3D render, soft natural daylight from a window on the left, potted plant, round wooden coffee table, high detail, sharp focus.';
// v-decor-18c (مراجعة الصور الأولى بالعين): أوصاف الخادم العامّة («modern furniture pieces») أخرجت الكنبة الرماديّة نفسها لأغلب
// أنماط الأثاث، والأرضيّة في لقطة الغرفة لا يُرى نقشها. للبطاقة وحدها (لا لأمر التوليد): وصف مرئيّ محدّد لكلّ نمط أثاث،
// والأرضيّة لقطة قريبة يملأ نقشها الإطار (كصور الأرضيّات التي اعتمدها المالك)، وألوان الحوائط الضعيفة بصيغة أصرح وبذرة أخرى.
const THUMB = {
  furniture: {
    modern: 'a sleek modern sofa with clean straight lines and slim black metal legs, a glass coffee table',
    classic: 'a classic carved-wood sofa with tufted cream upholstery and two ornate wooden armchairs',
    simple: 'a simple low plain sofa and a plain wooden coffee table, almost no decor',
    luxury: 'a luxurious velvet sofa with gold metal details, a marble coffee table and a crystal table lamp',
    bohemian: 'a bohemian lounge with a rattan armchair, many colorful patterned cushions, layered kilim rugs, macrame wall hanging and plants',
    scandinavian: 'a Scandinavian light-grey sofa on light oak legs, a chunky wool throw, white and light wood everywhere',
    japandi: 'a low Japandi sofa on a natural wood platform, linen cushions, a paper lantern, very calm and minimal',
    industrial: 'an industrial set: black leather sofa, black metal and reclaimed wood coffee table, exposed red brick wall',
    midcentury: 'a mid-century modern walnut sofa with tapered legs, a mustard yellow armchair and teal accents',
    artdeco: 'an Art Deco curved emerald velvet sofa with brass and gold geometric side tables',
    rattan: 'woven natural rattan furniture: a rattan sofa frame, two round rattan armchairs and a rattan coffee table, the woven texture clearly visible',
    velvet: 'a plush rounded dusty-pink velvet sofa and a matching velvet armchair',
    leather: 'a rich brown leather Chesterfield tufted sofa with a leather armchair',
    majlis: 'traditional Arabic majlis floor seating: low cushions along the walls with back bolsters in patterned red and gold fabric, a low brass tray table',
    modular: 'a large grey modular L-shaped sectional sofa with deep seats',
    curved: 'a strongly curved semicircular crescent-shaped cream boucle sofa (a half-moon shape) and a round organic coffee table',
    rustic: 'rustic farmhouse furniture made of chunky rough reclaimed wood: a heavy wooden-frame sofa, a thick log slab coffee table, wooden beams on the ceiling',
  },
  wall: { forest: 'dark forest green (deep green paint covering every wall)', mocha: 'dark mocha chocolate brown', terracotta: 'bold terracotta orange clay', olive: 'olive green (khaki green, clearly green)' },
  // v-decor-18d (الجولة الثانية بالعين): الستائر تخرج شيفونًا أبيض لأغلب الأنواع — اللون والشكل مصرّح بهما.
  curtains: {
    velvet: 'heavy deep-burgundy velvet floor-length drapes with rich folds',
    blackout: 'thick dark navy blackout curtains fully closed and covering the whole window, no daylight, the room is dark and moody',
    embroidered: 'cream curtains with wide gold Arabic embroidered borders and gold tassels',
    luxury: 'luxurious heavy gold and cream damask drapes with swags and tasselled tiebacks',
    pelmet: 'grey drapes under a large upholstered pelmet box valance spanning the top of the window',
    double: 'two curtain layers: a white sheer curtain behind and heavy charcoal drapes tied back in front',
    wave: 'light grey curtains hanging in perfectly even S-shaped wave folds from a ceiling track',
    motorized: 'modern charcoal curtains on a sleek ceiling track with a small motor box, half open',
    vertical: 'vertical slatted fabric blinds covering the whole window, clearly vertical stripes',
  },
};
// أرضيّات النقش: الموديل يضع النقش على الطاولة — هذه تُصوَّر من أعلى بلا أثاث، والنقش يملأ الصورة.
const FLOOR_TOPDOWN = {
  checker: 'classic black and white checkerboard marble floor tiles',
  herringbone: 'golden oak parquet laid in a herringbone (V-shaped zig-zag) pattern of many small rectangular planks',
  hexagon: 'hexagonal honeycomb-shaped floor tiles, each tile a six-sided hexagon outlined by dark grout lines',
  moroccan: 'colorful blue and white patterned Moroccan cement floor tiles',
};
const SEED_ALT = { 'curtains-blackout': 3515, 'flooring-herringbone': 3212, 'flooring-hexagon': 3212, 'wall-forest': 3434, 'wall-mocha': 3414, 'wall-terracotta': 3414, 'wall-olive': 3424, 'furniture-curved': 3111, 'furniture-rattan': 3111, 'furniture-rustic': 3111 };
const OPTS = {
  furniture: { map: 'FURNITURE_PROMPTS', seed: 3101, scene: (d) => 'Interior design photo of a living room featuring ' + d + '. The furniture is large in the frame and is the clear focus. Plain light walls, light oak floor, ' + ROOM },
  flooring: { map: 'FLOORING_PROMPTS', seed: 3202, scene: (d) => 'Close-up interior photo looking down at the floor: ' + d + ' fills most of the image, its texture and pattern clearly visible, only the edge of a sofa and a coffee table leg at the top of the frame, soft daylight, photorealistic, high detail, sharp focus.' },
  fabric: { map: 'FABRIC_PROMPTS', seed: 3303, scene: (d) => { const c = d.replace(/ (velvet )?fabrics for sofas\/cushions\/curtains/, ''); return 'Interior design photo of a ' + c + ' sofa with matching ' + c + ' armchair, cushions and curtains — the upholstery is clearly ' + c + '. White walls, light oak floor, ' + ROOM; } },
  wall: { map: 'WALLCOLOR_PROMPTS', seed: 3404, scene: (d) => { const c = d.replace(/ wall paint$/, '').replace(/^a bold accent wall color$/, 'bold deep teal accent'); return 'Interior design photo of a room whose walls are painted solid ' + c + ' — every wall is clearly ' + c + '. White sofa, light oak floor, ' + ROOM; } },
  curtains: { map: 'CURTAIN_PROMPTS', seed: 3505, scene: (d) => 'Interior design photo of a large window on the back wall dressed with ' + d + '. The window treatment is the clear focus. Beige sofa in front, white walls, light oak floor, ' + ROOM },
};
const OPT_FILE = { furniture: 'furniture', flooring: 'flooring', fabric: 'fabric', wall: 'wallcolor', curtains: 'curtains' };
if (MODE === 'opts' || MODE.startsWith('opts:')) {
  const want = MODE === 'opts' ? Object.keys(OPTS) : MODE.slice(5).split(',').map((x) => x.trim()).filter((x) => OPTS[x]);
  for (const sec of want) {
    const o = OPTS[sec];
    const map = grab(o.map);
    Object.entries(map).forEach(([v, desc]) => {
      const name = OPT_FILE[sec] + '-' + v;
      if (existsSync('assets/design/decor-opts/' + name + '.webp')) return;
      if (sec === 'curtains' && v === 'remove') desc = 'no curtains at all, a bare uncovered window';
      if (THUMB[sec] && THUMB[sec][v]) desc = sec === 'wall' ? THUMB[sec][v] + ' wall paint' : THUMB[sec][v];
      const scene = (sec === 'flooring' && FLOOR_TOPDOWN[v])
        ? 'Top-down photo looking straight down at a floor of ' + FLOOR_TOPDOWN[v] + '. The floor pattern fills the entire image edge to edge, no furniture, no objects, soft daylight, photorealistic, sharp focus.'
        : o.scene(desc);
      JOBS.push({ kind: 'dopts', name, seed: SEED_ALT[sec + '-' + v] || o.seed, wide: true, prompt: scene + ' No people, no text, no watermark, no logo.' });
    });
  }
  console.log('dopts: ' + JOBS.length + ' صورة ناقصة');
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
  for (let a = 1; a <= (j.wide ? 6 : 3) && !ok; a++) {
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
          // علامة المولّد المجّانيّ في الركن الأيمن السفليّ: نقصّ ١٦:٩ من الأعلى يسارًا يتركها خارجًا (٩٣٪ من الصورة).
          const meta = await sharp(buf).metadata();
          const cw = Math.round(meta.width * 0.93), ch = Math.round(cw * 9 / 16);
          await sharp(buf).extract({ left: 0, top: 0, width: cw, height: Math.min(ch, meta.height) }).resize(960, 540, { fit: 'cover' }).webp({ quality: 84 }).toFile('thumbs/dopts/' + j.name + '.webp');
        } else writeFileSync('thumbs-raw/' + j.kind + '-' + j.name + '.png', buf);
        console.log(el(), '✓ ' + j.kind + '/' + j.name + ' — ' + Math.round(buf.length / 1024) + 'KB');
        ok = true;
      } else {
        console.log(el(), '… ' + j.kind + '/' + j.name + ' محاولة ' + a + ' — HTTP ' + r.status + ' ' + buf.length + 'b');
        // 402/429 من المولّد المجّانيّ = طلب قبل انقضاء مهلته بعد السابق — ننتظر أطول بدل الاستسلام بعد ٢٥ ثانية.
        await sleep((r.status === 402 || r.status === 429 ? 20000 : 8000) * a);
      }
    } catch (e) {
      console.log(el(), '… ' + j.kind + '/' + j.name + ' محاولة ' + a + ' — ' + (e && e.message));
      await sleep(8000 * a);
    }
  }
  if (!ok) failed++;
  await sleep(j.wide ? 15000 : 5000); // احترام حدّ الخدمة المجانية — الأفقيّ يحتاج مهلة أطول بين الطلبات (402)
}
if (failed) { console.log('✗ ' + failed + ' من ' + JOBS.length + ' فشلت'); process.exitCode = failed === JOBS.length ? 2 : 0; }
console.log('✓ ' + (JOBS.length - failed) + '/' + JOBS.length + ' صورة جاهزة');
