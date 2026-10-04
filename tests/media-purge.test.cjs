'use strict';
/* v-media-purge (المالك ٤ أكتوبر: Redis المجانيّة امتلأت فرُفضت كلّ كتابة؛ أمر: «أحذف صور وملفات المشاركة القديمة…
   والحسابات والمحادثات ما تنلمس»): زرّ للمالك يحذف روابط المشاركة الأقدم من ٧ أيّام، وعمر الصور الجديدة ٧ لا ٣٠. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { purgeOldShares } = require('../api/_lib/media-purge.js');

const D = 86400;
function fakeKv(entries) { // key → TTL المتبقّي
  const store = new Map(Object.entries(entries));
  const calls = [];
  return {
    store, calls,
    kvList: async (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)),
    kvPipeline: async (cmds) => { calls.push(cmds.length); return cmds.map((c) => {
      if (c[0] === 'TTL') return store.has(c[1]) ? store.get(c[1]) : -2;
      if (c[0] === 'DEL') { let n = 0; for (const k of c.slice(1)) if (store.delete(k)) n++; return n; }
      throw new Error('أمر غير متوقّع ' + c[0]);
    }); },
  };
}

test('١. يحذف المشاركات الأقدم من ٧ أيّام فقط (ومقاطعها)، ولا يلمس الحسابات ولا المحادثات ولا الذاكرة', async () => {
  const kv = fakeKv({
    'db/img/old': 30 * D - 10 * D, 'db/img/old:0': 30 * D - 10 * D, // عمرها ١٠ أيّام
    'db/img/new': 30 * D - 2 * D,                                     // يومان
    'db/img/fresh7': 7 * D - 1 * D,                                   // كُتبت بعمر ٧ الجديد قبل يوم — لا تُحسب قديمة
    'db/img/noexp': -1,
    'db/file/old': -1, 'db/pdf/new': 7 * D - 3600,
    'db/users/u1': -1, 'db/chats/u1': -1, 'db/memory/u1': -1, 'db/oauth-claim/x': 500,
  });
  const out = await purgeOldShares(kv, { maxAgeDays: 7 });
  assert.deepEqual([...kv.store.keys()].sort(), ['db/chats/u1', 'db/img/fresh7', 'db/img/new', 'db/memory/u1', 'db/oauth-claim/x', 'db/pdf/new', 'db/users/u1']);
  assert.equal(out.deleted, 4);
  assert.deepEqual(out.byPrefix['db/img/'], { scanned: 5, deleted: 3 });
  assert.deepEqual(out.byPrefix['db/file/'], { scanned: 1, deleted: 1 });
});

test('٢. بالدفعات: ٤٥٠ مفتاحًا = طلبات قليلة لا طلب لكلّ مفتاح', async () => {
  const e = {}; for (let i = 0; i < 450; i++) e['db/img/k' + i] = 30 * D - 20 * D;
  const kv = fakeKv(e);
  const out = await purgeOldShares(kv, {});
  assert.equal(out.deleted, 450);
  assert.ok(kv.calls.length <= 6, 'طلبات: ' + kv.calls.length);
});

test('٣. عمر الصور ٧ أيّام، والمسار للمالك وحده، وزرّ «تنظيف التطبيق» القائم نفسه ينظّف عند المالك (لا إضافة جديدة) — والحزمة محدَّثة', () => {
  const img = read('api/_lib/img-share.js');
  assert.ok(img.includes('const TTL_SEC = 60 * 60 * 24 * 7;') && img.includes('ttlDays: 7'));
  const h = read('api/_lib/health.js');
  assert.ok(h.indexOf('if (!isOwner(req))') > 0 && h.indexOf('if (!isOwner(req))') < h.indexOf("req.query.purge === 'media'"), 'التحقّق من المالك قبل الحذف');
  const ps = read('js/partials-settings.js');
  assert.ok(!ps.includes('acctMediaPurge'), 'لا زرّ جديد');
  assert.ok(ps.includes('id="acctCleanupBtnEl" onclick="appFullCleanup()"'));
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    const s = read(f);
    const fn = s.slice(s.indexOf('window.appFullCleanup = function(){'));
    assert.ok(fn.indexOf("window.purgeOldMedia(); return;") > 0 && fn.indexOf("window.purgeOldMedia(); return;") < fn.indexOf('if(!confirm(msg)) return;'), f + ': المالك ينظّف قبل مسار حذف المحادثات');
  }
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("window.purgeOldMedia = async function(){") && b.includes("'/api/system?action=health&purge=media&token='"));
  assert.ok(b.includes("__b.textContent = '🧹 نظّف الآن';"));
  assert.ok(read('index.html').includes('partials-settings.js?v=687'));
});
