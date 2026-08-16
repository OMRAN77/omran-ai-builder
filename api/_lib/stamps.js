// «طوابع المدرسة» — ورقة طوابع/ملصقات قابلة للطباعة والقص عبر OpenAI (gpt-image-2).
// يأخذ صورة الطفل + اسمه ويعيد ورقة كاملة فيها طوابع صغيرة كثيرة بأشكال جميلة.
// نفس حرّاس adimage.js: هويّة مُتحقَّقة ثم سقف يومي، وsignal خاص يتخطى حارس الـ٣٠ ثانية.
const { checkAndConsumeCustom } = require('./_usage.js');
const { verifyPointsToken } = require('./points.js');

const DAILY = 8;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).end('{"error":"POST only"}'); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b);
    b = b || {};

    const username = verifyPointsToken(typeof b.token === 'string' ? b.token : '');
    if (!username) {
      res.status(401).end(JSON.stringify({ error: 'auth', message_ar: 'سجّل الدخول أوّلًا لتوليد الطوابع.' }));
      return;
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) { res.status(500).end(JSON.stringify({ error: 'no key' })); return; }

    const cut = (x, n) => String(x == null ? '' : x).slice(0, n).replace(/["\n\r]/g, ' ').trim();
    const name = cut(b.name, 30);
    const school = cut(b.school, 40);
    const subject = cut(b.subject, 30);
    const hint = String(b.hint || '').slice(0, 300);

    // 🎨 v731: ثيمات متنوعة — كل توليد شكل مختلف؛ وإذا ذكر المستخدم ثيمًا التُزم به
    const THEMES = [
      { k: /فضاء|كواكب|نجوم|صاروخ|رائد/i, d: 'OUTER SPACE theme: rocket-shaped, planet-ring, star, crescent-moon, astronaut-helmet, UFO, comet, telescope, saturn, alien-face, meteor-badge and galaxy-swirl frames; deep navy, purple, teal and silver palette with tiny stars, rockets and planets doodles' },
      { k: /ديناصور|دايناصور/i, d: 'DINOSAUR theme: dino-egg, T-rex-head, footprint, volcano, palm-leaf, triceratops-badge, dino-spine-arch, cracked-egg, bone, cartoon-claw, jungle-leaf and roar-bubble frames; green, orange, brown and lime palette with tiny dino footprints and leaves doodles' },
      { k: /أميرة|اميرة|برنسيس|تاج|ملكة/i, d: 'PRINCESS theme: crown, castle, magic-mirror, diamond, tiara-arch, carriage, magic-wand-star, rose, butterfly, heart-locket, glass-slipper and ribbon-bow frames; pink, gold, lilac and rose palette with tiny crowns, sparkles and hearts doodles' },
      { k: /كرة|كوره|فوتبول|رياض/i, d: 'SPORTS theme: soccer-ball, trophy, medal, jersey, whistle, goal-net-arch, champion-shield, star-burst, stopwatch, victory-ribbon, stadium-badge and flame frames; green, white, gold and red palette with tiny balls, trophies and stars doodles' },
      { k: /بحر|سمك|قرش|محيط|شاطئ/i, d: 'OCEAN theme: fish, shell, starfish, wave-circle, submarine-porthole, octopus, sailboat, anchor-badge, treasure-chest, bubble-cluster, dolphin-arch and lighthouse frames; aqua, coral, sandy-yellow and deep-blue palette with tiny bubbles, fish and shells doodles' },
      { k: /سيارات|سيارة|سباق|شاحن/i, d: 'RACE CARS theme: race-car, steering-wheel, traffic-light, checkered-flag-badge, tire, speedometer, road-sign, helmet, trophy-cup, turbo-star, finish-line-arch and license-plate frames; red, yellow, black-checker and blue palette with tiny cars and flags doodles' },
      { k: /يونيكورن|وحيد القرن|قوس قزح/i, d: 'UNICORN & RAINBOW theme: unicorn-head, rainbow-arch, cloud, shooting-star, ice-cream, candy, magic-horn-badge, heart-wings, lollipop, cupcake, sparkle-burst and moon-star frames; pastel rainbow palette with tiny rainbows, stars and clouds doodles' },
      { k: /حيوانات|غابة|أسد|اسد|قط|باندا/i, d: 'CUTE ANIMALS theme: panda-face, lion-mane, cat-ears, bear-hug, bunny-ears, fox-face, paw-print, koala, owl, elephant, penguin-badge and monkey-swing frames; warm orange, brown, cream and green palette with tiny paws and leaves doodles' },
      { k: /ورد|زهور|زهر|فراش/i, d: 'FLOWERS & GARDEN theme: sunflower, daisy, tulip-arch, butterfly, ladybug-badge, leaf-wreath, watering-can, bee, mushroom-house, petal-circle, vine-frame and rainbow-flower frames; spring pastel palette with tiny petals, bees and butterflies doodles' },
      { k: /تراث|صقر|سعف|إمارات|امارات|دلة|نخل/i, d: 'UAE HERITAGE theme: falcon-badge, dhow-boat, palm-tree, dallah-coffee-pot, sadu-pattern-frame, fort-tower, camel, crescent-badge, lantern, date-cluster, geometric-arch and majlis-cushion frames; sand, maroon, gold and palm-green palette with tiny falcons and sadu patterns doodles' },
      { k: /روبوت/i, d: 'ROBOTS theme: robot-head, gear, circuit-board-frame, antenna-badge, lightning-bolt, battery, computer-screen, wrench-cross, rocket-bot, LED-ring, joystick and spring-arm frames; steel-blue, orange, lime and grey palette with tiny gears and bolts doodles' },
      { k: /حلوى|حلويات|كيك|دونات|آيس كريم|ايس كريم/i, d: 'SWEETS theme: donut, cupcake, ice-cream-cone, wrapped-candy, lollipop, chocolate-bar, macaron, gingerbread-man, milkshake-cup, jelly-bean-arch, birthday-cake and waffle frames; pink, mint, chocolate and cream palette with tiny sprinkles and candies doodles' },
      { k: /فراشة|فراشات|طيور|عصفور/i, d: 'BUTTERFLIES & BIRDS theme: butterfly-wings, bird-nest, feather, hummingbird-badge, flower-branch-arch, dragonfly, birdcage, winged-heart, caterpillar, rainbow-feather, leaf-oval and sky-cloud frames; sky-blue, lavender, peach and mint palette with tiny butterflies and feathers doodles' },
      { k: /كلاسيكي|مدرسي/i, d: 'CLASSIC SCHOOL theme: circle, heart, star, cloud, hexagon, flower, shield-badge, rounded-square, oval, ribbon-rosette, pencil-shaped and open-book frames; cheerful pastel palette (soft blue, mint, peach, lilac, sunny yellow) with tiny stars, pencils and books doodles' },
    ];
    let theme = null;
    for (const t of THEMES) { if (t.k && t.k.test(hint)) { theme = t; break; } }
    if (!theme) theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    // تنويع إضافي: تخطيطات مختلفة كل مرة
    const LAYOUTS = ['a tidy grid of 12 small stickers (4 rows x 3 columns)', 'a tidy grid of 12 small stickers (3 rows x 4 columns, landscape-ish cells)', 'a playful staggered arrangement of 12 small stickers (rows slightly offset like a honeycomb)'];
    const layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
    const hasImg = typeof b.imageBase64 === 'string' && b.imageBase64.length > 100;
    if (!hasImg) {
      res.status(400).end(JSON.stringify({ error: 'no image', message_ar: 'أرفق صورة الطفل أولاً عشان أسوي الطوابع.' }));
      return;
    }

    // الخصم من الحد اليومي بعد اكتمال كل التحققات — طلب ناقص ما يحرق محاولة
    const gate = await checkAndConsumeCustom(b.token, null, null, 'adimage', DAILY);
    if (!gate.allowed) {
      res.status(429).end(JSON.stringify({ error: 'limit', message_ar: 'بلغتَ حدّ اليوم (' + DAILY + ' صور). جرّب غدًا.' }));
      return;
    }

    let p = 'A printable sticker/stamp sheet for a school kid, vertical portrait page on a clean WHITE background, designed for home printing and scissor cutting.\n'
      + 'The provided image is the child\'s REAL photo. STRICT RULE: the face must stay EXACTLY as photographed — same face, same features, same skin tone, same hair. Do NOT beautify, restyle, cartoonize or replace the face. You may neatly crop it into each sticker frame.\n'
      + 'Layout: ' + layout + ', evenly spaced with generous white gaps and a thin light-grey dashed cut line around every sticker.\n'
      + 'Every sticker features the child\'s photo inside a DIFFERENT frame — all 12 frames must be visibly different from each other. ' + theme.d + '. Doodles never cover the face.\n'
      + (function(){
        var lines = [];
        if (name) lines.push('the name "' + name + '" in clear bold lettering');
        if (school) lines.push('below it, in smaller lettering, the school name "' + school + '"');
        if (subject) lines.push('and the subject "' + subject + '"');
        if (!lines.length) return 'Do NOT write any name or any text inside the stickers — photo and frame only.\n';
        return 'Under the photo inside EVERY sticker: a small neat label showing ' + lines.join(', ') + '. CRITICAL TEXT ACCURACY: reproduce every word letter-for-letter EXACTLY as written in Arabic-friendly lettering — never misspell, never invent or add extra words. Keep the label compact so it fits neatly inside the sticker.\n';
      })()
      + 'No other text anywhere, no watermark, no logo, no invented letters. Clean, bright, printable, joyful school-stickers style.';

    const body = {
      model: 'gpt-image-2',
      prompt: p,
      size: '1024x1536',
      quality: 'medium',
      n: 1,
      output_format: 'webp',
      output_compression: 82,
    };
    const form = new FormData();
    for (const k of Object.keys(body)) form.append(k, String(body[k]));
    const mime = /^image\/(png|jpeg|webp)$/.test(String(b.mimeType || '')) ? b.mimeType : 'image/jpeg';
    form.append('image[]', new Blob([Buffer.from(b.imageBase64, 'base64')], { type: mime }), 'photo.' + mime.split('/')[1]);

    const init = { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form };
    init.signal = AbortSignal.timeout(240000);
    const upstream = await fetch('https://api.openai.com/v1/images/edits', init);

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const m = (data && data.error && data.error.message) || ('HTTP ' + upstream.status);
      res.status(upstream.status).end(JSON.stringify({ error: 'upstream', message_ar: 'تعذّر توليد الطوابع: ' + m }));
      return;
    }
    const out = ((data && data.data) || [])[0];
    if (!out || !out.b64_json) {
      res.status(502).end(JSON.stringify({ error: 'empty', message_ar: 'لم يرجع النموذج صورة. جرّب مرّة أخرى.' }));
      return;
    }
    res.status(200).end(JSON.stringify({ imageBase64: out.b64_json, mimeType: 'image/webp', dailyLimit: DAILY }));
  } catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'استغرق التوليد وقتًا أطول من المسموح. جرّب مرّة أخرى.' : (e && e.message ? e.message : String(e));
    res.status(500).end(JSON.stringify({ error: 'proxy', message_ar: msg }));
  }
};
