// v-unchanged-cap (١١ أكتوبر ٢٠٢٦، ثغرات الفلوس): «لم يُنفَّذ» (٤٢٢) كان يردّ حصّة الضيف/نقاط الحساب بلا حدّ بعد
// نداءين مدفوعين (برو ثمّ GPT) — ٨ دورات = ١٦ نداءً مدفوعًا والعدّاد صفر. الآن أوّل ٢ في اليوم لكلّ فاعل تُردّ
// (والرسالة «ما انحسبت عليك» صادقة)، وبعدها يبقى الخصم برمز لا يدّعي الردّ. المعالج الحقيقيّ بشبكة ومحاسبة محاكاة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const { PNG } = require('pngjs');
function mk(shift) {
  const p = new PNG({ width: 64, height: 64 });
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = ((i / 4) % 64 * 4 + shift) % 256; p.data[i + 1] = shift ? 20 : 120; p.data[i + 2] = shift ? 40 : 200; p.data[i + 3] = 255; }
  return PNG.sync.write(p).toString('base64');
}
const SRC = mk(0), EDITED = mk(128);

process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_VERIFY; delete process.env.IMAGE_CAPTION; delete process.env.IMAGE_UNCHANGED_FREE;
const store = new Map();
const ledger = [];
const kv = {
  kvGetJSON: async () => null,
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, Number(v)); return true; },
  kvIncr: async (k) => { const n = (store.get(k) || 0) + 1; store.set(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = (store.get(k) || 0) - by; store.set(k, n); return n; },
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', kv);
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: (req) => (req.headers['x-forwarded-for'] || null), checkAndConsume: async () => ({ allowed: true }) });
const balance = new Map();
stub('api/_lib/points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ owner: 'omran', sara: 'sara' })[t] || null,
  isOwnerUsername: (u) => u === 'omran',
  spendPoints: async (u, amt) => { if (u === 'omran') return { ok: true, owner: true }; const b = balance.get(u); if (b < amt) return { ok: false, points: b }; balance.set(u, b - amt); ledger.push(['spend', u, amt]); return { ok: true, points: b - amt }; },
  refundPoints: async (u, amt) => { balance.set(u, balance.get(u) + amt); ledger.push(['refund', u, amt]); },
});
stub('api/_lib/_mediaPlans.js', { imageQuality: async () => null });
stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {} });
const handler = require(rp('api/_lib/maha-image.js'));
const giveback = require(rp('api/_lib/image-giveback.js'));

// same = المحرّكان يعيدان المصدر نفسه (ثابت بكسليًّا)؛ ok = صورة متغيّرة وحكم «نُفّذ»؛ fail = عطب المزوّد (٥٠٠).
// judgeSays: حكم الرؤية لكلّ مرشّح (التوليد بلا مصدر يُرفض بالحكم وحده، لا بالبكسل).
let mode = 'same', paid = 0, judgeSays = 'done';
async function run(body, ip) {
  const save = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('gemini-flash-latest')) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts: [judgeSays, judgeSays], pick: 0, scope: 'small', report: 'ok', text: 'none' }) }] } }] });
    assert.match(u, /generativelanguage\.googleapis\.com|api\.openai\.com\/v1\/images/, 'لا نداء يفلت من المحاكاة');
    paid++;
    if (mode === 'fail') return Response.json({ error: { message: 'boom' } }, { status: 500 });
    const out = mode === 'same' ? SRC : EDITED;
    return u.includes('openai') ? Response.json({ data: [{ b64_json: out }] }) : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: out } }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  const before = paid;
  try {
    await handler({ method: 'POST', headers: ip ? { 'x-forwarded-for': ip } : {}, body: Object.assign({ prompt: 'Change the background to deep red', userText: 'غيّر الخلفية إلى أحمر غامق', editImageBase64: SRC, editMimeType: 'image/png' }, body) }, res);
  } finally { global.fetch = save; }
  return { status, json, paid: paid - before };
}
const reset = () => { store.clear(); ledger.length = 0; paid = 0; mode = 'same'; judgeSays = 'done'; };
const day = new Date().toISOString().slice(0, 10);
const capKeys = () => [...store.keys()].filter((k) => k.startsWith('abuse:img-unchanged:'));

test('١. الزائر: أوّل ٢ «لم يُنفَّذ» تُردّ، بعدها تُحتسب، ثمّ ٤٠٢ بلا أيّ نداء مدفوع (كانت ٨/٨ بعدّاد صفر)', async () => {
  reset();
  const r = [];
  for (let i = 0; i < 8; i++) r.push(await run({ guestId: 'guest_loop01' }, '6.6.6.6'));
  assert.deepEqual(r.map((x) => x.json.error), ['image_unchanged', 'image_unchanged', 'image_edit_no_change', 'image_edit_no_change', 'image_edit_no_change', 'guest_image_used', 'guest_image_used', 'guest_image_used']);
  assert.deepEqual(r.map((x) => x.paid), [2, 2, 2, 2, 2, 0, 0, 0]);
  assert.ok(r.slice(0, 5).every((x) => x.status === 422 && x.json.retryable === false), 'لا إعادة تلقائيّة من العميل');
  assert.equal(store.get('db/points/guest-image/guest_loop01/count'), 3);
  assert.equal(store.get('db/points/guest-image-ip/6.6.6.6/' + day), 3);
});

test('٢. تبديل guestId من الشبكة نفسها لا يفتح ردًّا جديدًا (مفتاح الشبكة يحسم)', async () => {
  reset();
  const r = [];
  for (let i = 0; i < 6; i++) r.push((await run({ guestId: 'guest_rot' + i + 'xx' }, '7.7.7.7')).json.error);
  assert.deepEqual(r, ['image_unchanged', 'image_unchanged', 'image_edit_no_change', 'image_edit_no_change', 'image_edit_no_change', 'guest_image_used']);
  assert.equal(paid, 10, 'سقف التكلفة لكلّ شبكة يوميًّا: (٣ + ٢) × ٢');
});

test('٣. عرض المكتب (شبكة واحدة، زوّار مختلفون): ثابتان مردودان ثمّ ٣ صور ناجحة كما اليوم', async () => {
  reset();
  const plan = ['ok', 'same', 'ok', 'same', 'ok'];
  const out = [];
  for (let i = 0; i < plan.length; i++) { mode = plan[i]; out.push((await run({ guestId: 'office_guest' + i }, '10.0.0.1')).status); }
  assert.deepEqual(out, [200, 422, 200, 422, 200]);
  assert.equal(store.get('db/points/guest-image-ip/10.0.0.1/' + day), 3, 'الثابتان لم يأكلا حصّة المكتب');
});

test('٤. الحساب بالنقاط: ردّان في اليوم ثمّ يُخصم، والرسالة لا تدّعي «ما انحسبت»', async () => {
  reset(); balance.set('sara', 70);
  const r = [];
  for (let i = 0; i < 5; i++) r.push(await run({ token: 'sara' }));
  assert.deepEqual(r.map((x) => x.json.error), ['image_unchanged', 'image_unchanged', 'image_edit_no_change', 'image_edit_no_change', 'image_edit_no_change']);
  assert.equal(balance.get('sara'), 10);
  assert.deepEqual(ledger.filter((l) => l[0] === 'refund'), [['refund', 'sara', 20], ['refund', 'sara', 20]]);
  assert.equal((await run({ token: 'sara' })).json.error, 'points_insufficient');
  // يوم جديد = سقف جديد
  assert.equal(await giveback.unchangedGiveback(['u:sara'], { kv, now: Date.now() + 86400000 }), true);
});

test('٤ب. التوليد بلا صورة مصدر: بعد السقف image_generation_failed لا image_edit_no_change', async () => {
  reset(); balance.set('sara', 200); mode = 'ok'; judgeSays = 'not_done';
  const errs = [];
  for (let i = 0; i < 3; i++) errs.push((await run({ token: 'sara', editImageBase64: undefined, editMimeType: undefined, prompt: 'Draw a red cat', userText: 'ارسم قطة حمراء' })).json);
  assert.deepEqual(errs.map((j) => j && j.error), ['image_unchanged', 'image_unchanged', 'image_generation_failed']);
  assert.equal(balance.get('sara'), 180, 'ردّان ثمّ خصم واحد');
  assert.equal(errs[2].retryable, false, 'لا إعادة تلقائيّة لتوليد رفضه الحكم مرّتين (كانت ~٤ نداءات مدفوعة لكلّ طلب من أداة الوكيل)');
});

test('٥. عطب المزوّد (لا صورة مدفوعة) يُردّ دائمًا ولا يمسّ السقف؛ المالك لا يمسّه؛ عطب KV = ردّ', async () => {
  reset(); balance.set('sara', 70); mode = 'fail';
  for (let i = 0; i < 4; i++) assert.equal((await run({ token: 'sara' })).status, 502);
  assert.equal(balance.get('sara'), 70);
  for (let i = 0; i < 4; i++) assert.equal((await run({ guestId: 'guest_fail01' }, '8.8.8.8')).status, 502);
  assert.equal(store.get('db/points/guest-image/guest_fail01/count'), 0);
  assert.equal(capKeys().length, 0);
  mode = 'same';
  for (let i = 0; i < 3; i++) assert.equal((await run({ token: 'owner' })).json.error, 'image_unchanged');
  assert.equal(capKeys().length, 0, 'المالك غير مخصوم فلا عدّ');
  const broken = { kvSetIfAbsent: async () => { throw new Error('down'); }, kvIncr: async () => 1, kvDecrBy: async () => 0 };
  assert.equal(await giveback.unchangedGiveback(['u:x'], { kv: broken }), true);
});

test('٦. الضبط بالبيئة: IMAGE_UNCHANGED_FREE (افتراضيًّا ٢؛ ٠ = لا ردّ؛ قيمة فاسدة = ٢)', async () => {
  assert.equal(giveback.freeLimit({}), 2);
  assert.equal(giveback.freeLimit({ IMAGE_UNCHANGED_FREE: '0' }), 0);
  assert.equal(giveback.freeLimit({ IMAGE_UNCHANGED_FREE: '5' }), 5);
  assert.equal(giveback.freeLimit({ IMAGE_UNCHANGED_FREE: 'x' }), 2);
  // التجاوز في هويّة واحدة يُرجع ما زيد في الهويّات الأخرى في النداء نفسه
  reset();
  assert.equal(await giveback.unchangedGiveback(['g', 'ip'], { kv, limit: 1 }), true);
  assert.equal(await giveback.unchangedGiveback(['g2', 'ip'], { kv, limit: 1 }), false);
  assert.deepEqual(capKeys().map((k) => store.get(k)), [1, 1, 0], 'g=1 · ip=1 · g2 أُرجع إلى ٠');
});

// ٧. المراجعة: حلقات الإعادة التلقائيّة في الواجهة كانت تعيد بعد ٤٢٢ المحتسب (retryable:false) و٤٠٢ — فبعد السقف
// يدفع المستخدم الأمين ٢–٣ مرّات بلا صورة. الحلقات الثلاث مستخرجة نصًّا من js/app-09-attach.js وتُشغَّل بـfetch محاكى.
const fs = require('node:fs');
const vm = require('node:vm');
function loopAt(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'الحلقة غير موجودة: ' + head);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('حلقة غير مغلقة: ' + head);
}
async function runLoop(code, decl, replies) {
  let n = 0;
  const fetch = async () => {
    const r = replies[Math.min(n++, replies.length - 1)];
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  const ctx = {
    fetch, setTimeout: (f) => f(), Date, String, JSON, Promise,
    __runCtl: { signal: null }, authGet: () => 't', window: { getGuestId: () => 'g' },
    __charImg: { b64: 'x', mime: 'image/png' }, __cartoonPrompt: 'p', prompt: 'p', text: 'p',
    __genTextSpec: { visualPrompt: 'p' },
  };
  await vm.runInNewContext('(async () => { ' + decl + '\n' + code + '\n})()', ctx);
  return n;
}
test('٧. الواجهة: الخصم الباقي (٤٢٢ بـretryable:false) أو ٤٠٢ يوقف الإعادة التلقائيّة؛ العطل المؤقّت وعطل الشبكة المردود يُعادان كما كان', async () => {
  const src = fs.readFileSync(rp('js/app-09-attach.js'), 'utf8');
  const loops = [
    ['كرتون', loopAt(src, 'for(let __ct = 0; __ct < 2 && !__cartoonB64; __ct++)'), "let __cartoonB64 = '', __cartoonMime = '';", 2],
    ['معماريّ', loopAt(src, 'for(let __t3 = 0; __t3 < 3 && !__k; __t3++)'), 'let __d = {}; let __k = false;', 3],
    ['توليد', loopAt(src, 'for(let __t2 = 0; __t2 < 2 && !__gOk; __t2++)'), 'let __gData = {}; let __gOk = false; const __gT0 = Date.now();', 2],
  ];
  const kept = { status: 422, body: { error: 'image_generation_failed', retryable: false } };
  const broke = { status: 402, body: { error: 'insufficient' } };
  const transient = { status: 500, body: { error: 'upstream', retryable: true } };
  const bare = { status: 502, body: {} };
  // المراجعة بعد الدمج: انقطاع الشبكة عند كلّ المحرّكات يُردّ ويُوسَم retryable:false (maha-image.js) — ليس خصمًا باقيًا فيُعاد
  const netDown = { status: 502, body: { error: 'image_generation_failed', retryable: false } };
  const noKey = { status: 503, body: { error: 'image_generation_failed', retryable: false } };
  for (const [name, code, decl, max] of loops) {
    assert.equal(await runLoop(code, decl, [kept]), 1, name + ': ٤٢٢ المحتسب نداء واحد');
    assert.equal(await runLoop(code, decl, [broke]), 1, name + ': ٤٠٢ نداء واحد');
    assert.equal(await runLoop(code, decl, [transient]), max, name + ': المؤقّت يُعاد');
    assert.equal(await runLoop(code, decl, [bare]), max, name + ': ردّ بلا جسم يُعاد');
    assert.equal(await runLoop(code, decl, [transient, kept]), 2, name + ': مؤقّت ثمّ نهائيّ يتوقّف');
    assert.equal(await runLoop(code, decl, [netDown]), max, name + ': عطل الشبكة المردود يُعاد كما قبل الطلب');
    assert.equal(await runLoop(code, decl, [noKey]), max, name + ': ٥٠٣ قبل الخصم يُعاد كما قبل الطلب');
  }
});
