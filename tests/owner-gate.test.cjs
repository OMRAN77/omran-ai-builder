process.env.AUTH_SECRET = 'synthetic-test-secret-' + 'x'.repeat(40);
process.env.MONITOR_KEY = 'synthetic-monitor-key-123';
process.env.OWNER_USERNAME = 'omran';
const { isOwner } = require('../api/_lib/_owner.js');
const { makeToken } = require('../api/_lib/auth.js');   // دالّة الختم الحقيقية
const q = (o) => ({ query: o });
const cases = [
  ['رمز المالك الحقيقي (makeToken)',        q({ token: makeToken('omran') }),               true ],
  ['رمز المالك في body',                     { body: { token: makeToken('omran') } },        true ],
  ['رمز مستخدم عادي',                        q({ token: makeToken('guest') }),               false],
  ['رمز مالك بحرف كبير OMRAN',               q({ token: makeToken('OMRAN') }),               true ],
  ['المفتاح الحقيقي',                         q({ key: 'synthetic-monitor-key-123' }),        true ],
  ['مفتاح خاطئ',                              q({ key: 'omran-monitor-2026' }),               false],
  ['مفتاح فارغ',                              q({ key: '' }),                                 false],
  ['بلا شيء',                                 q({}),                                          false],
  ['رمز مبتور',                               q({ token: 'a.b' }),                            false],
  ['طلب فارغ تمامًا',                         {},                                             false],
];
let bad = 0;
for (const [name, req, want] of cases) {
  const got = isOwner(req);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34)} متوقّع=${want} فعلي=${got}`);
}
// رمز منتهي: نختم بيدنا بصلاحية سالبة
const crypto = require('crypto');
const p = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() - 1000 })).toString('base64url');
const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
const expired = isOwner(q({ token: p + '.' + sig }));
console.log(`  ${expired === false ? '✓' : '✗'} ${'رمز مالك منتهي الصلاحية'.padEnd(34)} متوقّع=false فعلي=${expired}`);
if (expired !== false) bad++;
console.log(bad ? `\n✗ فشل ${bad}` : `\n✅ ١١/١١ — البوّابة تفتح للمالك وحده`);
process.exit(bad ? 1 : 0);
