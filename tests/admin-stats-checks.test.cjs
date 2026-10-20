'use strict';
/* tests/admin-stats-checks.test.cjs — v-stats-checks (تدقيق ١٨ أكتوبر، لقطة ٠٤٤: «حقيقيّة: 114، اختبار: 0» وفيها ٢٣ حساب فحص آليّ
   zzcheck… محسوبة حقيقيّة؛ وأمر المالك ٢٠ أكتوبر، الدفعة ٢: «الإحصائيات ما تحسب حسابات الفحص»).
   حسابات الفحص (zzcheck…) والاختبار خارج كلّ رقم في لوحة المالك — الحسابات، التسجيل باليوم، الأحدث، رسائل اليوم والكلّ والمزوّد
   والأكثر نشاطًا — وmanageableUsers كما كانت حرفيًّا (منها الحظر والحذف و«🧹 حذفها كلها»). مأخوذ من حزمة a9 في فرع ten-a وموسَّع. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { const id = rp(f); require.cache[id] = { id, filename: id, loaded: true, exports }; };

const today = new Date().toISOString().slice(0, 10);
const USERS = {
  alice: { createdAt: '2026-10-01T00:00:00Z', email: 'a@x.com' },
  bob: { createdAt: '2026-10-02T00:00:00Z', banned: true },
  zzcheck_1: { createdAt: '2026-10-03T00:00:00Z' },
  zzcheck_2: { createdAt: '2026-10-04T00:00:00Z' },
  ZZCHECK_3: { createdAt: '2026-10-05T00:00:00Z' },
  omran: { createdAt: '2026-01-01T00:00:00Z' },
  omran_dev: { createdAt: '2026-01-02T00:00:00Z' },
};
// عدّادات الرسائل: db/usage/tally/<user_YYYY-MM-DD_provider>/<YYYY-MM-DD>
const TALLY = {
  ['alice_' + today + '_claude']: 5,
  ['bob_' + today + '_gemini']: 2,
  ['zzcheck_1_' + today + '_claude']: 40,
  ['omran_dev_' + today + '_groq']: 9,
  ['alice_2026-10-01_claude']: 3,
};
const tallyKey = (k) => 'db/usage/tally/' + encodeURIComponent(k) + '/' + k.split('_').slice(-2, -1)[0];
stub('api/_lib/kv.js', {
  kvList: async (p) => (p === 'db/users/' ? Object.keys(USERS).map((u) => 'db/users/' + encodeURIComponent(u) + '.json')
    : p === 'db/usage/tally/' ? Object.keys(TALLY).map(tallyKey) : []),
  kvGetJSON: async (k) => { const comp = decodeURIComponent(String(k).replace(/^db\/usage\/tally\//, '')).split('/')[0]; return TALLY[comp] == null ? null : TALLY[comp]; },
});
stub('api/_lib/auth.js', { getUserOnce: async (u) => USERS[u] || null });
stub('api/_lib/_session.js', { sessionUser: (t) => (t === 'owner-tok' ? 'omran' : '') });
const stats = require(rp('api/_lib/admin-stats.js'));

function call(token) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, setHeader() {}, end(b) { resolve({ code: this.statusCode, body: JSON.parse(b) }); } };
    stats({ query: { token }, body: {} }, res);
  });
}

test('١. حسابات الفحص اختبارٌ في العدد: حقيقيّة ٣ (alice وbob والمالك) واختبار ٤ (omran_dev وثلاثة zzcheck)', async () => {
  const r = await call('owner-tok');
  assert.equal(r.code, 200);
  assert.equal(r.body.totalAccounts, 7);
  assert.equal(r.body.realAccounts, 3);
  assert.equal(r.body.testAccounts, 4);
});

test('٢. ولا في بقيّة الأرقام: التسجيل باليوم، الأحدث، رسائل اليوم والكلّ، المزوّد، والأكثر نشاطًا', async () => {
  const b = (await call('owner-tok')).body;
  assert.deepEqual(Object.keys(b.signupsByDay).sort(), ['2026-01-01', '2026-10-01', '2026-10-02']);
  assert.ok(!b.recentUsers.some((u) => /^zzcheck/i.test(u.username)), JSON.stringify(b.recentUsers));
  assert.equal(b.messagesToday, 7, 'alice ٥ + bob ٢ — لا ٤٠ zzcheck ولا ٩ omran_dev');
  assert.equal(b.totalMessagesAllTime, 10);
  assert.deepEqual(b.perProviderToday, { claude: 5, gemini: 2 });
  assert.deepEqual(b.topUsersToday.map((u) => u.username), ['alice', 'bob']);
});

test('٣. قائمة الإدارة كما كانت حرفيًّا (فيها حسابات الفحص لزرّ «حذفها كلها»)، وغير المالك 403', async () => {
  const r = await call('owner-tok');
  assert.deepEqual(r.body.manageableUsers.map((u) => u.username), ['ZZCHECK_3', 'zzcheck_2', 'zzcheck_1', 'bob', 'alice']);
  assert.equal(r.body.manageableUsers.find((u) => u.username === 'bob').banned, true);
  assert.equal((await call('nope')).code, 403);
});
