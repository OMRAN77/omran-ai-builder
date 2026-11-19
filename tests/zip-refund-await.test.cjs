'use strict';
/* tests/zip-refund-await.test.cjs — v-zip-refund-await (فحص Desloppify ٩ نوفمبر ٢٠٢٦، بند المال؛ موافقة المالك «ايه، ابدأ» ١٠ نوفمبر).
   analyze-zip يحجز محاولة من الحصّة اليوميّة قبل العمل ويردّها إن فشل. الردّ (refundCustom، غير متزامن) كان يُنادى بلا انتظار: يُرسَل الجواب
   ثمّ تتجمّد دالّة Vercel فيضيع. والخطأ غير المتوقَّع (٥٠٠) لم يكن يردّ شيئًا. الآن الردّ يكتمل قبل الجواب في كلّ مسار فشل، ومرّة واحدة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeZip } = require('./_zip.cjs');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const events = [];
let allowed = true;
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  checkAndConsumeCustom: async () => { events.push('consume'); return allowed ? { allowed: true } : { allowed: false, reason: 'limit' }; },
  // ردّ بطيء كالشبكة الحقيقيّة: إن لم يُنتظر، يصل الجواب قبله
  refundCustom: async (token, guest, ip, provider) => { await new Promise((r) => setTimeout(r, 30)); events.push('refund:' + provider); },
  clientIp: () => '10.1.2.3',
} };
const handler = require(rp('api/_lib/analyze-zip.js'));

const call = (body, opts) => new Promise((resolve) => {
  let first = true;
  const res = { code: 200, status(c) { this.code = c; return this; }, setHeader() {},
    json(b) {
      if (opts && opts.throwOnce && first) { first = false; throw new Error('serialize failed'); }
      events.push('reply:' + this.code); resolve({ code: this.code, body: b });
    } };
  handler({ method: 'POST', headers: {}, body }, res);
});

test('١. كلّ مسار فشل بعد الحجز: الردّ يكتمل قبل الجواب', async () => {
  const cases = [
    [{ token: 't' }, 400],                                                     // لا ملف
    [{ token: 't', fileBase64: '' }, 400],
    [{ token: 't', fileBase64: Buffer.from('ليس أرشيفًا').toString('base64') }, 400], // ليس zip
    [{ token: 't', fileBase64: Buffer.alloc(3 * 1024 * 1024 + 10).toString('base64') }, 413],
  ];
  for (const [body, code] of cases) {
    events.length = 0;
    const r = await call(body);
    assert.equal(r.code, code);
    assert.deepEqual(events, ['consume', 'refund:analyze-zip', 'reply:' + code], JSON.stringify(Object.keys(body)));
  }
});

test('٢. الخطأ غير المتوقَّع بعد الحجز يردّ المحاولة مرّة واحدة ثمّ ٥٠٠', async () => {
  events.length = 0;
  const zip = makeZip([{ name: 'a.txt', data: 'hello' }]).toString('base64');
  const r = await call({ token: 't', fileBase64: zip }, { throwOnce: true });
  assert.equal(r.code, 500);
  assert.deepEqual(events, ['consume', 'refund:analyze-zip', 'reply:500']);
});

test('٣. النجاح لا يردّ، والرفض قبل الحجز لا يردّ', async () => {
  events.length = 0;
  const zip = makeZip([{ name: 'a.txt', data: 'hello' }]).toString('base64');
  const ok = await call({ token: 't', fileBase64: zip });
  assert.equal(ok.code, 200);
  assert.deepEqual(events, ['consume', 'reply:200']);
  events.length = 0; allowed = false;
  try { assert.equal((await call({ token: 't', fileBase64: zip })).code, 429); } finally { allowed = true; }
  assert.deepEqual(events, ['consume', 'reply:429']);
});
