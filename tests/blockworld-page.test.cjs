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
    for (const m of text.matchAll(/(['"(=]\s*)\/(shared|vendor|styles|previews|icons|blockworld|js|css|api)\//g)) bad.push(f + ': ' + text.slice(Math.max(0, m.index - 25), m.index + 45).replace(/\s+/g, ' '));
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
