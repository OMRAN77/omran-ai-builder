'use strict';
/* v-redis-capacity (المالك ٤ أكتوبر: لقطة «DB capacity quota exceeded» ثمّ «التطبيق نظيف مافيه أي شي — شوف المشكلة»):
   القاعدة ممتلئة والتنظيف لا يجد ما يحذفه، فالجاني خارج روابط المشاركة. هذا الملفّ: (١) «ما يملأ القاعدة؟» قياس بالقراءة فقط
   وللمالك وحده، (٢) معاينات الاستوديو (٢٬٦٠٠ خيار تُحفظ في Redis بلا انتهاء) لا تُولَّد بمال حين لا تُحفظ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.OPENAI_API_KEY = 'test-openai-key';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };

const FULL = 'Upstash error: ERR DB capacity quota exceeded. Threshold: 268435456 bytes, Usage: 274604636 bytes. See for details';
const cmds = [];            // كلّ أمر وصل Redis المزيّف
let setIfAbsentError = null; // خطأ يرميه kvSetIfAbsent إن وُضع
const raw = new Map();
stub('api/_lib/kv.js', {
  kvList: async () => ['studio:preview:v2:hair:a', 'studio:preview:v2:hair:b', 'studio:preview:v2:nails:c', 'db/chats/ali.json', 'db/chats/sara.json', 'db/img/xyz', 'db/img/xyz:0', 'db/users/ali.json', 'points:omran', 'agent/tool/c1', 'db/health/check.json'],
  kvPipeline: async (list) => { list.forEach((c) => cmds.push(c)); const sizes = { 'studio:preview:v2:hair:a': 150000, 'studio:preview:v2:hair:b': 140000, 'studio:preview:v2:nails:c': 130000, 'db/chats/ali.json': 90000, 'db/chats/sara.json': 3000, 'db/img/xyz': 50, 'db/img/xyz:0': 600000, 'db/users/ali.json': 400, 'points:omran': 3 }; return list.map((c) => (c[1] === 'agent/tool/c1' ? null : (sizes[c[1]] || 0))); },
  kvGetJSON: async () => null,
  kvPutJSON: async () => { cmds.push(['PUT']); }, kvDel: async () => { cmds.push(['DEL']); }, kvExpire: async () => {}, kvIncr: async () => 1,
  kvGetRaw: async (k) => (raw.has(k) ? raw.get(k) : null),
  kvSetRaw: async (k, v) => { cmds.push(['SETRAW', k]); raw.set(k, v); },
  kvSetIfAbsent: async () => { if (setIfAbsentError) throw new Error(setIfAbsentError); return true; },
});
stub('api/_lib/_owner.js', { isOwner: (req) => !!(req.query && req.query.owner === '1'), isOwnerName: (u) => u === 'omran', ownerList: () => ['omran'] });
const { redisUsage, groupOf } = require(rp('api/_lib/redis-usage.js'));
const health = require(rp('api/_lib/health.js'));
const studio = require(rp('api/_lib/studio-preview.js'));

const call = (handler, query) => new Promise((resolve) => {
  const headers = {};
  const res = { code: 200, setHeader(k, v) { headers[k] = v; }, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j, headers }); return this; }, end() { resolve({ code: this.code, headers }); return this; } };
  handler({ method: 'GET', query, headers: {} }, res);
});

test('١. عائلة المفتاح: الخطّ المائل أوّل مقطعين، والنقطتان أوّل مقطع، والمقطع بعد «:» لا يفلت', () => {
  const cases = {
    'studio:preview:v2:hair:x': 'studio', 'db/chats/ali.json': 'db/chats', 'db/img/xyz:0': 'db/img', 'db/users/u.json': 'db/users',
    'points:omran': 'points', 'agent/tool/c1': 'agent/tool', 'living/gap/ali': 'living/gap', 'plain.json': 'plain', 'db/health/check.json': 'db/health',
  };
  for (const [k, g] of Object.entries(cases)) assert.equal(groupOf(k), g, k);
});

test('٢. القياس: العائلات مرتّبة بالبايتات، وأكبر المفاتيح، وغير النصّيّ بلا بايتات — بأمرَي SCAN/STRLEN فقط', async () => {
  cmds.length = 0;
  const kv = require(rp('api/_lib/kv.js'));
  const u = await redisUsage(kv);
  assert.equal(u.totalKeys, 11);
  assert.equal(u.scanned, 11);
  assert.equal(u.truncated, false);
  assert.equal(u.totalBytes, 150000 + 140000 + 130000 + 90000 + 3000 + 50 + 600000 + 400 + 3);
  assert.deepEqual(u.groups.map((g) => g.prefix).slice(0, 3), ['db/img', 'studio', 'db/chats']);
  assert.deepEqual(u.groups.find((g) => g.prefix === 'studio'), { prefix: 'studio', keys: 3, bytes: 420000 });
  assert.equal(u.groups.find((g) => g.prefix === 'agent/tool').bytes, 0, 'WRONGTYPE/خطأ = بلا بايتات لا انهيار');
  assert.deepEqual(u.biggest[0], { key: 'db/img/xyz:0', bytes: 600000 });
  assert.ok(u.biggest.length <= 5);
  assert.ok(cmds.length > 0 && cmds.every((c) => c[0] === 'STRLEN'), 'قراءة فقط: ' + JSON.stringify([...new Set(cmds.map((c) => c[0]))]));
  const cut = await redisUsage(kv, { maxKeys: 4 });
  assert.equal(cut.truncated, true);
  assert.equal(cut.scanned, 4);
});

test('٣. المسار: للمالك وحده (غيره 401 ولا لمسة لـRedis)، وبالقراءة فقط', async () => {
  cmds.length = 0;
  const no = await call(health, { usage: '1' });
  assert.equal(no.code, 401);
  assert.equal(cmds.length, 0, 'غير المالك: لا أمر وصل Redis');
  const ok = await call(health, { usage: '1', owner: '1' });
  assert.equal(ok.code, 200);
  assert.equal(ok.j.ok, true);
  assert.equal(ok.j.usage.groups[0].prefix, 'db/img');
  assert.ok(cmds.every((c) => c[0] === 'STRLEN'), 'لا PUT ولا DEL ولا SET');
});

test('٤. زرّ «ما يملأ القاعدة» في لوحة المالك يطلب usage=1 ويعرض العائلات وأكبر المفاتيح', () => {
  const p = read('js/partials-settings.js');
  const admin = p.slice(p.indexOf('id="adminSectionWrap"'));
  assert.match(admin, /id="adminRedisUsageBtn" onclick="redisUsageCheck\(\)"/);
  const v = read('js/app-11-video.js');
  assert.match(v, /window\.redisUsageCheck = async function\(\)\{/);
  assert.match(v, /'\/api\/system\?action=health&usage=1&token=' \+/);
  assert.match(v, /'العائلات الأكبر:'/);
  assert.match(v, /'أكبر المفاتيح:'/);
  assert.ok(read('js/app.bundle.js').includes('window.redisUsageCheck'));
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=693'));
  const h = read('api/_lib/health.js');
  assert.ok(h.indexOf('if (!isOwner(req))') < h.indexOf("req.query.usage === '1'"), 'التحقّق من المالك قبل القياس');
});

// ── معاينات الاستوديو: لا توليد مدفوع بلا حفظ ────────────────────────────────────────────────────
const MORE = require(rp('api/_lib/studio-more.js'));
const FEATURE = Object.keys(MORE.STYLE_PROMPTS)[0];
const VALUE = Object.keys(MORE.STYLE_PROMPTS[FEATURE])[0];

test('٥. القاعدة ممتلئة = لا توليد (٥٠٣)، فلا يُدفع لصورة لا تُحفظ؛ وعطل عابر آخر يبقى كما كان', async () => {
  const save = global.fetch;
  let openai = 0;
  global.fetch = async () => { openai++; return { ok: false, status: 500, json: async () => ({}) }; };
  try {
    raw.clear(); cmds.length = 0;
    setIfAbsentError = FULL;
    const full = await call(studio, { feature: FEATURE, value: VALUE });
    assert.equal(full.code, 503);
    assert.equal(full.j.error, 'preview store full');
    assert.equal(full.headers['Retry-After'], '600');
    assert.equal(openai, 0, 'لا نداء لمولّد الصور المدفوع');
    // عطل شبكة عابر لا علاقة له بالامتلاء: القفل يفتح كما كان (توليد)
    setIfAbsentError = 'fetch failed';
    const transient = await call(studio, { feature: FEATURE, value: VALUE });
    assert.equal(openai, 1, 'العطل العابر يولّد كما كان');
    assert.equal(transient.code, 502);
    // والمخزَّن يُقدَّم بلا قفل ولا توليد
    setIfAbsentError = FULL;
    raw.set('studio:preview:v2:' + FEATURE + ':' + VALUE, Buffer.from('x').toString('base64'));
    const cached = await call(studio, { feature: FEATURE, value: VALUE });
    assert.equal(cached.code, 200);
    assert.equal(openai, 1);
  } finally { global.fetch = save; setIfAbsentError = null; }
});

test('٦. فشل حفظ المعاينة المولَّدة يُسجَّل (توليد مدفوع ضاع) لا يُبتلع صامتًا', () => {
  const s = read('api/_lib/studio-preview.js');
  assert.equal((s.match(/logError\('studio-preview\/save', e\)/g) || []).length, 2, 'مساران: الترند والخيار');
  assert.ok(!/try \{ await kvSetRaw\(key, (tb|b64)\); \} catch \(e\) \{ \/\*/.test(s), 'لا كتمة صامتة');
});
