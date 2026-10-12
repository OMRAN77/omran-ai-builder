// tests/auth-sleep-seam.test.cjs — v-time-seam: مفصل زمن لانتظار إعادة محاولة getUser في api/_lib/auth.js.
// العرض: getUser لسجلّ غائب ينام ٣٠٠ ثمّ ٦٠٠ ثمّ ٩٠٠ م.ث حقيقيّة (١٫٨ ثانية)، فاختبار share-guard الخامس وحده
// أخذ ٥٤ ثانية، وtokens-cache ٧٧ — وقت CI يُدفع انتظارًا لا فحصًا، ولا طريق للاختبار ليرى المُدَد.
// القرار: الإنتاج بلا تغيير (نفس المُدَد ونفس النوم الحقيقيّ)؛ _timing.sleep قابل للاستبدال، و
// OMRAN_TEST_FAST_SLEEP=1 — يُقرأ عند كلّ نداء — يجعل النوم صفرًا في الاختبارات التي تدفعه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'auth-sleep-seam-test-secret';
delete process.env.OMRAN_TEST_FAST_SLEEP;
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const db = new Map();
let reads = 0;
stub('api/_lib/kv.js', new Proxy({ kvGetJSON: async (k) => { reads++; return db.has(k) ? db.get(k) : null; }, kvPutJSON: async (k, v) => { db.set(k, v); } }, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
const auth = require(rp('api/_lib/auth.js'));

test('١. الإنتاج كما كان: سجلّ غائب = ٤ قراءات و٣ انتظارات ٣٠٠/٦٠٠/٩٠٠ م.ث بالترتيب', async () => {
  const real = auth._timing.sleep;
  const waits = [];
  auth._timing.sleep = async (ms) => { waits.push(ms); };
  try {
    reads = 0;
    assert.equal(await auth.getUser('ghost-user'), null);
    assert.equal(reads, 4);
    assert.deepEqual(waits, [300, 600, 900]);
    waits.length = 0; reads = 0;
    assert.equal(await auth.getUser('ghost-user', 2), null, 'عدد المحاولات الممرَّر يُحترم');
    assert.deepEqual(waits, [300]);
  } finally { auth._timing.sleep = real; }
});

test('٢. سجلّ موجود من أوّل قراءة: لا انتظار إطلاقًا', async () => {
  const real = auth._timing.sleep;
  const waits = [];
  auth._timing.sleep = async (ms) => { waits.push(ms); };
  try {
    db.set('db/users/' + encodeURIComponent('sara') + '.json', { username: 'sara' });
    const u = await auth.getUser('sara');
    assert.equal(u && u.username, 'sara');
    assert.deepEqual(waits, []);
  } finally { auth._timing.sleep = real; db.clear(); }
});

test('٣. بلا المتغيّر: النوم الافتراضيّ حقيقيّ (لا مفصل صامت في الإنتاج)', async () => {
  delete process.env.OMRAN_TEST_FAST_SLEEP;
  const t0 = Date.now();
  await auth._timing.sleep(60);
  assert.ok(Date.now() - t0 >= 50, 'نام فعلًا: ' + (Date.now() - t0) + 'ms');
});

test('٤. OMRAN_TEST_FAST_SLEEP=1 يُقرأ عند النداء: getUser لسجلّ غائب بلا ١٫٨ ثانية', async () => {
  process.env.OMRAN_TEST_FAST_SLEEP = '1';
  try {
    reads = 0;
    const t0 = Date.now();
    assert.equal(await auth.getUser('ghost-user'), null);
    assert.equal(reads, 4, 'المحاولات الأربع نفسها — المفصل يمسّ الزمن لا المنطق');
    assert.ok(Date.now() - t0 < 900, 'بلا انتظار حقيقيّ: ' + (Date.now() - t0) + 'ms (الحقيقيّ ١٨٠٠)');
  } finally { delete process.env.OMRAN_TEST_FAST_SLEEP; }
});
