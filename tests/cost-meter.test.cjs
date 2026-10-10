// tests/cost-meter.test.cjs — v-cost-meter (قرار المالك ٥ أكتوبر ٢٠٢٦، الخطوة ٣: «قِس أسبوعين ثمّ قرّر Max بالأرقام»):
// تكلفة كلّ حساب علينا شهريًّا — الرسائل بتوكنات المزوّد الفعليّة × سعر النموذج، والصور والفيديو ودقائق مها بجدول تكلفتنا —
// وتقرير للمالك لكلّ باقة. القياس أفضل جهد لا يوقف خدمة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'cost-meter-secret';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const piped = [];
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvExpire: async () => {},
  kvList: async (prefix) => [...kv.keys()].filter((k) => k.startsWith(prefix)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    piped.push([op, k, a]);
    if (op === 'INCRBY') { const v = Number(kv.get(k) || 0) + Number(a); kv.set(k, String(v)); return v; }
    if (op === 'GET') return kv.has(k) ? kv.get(k) : null;
    return 1;
  }),
});
const users = new Map();
mock('api/_lib/auth.js', { getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null), putUser: async (u, r) => { users.set(u, structuredClone(r)); }, isBanned: async () => false, verifyToken: () => null });
mock('api/_lib/_vip.js', { isVip: async (u) => u === 'vip1' });

const cm = require(rp('api/_lib/cost-meter.js'));
const points = require(rp('api/_lib/points.js'));
const month = new Date().toISOString().slice(0, 7);
const micros = (u, kind) => Number(kv.get('cost:' + month + ':' + encodeURIComponent(u) + ':' + kind) || 0);

test('١. سعر الدور بالتوكنات: الدخل والخرج وقراءة الكاش (١٠٪) وكتابته (١٢٥٪) لكلّ نموذج', () => {
  assert.equal(cm.tokenCostUsd('claude-haiku-4-5', { input: 1e6, output: 1e6 }), 6);
  assert.equal(cm.tokenCostUsd('anthropic/claude-sonnet-5', { cacheRead: 1e6 }), 0.3);
  assert.equal(cm.tokenCostUsd('claude-sonnet-5', { cacheWrite: 1e6 }), 3.75);
  assert.equal(cm.tokenCostUsd('openai/gpt-oss-120b', { input: 1e6, output: 1e6 }), 0.75);
  assert.equal(cm.tokenCostUsd('deepseek/deepseek-v4-pro', { input: 1e6 }), 0.58);
  assert.equal(cm.tokenCostUsd('', {}), 0);
});

test('٢. عدّاد بثّ Anthropic يقرأ التوكنات ولو انقسم السطر بين قطعتين', () => {
  const tap = cm.anthropicUsageTap();
  const sse = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1200,"cache_read_input_tokens":5000,"cache_creation_input_tokens":0,"output_tokens":1}}}\n\n'
    + 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"usage"}}\n\n'
    + 'data: {"type":"message_delta","usage":{"output_tokens":850}}\n\n';
  for (let i = 0; i < sse.length; i += 37) tap.push(sse.slice(i, i + 37));
  assert.deepEqual(tap.usage(), { input: 1200, cacheRead: 5000, cacheWrite: 0, output: 850 });
});

test('٣. التسجيل: INCRBY بالميكرو-دولار مع مدّة في طلب مجمّع واحد، ولا شيء للصفر أو بلا حساب', async () => {
  piped.length = 0;
  await cm.addCost('ann', 0.0123456, 'chat');
  assert.deepEqual(piped.map((c) => c[0]), ['INCRBY', 'EXPIRE']);
  assert.equal(micros('ann', 'chat'), 12346);
  await cm.addCost('ann', 0, 'chat'); await cm.addCost('', 1, 'chat');
  assert.equal(piped.length, 2);
});

test('٤. كلّ خصم ناجح يُسجَّل بتكلفتنا من جدول الوسائط: نقاط، رصيد اشتراك، فيديو باقة، ودقيقة مها «صوت»', async () => {
  users.set('bo', { username: 'bo', points: 500 });
  await points.spendPoints('bo', 20, 'image');
  assert.equal(micros('bo', 'media'), Math.round(50 / 100 / 3.6725 * 1e6));
  await points.spendPoints('bo', 15, 'maha_minute');
  assert.equal(micros('bo', 'voice'), Math.round(55 / 100 / 3.6725 * 1e6));
  users.set('pv', { username: 'pv', points: 0, plan: 'pro', planUpdatedAt: Date.now() });
  const r = await points.spendPoints('pv', 40, 'minimax_video', { planVideoOnly: true });
  assert.equal(r.planVideo, true);
  assert.equal(micros('pv', 'media'), Math.round(103 / 100 / 3.6725 * 1e6), 'فيديو الباقة مجّانيّ له لا لنا');
  assert.equal(micros('omran', 'media'), 0, 'المالك لا يُقاس هنا');
});

test('٥. تقرير الشهر: لكلّ باقة العدد والمتوسّط والأعلى، وأعلى الحسابات، والـVIP والمالك منفصلان', async () => {
  for (const [u, rec] of [['p1', { plan: 'pro', planUpdatedAt: Date.now() }], ['p2', { plan: 'pro', planUpdatedAt: Date.now() }], ['m1', { plan: 'max', planUpdatedAt: Date.now() }], ['f1', {}]]) users.set(u, Object.assign({ username: u }, rec));
  await cm.addCost('p1', 2, 'chat'); await cm.addCost('p2', 4, 'media'); await cm.addCost('m1', 30, 'chat'); await cm.addCost('m1', 5, 'voice');
  await cm.addCost('f1', 0.5, 'chat'); await cm.addCost('vip1', 9, 'chat');
  const rep = await cm.monthReport();
  const g = Object.fromEntries(rep.byPlan.map((x) => [x.plan, x]));
  const pvUsd = micros('pv', 'media') / 1e6; // مشترك Pro من الاختبار ٤ (فيديو باقته)
  assert.deepEqual([g.pro.users, g.pro.max], [3, 4]);
  assert.equal(g.pro.total, Math.round((2 + 4 + pvUsd) * 100) / 100);
  assert.equal(g.pro.avg, Math.round((2 + 4 + pvUsd) / 3 * 100) / 100);
  assert.deepEqual([g.max.users, g.max.total], [1, 35]);
  assert.equal(g.vip.users, 1);
  assert.equal(rep.top[0].user, 'm1');
  assert.deepEqual([rep.top[0].chat, rep.top[0].voice], [30, 5]);
});

test('٦. الأسلاك: chat.js يقيس نهاية الدور العاديّة والمخرج الآخر مرّة وحدة، وclaude.js من البثّ، والمالك يرى التقرير وحده', () => {
  const chat = read('api/_lib/chat.js');
  assert.ok((chat.match(/await __meterTurn\(\);/g) || []).length >= 2);
  assert.match(chat, /if \(__metered \|\| !usage\.username \|\| __ownerReq\) return;/);
  const cl = read('api/_lib/claude.js');
  assert.match(cl, /if \(tap\) tap\.push\(dec\.decode\(value, \{ stream: true \}\)\);/);
  const h = read('api/_lib/health.js');
  assert.ok(h.indexOf("req.query.costs === '1'") > h.indexOf('if (!isOwner(req))'), 'بعد بوّابة المالك');
  const ps = read('js/partials-settings.js');
  assert.ok(ps.includes('onclick="subscriberCostsCheck()"'));
  assert.ok(read('js/app.bundle.js').includes('window.subscriberCostsCheck = async function(){'));
});
