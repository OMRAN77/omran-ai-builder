'use strict';
/* v-image-vault (المالك ٦ سبتمبر «1000 صورة ورا بعض»): الصور الكبيرة سجلّات مستقلة في IndexedDB، وسجلّ المشاريع بلا base64 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const helpers = new Function(
  'const __swallow = () => {}; const Date_now = Date.now;' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  '; return { __vaultAssign, __vaultReplacer, __collectVaultIds, VAULT_MIN };'
)();
const big = 'data:image/png;base64,' + 'A'.repeat(200000);
const small = 'data:image/png;base64,' + 'B'.repeat(1000);
const mk = () => [{ id: 'p1', messages: [
  { role: 'user', attachments: [{ name: 'a.png', isImage: true, dataUrl: big }, { name: 's.png', isImage: true, dataUrl: small }, { name: 'f.txt', isImage: false, text: 'x' }] },
  { role: 'assistant', attachments: [{ name: 'edited.png', isImage: true, dataUrl: big }], apiImages: [{ dataUrl: big }] },
]}];

test('large images get a vault id and are stripped from the persisted copy; small ones stay inline', () => {
  const projects = mk();
  const puts = helpers.__vaultAssign(projects, 1000);
  assert.equal(puts.length, 3, 'ثلاث صور كبيرة تُكتب في المخزن');
  assert.ok(puts.every(x => /^v[0-9a-z]+_[0-9a-z]+$/.test(x.id) && x.dataUrl === big));
  const ids = new Set(puts.map(x => x.id));
  assert.equal(ids.size, 3, 'معرّفات فريدة');
  /* قبل اكتمال الكتابة (vaultPending) تبقى الصورة في النسخة المحفوظة — لا فقدان لو تعثّر المخزن */
  let copy = JSON.parse(JSON.stringify(projects, helpers.__vaultReplacer));
  assert.equal(copy[0].messages[0].attachments[0].dataUrl, big);
  puts.forEach(x => { delete x.ref.vaultPending; });
  copy = JSON.parse(JSON.stringify(projects, helpers.__vaultReplacer));
  assert.equal(copy[0].messages[0].attachments[0].dataUrl, '', 'الكبيرة تُحذف من النسخة');
  assert.equal(copy[0].messages[0].attachments[0].vaultId, puts[0].id, 'المعرّف يبقى');
  assert.equal(copy[0].messages[0].attachments[1].dataUrl, small, 'الصغيرة تبقى كما هي');
  assert.equal(copy[0].messages[1].apiImages[0].dataUrl, '', 'apiImages تُخزَّن أيضًا');
  assert.equal(copy[0].messages[0].attachments[0].vaultPending, undefined);
  /* الذاكرة لم تتغير */
  assert.equal(projects[0].messages[0].attachments[0].dataUrl, big);
  /* حفظ ثانٍ لا يعيد كتابة ما كُتب */
  assert.equal(helpers.__vaultAssign(projects, 2000).length, 0);
  assert.deepEqual([...helpers.__collectVaultIds(projects)].sort(), [...ids].sort());
});

test('save path, boot hydration and lazy render hydration are wired', () => {
  assert.match(src, /indexedDB\.open\(IDB_NAME, 2\)/);
  assert.match(src, /if\(!db\.objectStoreNames\.contains\(IDB_IMAGES\)\) db\.createObjectStore\(IDB_IMAGES\);/);
  assert.match(src, /__idbSavedAt = Date\.now\(\);\n\s+__vaultSave\(\)\.catch\(err => \{/);
  assert.match(src, /try\{ await idbImgPutAll\(puts\); puts\.forEach\(x => \{ delete x\.ref\.vaultPending; \}\); \}/);
  assert.match(src, /const copy = vaulted \? JSON\.parse\(JSON\.stringify\(state\.projects, __vaultReplacer\)\) : JSON\.parse\(JSON\.stringify\(state\.projects\)\);/);
  assert.match(src, /if\(!a\.dataUrl && a\.vaultId\)\{ idbImgGet\(a\.vaultId\)\.then\(d => \{ if\(typeof d === 'string' && d\)\{ a\.dataUrl = d; img\.src = d; \} \}\)/);
  const boot = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(boot, /await window\.__hydrateProjectImages\(state\.projects\.find\(q => q\.id === state\.currentId\)\);/);
  assert.match(boot, /window\.__vaultSweep && window\.__vaultSweep\(\);/);
  /* المسار الاحتياطي (localStorage) ما زال يحفظ الصور كاملة لأن المخزن غير متاح حينها */
  assert.match(src, /localStorage\.setItem\('aiapp_projects', __projectsToJson\(\)\);/);
});
