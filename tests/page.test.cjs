// tests/page.test.cjs — لعبة «عالم المكعبات»: الملفّات كما تُنشر.
//
// المجلّد يُنشر كما هو بلا بناء، فما يكسره يُرى من الملفّات نفسها: مسار يبدأ من جذر الموقع (يعمل محلّيًّا على الجذر
// وينكسر تحت ‎/blockworld/‎)، استيراد أو خطّ أو أيقونة تشير إلى ملفّ غير موجود، أو رابط من التطبيق إلى صفحة طلبها
// المالك شخصيّة. اللعب نفسه (مشي، حفر، بناء، لمس) يُفحص في المتصفّح بـ‎blockworld/tools/playtest.cjs‎.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const G = ROOT;      // اللعبة هي المشروع كلّه
const WORLDS = ['kawkab', 'waha', 'dhalam', 'barari'];
const read = (rel) => fs.readFileSync(path.join(G, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(G, rel)) && fs.statSync(path.join(G, rel)).isFile();

function walk(dir, out = []) {
  for (const n of fs.readdirSync(path.join(G, dir))) {
    if (!dir && ['vendor', 'tools', 'tests', 'api', 'knowledge', 'node_modules', '.git', '.github', '.vercel'].includes(n)) continue;      // ليست من اللعبة المنشورة
    const rel = dir ? dir + '/' + n : n;
    if (fs.statSync(path.join(G, rel)).isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
const OWN = walk('').filter((f) => f.includes('/') || ['index.html', 'manifest.webmanifest'].includes(f));      // ملفّات اللعبة: المجلّدات المنشورة وصفحة الدخول
const OWN_TEXT = OWN.filter((f) => /\.(js|css|html|webmanifest)$/.test(f));

test('الصفحة وعوالمها الثلاثة موجودة', () => {
  for (const f of ['index.html', 'manifest.webmanifest', 'shared/play.js', 'shared/voxel.js', 'vendor/three.module.js', 'vendor/three.core.js']) assert.ok(exists(f), f);
  for (const k of WORLDS) for (const f of ['index.html', 'main.js', 'world.js']) assert.ok(exists(`styles/${k}/${f}`), `styles/${k}/${f}`);
  const ready = /const READY = (\[[^\]]*\]);/.exec(read('index.html'));
  assert.ok(ready, 'قائمة العوالم في صفحة الاختيار');
  assert.deepEqual(JSON.parse(ready[1].replace(/'/g, '"')).sort(), [...WORLDS, 'dino'].sort(), 'العوالم الأربعة، وعالم الديناصورات (وضع من البراري)');
  for (const f of ['index.html', 'main.js']) assert.ok(exists(`styles/dino/${f}`), `styles/dino/${f}`);
});

test('لا مسار يبدأ من جذر الموقع: المجلّد يعمل تحت أيّ مسار', () => {
  const bad = [];
  for (const f of OWN_TEXT) {
    const text = read(f);
    for (const m of text.matchAll(/(['"(=]\s*)\/(shared|vendor|styles|previews|icons|blockworld|js|css|api)\//g)) {
      // استثناء واحد مقصود (v-blockworld-net): وسيط تعارف اللعب الجماعيّ من خادم الموقع نفسه، ومكانه جذر الموقع لا المجلّد
      if (f === 'shared/net.js' && text.slice(m.index + m[1].length).startsWith('/api/play-room')) continue;
      // والثاني (v-blockworld-esc): ملاحظات اللاعبين وبلاغاتهم تذهب إلى قائمة آراء الموقع نفسها
      if (f === 'shared/play.js' && text.slice(m.index + m[1].length).startsWith('/api/feedback')) continue;
      // والثالث (v-blockworld-cloud): الحفظ في الحساب من خادم الموقع نفسه
      if (f === 'shared/cloud.js' && text.slice(m.index + m[1].length).startsWith('/api/cloud-save')) continue;
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

test('صفحة شخصيّة: لا تُفهرس', () => {
  assert.match(read('index.html'), /<meta name="robots" content="noindex, nofollow">/);
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const all = v.headers.find((h) => h.source === '/(.*)').headers;
  assert.ok(all.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)));
});

test('لا اسم مزوّد أو نموذج في ما يراه اللاعب، وأدوات التحقّق لا تُنشر', () => {
  const NAMES = /\b(claude|anthropic|openai|chatgpt|gpt-?\d|gemini|groq|deepseek|mistral|openrouter)\b/i;
  const hits = OWN_TEXT.filter((f) => NAMES.test(read(f)));
  assert.deepEqual(hits, []);
  const ignore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim());
  for (const d of ['tools/', 'tests/', 'knowledge/']) assert.ok(ignore.includes(d), '.vercelignore: ' + d);
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
  const need = { kawkab: ["key: 'o2'", "key: 'pw'"], waha: ["key: 'wt'"], dhalam: ["key: 'warm'"], barari: ["key: 'water'", "key: 'warm'"] };
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /vitals = createVitals\(/, k);
    assert.match(src, /if \(vitals\) vitals\.update\(dt\);/, k + ': تُحدَّث كلّ إطار، وبأمان قبل إنشائها');
    for (const key of need[k]) assert.ok(src.includes(key), `${k}: ${key}`);
  }
});

test('v-blockworld-life: حيوانات تُصاد ووحوش تهاجم، بمجسّمات وأسماء كلّ عالم', () => {
  const life = read('shared/life.js'), play = read('shared/play.js'), kit = read('shared/kit.js');
  assert.match(life, /k\.kind === 'monster' && monsters\) \|\| \(k\.fights && e\.flee > 0\)\) && dist < 20/, 'الوحش يطارد حين يقترب اللاعب (والحيوان اللي يدافع عن نفسه إذا انضرب)');
  assert.match(life, /v\.hurt\(dmg \* \(1 - armor\(\)\)\)/, 'ضربته تنقص الصحّة، والدرع الملبوس يخفّفها');
  assert.match(life, /play\.give\(it\)/, 'الصيد يعطي لحمًا');
  assert.match(life, /const dropsOf = \(k\) => k\.drops \|\| \(k\.meat \? \[\[MEAT, k\.meat\]\] : \[\]\)/, 'كل حيوان يعطي ما يخصّه، والقديم (meat) يبقى يعمل');
  assert.match(life, /if \(list\.length\) giveDrops\(list\);/);
  assert.match(life, /const it = kitItem\(id \| 0/, 'واللحم يدخل الأغراض بالطريق العامّ');
  assert.match(life, /item\.use === 'eat'/);
  assert.match(life, /st\.noDig = !!aimed/, 'المخلوق تحت المؤشّر يُضرب بدل المكعب خلفه');
  assert.match(play, /if \(st\.noDig\)/);
  assert.match(play, /if \(s && s\.use\) return o\.onUse/);
  for (const name of ['لحم', 'سيف ألماس', 'صدرية']) assert.ok(kit.includes(name), name);
  const want = { kawkab: ['الحمّال', 'الزاحف', 'الطيف'], waha: ['المها', 'غول الرمال', 'عقرب الصخر'], dhalam: ['الوعل', 'المتربّص', 'ذئب العظم'], barari: ['العاصوف', 'الزمهرير'] };
  for (const k of WORLDS) {
    const src = ['main.js', 'game.js'].filter((n) => exists(`styles/${k}/${n}`)).map((n) => read(`styles/${k}/${n}`)).join('\n');
    assert.match(src, /life = createLife\(/, k);
    assert.match(src, /if \(life\) life\.update\(dt\);/, k);
    assert.match(src, /onUse: \(item\) => \(life \? life\.use\(item\) : false\)/, k);
    for (const n of want[k]) assert.ok(src.includes(`name: '${n}'`), `${k}: ${n}`);
    if (k === 'barari') assert.match(src, /\.\.\.landKinds\('barari', gen\.landOf\)/, 'حيوانات البراري حسب الأرض');
    assert.ok((/kind: 'animal'/.test(src) || /\.\.\.landKinds\(/.test(src)) && /kind: 'monster'/.test(src), k + ': حيوان ووحش');
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
  assert.match(life, /v\.values\.food = Math\.min\(100, v\.values\.food \+ \(item\.eat \|\| 40\)\)/, 'اللحم يُشبع (وكل أكل بقدره)');
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
  assert.match(play, /let sp = \(tool && tool\.speed\) \|\| 1; if \(tool && tool\.dig && digClass && digClass\(h\.id\) !== tool\.dig\) sp = 1;/, 'المعول والفأس والمجرفة أسرع، كل واحد في اللي له');
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
  assert.match(status, /export const protection = \(st\) => \['head', 'chest', 'legs', 'feet', 'off'\]\.reduce/);
  assert.match(held, /const tools = \{ sword: new THREE\.Group\(\), axe: new THREE\.Group\(\), pick: new THREE\.Group\(\),/);
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
  assert.match(adv, /secrets: \(\) => secretsHere\.filter\(\(q\) => done\.has\('s:' \+ q\[0\]\)\)/, 'السرّيّة تظهر بعد اكتشافها فقط');
  assert.ok(adv.includes('ما تنكتب هني لين تلقاها بروحك'));
  // الملابس: تُمنح فتُلبس فورًا وتُحفظ
  assert.ok((outfits.match(/\{ key: '/g) || []).length >= 12);
  assert.match(outfits, /key: 'custom', name: 'تصميمي'/, 'ولبس يصمّمه اللاعب');
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
  assert.match(bag, /if \(r\.bed\) return adv \? adv\.sleep\(\) \|\| adv\.nap\(\) : false;/);
  // الإشعار ينتقل حين تُفتح لوحة فوقه
  assert.match(play, /if \(typeof seatNote === 'function'\) seatNote\(\);/);
  assert.ok(!/[٠-٩]/.test(adv + outfits), 'أرقام لاتينيّة كباقي الواجهة');
});

test('v-blockworld-net: لعب جماعيّ بكود من أربعة أرقام — صاحب الغرفة يُدخل ويُخرج ويتحكّم', () => {
  const net = read('shared/net.js'), play = read('shared/play.js'), life = read('shared/life.js'), sky = read('shared/weather.js');
  const bag = read('shared/bag.js'), kit = read('shared/kit.js');
  assert.match(net, /const API = '\/api\/play-room';/, 'التعارف من خادم الموقع نفسه');
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
  assert.match(play, /const FEEDBACK_API = '\/api\/feedback';/);
  assert.match(play, /rating: bug \? 3 : stars, chips: bug \? \['fbChipBug'\] : \[\]/);
  assert.match(play, /\.slice\(0, 1000\), lang: 'ar'/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'api/feedback.js'), 'utf8'), /'fbChipBug'/, 'الشريحة معروفة عند الخادم');
  // الإعدادات: صوت، سرعة النظر، الصورة، الصعوبة، الوحوش، أزرار التحكّم
  for (const a of ["btn('sound'", "btn('look'", "btn('video'", "btn('diff'", "btn('mon'", "btn('keys'"]) assert.ok(play.includes(a), a);
  assert.match(play, /const KEYS0 = \{ fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', run: 'ControlLeft', bag: 'KeyE', menu: 'KeyQ', view: 'KeyV', place: 'KeyF', mute: 'KeyM' \};/);
  assert.match(play, /for \(const a of Object\.keys\(KM\)\) if \(KM\[a\] === code && a !== action\) KM\[a\] = KM\[action\];/, 'مفتاح مستعمل يتبادل مع صاحبه');
  assert.ok(!/keys\.has\('Key[WASD]'\)|e\.code === 'Key[EQVMF]'/.test(play), 'لا مفتاح ثابت بقي في مسار اللعب');
  assert.match(play, /const DIFFS = \{ peaceful: \{ dmg: 0, hunger: 0\.4, mobs: 0 \}, easy: \{ dmg: 0\.5, hunger: 0\.6, mobs: 1 \}, normal: \{ dmg: 1, hunger: 1, mobs: 1 \}, hard: \{ dmg: 1\.6, hunger: 1\.4, mobs: 1\.5 \} \};/);
  assert.match(life, /const dmg = k\.dmg \* \(window\.__GAME_DIFF \? window\.__GAME_DIFF\.dmg : 1\);/);
  assert.match(vit, /n\.key === 'food' && window\.__GAME_DIFF \? window\.__GAME_DIFF\.hunger : 1/);
  assert.ok(play.includes('اللغات الثانية ما انضافت للعبة للحين'), 'اللغة مذكورة بصدق لا بزرّ لا يعمل');
  // الحفظ: سجلّ ما فُعل بالعالم + اللاعب + الصناديق + السماء، كلّ ٢٠ ثانية وعند ترك الصفحة، ويُقرأ عند العودة
  assert.match(bag, /createSave\(\{ play, kit, net, world: o\.world, fresh: joining \}\)/);
  assert.match(save, /KEY = 'bw-save-' \+ world/);
  assert.match(save, /if \(\(wait \+= dt\) >= 20\) \{\s*wait = 0;\s*if \(!api\.disabled && net\.role !== 'guest'\) \{ if \(api\.cloud\.code && sent >= PUSH_EVERY\) \{ sent = 0; api\.pushNow\(\); \} else api\.save\(\); \}/, 'كل ٢٠ ثانية (ومع الحساب: الرفع يحفظ هنا أوّلًا)');
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

test('v-blockworld-cave: نار تحرق باللمس، بناء فوق الماء، كهف اليوم وطقم الألماس، اسم ومشرف وتصميم', () => {
  const play = read('shared/play.js'), vit = read('shared/vitals.js'), life = read('shared/life.js'), kit = read('shared/kit.js');
  const cave = read('shared/cave.js'), craft = read('shared/craft.js'), adv = read('shared/adventure.js'), net = read('shared/net.js'), outfits = read('shared/outfits.js');
  // بلاغ «النار ما يحرق»: كانت تحرق من يقف داخل خانتها فقط
  assert.match(vit, /for \(const dx of \[-r, 0, r\]\) for \(const dz of \[-r, 0, r\]\) if \(cellAt\(p\.x \+ dx, y, p\.z \+ dz\) === K\.FIRE\) burn = true;/);
  assert.match(life, /if \(cell\(e\.x, e\.y \+ 0\.2, e\.z\) === 151\) \{ e\.hp -= 9 \* dt;/, 'والمخلوقات تحترق أيضًا');
  // بلاغ «الماي ما ينحط على كل بلوكه»: سطح الماء صار يُبنى عليه
  assert.match(play, /const wet = raycast\(_eye, _dir, P\.reach, \(id\) => isLiquid\(id\) \|\| pickable\(id\)\);/);
  assert.match(play, /if \(wet && isLiquid\(wet\.id\) && \(!h \|\| wet\.t < h\.t - 0\.01\)\) h = wet;/);
  // الكهف: بذرته اليوم والعالم، لا يفتح بحيرة، عروقه في الجدران، ومشاعل في الطريق
  assert.match(adv, /makeCave\(\{ play, kit, rnd: rng\(hash\('cave\|' \+ worldKey \+ '\|' \+ today\)\), spawn \}\)/);
  assert.match(cave, /never open a lake into the cave/);
  assert.match(cave, /vein\(veins\.diamond, K\.ROCK_DIAMOND, 6\);/);
  assert.match(cave, /kit\.setBlock\(fx, fy, fz, fire \? K\.FIRE : K\.TORCH\); if \(kit\.lit\) kit\.lit\(fx, fy, fz, fire \? K\.FIRE : K\.TORCH\);/);
  assert.match(kit, /add\(K\.ROCK_DIAMOND, \{ tiles: 'x:rock:#7fe6f5', drop: K\.GEM, hard: 1\.1 \}/, 'صخر الألماس يعطي ألماسة');
  assert.match(craft, /\{ out: 220, n: 1, also: \[211, 222, 223\], name: 'طقم لبس الألماس \(4 قطع\)', needs: \[\[K\.GEM, 4\]\], table: true \}/, 'أربع ألماسات = الطقم كاملًا');
  assert.match(adv, /\['cave', 'انزل الكهف \(علامته على الخريطة\) وطلّع منه أي حجر ثمين'/);
  // الاسم يتغيّر من الإعدادات ويصل للغرفة؛ صاحب الغرفة يرفع لاعبًا مشرفًا
  assert.match(net, /function setName\(name\) \{/);
  assert.match(play, /btn\('name', 'احفظ الاسم'\)/);
  assert.match(net, /else if \(m\.t === 'admin' && p\.admin && typeof m\.id === 'string'\) \{/, 'أوامر المشرف تُقبل ممّن رُفع فقط');
  assert.match(net, /else if \(m\.do === 'kick' && peers\.has\(m\.id\) && m\.id !== id && !peers\.get\(m\.id\)\.admin\) drop\(m\.id, true\);/, 'المشرف لا يطرد نفسه ولا مشرفًا آخر');
  for (const t of ['خلّه مشرف', 'خلّه عادي', 'لاعب عادي']) assert.ok(net.includes(t), t);
  // تصميم الشخصية: ألوان فقط، وما يأتي من لاعب آخر يُنظَّف
  assert.match(outfits, /const HEX = \/\^#\[0-9a-fA-F\]\{6\}\$\/;/);
  assert.match(net, /cleanLook\(m\.s\.look\.c\)/);
  assert.match(adv, /<h3>صمّم شكلك<\/h3>/);
});

test('v-blockworld-gadgets: أجهزة الحقيبة الستّة، والمخلوقات الأليفة، والمفاجآت', () => {
  const kit = read('shared/kit.js'), gad = read('shared/gadgets.js'), fr = read('shared/friends.js'), ev = read('shared/events.js');
  const adv = read('shared/adventure.js'), bag = read('shared/bag.js'), save = read('shared/save.js'), play = read('shared/play.js'), craft = read('shared/craft.js');
  // الأجهزة: كلّها في القائمة ولها وصفة
  for (const [id, name] of [[240, 'كاشف الكنوز'], [241, 'كاميرا'], [242, 'الخريطة السحرية'], [243, 'شنطة إضافية'], [244, 'جهاز التاجر'], [245, 'بلورة المكان'], [246, 'بيضة تنين']]) assert.ok(kit.includes("gadget(" + id + ",") && kit.includes(name), name);
  for (const id of [240, 241, 242, 243, 244, 245]) assert.ok(craft.includes('{ out: ' + id + ', n: 1,'), 'وصفة ' + id);
  for (const u of ['camera()', 'pouch()', 'phone()', 'recall()']) assert.ok(gad.includes('    ' + u + ' {'), u);
  assert.match(play, /capture\(done\) \{ draw\(\); canvas\.toBlob\(\(b\) => done\(b\), 'image\/png'\); \}/, 'الصورة تؤخذ في إطار الرسم نفسه');
  assert.match(gad, /const rel = Math\.atan2\(dx, -dz\) - \(-st\.yaw\);/, 'سهم الكاشف نسبةً لاتّجاه نظر اللاعب');
  assert.match(gad, /return !!\(\(a && a\.gadget === what\) \|\| \(b && b\.gadget === what\)\);/, 'صحيح أو خطأ دائمًا: كان يرجع null فيبقى الكاشف والخريطة على الشاشة بعد وضعهما');
  assert.match(save, /pouch: st\.pouch\.map\(item\), petBag: st\.petBag\.map\(item\), pet: !!st\.pet, mark: st\.mark/, 'الشنطة والتنين وبلورة المكان تُحفظ');
  // المخلوقات: كلّ واحد بمهمّته
  for (const n of ['ثعلب الكريستال', 'سلحفاة الرمال', 'غزال الظلال', 'التنين الصغير']) assert.ok(fr.includes(n), n);
  assert.match(fr, /const turtle = world === 'waha' \?/, 'السلحفاة في واحة');
  assert.match(fr, /const deer = world === 'dhalam' \? make\(makeDeer\) : null;/, 'الغزال في ظلام');
  assert.match(fr, /if \(dNear\) return openStore\(st\.petBag, 'شنطة التنين'\);/);
  assert.match(fr, /else if \(d < 6\.5\) \{ hide\(deer\);/, 'الغزال يختفي إن اقترب اللاعب');
  // المفاجآت
  assert.match(ev, /const islandTime = \(\) => Math\.floor\(Date\.now\(\) \/ 60000\) % 30 < 10;/, 'الجزيرة بالساعة: الكلّ يراها في الوقت نفسه');
  assert.match(ev, /for \(const \[x, y, z, id\] of isle\.cells\) if \(w\.get\(x, y, z\) === id\) kit\.setBlock\(x, y, z, 0\);/, 'تختفي بلا أثر، وما بناه اللاعب مكانها يبقى');
  assert.match(ev, /st\.noDig = true; if \(st\.flying\) play\.setFlying\(false\);/, 'لا حفر ولا طيران في المتاهة');
  assert.match(ev, /const open = !wall\[z\]\[x\] \|\| \(Math\.abs\(x - px\) <= 0 && Math\.abs\(z - pz\) <= 0\) \|\| exit;/, 'الجدار لا يُغلق على اللاعب ولا على المخرج');
  assert.match(ev, /if \(load\('bw-msg-' \+ world\) !== today\)/, 'رسالة اليوم مرّة في اليوم');
  assert.match(ev, /window\.__GAME_SKY\.time !== 'morning' && window\.__GAME_SKY\.time !== 'noon'/, 'الغريب بعد مغيب الشمس');
  assert.match(bag, /adv\.friends = createFriends\(/);
  assert.match(bag, /adv\.events = createEvents\(/);
  assert.match(adv, /const secretsHere = SECRETS\.filter\(\(q\) => !q\[6\] \|\| q\[6\] === worldKey\);/, 'أسرار كلّ عالم له');
  assert.ok(!/[٠-٩]/.test(gad + fr + ev), 'أرقام لاتينيّة كباقي الواجهة');
});

test('v-blockworld-party: مايك، هدايا، مسابقة بناء، ومهمّة فريق', () => {
  const net = read('shared/net.js'), voice = read('shared/voice.js'), party = read('shared/party.js');
  // المايك: خطّ صوت صامت من البداية، يُشغَّل بيد اللاعب، وصاحب الغرفة يُسمع كلّ ضيف الباقين
  assert.match(net, /tx = pc\.addTransceiver\('audio', \{ direction: 'sendrecv' \}\);/);
  assert.match(net, /if \(p\.tx\) p\.tx\.direction = 'sendrecv';/);
  assert.match(voice, /let mic = null, micOn = false,/, 'المايك مطفأ حتّى يُشغَّل');
  assert.match(voice, /for \(const \[id, h\] of heard\) if \(id !== l\.id && h\.node\) h\.node\.connect\(dest\);/, 'كلّ ضيف يسمع الباقين لا نفسه');
  assert.match(voice, /catch \(e\) \{ return 'ما في إذن للمايك/);
  for (const t of ['شغّل المايك', 'صوت الربع مكتوم', 'ابدأ مسابقة بناء (5 دقايق)']) assert.ok(net.includes(t), t);
  // الرسائل بين ضيفين تمرّ بصاحب الغرفة، ولنوع واحد معروف، ويُعاد بناؤها لا تُمرَّر كما هي
  assert.match(net, /const RELAYED = new Set\(\['gift'\]\);/);
  assert.match(net, /send\(q\.dc, \{ t: m\.m\.t, item: m\.m\.item && \{ id: m\.m\.item\.id \| 0, n: 1 \}, from: id \}\);/);
  // الهديّة: غرض معروف، واحد في المرّة
  assert.match(party, /const id = m\.item && \(m\.item\.id \| 0\), it = id \? \(play\.itemOf && play\.itemOf\(id\)\) \|\| adv\.item\(id, 1\) : null;/);
  // المسابقة: لا أحد يصوّت لنفسه
  assert.match(party, /typeof m\.for === 'string' && m\.for !== from/);
  assert.match(party, /const ids = \[\.\.\.net\.others\.keys\(\)\];/);
  // مهمّة الفريق: مجموع الجميع
  assert.match(party, /for \(const \[id, p\] of net\.peers\) have \+= \(\(p\.share \|\| \[\]\)\[k\] \|\| 0\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'), /microphone=\(self\)/, 'الموقع يسمح بالمايك لصفحاته');
});


test('v-blockworld-rules: طلبات مزون — وضع اللعب والسرعة والموت، الطيران ثابت، النخلة تنقطع، فحم ونار، شخصيات', () => {
  const play = read('shared/play.js'), vit = read('shared/vitals.js'), bag = read('shared/bag.js'), cave = read('shared/cave.js'), out = read('shared/outfits.js'), idx = read('index.html'), waha = read('styles/waha/game.js'), life = read('shared/life.js'), kit = read('shared/kit.js');
  assert.match(play, /export const RULES = \{ mode: \['survival', 'creative'\], speed: \['normal', 'fast', 'slow'\], death: \['keep', 'drop', 'lose'\] \}/);
  assert.match(play, /const vy = \(\(inp\.jump \? 1 : 0\) - \(inp\.down \? 1 : 0\)\) \* P\.flyRise;/, 'الطيران ما يتبع ميلان النظر');
  assert.ok(!/Math\.sin\(st\.pitch\) \* speed/.test(play), 'المشي وأنت طاير ما يطيّحك');
  assert.match(play, /downBtn\.textContent = 'نزول'/, 'زر نزول باللمس');
  assert.match(play, /\* pace\(\)/, 'السرعة المختارة');
  assert.match(vit, /if \(d <= 0 \|\| creative\(\)\) return;/, 'الإبداعي ما شي يضرّه');
  assert.match(vit, /play\.put\(x, y, z, K\.CHEST\)/, 'الأغراض تطيح في صندوق مكان الموت');
  assert.match(bag, /if \(cat\) cat\.hidden = !creative\(\);/, 'كل البلوكات للإبداعي فقط');
  assert.match(cave, /vein\(veins\.coal, K\.ROCK_COAL, 16\);/);
  assert.match(cave, /fire \? K\.FIRE : K\.TORCH/);
  assert.match(waha, /BLOCKS\[PALM\] = \{ tiles: 'beam', kind: 'none', solid: true, pick: true \};/, 'جذع النخلة ينضرب');
  assert.match(waha, /function fellPalm\(p\)/);
  assert.ok((out.match(/free: true/g) || []).length >= 7, 'شخصيات متاحة من البداية');
  assert.match(idx, /data-rule="mode"/); assert.match(idx, /op: 'peek'/);
  assert.match(life, /function feed\(e, s\)/, 'نأكّل الحيوانات فتحبنا');
  for (const n of ['فروة', 'ريش', 'لحم دجاج', 'سمكة', 'ربيان', 'فحم', 'طحالب']) assert.ok(kit.includes("'" + n + "'"), n);
});

test('v-blockworld-zoo: حيوانات أكثر (بقرة، خروف، حصان، جمل، قطوة، كلب، غزال، أرنب، ثعلب، بطريق، سلحفاة، دلفين…) وشخصيات صور المالك', () => {
  const beasts = read('shared/beasts.js'), out = read('shared/outfits.js'), av = read('shared/avatar.js');
  for (const n of ['بقرة', 'خروف', 'حصان', 'حمار', 'جمل', 'قطوة', 'كلب', 'غزال', 'أرنب', 'ثعلب', 'ضفدع', 'دب أبيض', 'بطريق', 'سلحفاة', 'سرطان', 'ببغاء', 'دلفين', 'بطة', 'لاما', 'حمار وحشي', 'باندا', 'فهد', 'ذيب', 'نحلة', 'خفّاش', 'عنكبوت الكهف', 'سمكة منفوخة', 'أكسولوتل']) assert.ok(beasts.includes(`name: '${n}'`), n);
  for (const k of ['heartbot', 'sage', 'chrono', 'nebula', 'oracle', 'envoy', 'titan', 'weaver', 'scavenger', 'biologist', 'prospector', 'aicore']) { assert.ok(out.includes(`pic: '${k}'`), k); assert.ok(exists(`previews/heroes/${k}.webp`), 'صورة ' + k); }
  assert.match(beasts, /export function landKinds\(world, landAt\)/, 'كل حيوان في الأرض اللي تناسبه');
  assert.match(beasts, /drops: \[\[K\.MEAT, 1\], \[K\.WOOL, 2\]\]/, 'الخروف يعطي صوف');
  for (const n of ['القلب الآلي', 'حكيم المجرّة', 'جندي البر', 'رائد الفضاء', 'قائد العملاق', 'جنّية الغابة', 'فارس الجليد', 'المغامرة', 'صيّاد الزمن', 'حارسة السديم', 'عرّافة الشبكة', 'سفير المجرّة', 'قائدة العملاق', 'نسّاج الضوء', 'عالم الكائنات', 'منقّب الكويكبات', 'الآلي الفضّي', 'كاسح القفار']) assert.ok(out.includes(`name: '${n}'`), n);
  for (const part of ['faces.heart', 'faces.visor', 'faces.mask', 'faces.bubble', 'tentacles', 'wings', 'pack', 'pads']) assert.ok(av.includes(part), part);
  assert.match(out, /\['heart', 'visor', 'alien', 'mask', 'bubble', 'screen', 'goggles', 'helm', 'bot'\]\.includes\(c\.face\)/, 'الشكل اللي يجي من لاعب ثاني ينفحص');
  assert.ok(!/creeper|enderman|steve|mooshroom|sniffer|golem|كريبر|إندرمان|غولم/i.test(beasts + out), 'لا أسماء ولا مخلوقات منقولة من لعبة ثانية');
});

test('v-blockworld-farm: السرير يغيّر الليل والنهار، صيد بأنواع سمك، زراعة وسقي، قارب، علامات، معادن نادرة، كنوز مدفونة', () => {
  const farm = read('shared/farm.js'), kit = read('shared/kit.js'), play = read('shared/play.js'), adv = read('shared/adventure.js'), cave = read('shared/cave.js'), craft = read('shared/craft.js'), gad = read('shared/gadgets.js');
  assert.match(adv, /sky\.set\(toNight \? 'night' : 'morning', sky\.rain\)/, 'نوم النهار يودّي لليل (بعد شاشة النوم)');
  for (const n of ['هامور', 'صافي', 'كنعد', 'شعري', 'سمكة ذهبية', 'محارة', 'قمح', 'خبز', 'زمرّد', 'ياقوت', 'جمشت', 'سنارة', 'مرشّة ماء', 'قارب']) assert.ok(kit.includes(`'${n}'`), n);
  assert.match(farm, /const GROW = 28;/); assert.match(farm, /c\.grow \+= step \* \(wet \? 1 : 1 \/ 3\)/, 'السقي يكبّر الزرع أسرع');
  assert.match(farm, /if \(guest\(\)\) return|guest\(\)\) return/, 'صاحب الغرفة اللي يكبّر الزرع');
  assert.match(farm, /cast\.biting = 1\.4/, 'العوّامة تغطس ولها وقت');
  assert.match(play, /function enterBoat\(x, z, y\)/); assert.match(play, /function leaveBoat\(force\)/);
  assert.match(farm, /marks\.length >= 9/, 'لين 9 علامات');
  assert.match(cave, /vein\(veins\.ruby, K\.ROCK_RUBY, 4\)/);
  assert.match(adv, /hidden\.length < 4/, 'أربعة كنوز مدفونة كل يوم');
  assert.match(gad, /buriedLeft/, 'الكاشف يدلّ على المدفون');
  for (const id of ['K.ROD', 'K.CAN', 'K.BOAT', 'K.BREAD']) assert.ok(craft.includes(`out: ${id}`), id);
});

test('v-blockworld-wonders: صندوق الحظ، قرية تحت البحر، جزيرة الجمعة، بوابة عالم الديناصورات', () => {
  const wd = read('shared/wonders.js'), kit = read('shared/kit.js'), bag = read('shared/bag.js'), craft = read('shared/craft.js');
  for (const n of ['صندوق الحظ', 'حجر البوابة']) assert.ok(kit.includes(`'${n}'`), n);
  assert.match(wd, /const LUCK = \[/, 'جدول الأشياء النادرة'); assert.match(wd, /'أسطوري'/);
  assert.match(wd, /function buildVillage\(\)/); assert.match(wd, /function deepLake\(size, depth, seed, avoid\)/, 'عالم بدون بحر عميق: البحيرة تنحفر');
  assert.match(wd, /const FRIDAY = 5;/, 'الجزيرة يوم الجمعة');
  assert.match(wd, /world === 'dino' \? \(sessionStorage\.getItem\(HOME\) \|\| 'barari'\) : 'dino'/, 'البوابة تودّي للديناصورات وترجّع');
  assert.match(wd, /if \(play\.shared\)/, 'ما تروح من البوابة وانت في غرفة');
  assert.match(bag, /createWonders\(\{ play, kit, adv, world: o\.world, seaSpot: o\.seaSpot \}\)/);
  assert.ok(craft.includes('out: K.LUCKY'));
});

test('v-blockworld-dino: عالم الديناصورات وضع من محرّك البراري، ودخوله من الصفحة الأولى ومن البوابة', () => {
  const idx = read('index.html'), dm = read('styles/dino/main.js'), mode = read('styles/barari/mode.js'), dinos = read('shared/dinos.js'), room = read('api/play-room.js');
  assert.match(idx, /"dino"\]/); assert.match(idx, /data-world="dino"/);
  assert.match(dm, /__BW_MODE = 'dino'/); assert.match(dm, /import\('\.\.\/barari\/main\.js'\)/);
  assert.match(mode, /__BW_MODE/);
  for (const n of ['العملاق أبو رقبة', 'أبو ثلاث قرون', 'ملك الأنياب', 'الطاير الجلدي', 'وحش البحر القديم']) assert.ok(dinos.includes(n), n);
  assert.match(room, /'dino'/, 'الغرف تقبل عالم الديناصورات');
  assert.ok(exists('previews/dino.webp'));
});

test('v-blockworld-gear: أغراض الحقيبة كلها — معزقة ومجرفة ودرجات الحديد، درع يد وأجنحة، أكل وفرن، دلو ومقص وحبل وسرج، بوصلة وساعة وقوس وأسهم ولؤلؤة قفز وقدّاحة ودفتر وبطاقة اسم ومنظار', () => {
  const kit = read('shared/kit.js'), gear = read('shared/gear.js'), craft = read('shared/craft.js'), play = read('shared/play.js'), held = read('shared/held.js');
  for (const n of ['معول حديد', 'فأس حديد', 'سيف حديد', 'مجرفة حجر', 'مجرفة حديد', 'مجرفة ألماس', 'معزقة حجر', 'معزقة حديد', 'معزقة ألماس', 'درع يد', 'أجنحة',
    'تفاحة', 'لحم مشوي', 'تفاحة ذهبية', 'جزرة', 'بطاطس', 'بطاطس مشوية', 'فرن', 'دلو', 'دلو ماي', 'دلو حليب', 'مقص', 'حبل قيادة', 'سرج', 'بوصلة', 'ساعة', 'قوس', 'سهم', 'لؤلؤة القفزة', 'قدّاحة', 'دفتر', 'بطاقة اسم', 'منظار', 'سبيكة حديد', 'أرض محروثة']) assert.ok(kit.includes(`'${n}'`), n);
  assert.match(kit, /gear\(270 \+ i, 'iron-' \+ wear, name \+ ' حديد'/, 'لبس الحديد: خوذة وصدرية وسروال وحذاء');
  assert.ok(!/ender|إندر/i.test(kit), 'اللؤلؤة باسم من عندنا');
  assert.match(play, /st\.gliding = true/, 'الأجنحة تنزلق'); assert.match(play, /\* \(st\.ride \|\| 1\)/, 'الركوب أسرع');
  assert.match(craft, /furnace: true/); assert.match(craft, /what === 'fuel'/, 'الفرن يبي فحم أو خشب');
  for (const k of ['case K.BUCKET', 'case K.SHEARS', 'case K.LEAD', 'case K.SADDLE', 'case K.BOW', 'case K.PEARL_JUMP', 'case K.FLINT', 'case K.BOOK', 'case K.NAME_TAG', 'case K.SPYGLASS']) assert.ok(gear.includes(k), k);
  assert.match(gear, /setHome\(\)/, 'السرير يصير مكان الرجوع');
  for (const m of ['shovel', 'hoe', 'shield', 'bow', 'bucket', 'spyglass']) assert.ok(held.includes('tools.' + m), m);
});

test('أرقام العدّة ما تتكرّر: كل مكعب وكل غرض له رقمه، والمكعبات تحت 200', () => {
  const kit = read('shared/kit.js');
  const body = /export const K = \{([^}]*)\}/.exec(kit)[1];
  const pairs = [...body.matchAll(/([A-Z_0-9]+): (\d+)/g)].map((m) => [m[1], +m[2]]);
  const seen = new Map();
  for (const [k, v] of pairs) { assert.ok(!seen.has(v), k + ' و ' + seen.get(v) + ' نفس الرقم ' + v); seen.set(v, k); }
  // crops take four ids from their first: they must not run into another id
  for (const base of ['CROP0', 'CARROT0', 'POTATO0']) { const b = pairs.find((q) => q[0] === base)[1]; for (let i = 1; i < 4; i++) assert.ok(!seen.has(b + i) || seen.get(b + i) === base.slice(0, -1) + i, base + '+' + i + ' يطيح على ' + seen.get(b + i)); assert.ok(b + 3 < 200, base + ' مكعب تحت 200'); }
  assert.ok(pairs.find((q) => q[0] === 'FURNACE')[1] < 200);
});

test('v-blockworld-looks: مكان واضح لتغيير الشخصية — صفحة «الشخصيات» في الحقيبة، زر في القائمة، واختيار من الصفحة الأولى', () => {
  const bag = read('shared/bag.js'), adv = read('shared/adventure.js'), play = read('shared/play.js'), idx = read('index.html');
  assert.match(bag, /\['looks', 'الشخصيات'\]/); assert.match(bag, /adv\.looksPage\(\)/); assert.match(bag, /window\.__GAME_LOOKS = /);
  assert.match(adv, /looksPage\(\) \{/); assert.match(adv, /شخصيتك الحين/);
  assert.match(play, /btn\('looks', 'غيّر شخصيتك'\)/);
  assert.match(idx, /<section class="who">/); assert.match(idx, /localStorage\.setItem\('bw-outfit', cur\)/, 'اللي ينختار في الصفحة الأولى تلبسه اللعبة');
});

test('v-blockworld-skins: مجموعات شخصيات (العائلة، أبطال اليوم، الخيال، الأساطير، السحر) بقطع جديدة وشكل ثلاثي يدور', () => {
  const out = read('shared/outfits.js'), av = read('shared/avatar.js'), adv = read('shared/adventure.js');
  for (const n of ['البنوتة', 'الساحر الأزرق', 'الرامية الجنّية', 'الفارس الفضّي', 'القزم المحارب', 'النينجا', 'الفايكنج', 'الفرعون', 'الملك', 'الملكة المحاربة', 'الغوّاص', 'رجل الفطر', 'حارس الغابة', 'التنّين الصغير']) assert.ok(out.includes(`name: '${n}'`), n);
  assert.match(out, /export const PACKS = \[/);
  for (const h of ['wizard', 'witch', 'viking', 'crown', 'nemes', 'crest', 'mushroom', 'phones', 'leaves', 'diver', 'ninja']) assert.ok(av.includes(`HG('${h}')`), h);
  assert.match(adv, /function mountPreview\(slot\)/, 'شكل الشخصية يدور في صفحة الشخصيات'); assert.match(adv, /data-thumb/, 'كل بطاقة صورتها من شكلها');
  assert.ok(!/previews\/family|\.jpg|\.jpeg/.test(out), 'صورة البنت نفسها ما تنحط في اللعبة: شخصية مستوحاة منها بس');
});

test('v-blockworld-cars: سيارة لكل عالم، والسيارة الرياضية جايزة المهام، والمهام أسهل', () => {
  const kit = read('shared/kit.js'), cars = read('shared/cars.js'), craft = read('shared/craft.js'), adv = read('shared/adventure.js');
  for (const n of ['الروفر الكريستالي', 'عربة الصحراء', 'جيب المغامرات', 'متتبع الديناصورات', 'عربة الأشباح القوطية', 'لمسة ذهبية']) assert.ok(kit.includes(`'${n}'`), n);
  assert.match(cars, /export const CAR_OF_WORLD = \{ kawkab: K\.CAR_ROVER, waha: K\.CAR_BUGGY, barari: K\.CAR_JEEP, dino: K\.CAR_DINO, dhalam: K\.CAR_GHOST \}/);
  assert.match(craft, /unlock: \(\) => sportsEarned\(\)/, 'الرياضية ما تنصنع إلا بعد ما تنكسب');
  assert.match(adv, /if \(QUESTS\.every\(\(q\) => done\.has\(q\[0\]\)\)\) earnSports\(play\);/, 'تخلّص كل المهام تحصل الرياضية');
  assert.match(adv, /'جمّع 4 خشب'/); assert.match(adv, /'صيد حيوان واحد'/); assert.match(adv, /'وصّل المستوى 3'/);
  assert.match(cars, /if \(st\.inWater\)/, 'السيارة ما تمشي في الماي');
});
