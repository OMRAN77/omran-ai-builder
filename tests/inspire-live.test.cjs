// v-live-cards: بطاقتا «تجارب حيّة» في الإلهام — ١٤ لغة، مختبر السيّارات للمالك وحده، وتُفتحان بإطار من النطاق نفسه.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-35-inspire.js'), 'utf8');
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne', 'ml', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];
const block = src.slice(src.indexOf('const INSPIRE_LIVE = ['), src.indexOf('(function(){\n  const ID'));
const LIVE = new Function(block + '; return { INSPIRE_LIVE, INSPIRE_LIVE_TXT };')();

test('كلّ نصّ بالأربع عشرة لغة', () => {
  for (const c of LIVE.INSPIRE_LIVE) for (const k of ['t', 'd']) for (const l of LANGS) assert.ok(String(c[k][l] || '').trim(), c.id + '.' + k + '.' + l);
  for (const l of LANGS) assert.ok(LIVE.INSPIRE_LIVE_TXT.t[l], 'section.' + l);
});
test('المدينة للجميع ومختبر السيّارات للمالك، والصور موجودة', () => {
  const byId = Object.fromEntries(LIVE.INSPIRE_LIVE.map((c) => [c.id, c]));
  assert.ok(!byId.real3d.owner); assert.strictEqual(byId['car-lab'].owner, true);
  for (const c of LIVE.INSPIRE_LIVE) {
    assert.ok(fs.existsSync(path.join(root, 'assets/inspire/live', c.id + '.jpg')), c.id + '.jpg');
    assert.ok(fs.existsSync(path.join(root, c.src.slice(1))), c.src);
  }
  assert.match(src, /INSPIRE_LIVE\.filter\(\(c\) => !c\.owner \|\| liveOwner\(\)\)/);
});
test('تُفتح بإطار من النطاق نفسه مع لغة التطبيق، وEsc يغلقها', () => {
  assert.match(src, /fr\.src = item\.src \+ .*'lang=' \+ encodeURIComponent/);
  assert.doesNotMatch(src, /'Escape'/, 'لا مستمع Esc خاصّ');
  assert.match(src, /esc\.id = 'inspireLiveEsc'; esc\.hidden = true; esc\.onclick = closeInspireLive;/);
  assert.match(fs.readFileSync(path.join(root, 'js/app-05-swipe-back.js'), 'utf8'), /inspireLive: 'inspireLiveEsc'/);
  const r3 = fs.readFileSync(path.join(root, 'inspire/real3d.html'), 'utf8');
  assert.match(r3, /new URLSearchParams\(location\.search\)\.get\('lang'\)/);
});

test('v-real-modes: بطاقتا المطاردة والدرون تفتحان المدينة الحقيقيّة بوضعهما، والوضعان موصولان', () => {
  assert.match(src, /const REAL_MODES = \{ chase: 'chase', drone: 'drone' \}/);
  assert.match(src, /REAL_MODES\[b\.dataset\.id\] \? openInspireLive\('real3d', REAL_MODES\[b\.dataset\.id\]\)/);
  assert.match(src, /'&mode=' \+ encodeURIComponent\(mode\)/);
  const r3 = fs.readFileSync(path.join(root, 'inspire/real3d.html'), 'utf8');
  const md = fs.readFileSync(path.join(root, 'inspire/real3d-modes.js'), 'utf8');
  assert.match(r3, /import \{ initModes \} from '\.\/real3d-modes\.js\?v=\d+'/);
  assert.match(r3, /START_MODE === 'drone'/); assert.match(r3, /START_MODE === 'chase'/);
  assert.match(md, /const N_GATES = 6, N_RINGS = 8/);
  assert.match(md, /0\.6 \* \(Math\.min\(a\.y, b\.y\) - ground\)/); // الحلقة على ٦٠٪ من أقصر البرجين
});
