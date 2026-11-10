// tests/rename-spend-lock.test.cjs — v-sec-rename-spend (مراجعة أمنيّة ٢٥ أكتوبر): خصم النقاط يُرفض
// ما دام قفل تغيير الاسم قائمًا، فلا يضيع خصمٌ بالاسم القديم أثناء نقل الرصيد (نسخ ثمّ حذف).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'rename-spend-secret';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvPipeline: async () => [], kvExpire: async () => {}, kvGetJSON: async () => null, kvPutJSON: async () => {},
});
mock('api/_lib/auth.js', { getUser: async () => ({ username: 'sami', points: 100 }), putUser: async () => {}, isBanned: async () => false });
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/_owner.js', { ownerList: () => ['omran'], isOwner: () => false, isOwnerName: () => false });

const points = require(path.join(root, 'api/_lib/points.js'));

test('spendPoints يُرفض أثناء قفل تغيير الاسم ثمّ يعمل بعد رفعه', async () => {
  store.set('points:sami', '100');
  // لا قفل → الخصم يعمل
  const ok = await points.spendPoints('sami', 10, 'image');
  assert.equal(ok.ok, true, 'بلا قفل: الخصم يمرّ');
  // قفل تغيير الاسم قائم → الخصم يُرفض بسبب renaming (لا يمسّ الرصيد)
  store.set('db/rename-lock/sami', '1');
  const during = await points.spendPoints('sami', 10, 'image');
  assert.equal(during.ok, false);
  assert.equal(during.reason, 'renaming', 'أثناء القفل: يُرفض renaming');
  assert.equal(Number(store.get('points:sami')), 90, 'الرصيد لم يُمسّ أثناء القفل');
  // رُفع القفل → الخصم يعمل من جديد
  store.delete('db/rename-lock/sami');
  const after = await points.spendPoints('sami', 10, 'image');
  assert.equal(after.ok, true, 'بعد رفع القفل: الخصم يمرّ');
  assert.equal(Number(store.get('points:sami')), 80);
});
