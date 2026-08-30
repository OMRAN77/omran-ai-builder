// «طوابع المدرسة» — ورقة طوابع/ملصقات قابلة للطباعة والقص عبر OpenAI (gpt-image-2).
// v-strong-school-stamps: جودة عالية + دقة صورة مرجعية للطباعة.
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
    const requestedCount = Number.parseInt(b.count, 10);
    const stampCount = [1, 2, 4].includes(requestedCount) ? requestedCount : 4;

    // 🎨 v731: ثيمات متنوعة — كل توليد شكل مختلف؛ وإذا ذكر المستخدم ثيمًا التُزم به
    const THEMES = [
      { k: /فضاء|كواكب|نجوم|صاروخ|رائد/i, d: 'OUTER SPACE theme: rocket-shaped, planet-ring, star, crescent-moon, astronaut-helmet, UFO, comet, telescope, saturn, alien-face, meteor-badge and galaxy-swirl frames; deep navy, purple, teal and silver palette with tiny stars, rockets and planets doodles' },
      { k: /ديناصور|دايناصور/i, d: 'DINOSAUR theme: dino-egg, T-rex-head, footprint, volcano, palm-leaf, triceratops-badge, dino-spine-arch, cracked-egg, bone, cartoon-claw, jungle-leaf and roar-bubble frames; green, orange, brown and lime palette with tiny dino footprints and leaves doodles' },
      { k: /أميرة|اميرة|برنسيس|تاج|ملكة/i, d: 'PRINCESS theme: crown, castle, magic-mirror, diamond, tiara-arch, carriage, magic-wand-star, rose, butterfly, heart-locket, glass-slipper and ribbon-bow frames; pink, gold, lilac and rose palette with tiny crowns, sparkles and hearts doodles' },
      { k: /كرة|كوره|فوتبول|رياضة|رياضه|رياضي(?!ات)/i, d: 'SPORTS theme: soccer-ball, trophy, medal, jersey, whistle, goal-net-arch, champion-shield, star-burst, stopwatch, victory-ribbon, stadium-badge and flame frames; green, white, gold and red palette with tiny balls, trophies and stars doodles' },
      { k: /بحر|سمك|قرش|محيط|شاطئ/i, d: 'OCEAN theme: fish, shell, starfish, wave-circle, submarine-porthole, octopus, sailboat, anchor-badge, treasure-chest, bubble-cluster, dolphin-arch and lighthouse frames; aqua, coral, sandy-yellow and deep-blue palette with tiny bubbles, fish and shells doodles' },
      { k: /سيارات|سيارة|سباق|شاحن/i, d: 'RACE CARS theme: race-car, steering-wheel, traffic-light, checkered-flag-badge, tire, speedometer, road-sign, helmet, trophy-cup, turbo-star, finish-line-arch and license-plate frames; red, yellow, black-checker and blue palette with tiny cars and flags doodles' },
      { k: /يونيكورن|وحيد القرن|قوس قزح/i, d: 'UNICORN & RAINBOW theme: unicorn-head, rainbow-arch, cloud, shooting-star, ice-cream, candy, magic-horn-badge, heart-wings, lollipop, cupcake, sparkle-burst and moon-star frames; pastel rainbow palette with tiny rainbows, stars and clouds doodles' },
      { k: /حيوانات|غابة|أسد|اسد|قط|باندا/i, d: 'CUTE ANIMALS theme: panda-face, lion-mane, cat-ears, bear-hug, bunny-ears, fox-face, paw-print, koala, owl, elephant, penguin-badge and monkey-swing frames; warm orange, brown, cream and green palette with tiny paws and leaves doodles' },
      { k: /ورد|زهور|زهر|فراش/i, d: 'FLOWERS & GARDEN theme: sunflower, daisy, tulip-arch, butterfly, ladybug-badge, leaf-wreath, watering-can, bee, mushroom-house, petal-circle, vine-frame and rainbow-flower frames; spring pastel palette with tiny petals, bees and butterflies doodles' },
      { k: /تراث|صقر|سعف|إمارات|امارات|دلة|نخل/i, d: 'UAE HERITAGE theme: falcon-badge, dhow-boat, palm-tree, dallah-coffee-pot, sadu-pattern-frame, fort-tower, camel, crescent-badge, lantern, date-cluster, geometric-arch and majlis-cushion frames; sand, maroon, gold and palm-green palette with tiny falcons and sadu patterns doodles' },
      { k: /روبوت/i, d: 'ROBOTS theme: robot-head, gear, circuit-board-frame, antenna-badge, lightning-bolt, battery, computer-screen, wrench-cross, rocket-bot, LED-ring, joystick and spring-arm frames; steel-blue, orange, lime and grey palette with tiny gears and bolts doodles' },
      { k: /حلوى|حلويات|كيك|دونات|آيس كريم|ايس كريم/i, d: 'SWEETS theme: donut, cupcake, ice-cream-cone, wrapped-candy, lollipop, chocolate-bar, macaron, gingerbread-man, milkshake-cup, jelly-bean-arch, birthday-cake and waffle frames; pink, mint, chocolate and cream palette with tiny sprinkles and candies doodles' },
      { k: /فراشة|فراشات|طيور|عصفور/i, d: 'BUTTERFLIES & BIRDS theme: butterfly-wings, bird-nest, feather, hummingbird-badge, flower-branch-arch, dragonfly, birdcage, winged-heart, caterpillar, rainbow-feather, leaf-oval and sky-cloud frames; sky-blue, lavender, peach and mint palette with tiny butterflies and feathers doodles' },
      { k: /كرومي/i, d: 'CHROMIE CARTOON theme: goggle-eyed colorful blob pals, rainbow round-creature badges, wiggly-outline frame, fizzy-bubble, zigzag-arch, star-pop, confetti-circle, swirl-warp, happy-eye-oval, bouncy speech-bubble and squiggle-heart frames; electric rainbow palette — hot pink, lime green, electric blue, sunny yellow, orange — with tiny googly eyes and squiggles doodles' },
      { k: /ماي ملدي|ميلودي/i, d: 'MY MELODY SANRIO theme: My Melody bunny-hood silhouette, pink-bow-circle, Kuromi skull-bow badge, cherry-blossom-arch, polka-dot oval, strawberry, ribbon-heart, mushroom-cap, puffy-cloud, flower-wreath, dreamy-moon-arch and lace-border frames; soft pink, lavender, cream and cherry-red palette with tiny bows, cherries and mushrooms doodles' },
      { k: /هالو كاتي|هيلو كيتي|هيلو كاتي|كيتي/i, d: 'HELLO KITTY SANRIO theme: Hello Kitty face outline (no-mouth, red bow, whiskers), bow-arch, red-apple, heart-locket, polka-dot circle, strawberry-badge, piano-key-border, cupcake, rainbow-ribbon, shooting-star, cloud-castle and gift-box frames; signature red, white, cream and pastel-pink palette with tiny bows, apples and stars doodles' },
      { k: /الدبب|دببة ثلاث|دبب 3|الدببة الثلاثة/i, d: 'WE BARE BEARS theme: grizzly-bear-head, panda-face, ice-bear-silhouette, three-bears-stack-arch, pawprint-badge, pizza-slice, rainbow-stripe, phone-screen-frame, bear-stack-medal, ice-cream-cone, fish-badge and cityscape-arch frames; warm brown, black-and-white and pale-blue palette with tiny paws, phones and pizza slices doodles' },
      { k: /كلاسيكي|مدرسي/i, d: 'CLASSIC SCHOOL theme: circle, heart, star, cloud, hexagon, flower, shield-badge, rounded-square, oval, ribbon-rosette, pencil-shaped and open-book frames; cheerful pastel palette (soft blue, mint, peach, lilac, sunny yellow) with tiny stars, pencils and books doodles' },
      // 🧑 v735 (طلب عمران): ثيمات للشباب +12 — أسلوب «كول» ناضج، ممنوع الطفولي.
      { k: /قيمنق|قيمنج|جيمنج|جيمر|بلايستيشن|اكس\s*بوكس|إكس\s*بوكس|فورتنايت|ألعاب\s*فيديو|العاب\s*فيديو|gaming|gamer|esport/i, teen: true, d: 'ESPORTS GAMING theme: game-controller, neon-hexagon, gaming-headset-badge, pixel-heart, level-up-arrow, victory-trophy, lightning-bolt, keyboard-key, joystick-shield, power-button-ring, XP-star and arcade-screen frames; dark navy, neon purple, electric cyan and lime palette with tiny pixels, controllers and lightning doodles' },
      { k: /أنمي|انمي|مانجا|anime|manga/i, teen: true, d: 'ANIME MANGA theme: manga-panel frame, speed-lines-burst, katana-cross-badge, cherry-blossom-storm circle, shonen-power-aura ring, headband-banner, ramen-bowl, torii-gate-arch, lightning-scar emblem, scroll-frame, spiky-hair-silhouette badge and rising-sun-rays frames; ink black, crimson, white and gold palette with tiny sakura petals and action stars doodles' },
      { k: /ستريت|سكيت|قرافيتي|جرافيتي|سنيكرز|street|skate|graffiti/i, teen: true, d: 'URBAN STREET theme: skateboard, graffiti-splash-tag, sneaker-badge, boombox, snapback-cap, spray-can, lightning-sticker, cassette-tape, headphones-ring, star-burst-patch, ticket-stub and vinyl-record frames; matte black, white, electric orange and teal palette with tiny paint drips and stars doodles' },
      { k: /مغامر|طعوس|تخييم|قنص|رحلات|دباب|أوف\s*رود|اوف\s*رود|offroad|adventure|camp/i, teen: true, d: 'DESERT ADVENTURE theme: 4x4-offroad-truck, dune-buggy, mountain-peak-badge, compass-ring, camping-tent, campfire, binoculars, quad-bike, rope-knot-frame, canteen-flask, folded-map and eagle-wings-badge frames; sand, khaki, burnt-orange and deep-green palette with tiny tire tracks and desert stars doodles' },
      { k: /أساطير|اساطير|ذئب|تنين|نمر\b|شعار|دروع|legend|dragon|wolf/i, teen: true, d: 'LEGENDARY EMBLEMS theme: wolf-head-crest, dragon-wing-arch, tiger-stripe-hexagon, phoenix-flame-badge, knight-shield, crossed-swords-ring, lion-crest, thunder-rune, dragon-scale-frame, claw-mark-slash, crescent-mountain emblem and royal-laurel ring frames; charcoal, steel-blue, crimson and antique-gold palette with tiny flames and rune marks doodles' },
      // 🌸 v735: ميزة البنات — ثيمات راقية ناعمة.
      { k: /بناتي|استاتيك|اسثتيك|إستاتيك|جورنال|راقي|ناعم|aesthetic|journal/i, girlx: true, d: 'SOFT AESTHETIC theme: satin-ribbon-bow arch, pearl-heart, iced-coffee-cup, journal-page frame, pressed-wildflower sprig, crescent-moon-and-stars, lace-edged oval, butterfly-hairpin badge, fluffy-cloud frame, vintage-postage-stamp edge, wax-seal medallion and sparkle-ring frames; cream, blush pink, sage green and soft gold palette with tiny hearts, stars and petals doodles' },
      { k: /فاشن|موضة|موضه|ميك\s*اب|ميكب|مكياج|جلام|fashion|glam|makeup/i, girlx: true, d: 'GIRLY GLAM theme: quilted-handbag badge, oversized-bow frame, perfume-bottle, heart-sunglasses, vanity-mirror oval, nail-polish-bottle, pearl-necklace ring, shopping-bag, lipstick-kiss-mark badge, gemstone-hexagon, high-heel silhouette and boutique-window arch frames; rose pink, ivory, lilac and gold palette with tiny sparkles, bows and pearls doodles' },
    ];
    let theme = null;
    for (const t of THEMES) { if (t.k && t.k.test(hint)) { theme = t; break; } }
    if (!theme) {
      // «فاجئني»: العشوائي يحترم العمر والجنس إن ذُكرا — وإلا يبقى على ثيمات الصغار.
      const teenHint = /مراهق|شباب|ثانوي|إعدادي|اعدادي|متوسط|كبير|(?:1[2-9]|٢٠|20)\s*(?:سنه|سنة|عام)|teen/i.test(hint);
      const girlHint = /بنت|بنات|بنيه|بنية|girl/i.test(hint);
      let pool;
      if (teenHint && girlHint) pool = THEMES.filter((t) => t.girlx);
      else if (teenHint) pool = THEMES.filter((t) => t.teen);
      else if (girlHint) pool = THEMES.filter((t) => t.girlx || /أميرة|يونيكورن|ورد|فراشة|فراش|ميلودي|كيتي|حلوى/.test(String(t.k)));
      else pool = THEMES.filter((t) => !t.teen && !t.girlx);
      if (!pool.length) pool = THEMES;
      theme = pool[Math.floor(Math.random() * pool.length)];
    }
    // تخطيط مناسب للعدد المختار: طابع واحد كبير، أو طابعان، أو أربعة.
    const LAYOUTS = stampCount === 1
      ? ['one large centered sticker with generous whitespace around it']
      : stampCount === 2
        ? ['two large stickers side by side with generous whitespace', 'two large stickers stacked vertically with generous whitespace']
        : ['a tidy 2x2 grid of 4 medium-large stickers with generous white gaps', 'four balanced stickers in a clean 2x2 printable grid'];
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

    const audience = theme.teen
      ? 'A printable sticker/stamp sheet for a TEENAGER (age 12+), vertical portrait page on a clean WHITE background, designed for home printing and scissor cutting. Art direction: bold modern cool style — absolutely NO babyish or childish elements.\n'
      : theme.girlx
        ? 'A printable sticker/stamp sheet for a girl, vertical portrait page on a clean WHITE background, designed for home printing and scissor cutting. Art direction: elegant dreamy girly aesthetic, soft and sophisticated.\n'
        : 'A printable sticker/stamp sheet for a school kid, vertical portrait page on a clean WHITE background, designed for home printing and scissor cutting.\n';
    let p = audience
      + 'The provided image is the child\'s REAL photo. IDENTITY LOCK — the face must stay EXACTLY as photographed in every sticker: same eyes, nose, mouth, skin tone, hair, age and expression. Do NOT beautify, retouch, slim, age, gender-swap, redraw, cartoonize or replace the face. Do NOT merge faces or invent a second child. Use the original photo as the only person reference and crop it cleanly into each frame.\n'
      + 'Layout: ' + layout + ', evenly spaced with generous white gaps and a thin light-grey dashed cut line around every sticker. Premium print-ready composition: crisp edges, strong contrast, balanced margins, clear separation between all stickers, no cropped sticker, no visual clutter.\n'
      + 'Every sticker features the child\'s photo inside a DIFFERENT frame — all ' + stampCount + ' frames must be visibly different from each other, with bold polished school-reward badge design and consistent visual quality. ' + theme.d + '. Doodles never cover the face or touch the eyes, nose or mouth.\n'
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
      quality: b.quality === 'fast' ? 'medium' : 'high',
      input_fidelity: 'high',
      n: 1,
      output_format: 'png',
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
    res.status(200).end(JSON.stringify({ imageBase64: out.b64_json, mimeType: 'image/png', stampCount, dailyLimit: DAILY }));
  } catch (e) {
    const msg = e && e.name === 'TimeoutError' ? 'استغرق التوليد وقتًا أطول من المسموح. جرّب مرّة أخرى.' : (e && e.message ? e.message : String(e));
    res.status(500).end(JSON.stringify({ error: 'proxy', message_ar: msg }));
  }
};
