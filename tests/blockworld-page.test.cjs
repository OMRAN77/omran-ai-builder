// tests/blockworld-page.test.cjs — v-blockworld: لعبة «عالم المكعبات» صفحة مستقلّة تحت ‎/blockworld/‎.
//
// المجلّد يُنشر كما هو بلا بناء، فما يكسره يُرى من الملفّات نفسها: مسار يبدأ من جذر الموقع (يعمل محلّيًّا على الجذر
// وينكسر تحت ‎/blockworld/‎)، استيراد أو خطّ أو أيقونة تشير إلى ملفّ غير موجود، أو رابط من التطبيق إلى صفحة طلبها
// المالك شخصيّة. اللعب نفسه (مشي، حفر، بناء، لمس) يُفحص في المتصفّح بـ‎blockworld/tools/playtest.cjs‎.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const G = path.join(ROOT, 'blockworld');
const WORLDS = ['kawkab', 'waha', 'dhalam'];
const read = (rel) => fs.readFileSync(path.join(G, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(G, rel)) && fs.statSync(path.join(G, rel)).isFile();

function walk(dir, out = []) {
  for (const n of fs.readdirSync(path.join(G, dir))) {
    const rel = dir ? dir + '/' + n : n;
    if (fs.statSync(path.join(G, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
// ملفّات اللعبة نفسها: لا المكتبة المنقولة ولا أدوات التحقّق.
const OWN = walk('').filter((f) => !f.startsWith('vendor/') && !f.startsWith('tools/'));
const OWN_TEXT = OWN.filter((f) => /\.(js|css|html|webmanifest)$/.test(f));

test('الصفحة وعوالمها الثلاثة موجودة', () => {
  for (const f of ['index.html', 'manifest.webmanifest', 'shared/play.js', 'shared/voxel.js', 'vendor/three.module.js', 'vendor/three.core.js']) assert.ok(exists(f), f);
  for (const k of WORLDS) for (const f of ['index.html', 'main.js', 'world.js']) assert.ok(exists(`styles/${k}/${f}`), `styles/${k}/${f}`);
  const ready = /const READY = (\[[^\]]*\]);/.exec(read('index.html'));
  assert.ok(ready, 'قائمة العوالم في صفحة الاختيار');
  assert.deepEqual(JSON.parse(ready[1].replace(/'/g, '"')).sort(), [...WORLDS].sort());
});

test('لا مسار يبدأ من جذر الموقع: المجلّد يعمل تحت أيّ مسار', () => {
  const bad = [];
  for (const f of OWN_TEXT) {
    const text = read(f);
    for (const m of text.matchAll(/(['"(=]\s*)\/(shared|vendor|styles|previews|icons|blockworld|js|css|api)\//g)) {
      // استثناء واحد مقصود (v-blockworld-net): وسيط تعارف اللعب الجماعيّ من خادم الموقع نفسه، ومكانه جذر الموقع لا المجلّد
      if (f === 'shared/net.js' && text.slice(m.index + m[1].length).startsWith('/api/system?action=play-room')) continue;
      // والثاني (v-blockworld-esc): ملاحظات اللاعبين وبلاغاتهم تذهب إلى قائمة آراء الموقع نفسها
      if (f === 'shared/play.js' && text.slice(m.index + m[1].length).startsWith('/api/system?action=feedback')) continue;
      bad.push(f + ': ' + text.slice(Math.max(0, m.index - 25), m.index + 45).replace(/\s+/g, ' '));
    }
  }
  assert.deepEqual(bad, []);
});

test('كلّ استيراد يصل ملفًّا موجودًا (three عبر خريطة الاستيراد في كلّ صفحة)', () => {
  const IMPORT = /(?:\bimport\s+(?:[^'"()]*?\sfrom\s+)?|\bexport\s+[^'"]*?\sfrom\s+|\bimport\s*\(\s*)(['"])([^'"\n]+)\1/g;
  const seen = new Set(), missing = [];
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!exists(rel)) { missing.push(rel); return; }
    for (const m of read(rel).matchAll(IMPORT)) {
      const spec = m[2];
      const next = spec === 'three' ? 'vendor/three.module.js'
        : spec.startsWith('three/addons/') ? 'vendor/addons/' + spec.slice('three/addons/'.length)
          : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)) : null;
      assert.ok(next, `استيراد غير نسبيّ «${spec}» في ${rel}`);
      visit(next);
    }
  };
  for (const page of ['index.html', ...WORLDS.map((k) => `styles/${k}/index.html`)]) {
    const html = read(page), dir = path.posix.dirname(page);
    const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(map, 'خريطة الاستيراد في ' + page);
    const imports = JSON.parse(map[1]).imports;
    assert.ok(exists(path.posix.normalize(path.posix.join(dir, imports.three))), page + ': three');
    assert.equal(path.posix.normalize(path.posix.join(dir, imports['three/addons/'])), 'vendor/addons/', page + ': three/addons/');
    const mod = /<script\b[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
    if (mod) visit(path.posix.normalize(path.posix.join(dir, mod[1])));
  }
  assert.deepEqual(missing, []);
  assert.ok(seen.has('shared/play.js') && seen.has('shared/voxel.js') && seen.has('vendor/three.module.js'));
});

test('كلّ خطّ وصورة وورقة أنماط مذكورة موجودة', () => {
  const missing = [];
  const need = (from, ref) => {
    if (/^(data:|blob:|https?:|#)/.test(ref)) return;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), ref.split(/[?#]/)[0]));
    if (!exists(rel)) missing.push(from + ' → ' + ref);
  };
  for (const f of OWN_TEXT.filter((x) => /\.(css|html)$/.test(x))) {
    const text = read(f);
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) need(f, m[1]);
    if (!f.endsWith('.html')) continue;
    for (const m of text.matchAll(/<(?:link|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)) need(f, m[1]);
  }
  assert.deepEqual(missing, []);
});

test('تُضاف إلى الشاشة الرئيسيّة: بيان بنطاق اللعبة وحدها وأيقونات بمقاساتها المعلنة', () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.equal(man.scope, './');
  assert.equal(man.start_url, './');
  assert.equal(man.display, 'fullscreen');
  assert.equal(man.dir, 'rtl');
  assert.ok(man.icons.length >= 2);
  for (const ic of man.icons) {
    const buf = fs.readFileSync(path.join(G, ic.src));
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', ic.src);
    assert.equal(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, ic.sizes, ic.src);
  }
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png">/);
});

test('صفحة شخصيّة: لا تُفهرس ولا يشير إليها التطبيق ولا خريطة الموقع', () => {
  assert.match(read('index.html'), /<meta name="robots" content="noindex, nofollow">/);
  for (const f of ['index.html', 'sitemap.xml', 'robots.txt', 'manifest.json']) {
    assert.ok(!/blockworld/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' يذكر blockworld');
  }
});

test('لا اسم مزوّد أو نموذج في ما يراه اللاعب، وأدوات التحقّق لا تُنشر', () => {
  const NAMES = /\b(claude|anthropic|openai|chatgpt|gpt-?\d|gemini|groq|deepseek|mistral|openrouter)\b/i;
  const hits = OWN_TEXT.filter((f) => NAMES.test(read(f)));
  assert.deepEqual(hits, []);
  const ignore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(ignore.includes('blockworld/tools/'), '.vercelignore: blockworld/tools/');
});

// v-blockworld-black: `pow(x, y)` بأساس سالب غير معرَّف في GLSL. المتصفّح البرمجيّ الذي بُنيت به المشاهد يحسب ‎|x|^y‎،
// وكروت الشاشة الحقيقيّة تعيد NaN؛ بكسل واحد منه يمسحه توهّج الصورة على الإطار كلّه فيسودّ العالم. كلّ أساس يُحصَّن.
function powBases(src) {
  const out = [];
  for (const m of src.matchAll(/(?<![\w.])pow\s*\(/g)) {
    let depth = 0, j = m.index + m[0].length;
    const start = j;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; } else if (c === ',' && depth === 0) { out.push(src.slice(start, j).trim()); break; }
    }
  }
  return out;
}
function safeBase(arg) {
  if (/^\d+(\.\d+)?$/.test(arg)) return true;                                  // ثابت موجب
  const head = /^(abs|exp|saturate|max|clamp)\s*\(/.exec(arg);
  if (!head) return false;
  let depth = 0;
  for (let i = head[0].length - 1; i < arg.length; i++) {                      // نداء واحد يغطّي الوسيط كلّه
    if (arg[i] === '(') depth++;
    else if (arg[i] === ')' && --depth === 0) { if (i !== arg.length - 1) return false; break; }
  }
  if (head[1] === 'max') return /,\s*(0\.0|vec[234]\(\s*0\.0\s*\))\s*\)$/.test(arg);
  if (head[1] === 'clamp') return /,\s*0\.0\s*,[^,]*\)$/.test(arg);
  return true;
}

test('لا pow بأساس قد يكون سالبًا في شيدرات اللعبة: كروت الشاشة تعيد NaN فيسودّ العالم', () => {
  assert.equal(safeBase('abs(1.0 - vT)'), true);
  assert.equal(safeBase('max(dot(n, l), 0.0)'), true);
  assert.equal(safeBase('1.0 - max(dot(N, V), 0.0)'), false, 'قريب من الصفر قد ينزل تحته');
  assert.equal(safeBase('abs(a) - abs(b)'), false);
  assert.equal(safeBase('sd'), false);
  const bad = [];
  let seen = 0;
  for (const f of OWN.filter((x) => x.endsWith('.js'))) {
    for (const arg of powBases(read(f))) { seen++; if (!safeBase(arg)) bad.push(`${f}: pow(${arg.slice(0, 60)}, …)`); }
  }
  assert.ok(seen >= 30, 'الاختبار يرى نداءات pow في الشيدرات');
  assert.deepEqual(bad, []);
});

test('حلقة اللعب تنتظر كرت الشاشة وتنتبه للصورة السوداء وتذكر اسم الكرت', () => {
  const play = read('shared/play.js');
  assert.match(play, /fenceSync\(/, 'لا يُصفّ إطار جديد والسابق لم يكتمل');
  assert.match(play, /function pictureIsBlack\(\)/);
  assert.match(play, /st\.safeMode = true/);
  assert.match(play, /WEBGL_debug_renderer_info/);
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /\bstage, render: \(\) => stage\.render\(\)/, k + ': يسلّم المشهد للمتحكّم');
  }
});

test('v-blockworld-kit: الركض والطيران والحقيبة وعدّة البناء في العوالم الثلاثة', () => {
  const play = read('shared/play.js'), kit = read('shared/kit.js');
  assert.match(play, /doubled\(now, lastFwd\)/, 'W مرّتين يركض');
  assert.match(play, /setFlying\(!st\.flying\)/, 'المسافة مرّتين تطير');
  assert.match(play, /slab: 1/, 'نصف المكعب صلب');
  assert.match(play, /function setSlot\(/);
  assert.match(read('shared/voxel.js'), /kind === 'slab'/);
  for (const name of ['مكعب ', 'نصف مكعب ', 'ليت ', 'مكعب ذهب', 'مكعب ألماس', 'زجاج', 'ماء', 'نار', 'سرير ']) assert.ok(kit.includes(name), 'في العدّة: ' + name);
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js', 'world.js', 'mesher.js', 'hud.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    for (const need of ['KIT_BLOCKS', 'kitMaterial(', 'createKit(', 'createBag(', 'kitIcon(', 'heightOf', 'onBag', 'onFly']) assert.ok(src.includes(need), `${k}: ${need}`);
    const page = read(`styles/${k}/index.html`) + src;
    assert.match(page, /data-act="bag"/, k + ': زرّ الحقيبة للّمس');
  }
});

test('v-blockworld-sound: أصوات مولَّدة في المتصفّح بلا ملفّات، تبدأ بضغطة البدء وتُكتم', () => {
  const snd = read('shared/sound.js'), play = read('shared/play.js');
  assert.match(snd, /AudioContext/);
  assert.ok(!/\.(mp3|ogg|wav|m4a)\b/.test(snd + play), 'لا ملفّ صوت');
  for (const fn of ['step', 'dig', 'brk', 'place', 'jump', 'land', 'splash', 'fly']) assert.match(play, new RegExp('sound\\.' + fn + '\\('), 'يُنادى: ' + fn);
  assert.match(play, /if \(sound\) sound\.start\(\);/, 'الصوت يبدأ داخل ضغطة البدء');
  assert.match(play, /KeyM/);
  assert.match(play, /hitTop\(p\.x, p\.y - 0\.03, p\.z\)/, 'الواقف على الأرض لا يُعدّ طائرًا في إطار قصير');
  assert.ok(!OWN.some((f) => /\.(mp3|ogg|wav|m4a)$/.test(f)));
});

test('v-blockworld-held: اليد تمسك ما في المربّع المختار، والضربة تُسمع حتّى في الهواء', () => {
  assert.ok(exists('shared/held.js'));
  for (const k of ['kawkab', 'waha']) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /createHeld\(/, k + ': مجسّم المكعب في اليد');
    assert.match(src, /heldBlock\.show\(block\)/, k + ': يتبع المربّع المختار');
  }
  assert.match(read('styles/dhalam/main.js'), /heldBox/, 'ظلام: مجسّمه الخاصّ');
  const play = read('shared/play.js');
  assert.match(play, /sound\.swing\(\)/, 'ضربة في الهواء لها صوت');
  assert.match(play, /\(Digit\|Numpad\)\[1-9\]/, 'أرقام اللوحة الجانبيّة تختار المربّع');
  assert.match(read('shared/sound.js'), /createDynamicsCompressor/);
});

test('v-blockworld-sharp: الصورة لا تُغبَّش للسرعة إلّا بحدّ، واللاعب يختار', () => {
  const play = read('shared/play.js');
  const q = /const QUALITY = \{ sharp: \{ min: ([\d.]+), slow: Infinity \}, balanced: \{ min: ([\d.]+), slow: (\d+) \}, fast: \{ min: ([\d.]+), slow: (\d+) \} \};/.exec(play);
  assert.ok(q, 'جدول الجودة');
  assert.equal(+q[1], 1, 'الواضحة: دقّة كاملة دائمًا');
  assert.ok(+q[2] >= 0.75, 'المتوازنة لا تنزل تحت ثلاثة أرباع');
  assert.ok(+q[3] >= 40, 'المتوازنة تنزل تحت ٢٥ إطارًا في الثانية فقط');
  assert.match(play, /mode: 'balanced'/, 'الافتراضيّ متوازن');
  assert.match(play, /const floor = res\.base \* res\.min;/, 'الحدّ نسبة من دقّة الشاشة لا رقمًا مطلقًا');
});

test('v-blockworld-vitals: الصحّة وحاجة كلّ عالم أرقام حيّة لا ثابتة', () => {
  const vit = read('shared/vitals.js');
  for (const how of ["'fire'", "'water'", "'home'", "'rest'"]) assert.ok(vit.includes('n.how === ' + how), 'قاعدة: ' + how);
  assert.match(vit, /fallV < -15/, 'السقوط الطويل يؤذي');
  assert.match(vit, /if \(v\.hp <= 0\) die\(\);/);
  const need = { kawkab: ["key: 'o2'", "key: 'pw'"], waha: ["key: 'wt'"], dhalam: ["key: 'warm'"] };
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /vitals = createVitals\(/, k);
    assert.match(src, /if \(vitals\) vitals\.update\(dt\);/, k + ': تُحدَّث كلّ إطار، وبأمان قبل إنشائها');
    for (const key of need[k]) assert.ok(src.includes(key), `${k}: ${key}`);
  }
});

test('v-blockworld-life: حيوانات تُصاد ووحوش تهاجم، بمجسّمات وأسماء كلّ عالم', () => {
  const life = read('shared/life.js'), play = read('shared/play.js'), kit = read('shared/kit.js');
  assert.match(life, /kind === 'monster' && monsters && dist < 20/, 'الوحش يطارد حين يقترب اللاعب');
  assert.match(life, /v\.hurt\(dmg \* \(1 - armor\(\)\)\)/, 'ضربته تنقص الصحّة، والدرع الملبوس يخفّفها');
  assert.match(life, /if \(e\.hp <= 0\) \{ felled\(e\); credit\(e\.k\.kind, e\.k\.meat\); \}/, 'الصيد يعطي لحمًا');
  assert.match(life, /if \(meat\) giveMeat\(meat\);/);
  assert.match(life, /play\.give\(kitItem\(MEAT, n\)\)/, 'واللحم يدخل الأغراض بالطريق العامّ');
  assert.match(life, /item\.use === 'eat'/);
  assert.match(life, /st\.noDig = !!aimed/, 'المخلوق تحت المؤشّر يُضرب بدل المكعب خلفه');
  assert.match(play, /if \(st\.noDig\)/);
  assert.match(play, /if \(s && s\.use\) return o\.onUse/);
  for (const name of ['لحم', 'سيف ألماس', 'صدرية']) assert.ok(kit.includes(name), name);
  const want = { kawkab: ['الحمّال', 'الزاحف', 'الطيف'], waha: ['المها', 'غول الرمال', 'عقرب الصخر'], dhalam: ['الوعل', 'المتربّص', 'ذئب العظم'] };
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /life = createLife\(/, k);
    assert.match(src, /if \(life\) life\.update\(dt\);/, k);
    assert.match(src, /onUse: \(item\) => \(life \? life\.use\(item\) : false\)/, k);
    for (const n of want[k]) assert.ok(src.includes(`name: '${n}'`), `${k}: ${n}`);
    assert.ok(/kind: 'animal'/.test(src) && /kind: 'monster'/.test(src), k + ': حيوان ووحش');
  }
  assert.ok(!/zombie|creeper|enderman|زومبي/i.test(life + kit), 'لا أسماء منقولة من لعبة أخرى');
});

test('v-blockworld-sky: لوحة Q تختار الوقت والمطر والوحوش، وكلّ عالم يضيء أوقاته بنفسه', () => {
  const sky = read('shared/weather.js'), play = read('shared/play.js'), bag = read('shared/bag.js'), snd = read('shared/sound.js');
  assert.match(play, /e\.code === KM\.menu && !e\.repeat && o\.onMenu/, 'Q يفتح اللوحة (والمفتاح يتغيّر من الإعدادات)');
  for (const t of ['الصبح', 'المغرب', 'الليل', 'صافي', 'مطر', 'موجودة', 'بدون']) assert.ok(sky.includes(t), t);
  assert.match(sky, /window\.__GAME_SKY = state/, 'الصحّة والمخلوقات تقرآن الوقت والمطر');
  assert.match(sky, /if \(v === open \|\| \(v && st\.modal\)\) return/, 'لوحة واحدة في المرّة');
  assert.match(bag, /if \(v === open \|\| \(v && st\.modal\)\) return/);
  assert.match(bag, /class="extra"/, 'على الجوّال: زرّ داخل الحقيبة يفتح اللوحة');
  assert.ok(!/class="x extra"/.test(bag), 'زرّ اللوحة ليس زرّ الإغلاق (كان يُغلق الحقيبة ويفتح اللوحة بدلها)');
  // خطوط المطر: لا pow ولا normalize على متّجه قد يكون صفرًا (غير معرّف على العتاد الحقيقيّ)
  const shader = sky.slice(sky.indexOf('vertexShader'), sky.indexOf('const mesh'));
  assert.ok(!/\bpow\(|\bnormalize\(/.test(shader), 'ظلّل المطر بلا pow ولا normalize');
  assert.match(shader, /max\(length\(side\), 0\.0001\)/);
  assert.match(snd, /rain: setRain/);
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /weather = createWeather\(/, k);
    assert.match(src, /onMenu\(\) \{ if \(weather\) weather\.toggle\(\); \}/, k);
    assert.match(src, /if \(weather\) weather\.update\(dt\);/, k);
    assert.match(src, /extra: \{ label: 'الوقت والجو'/, k);
    assert.ok(!src.includes('الوقت ثابت'), k + ': الملاحظة القديمة أزيلت');
  }
  assert.match(read('styles/kawkab/main.js'), /\n  day: \{/, 'كوكب: نهار جديد');
  assert.match(read('styles/waha/game.js'), /rain: 3, nightDrain: 0\.5/, 'واحة: المطر يملأ الماء والليل أبرد');
  assert.match(read('styles/dhalam/main.js'), /rainDrain: 1\.8, nightDrain: 1\.4/, 'ظلام: المطر والليل أبرد');
  assert.match(read('shared/life.js'), /k\.kind === 'monster' \? \(night \? 2 : 1\) \* \(window\.__GAME_DIFF \? window\.__GAME_DIFF\.mobs : 1\) : 1/, 'الليل: الوحوش ضعف العدد');
});

test('v-blockworld-status: قلوب وأكل ودرع وخبرة فوق المربّعات، والجوع يُشبعه اللحم', () => {
  const st = read('shared/status.js'), vit = read('shared/vitals.js'), life = read('shared/life.js'), play = read('shared/play.js');
  assert.match(st, /cell\(HEART\)\.repeat\(10\)/);
  assert.match(st, /cell\(FOOD\)\.repeat\(10\)/);
  assert.match(st, /Math\.ceil\(Math\.max\(0, Math\.min\(100, val\)\) \/ 5\)/, 'أنصاف: كلّ قلب عشر نقاط');
  assert.match(vit, /key: 'food', start: o\.food \?\? 80, drain: 0\.14, run: 2\.2, how: 'eat'/);
  assert.match(life, /v\.values\.food = Math\.min\(100, v\.values\.food \+ 40\)/, 'اللحم يُشبع');
  assert.match(play, /st\.xp \+= 1;/, 'كسر مكعب = نقطة خبرة');
  assert.match(life, /st\.xp = \(st\.xp \|\| 0\) \+ gain/, 'الصيد = خبرة');
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /status = createStatus\(\{[^\n]*hide: \[vq\('[a-z-]*(hp|health)'\)\]/, k + ': شريط الصحّة القديم يُخفى فلا يتكرّر');
    assert.match(src, /if \(status\) status\.update\(\);/, k);
  }
});

test('v-blockworld-inv: حقيبة بثلاث صفحات، ٢٧ خانة ولبس ويد ثانية، وتصنيع وصندوق وباب وإنجازات', () => {
  const play = read('shared/play.js'), bag = read('shared/bag.js'), kit = read('shared/kit.js'), craft = read('shared/craft.js');
  const feats = read('shared/feats.js'), life = read('shared/life.js'), status = read('shared/status.js'), held = read('shared/held.js');
  // الأغراض: حقيبة ٢٧، أربع خانات لبس ويد ثانية، ومربّع فارغ يُرسم كأيّ غرض
  assert.match(play, /pack: new Array\(27\)\.fill\(null\)/);
  assert.match(play, /gear: \{ head: null, chest: null, legs: null, feet: null, off: null \}/);
  assert.match(play, /export const EMPTY = Object\.freeze\(\{ empty: true, kit: true, id: 0, name: '', tool: 'none' \}\)/);
  assert.match(play, /const it = itemOf \? itemOf\(want\) : null;/, 'ما يُحفر يبدأ كومة جديدة إن عُرف الغرض (كان يضيع)');
  assert.match(play, /return 'pack';/, 'give يقول أين ذهب الغرض');
  assert.match(play, /o\.onInteract && !keys\.has\('ShiftLeft'\)/, 'زرّ البناء يشغّل الباب والصندوق، وShift يبني بجانبهما');
  assert.match(play, /blocks\[s\.id\]\.tall && \(y \+ 2 >= sy \|\| world\.get\(x, y \+ 1, z\) !== 0\)/, 'الباب يحتاج الخانة فوقه');
  assert.match(play, /hardness\(h\.id\) \/ \(\(tool && tool\.speed\) \|\| 1\)/, 'المعول والفأس أسرع');
  assert.match(play, /e\.code === 'Escape' && !st\.locked && o\.onUnlock/, 'Esc يفتح القائمة حتّى بلا التقاط الفأرة');
  for (const t of ['أغراضي', 'التصنيع', 'كل البلوكات', 'اليد الثانية', 'خوذة', 'صدرية', 'سروال', 'حذاء']) assert.ok(bag.includes(t), t);
  assert.match(bag, /fits = \(z, k, it\) => !has\(it\) \|\| z === 'bar' \|\| z === 'pack' \|\| z === 'chest' \|\| k === 'off' \|\| it\.wear === k/, 'خانة اللبس لا تقبل إلّا قطعتها');
  // البلوكات الجديدة
  assert.match(kit, /CHEST: 170, TABLE: 171, TORCH: 172, DOOR: 173, DOOR_TOP: 174, DOOR_OPEN: 175, DOOR_OPEN_TOP: 176/);
  assert.match(kit, /kind: 'none', solid: true, pick: true, tall: true, door: 1/, 'الباب المغلق صلب ويُصوَّب عليه ولا يُرسم مكعبًا');
  assert.match(kit, /\[K\.DOOR_OPEN\] = \{[^}]*solid: false/, 'والمفتوح يُعبَر');
  assert.match(kit, /if \(c && play\) for \(const it of c\) if \(it\) play\.give\(it\);/, 'كسر الصندوق يردّ ما فيه');
  assert.match(kit, /never shut a door on the player/);
  for (const n of ['سيف حجر', 'سيف ذهب', 'فأس حجر', 'فأس ألماس', 'معول حجر', 'معول ألماس', 'طاولة تصنيع', 'صندوق', 'مشعل', 'باب']) assert.ok(kit.includes(n), n);
  assert.match(craft, /\{ out: K\.TABLE, n: 1, needs: \[\['wood', 4\]\] \}/, 'الطاولة تُصنع باليد');
  assert.match(craft, /\{ out: K\.CHEST, n: 1, needs: \[\['wood', 6\]\], table: true \}/);
  assert.match(craft, /if \(r\.table && !tableNear\(\)\) return/);
  assert.match(life, /s\.weapon \? \+s\.weapon/, 'قوّة السلاح من السلاح نفسه');
  assert.match(status, /export const protection = \(st\) => \['head', 'chest', 'legs', 'feet'\]\.reduce/);
  assert.match(held, /const tools = \{ sword: new THREE\.Group\(\), axe: new THREE\.Group\(\), pick: new THREE\.Group\(\) \}/);
  assert.ok((feats.match(/^  \['/gm) || []).length >= 12, '١٢ إنجازًا على الأقلّ');
  assert.ok(!/[٠-٩]/.test(feats + status), 'أرقام لاتينيّة كباقي الواجهة');
  assert.match(play, /'الإنجازات ' \+/);
  assert.match(play, /سرعة النظر \(الماوس واللمس\): عادية/);
  // الإشعار فوق اللوحات المفتوحة لا خلفها
  assert.match(play, /z-index:48;/);
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /onInteract: \(h\) => bag\.interact\(h\),/, k);
    assert.match(src, new RegExp("play, kit, camera, world: '" + k + "', shown: [a-z.]+, onMenu: \\(\\) => \\{ play\\.stop\\(\\); panel\\.show\\('pause'\\); \\},"), k);
    assert.match(src, /mats: \{ wood: \{ ids: \[/, k);
    assert.ok(!/it\.weapon\) \? it\.id/.test(src), k + ': اليد تتبع نموذج الأداة لا السيف وحده');
  }
  assert.match(read('styles/kawkab/hud.js'), /const shown = touch \? 5 : 9,/);
  assert.match(read('styles/dhalam/index.html'), /class="slot x9" data-i="8"/);
  assert.match(read('styles/dhalam/main.js'), /solid === false\)/, 'ظلام: الباب المفتوح يُعبَر');
  assert.match(read('styles/waha/game.js'), /BLOCKS\[id\]\.solid != null \? BLOCKS\[id\]\.solid : built\(id\)/);
  assert.ok(!/creeper|enderman|minecraft|ماين ?كرافت/i.test(bag + kit + craft + feats), 'لا أسماء منقولة من لعبة أخرى');
});

test('v-blockworld-adv: مهام ظاهرة وسرّيّة، كنز يتغيّر كلّ يوم، ملابس، تاجر، ومنظور من الخلف', () => {
  const adv = read('shared/adventure.js'), outfits = read('shared/outfits.js'), avatar = read('shared/avatar.js');
  const bag = read('shared/bag.js'), play = read('shared/play.js'), kit = read('shared/kit.js');
  assert.match(bag, /\['quests', 'المهام'\]/, 'صفحة رابعة في الحقيبة');
  assert.match(bag, /createAdventure\(\{ play, kit, craft, camera: o\.camera, world: o\.world \}\)/);
  // الكنز: بذرته اليوم والعالم، بعيد عن البداية، ويُحسب مرّة في اليوم
  assert.match(adv, /rng\(hash\(worldKey \+ '\|' \+ today\)\)/);
  assert.match(adv, /Math\.hypot\(x - spawn\.x, z - spawn\.z\) < 24\) continue;/);
  assert.match(adv, /save\(foundKey, today\)/);
  // المهام: الظاهرة بالترتيب، والسرّيّة لا تُكتب حتّى تُكتشف
  assert.ok((adv.match(/^  \['[a-z0-9]+', '/gm) || []).length >= 15, 'تسع مهامّ وسبع أسرار');
  assert.match(adv, /secrets: \(\) => SECRETS\.filter\(\(q\) => done\.has\('s:' \+ q\[0\]\)\)/, 'السرّيّة تظهر بعد اكتشافها فقط');
  assert.ok(adv.includes('ما تنكتب هني لين تلقاها بروحك'));
  // الملابس: تُمنح فتُلبس فورًا وتُحفظ
  assert.ok((outfits.match(/\{ key: '/g) || []).length >= 12);
  assert.match(outfits, /owned\.add\(key\); current = key; keep\(\);/);
  assert.match(avatar, /export function makeAvatar\(\)/);
  // المنظور من الخلف: الكاميرا ترجع وتقف قبل الجدار، وما على الكاميرا يُخفى بالطبقات لا بـvisible
  assert.match(play, /e\.code === KM\.view && !e\.repeat && !st\.modal/);
  assert.match(play, /if \(st\.third\) \{/);
  assert.match(adv, /o\.userData\.bwMask = o\.layers\.mask; o\.layers\.set\(30\);/, 'لا يُمسّ visible الذي تديره العوالم');
  // التاجر: زرّ البناء أمامه يفتح صفحته، وعباءته بأربع ألماسات
  assert.match(adv, /play\.onUseFirst\(\(\) => \{ if \(!tNear \|\| !api\.onTrade\) return false; api\.onTrade\(\); return true; \}\);/);
  assert.match(adv, /out\.push\(\[K\.DIAMOND, 4, 'outfit:merchant', 1\]\)/);
  // السرير: في الليل نوم للصباح، وفي النهار مكعب عاديّ
  assert.match(kit, /if \(d\.mate\) return \{ bed: true \};/);
  assert.match(bag, /if \(r\.bed\) return adv \? adv\.sleep\(\) : false;/);
  // الإشعار ينتقل حين تُفتح لوحة فوقه
  assert.match(play, /if \(typeof seatNote === 'function'\) seatNote\(\);/);
  assert.ok(!/[٠-٩]/.test(adv + outfits), 'أرقام لاتينيّة كباقي الواجهة');
});

test('v-blockworld-net: لعب جماعيّ بكود من أربعة أرقام — صاحب الغرفة يُدخل ويُخرج ويتحكّم', () => {
  const net = read('shared/net.js'), play = read('shared/play.js'), life = read('shared/life.js'), sky = read('shared/weather.js');
  const bag = read('shared/bag.js'), kit = read('shared/kit.js');
  assert.match(net, /const API = '\/api\/system\?action=play-room';/, 'التعارف من خادم الموقع نفسه');
  assert.match(net, /const MAX_PLAYERS = 4/);
  assert.match(bag, /createNet\(\{ play, kit, camera: o\.camera, world: o\.world, adv,/);
  assert.match(play, /'العب مع ربعك \(الغرفة ' \+ net\.code \+ '\)'/, 'زرّ في قائمة Esc');
  // صاحب الغرفة: يُسأل عن كلّ داخل، يقبل أو يرفض، ويُخرج
  for (const t of ['دخّله', 'ارفض', 'طلّعه', 'سكّر الغرفة', 'افتح غرفة', 'ادخل']) assert.ok(net.includes(t), t);
  assert.match(net, /if \(kicked\) send\(p\.dc, \{ t: 'kick' \}\);/);
  // ما يُفعل بالعالم يُسجَّل ويُعاد على الداخل الجديد
  assert.match(net, /send\(p\.dc, \{ t: 'welcome', id, world, log,/);
  assert.match(net, /for \(const a of m\.log \|\| \[\]\) apply\(a\);/);
  assert.match(play, /if \(net\.place\) net\.place\(x, y, z, s\.id, st\.yaw\);/);
  assert.match(play, /if \(net\.dig\) net\.dig\(h\.x, h\.y, h\.z\);/);
  assert.match(play, /remotePlace\(x, y, z, id, yaw\) \{/);
  assert.match(kit, /if \(!remote && api\.onDoor\) api\.onDoor\(x, by, z\);/, 'الباب يُفتح للجميع');
  // ما يأتي من لاعب آخر يُفحص قبل تطبيقه
  assert.match(net, /\['put', 'dig', 'door'\]\.includes\(m\.a\[0\]\) && okCell\(m\.a\)/);
  assert.match(net, /m\.s\.p\.every\(Number\.isFinite\)/);
  // الوقت والجو والوحوش لصاحب الغرفة
  assert.match(sky, /if \(state\.locked && !forced\) \{/);
  assert.match(life, /if \(share\.mode === 'guest' && !forced\) \{/);
  // مخلوقات صاحب الغرفة هي الحقيقيّة: الضيف يراها ويرسل ضرباته
  assert.match(life, /if \(share\.mode === 'guest'\) \{ if \(share\.send\) share\.send\(null, \{ t: 'hit', e: e\.nid, pow: power\(\) \}\); return; \}/);
  assert.match(life, /function applySnapshot\(list\) \{/);
  assert.match(life, /if \(who !== null\) \{ if \(share\.send\) share\.send\(who, \{ t: 'hurt', d: dmg \}\); \}/, 'الوحش يلاحق أقرب لاعب');
  // قائمة التوقّف لا توقف العالم على الباقين
  assert.match(play, /if \(shared && st\.running\) \{ held = true; setModal\(true\); return; \}/);
  // بداية نظيفة للداخل الذي غيّر عالمه
  assert.match(net, /if \(log\.length > 0 && !join\.fresh\) \{ try \{ window\.sessionStorage\.setItem\('bw-join'/);
  assert.ok(!/console\.(log|error|warn)/.test(net), 'لا طباعة لعرض الاتّصال (فيه عناوين اللاعبين)');
  assert.ok(exists('tools/nettest.cjs'), 'فحص متصفّحين يتّصلان فعلًا');
});

test('v-blockworld-esc: قائمة Esc بخياراتها الثمانية، والحفظ يحفظ فعلًا', () => {
  const play = read('shared/play.js'), save = read('shared/save.js'), bag = read('shared/bag.js'), net = read('shared/net.js');
  const life = read('shared/life.js'), vit = read('shared/vitals.js'), kit = read('shared/kit.js');
  // الخيارات بترتيب طلب المالك
  const order = ["'الرجوع للعبة'", "'الإنجازات '", "'الإحصائيات'", "'أرسل ملاحظة'", "'بلّغ عن خطأ'", "'الإعدادات'", "'العب مع ربعك'", "'احفظ واطلع للقائمة'"];
  const at = order.map((t) => play.indexOf(t, play.indexOf("btn('go', 'الرجوع للعبة', 'go')")));
  assert.ok(at.every((n) => n > 0) && at.every((n, i) => i === 0 || n > at[i - 1]), 'الثمانية موجودة وبالترتيب: ' + at.join(','));
  // الإحصائيات من عدّادات اللعب الحقيقيّة
  for (const k of ['st.played', 'st.walked', 'st.swumDist', 'st.broken', 'st.placed', 'st.jumps', 'st.deaths']) assert.ok(play.includes(k), k);
  assert.match(play, /st\.played \+= dt;/);
  assert.match(vit, /deaths\+\+; st\.deaths = \(st\.deaths \|\| 0\) \+ 1;/);
  // الملاحظة والبلاغ: إلى قائمة آراء الموقع، بعلامة اللعبة، وبحدّ الطول الذي يقبله الخادم
  assert.match(play, /const FEEDBACK_API = '\/api\/system\?action=feedback';/);
  assert.match(play, /rating: bug \? 3 : stars, chips: bug \? \['fbChipBug'\] : \[\]/);
  assert.match(play, /\.slice\(0, 1000\), lang: 'ar'/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'api/_lib/feedback.js'), 'utf8'), /'fbChipBug'/, 'الشريحة معروفة عند الخادم');
  // الإعدادات: صوت، سرعة النظر، الصورة، الصعوبة، الوحوش، أزرار التحكّم
  for (const a of ["btn('sound'", "btn('look'", "btn('video'", "btn('diff'", "btn('mon'", "btn('keys'"]) assert.ok(play.includes(a), a);
  assert.match(play, /const KEYS0 = \{ fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', run: 'ControlLeft', bag: 'KeyE', menu: 'KeyQ', view: 'KeyV', place: 'KeyF', mute: 'KeyM' \};/);
  assert.match(play, /for \(const a of Object\.keys\(KM\)\) if \(KM\[a\] === code && a !== action\) KM\[a\] = KM\[action\];/, 'مفتاح مستعمل يتبادل مع صاحبه');
  assert.ok(!/keys\.has\('Key[WASD]'\)|e\.code === 'Key[EQVMF]'/.test(play), 'لا مفتاح ثابت بقي في مسار اللعب');
  assert.match(play, /const DIFFS = \{ easy: \{ dmg: 0\.5, hunger: 0\.6, mobs: 1 \}, normal: \{ dmg: 1, hunger: 1, mobs: 1 \}, hard: \{ dmg: 1\.6, hunger: 1\.4, mobs: 1\.5 \} \};/);
  assert.match(life, /const dmg = k\.dmg \* \(window\.__GAME_DIFF \? window\.__GAME_DIFF\.dmg : 1\);/);
  assert.match(vit, /n\.key === 'food' && window\.__GAME_DIFF \? window\.__GAME_DIFF\.hunger : 1/);
  assert.ok(play.includes('اللغات الثانية ما انضافت للعبة للحين'), 'اللغة مذكورة بصدق لا بزرّ لا يعمل');
  // الحفظ: سجلّ ما فُعل بالعالم + اللاعب + الصناديق + السماء، كلّ ٢٠ ثانية وعند ترك الصفحة، ويُقرأ عند العودة
  assert.match(bag, /createSave\(\{ play, kit, net, world: o\.world, fresh: joining \}\)/);
  assert.match(save, /KEY = 'bw-save-' \+ world/);
  assert.match(save, /if \(\(wait \+= dt\) >= 20\) \{ wait = 0; if \(!api\.disabled && net\.role !== 'guest'\) api\.save\(\); \}/);
  assert.match(save, /window\.addEventListener\('pagehide', leaving\);/);
  assert.match(save, /for \(const a of d\.log\) \{ if \(Array\.isArray\(a\)\) \{ net\.apply\(a\); net\.log\.push\(a\); \} \}/);
  assert.match(save, /api\.disabled = 'broken'/, 'حفظ لا يُقرأ لا يُكتب فوقه');
  assert.match(net, /window\.__GAME_SAVE\.disabled = 'guest';/, 'الضيف لا يكتب عالم غيره فوق عالمه');
  assert.match(kit, /if \(play && play\.sound && !remote\) play\.sound\.place\(\);/, 'تحميل الحفظ لا يشغّل صوتًا قبل أوّل نقرة');
});

test('v-blockworld-esc: تقصير سجلّ الحفظ يعطي العالم نفسه', async () => {
  const src = read('shared/save.js');
  const body = src.slice(src.indexOf('export function compact'), src.indexOf('export function createSave')).replace('export ', '');
  const compact = new Function(body + '; return compact;')();
  const key = (a) => a[1] + ',' + a[2] + ',' + a[3];
  const run = (log) => { const w = new Map(), open = new Map(); for (const a of log) { if (a[0] === 'put') { w.set(key(a), a[4]); open.set(key(a), false); } else if (a[0] === 'dig') { w.set(key(a), 0); open.delete(key(a)); } else if (open.has(key(a))) open.set(key(a), !open.get(key(a))); } return [w, open]; };
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 300; t++) {
    const log = [], placed = new Set(), natural = new Set();
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(r() * 4), y = Math.floor(r() * 2), z = Math.floor(r() * 2), k = x + ',' + y + ',' + z, c = r();
      if (c < 0.45) { if (!placed.has(k)) { log.push(['put', x, y, z, 100 + Math.floor(r() * 3), 0]); placed.add(k); } }
      else if (c < 0.85) { if (placed.has(k)) { log.push(['dig', x, y, z]); placed.delete(k); } else if (!natural.has(k) && y === 0) { log.push(['dig', x, y, z]); natural.add(k); } }
      else if (placed.has(k)) log.push(['door', x, y, z]);
    }
    const short = compact(log), [w1, o1] = run(log), [w2, o2] = run(short);
    assert.ok(short.length <= log.length);
    // خانة وُضع فيها مكعب ثمّ حُفر قد تغيب من القصير: المعنى واحد ما لم تكن أرضًا أصليّة حُفرت
    const cells = (w) => JSON.stringify([...w].filter(([k, v]) => v !== 0 || natural.has(k)).sort());
    assert.equal(cells(w2), cells(w1), 'المكعبات نفسها');
    assert.equal(JSON.stringify([...o2].filter(([, v]) => v).sort()), JSON.stringify([...o1].filter(([, v]) => v).sort()), 'الأبواب المفتوحة نفسها');
  }
});

