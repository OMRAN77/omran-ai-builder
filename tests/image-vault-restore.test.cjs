'use strict';
/* v-vault-restore (المالك ٢٣ سبتمبر «الصور تمسح من المحادثه»): صورة مخزونة في IndexedDB كانت تُعرض مكسورة أو مصغّرة
   لأنّ الاستعادة لا تعمل إلّا حين يكون dataUrl فارغًا تمامًا — والمرآة المنحّفة/السيرفر يضعان «[media]» أو المصغّرة،
   وpurgeOldImages يضع purged=true. الآن أيّ صورة لها vaultId وبديلها أقصر من VAULT_MIN تُستعاد من المخزن. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const make = (vault) => new Function('vault',
  'const __swallow = () => {};' +
  slice('const VAULT_MIN = 150000;', 'function idbImgPutAll(puts){') +
  'function idbImgGetMany(ids){ const o = {}; ids.forEach(id => { if(vault[id]) o[id] = vault[id]; }); return Promise.resolve(o); }' +
  slice('async function hydrateProjectImages(p, fromIdx){', 'window.__hydrateProjectImages') +
  '; return { __vaultDegraded, __vaultReplacer, hydrateProjectImages };'
)(vault);
const big = 'data:image/png;base64,' + 'A'.repeat(200000);
const thumb = 'data:image/jpeg;base64,' + 'T'.repeat(30000);

test('١. البديل المتدهور («[media]»، مصغّرة، فراغ، purged) مع معرّف = يُستعاد؛ الأصل والصغيرة بلا معرّف لا تُلمس', () => {
  const { __vaultDegraded } = make({});
  assert.equal(__vaultDegraded({ vaultId: 'v1', dataUrl: '[media]' }), true);
  assert.equal(__vaultDegraded({ vaultId: 'v1', dataUrl: thumb }), true);
  assert.equal(__vaultDegraded({ vaultId: 'v1', dataUrl: '', purged: true }), true);
  assert.equal(__vaultDegraded({ vaultId: 'v1' }), true);
  assert.equal(__vaultDegraded({ vaultId: 'v1', dataUrl: big }), false, 'الأصل في الذاكرة');
  assert.equal(__vaultDegraded({ vaultId: 'v1', dataUrl: '', vaultPending: true }), false, 'لم تُكتب بعد');
  assert.equal(__vaultDegraded({ dataUrl: thumb }), false, 'صغيرة بلا معرّف هي الأصل');
});

test('٢. الإقلاع من المرآة المنحّفة: المرفقات وapiImages تعود للأصل من المخزن ويسقط purged', async () => {
  const { hydrateProjectImages } = make({ v1: big, v2: big, v3: big, v4: big });
  const p = { id: 'p', messages: [
    { role: 'assistant', attachments: [{ isImage: true, vaultId: 'v1', dataUrl: '[media]' }], apiImages: [{ vaultId: 'v2', dataUrl: '[media]' }] },
    { role: 'user', attachments: [{ isImage: true, vaultId: 'v3', dataUrl: thumb }, { isImage: true, vaultId: 'v4', dataUrl: '', purged: true }, { isImage: true, vaultId: 'gone', dataUrl: thumb }] },
  ] };
  await hydrateProjectImages(p);
  const [a1, a3, a4, lost] = [p.messages[0].attachments[0], p.messages[1].attachments[0], p.messages[1].attachments[1], p.messages[1].attachments[2]];
  assert.equal(a1.dataUrl, big);
  assert.equal(p.messages[0].apiImages[0].dataUrl, big, 'نسخة المحرّر تعود أيضًا');
  assert.equal(a3.dataUrl, big, 'المصغّرة تُستبدل بالأصل');
  assert.equal(a4.dataUrl, big); assert.equal(a4.purged, undefined, 'لا بطاقة «حُذفت الصورة»');
  assert.equal(lost.dataUrl, thumb, 'ما ليس في المخزن يبقى على بديله — لا يُمسح');
});

test('٣. الحفظ لا يكتب «[media]» فوق المعرّف، والعرض لا يطلب «[media]» كعنوان صورة', () => {
  const { __vaultReplacer } = make({});
  const copy = JSON.parse(JSON.stringify([{ vaultId: 'v1', dataUrl: '[media]' }, { dataUrl: '[media]' }], __vaultReplacer));
  assert.equal(copy[0].dataUrl, '');
  assert.equal(copy[1].dataUrl, '[media]', 'بلا معرّف لا يتغيّر شيء');
  assert.match(src, /img\.src = a\.dataUrl === '\[media\]' \? '' : \(a\.dataUrl \|\| ''\);/);
  assert.match(src, /\} else if\(a\.isImage && a\.purged && !a\.vaultId\)\{/);
  assert.match(src, /function renderMessages\(keepScroll\)\{\n.*\n\s+try\{ const __hp = getCurrent\(\); if\(__hp\) hydrateProjectImages\(__hp\)/);
});
