// v-marsa-noor: لعبة «مرسى نور» ملفّ واحد مستقلّ — بلا خدمة خارجيّة ولا اسم مزوّد ولا رموز تعبيريّة، ولغتان متكافئتان.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const file = path.join(root, 'inspire/marsa-noor.html');
const src = fs.readFileSync(file, 'utf8');
const mod = src.slice(src.indexOf('<script type="module">'), src.lastIndexOf('</script>'));
const T = new Function(src.slice(src.indexOf('const T = {'), src.indexOf('\nconst t = ')) + '; return T;')();

test('لا شبكة إلّا محرّك العرض المثبّت بإصداره من خريطة الاستيراد، ولا مفتاح', () => {
  const urls = src.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.ok(urls.length >= 2, 'importmap');
  for (const u of urls) assert.ok(u.startsWith('https://cdn.jsdelivr.net/npm/three@0.180.0/'), u);
  assert.doesNotMatch(mod, /\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|@import|url\(/);
  assert.doesNotMatch(src, /sk-ant-|sk-or-|ghp_|github_pat_|AIza[0-9A-Za-z_-]{20}/);
  assert.match(mod, /^import \* as THREE from 'three';$/m);
  assert.match(mod, /^import \{ RoomEnvironment \} from 'three\/addons\/environments\/RoomEnvironment\.js';$/m);
});

test('لا اسم مزوّد أو نموذج ولا رمز تعبيريّ في أيّ نصّ يراه اللاعب', () => {
  const ui = [];
  const walk = (o) => { for (const k in o) typeof o[k] === 'string' ? ui.push(o[k]) : walk(o[k]); };
  walk(T);
  const shops = src.slice(src.indexOf('const SHOPS = ['), src.indexOf('];', src.indexOf('const SHOPS = [')));
  const stations = src.slice(src.indexOf('const STATIONS = ['), src.indexOf('];', src.indexOf('const STATIONS = [')));
  const html = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  const all = ui.join('\n') + shops + stations + html;
  assert.doesNotMatch(all, /claude|anthropic|gemini|google|openai|gpt|groq|kimi|openrouter|three\.js|vercel/i);
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, 'رمز تعبيريّ');
});

test('العربيّة والإنجليزيّة بالمفاتيح نفسها، وكلّ t() وكلّ $() له أصل', () => {
  const ka = Object.keys(T.ar).sort(), ke = Object.keys(T.en).sort();
  assert.deepStrictEqual(ka, ke);
  for (const k of ka) { assert.ok(String(T.ar[k]).trim(), 'ar.' + k); assert.ok(String(T.en[k]).trim(), 'en.' + k); }
  for (const m of mod.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)) assert.ok(m[1] in T.ar, 't(' + m[1] + ')');
  const ids = new Set([...src.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
  for (const m of mod.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) assert.ok(ids.has(m[1]), '$(' + m[1] + ')');
  assert.match(src, /\/\[\?&\]lang=\(\[a-z\]\{2\}\)\//, 'لغة من ?lang=');
});

test('الحفظ محميّ، وشاشة خطأ عند فشل المحرّك، والدمج بمجموعة لكلّ مادّة (فخّ mergeGeometries)', () => {
  assert.match(mod, /try \{ localStorage\.setItem\(SAVE_KEY/);
  assert.match(src, /window\.__marsaErr = function/);
  assert.match(mod, /BGU\.mergeGeometries\(geos, false\)/);
  assert.match(mod, /merged\.addGroup\(start, off - start, cur\)/);
  assert.doesNotMatch(mod, /mergeGeometries\(geos, true\)/);
  // الاتّجاه: الأمام (sin h, -cos h) والنموذج أمامه +x يدور بـ π/2 - h — في السيّارة والشبح والزحمة معًا
  assert.match(mod, /car\.rotation\.y = Math\.PI \/ 2 - V\.h/);
  assert.match(mod, /ghostCar\.rotation\.y = Math\.PI \/ 2 - ghostPlay\[i \+ 2\]/);
  assert.match(mod, /TRS\(c\.x, 0, c\.z, Math\.PI \/ 2 - c\.h\)/);
});
