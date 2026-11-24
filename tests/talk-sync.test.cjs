'use strict';
// v-talk-contacts-sync: مزامنة جهات الهاتف في «غرفة الربع» — الخادم لا يحفظ رقمًا ولا اسمًا: تذكرة رفع مشفّر يُقرأ مرّة، ومطابقة
// بصمات SHA-256 بفهرس db/phone-hash يُكتب مع ربط الرقم ويُمحى مع تغييره وحذف الحساب، ورمز اتّصال مشفّر مربوط بالمتّصل.
// بمخزن في الذاكرة يقلّد أوامر Redis المستعملة (طريقة tests/talk-room.test.cjs) ومخزن مستخدمين مزيّف.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-talk-sync';
const { act } = require('../api/_lib/talk-room.js');
const sync = require('../api/_lib/talk-sync.js');
const pl = require('../api/_lib/phone-link.js');
const { deleteAccount } = require('../api/_lib/account-delete.js');

function memoryKV() {
  const data = new Map(), ttl = new Map(), log = [];
  const set = (k, v, t) => { data.set(k, String(v)); if (t) ttl.set(k, Number(t)); else ttl.delete(k); };
  const run = ([cmd, ...a]) => {
    log.push(cmd);
    if (cmd === 'GET') return data.has(a[0]) ? data.get(a[0]) : null;
    if (cmd === 'MGET') return a.map((k) => (data.has(k) ? data.get(k) : null));
    if (cmd === 'DEL') { const had = data.delete(a[0]); ttl.delete(a[0]); return had ? 1 : 0; }
    if (cmd === 'SET') {
      const nx = a.includes('NX'), ex = a.indexOf('EX');
      if (nx && data.has(a[0])) return null;
      set(a[0], a[1], ex > 0 ? a[ex + 1] : 0); return 'OK';
    }
    if (cmd === 'EXPIRE') { ttl.set(a[0], Number(a[1])); return 1; }
    if (cmd === 'INCRBY') { const n = Number(data.get(a[0]) || 0) + Number(a[1]); data.set(a[0], String(n)); return n; }
    if (cmd === 'DECRBY') { const n = Number(data.get(a[0]) || 0) - Number(a[1]); data.set(a[0], String(n)); return n; }
    throw new Error('unexpected command ' + cmd);
  };
  return {
    data, ttl, log,
    kvGetRaw: async (k) => run(['GET', k]),
    kvGetJSON: async (k) => { const v = run(['GET', k]); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    kvPutJSON: async (k, v) => { log.push('SET'); set(k, JSON.stringify(v)); },
    kvSetRaw: async (k, v, t) => { log.push('SET'); set(k, v, t); },
    kvSetIfAbsent: async (k, v, t) => { log.push('SETNX'); if (data.has(k)) return false; set(k, v, t); return true; },
    kvDel: async (k) => { run(['DEL', k]); },
    kvIncr: async (k) => run(['INCRBY', k, '1']),
    kvIncrBy: async (k, n) => run(['INCRBY', k, String(n)]),
    kvDecrBy: async (k, n) => run(['DECRBY', k, String(n)]),
    kvExpire: async (k, t) => { ttl.set(k, t); },
    kvList: async (p) => { log.push('SCAN'); return [...data.keys()].filter((k) => k.startsWith(p)); },
    kvPipeline: async (cmds) => cmds.map(run),
  };
}

const H = (p) => crypto.createHash('sha256').update(p, 'utf8').digest('hex');
const rndHash = () => crypto.randomBytes(32).toString('hex');
const P = { omran: '+971500000001', fatima: '+971500000002', ali: '+971500000003', aliNew: '+971500000033', gone: '+971500000004', renamed: '+971500000005' };

function world() {
  const K = memoryKV(), users = new Map(), pushed = [];
  users.set('omran', { username: 'omran', phone: P.omran, displayName: 'عمران' });
  users.set('fatima', { username: 'fatima', phone: P.fatima });
  users.set('ali', { username: 'ali', phone: P.aliNew });                      // غيّر رقمه: الفهرس القديم باقٍ بعطب
  users.set('gone', { deleted: true });                                        // حذف حسابه
  users.set('oldname', { deleted: true, movedTo: 'newname' });                 // غيّر اسمه
  users.set('newname', { username: 'newname', phone: P.renamed });
  const reads = [], failRead = new Map();      // failRead: اسم → خطأ ترميه القراءة الصارمة (عطل المخزن أو سجلّ مختوم)
  const auth = {
    getUser: async (u) => { reads.push('getUser:' + u); return users.has(u) ? JSON.parse(JSON.stringify(users.get(u))) : null; },
    getUserSure: async (u) => { reads.push('sure:' + u); if (failRead.has(u)) throw failRead.get(u); return users.has(u) ? JSON.parse(JSON.stringify(users.get(u))) : null; },
    putUser: async (u, r) => { users.set(u, JSON.parse(JSON.stringify(r))); },
  };
  const idx = (phone, username) => K.data.set('db/phone-hash/' + H(phone), JSON.stringify({ username }));
  idx(P.omran, 'omran'); idx(P.fatima, 'fatima'); idx(P.ali, 'ali'); idx(P.gone, 'gone'); idx(P.renamed, 'oldname');
  const o = {
    phoneLink: { normalizePhone: pl.normalizePhone, maskPhone: pl.maskPhone, phoneOwner: (p) => pl.phoneOwner(p, { kv: K, auth }) },
    auth,
    push: async (KV, user, payload) => { pushed.push({ user, payload }); return true; },
  };
  const call = (body, who, ip) => act(body, ip || 'ip', K, who || null, null, o);
  return { K, users, auth, o, pushed, call, reads, failRead };
}

test('phoneHash: SHA-256 بالهيكس الصغير لنصّ E.164 (الدالّة نفسها في الصفحة)', () => {
  assert.equal(pl.phoneHash('+971501234567'), H('+971501234567'));
  assert.match(pl.phoneHash('+971501234567'), /^[0-9a-f]{64}$/);
  assert.equal(sync.phoneHash('+971501234567'), pl.phoneHash('+971501234567'), 'دالّة واحدة');
});

test('التذكرة: رفع ثمّ سحب مرّة واحدة لصاحبها وحده، والأعمار ١٠ دقائق للتذكرة و٣ للنصّ المشفّر', async () => {
  const w = world();
  assert.equal((await w.call({ op: 'sync-ticket' })).status, 401, 'بلا حساب ما في تذكرة');
  const t = await w.call({ op: 'sync-ticket' }, 'omran');
  assert.equal(t.status, 200);
  const id = t.json.id;
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(w.K.ttl.get('talk/sync/' + id), 600);
  assert.deepEqual((await w.call({ op: 'sync-get', id }, 'omran')).json, { wait: true }, 'قبل الرفع: انتظر');
  const blob = crypto.randomBytes(300).toString('base64url');
  assert.deepEqual((await w.call({ op: 'sync-put', id, blob })).json, { ok: true }, 'الرفع بلا جلسة: التذكرة هي الإذن');
  assert.equal(w.K.ttl.get('talk/sync/' + id), 180);
  assert.equal((await w.call({ op: 'sync-put', id, blob })).json.error, 'no-ticket', 'تذكرة مستعملة لا ترفع ثانية');
  const other = await w.call({ op: 'sync-get', id }, 'fatima');
  assert.deepEqual([other.status, other.json.error], [404, 'no-ticket'], 'حساب آخر لا يسحب');
  assert.equal((await w.call({ op: 'sync-get', id }, null)).status, 401);
  assert.deepEqual((await w.call({ op: 'sync-get', id }, 'OMRAN')).json, { blob }, 'صاحبها يسحب');
  assert.ok(!w.K.data.has('talk/sync/' + id), 'يُمحى عند القراءة');
  assert.equal((await w.call({ op: 'sync-get', id }, 'omran')).status, 404, 'ولا يُقرأ مرّتين');
});

test('الرفع: بلا تذكرة أو بنصّ غير صالح يُرفض، والعنوان محدود، والتذاكر ١٠ في الساعة', async () => {
  const w = world();
  const blob = 'A'.repeat(40);
  assert.deepEqual([(await w.call({ op: 'sync-put', id: 'f'.repeat(32), blob })).status, (await w.call({ op: 'sync-put', id: 'f'.repeat(32), blob })).json.error], [404, 'no-ticket']);
  const id = (await w.call({ op: 'sync-ticket' }, 'omran')).json.id;
  for (const bad of ['short', 'A'.repeat(39) + '+', 'A'.repeat(39) + '=', 'A'.repeat(110001), 42, null]) {
    const r = await w.call({ op: 'sync-put', id, blob: bad });
    assert.deepEqual([r.status, r.json.error], [400, 'blob'], String(bad).slice(0, 12));
  }
  assert.equal((await w.call({ op: 'sync-put', id: 'XYZ', blob })).json.error, 'id');
  assert.equal((await w.call({ op: 'sync-put', id: id.toUpperCase(), blob })).json.error, 'id');
  assert.equal(JSON.parse(w.K.data.get('talk/sync/' + id)).s, 0, 'الرفض لا يلمس التذكرة');
  let slow = 0;
  for (let i = 0; i < 14; i++) if ((await w.call({ op: 'sync-put', id: 'e'.repeat(32), blob }, null, '9.9.9.9')).status === 429) slow++;
  assert.ok(slow >= 1, 'الرفع محدود لكلّ عنوان');
  let tslow = 0;
  for (let i = 0; i < 12; i++) if ((await w.call({ op: 'sync-ticket' }, 'fatima')).status === 429) tslow++;
  assert.equal(tslow, 2, 'عشر تذاكر في الساعة');
});

test('المطابقة: المطابَقون الموثَّقون وحدهم برموز مبهمة بلا أسماء حسابات، ولا نفسك، والرقم القديم والمحذوف لا يطابقان، وأمر MGET واحد', async () => {
  const w = world();
  const hashes = [H(P.omran), H(P.fatima), H(P.ali), H(P.aliNew), H(P.gone), H(P.renamed), rndHash(), H(P.fatima)];
  assert.equal((await w.call({ op: 'match', hashes })).status, 401);
  w.K.log.length = 0;
  const r = await w.call({ op: 'match', hashes }, 'omran');
  assert.equal(r.status, 200);
  assert.equal(w.K.log.filter((c) => c === 'MGET').length, 1, 'قراءة الفهرس بأمر واحد');
  assert.equal(w.K.log.filter((c) => c === 'GET').length, 0, 'لا GET لكلّ بصمة');
  assert.deepEqual(r.json.matches.map((m) => m.h).sort(), [H(P.fatima), H(P.renamed)].sort(), 'فاطمة، ومن غيّر اسمه (يُتبع شاهده)؛ لا نفسك ولا الرقم القديم ولا المحذوف');
  assert.deepEqual(Object.keys(r.json), ['matches']);
  const s = JSON.stringify(r.json);
  for (const name of ['fatima', 'newname', 'oldname', 'ali', 'gone', 'omran']) assert.ok(!s.includes(name), 'لا اسم حساب: ' + name);
  for (const m of r.json.matches) { assert.deepEqual(Object.keys(m).sort(), ['h', 't']); assert.match(m.t, /^[A-Za-z0-9_-]{40,}$/); }
  const tf = r.json.matches.find((m) => m.h === H(P.fatima)).t;
  assert.ok(!Buffer.from(tf, 'base64url').toString('latin1').includes('fatima'), 'الرمز مشفّر لا موقَّع فقط');
  assert.equal(sync.openCallee(tf, 'omran').c, 'fatima');
  assert.equal(sync.openCallee(tf, 'someone'), null, 'الرمز مربوط بمن طابق');
  // ali changed his number: the new number matches once its index exists
  w.K.data.set('db/phone-hash/' + H(P.aliNew), JSON.stringify({ username: 'ali' }));
  assert.deepEqual((await w.call({ op: 'match', hashes: [H(P.ali), H(P.aliNew)] }, 'omran')).json.matches.map((m) => m.h), [H(P.aliNew)]);
});

test('المطابقة: أكثر من ٥٠٠ أو بصمة غير صالحة يُرفض، والسقف اليوميّ ١٠٠٠٠ لكلّ حساب، والمرفوض يُردّ للعدّاد', async () => {
  const w = world();
  const many = (n) => Array.from({ length: n }, rndHash);
  for (const bad of [[], many(501), [H(P.fatima), 'xyz'], [H(P.fatima).toUpperCase()], [H(P.fatima) + '0'], 'abc', null, [42]]) {
    const r = await w.call({ op: 'match', hashes: bad }, 'omran');
    assert.deepEqual([r.status, r.json.error], [400, 'hashes'], JSON.stringify(bad).slice(0, 30));
  }
  assert.equal(sync.HASHES_PER_DAY, 10000, 'مزامنتان كاملتان لـ٣٠٠٠ رقم في اليوم');
  assert.equal((await w.call({ op: 'match', hashes: many(500) }, 'omran')).status, 200, '٥٠٠ مسموحة');
  for (let i = 1; i < 19; i++) assert.equal((await w.call({ op: 'match', hashes: many(500) }, 'omran')).status, 200, 'الدفعة ' + (i + 1));
  assert.equal((await w.call({ op: 'match', hashes: many(400) }, 'omran')).status, 200, '٩٩٠٠');
  const day = [...w.K.ttl.keys()].find((k) => k.startsWith('rl:talk-sync:match:omran:'));
  assert.equal(w.K.ttl.get(day), 2 * 86400);
  const refused = await w.call({ op: 'match', hashes: many(500) }, 'omran');
  assert.deepEqual([refused.status, refused.json.error], [429, 'slow-down'], 'فوق ١٠٠٠٠ في اليوم: انتظر (منع مسح الأرقام)');
  assert.equal(Number(w.K.data.get(day)), 9900, 'الدفعة المرفوضة لا تُحسب');
  assert.equal((await w.call({ op: 'match', hashes: many(100) }, 'omran')).status, 200, 'وما بقي من السقف يصلح لدفعة أصغر');
  const over = await w.call({ op: 'match', hashes: [H(P.fatima)] }, 'omran');
  assert.deepEqual([over.status, over.json.error], [429, 'slow-down'], 'عند ١٠٠٠٠ تمامًا: لا مزيد');
  assert.equal(Number(w.K.data.get(day)), 10000);
  assert.equal((await w.call({ op: 'match', hashes: [H(P.fatima)] }, 'fatima')).status, 200, 'السقف لكلّ حساب');
  const dup = world();
  await dup.call({ op: 'match', hashes: Array(500).fill(H(P.fatima)) }, 'omran');
  assert.equal(Number([...dup.K.data].find(([k]) => k.startsWith('rl:talk-sync:match:'))[1]), 1, 'المكرّر يُعدّ مرّة');
});

test('المكالمة برمز المطابقة: تمرّ لمن طابق، وترفض رمزًا لمتّصل آخر أو تالفًا أو لرقم تغيّر، ولا تتّصل بنفسك', async () => {
  const w = world();
  const t = (await w.call({ op: 'match', hashes: [H(P.fatima)] }, 'omran')).json.matches[0].t;
  const { code, key } = (await w.call({ op: 'open' }, 'omran')).json;
  assert.equal((await w.call({ op: 'ring', code, key: 'x'.repeat(24), callee: t }, 'omran')).status, 403, 'غرفته وبسرّها');
  const r = await w.call({ op: 'ring', code, key, callee: t }, 'omran');
  assert.deepEqual(r.json, { ok: true, pushed: true });
  assert.equal(w.pushed[0].user, 'fatima');
  assert.equal(w.pushed[0].payload.url, '/room?c=' + code + '&ring=1');
  assert.deepEqual((await w.call({ op: 'rings' }, 'fatima')).json, { ring: { code, from: 'عمران' } });
  assert.ok(!w.K.data.has('talk/contacts/omran'), 'لا قائمة تُحفظ في الخادم');

  const forOther = sync.mintCallee('fatima', 'ali', H(P.fatima));
  const r2 = await w.call({ op: 'ring', code, key, callee: forOther }, 'omran');
  assert.deepEqual([r2.status, r2.json.error], [404, 'not-on-app'], 'رمز صدر لمتّصل آخر');
  assert.equal((await w.call({ op: 'ring', code, key, callee: 'garbage-token' }, 'omran')).json.error, 'not-on-app');
  const forged = Buffer.from(t, 'base64url'); forged[20] ^= 1;
  assert.equal((await w.call({ op: 'ring', code, key, callee: forged.toString('base64url') }, 'omran')).json.error, 'not-on-app', 'المعدَّل لا يُفكّ');
  const expired = sync.mintCallee('fatima', 'omran', H(P.fatima), Date.now() - 31 * 86400000);
  assert.equal((await w.call({ op: 'ring', code, key, callee: expired }, 'omran')).json.error, 'not-on-app', 'المنتهي (٣٠ يومًا)');
  const self = sync.mintCallee('omran', 'omran', H(P.omran));
  assert.equal((await w.call({ op: 'ring', code, key, callee: self }, 'omran')).json.error, 'self');

  const u = w.users.get('fatima'); u.phone = '+971500000099'; w.users.set('fatima', u);
  assert.equal((await w.call({ op: 'ring', code, key, callee: t }, 'omran')).json.error, 'not-on-app', 'غيّرت رقمها: الرمز القديم يسقط');
  w.users.set('fatima', { deleted: true });
  assert.equal((await w.call({ op: 'ring', code, key, callee: t }, 'omran')).json.error, 'not-on-app', 'حذفت حسابها');
  const tr = (await w.call({ op: 'match', hashes: [H(P.renamed)] }, 'omran')).json.matches[0].t;
  assert.deepEqual((await w.call({ op: 'ring', code, key, callee: tr }, 'omran')).json, { ok: true, pushed: true }, 'من غيّر اسمه يصله');
  assert.equal(w.pushed.at(-1).user, 'newname');
});

test('الفهرس: يُكتب مع ربط الرقم، وتُمحى بصمة القديم عند تغييره، ويُمحى مع حذف الحساب ومعه جهاته ومكالمته الواردة', async () => {
  const w = world();
  w.users.set('sara', { username: 'sara' });
  const o = { kv: w.K, auth: w.auth };
  const link = async (phone) => {
    const code = pl.newCode();
    await w.K.kvSetRaw('db/phone-link/' + code, JSON.stringify({ purpose: 'link', channel: 'telegram', username: 'sara', status: 'pending', at: Date.now() }), 600);
    return pl.complete(code, phone, 'telegram', o);
  };
  assert.equal((await link('+971500000077')).status, 'linked');
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H('+971500000077'))), { username: 'sara' });
  assert.ok(!w.K.ttl.has('db/phone-hash/' + H('+971500000077')), 'بلا عمر كفهرس الهاتف');
  assert.equal((await link('+971500000078')).status, 'linked');
  assert.ok(!w.K.data.has('db/phone-hash/' + H('+971500000077')), 'بصمة الرقم القديم تُمحى');
  assert.ok(!w.K.data.has('db/phone-index/+971500000077'));
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H('+971500000078'))), { username: 'sara' });
  assert.deepEqual((await w.call({ op: 'match', hashes: [H('+971500000078')] }, 'omran')).json.matches.length, 1);

  w.K.data.set('talk/contacts/sara', JSON.stringify([{ phone: '+971500000002', name: 'x' }]));
  w.K.data.set('talk/ring/sara', JSON.stringify({ code: '1234', from: 'x' }));
  w.K.data.set('talk/contacts/sarah', '[]');
  const r = await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara' }, { kv: w.K, auth: w.auth, now: 1, autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const k of ['db/phone-hash/' + H('+971500000078'), 'db/phone-index/+971500000078', 'talk/contacts/sara', 'talk/ring/sara']) assert.ok(!w.K.data.has(k), 'باقٍ: ' + k);
  assert.ok(w.K.data.has('talk/contacts/sarah') && w.K.data.has('db/phone-hash/' + H(P.fatima)), 'غيره لا يُمسّ');
  assert.equal((await w.call({ op: 'match', hashes: [H('+971500000078')] }, 'omran')).json.matches.length, 0);
});

test('حذف الحساب لا يمحو بصمة صارت لغيره', async () => {
  const w = world();
  w.users.set('sara', { username: 'sara', phone: P.fatima });      // سجلّ بعطب يحمل رقمًا ربطه غيرها
  const r = await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara' }, { kv: w.K, auth: w.auth, now: 1, autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }) });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H(P.fatima))), { username: 'fatima' });
});

test('ترميم ذاتيّ: فتح جهات الاتّصال يكتب بصمة رقمه إن غابت (SETNX لا يكتب فوق شيء)', async () => {
  const w = world();
  w.K.data.delete('db/phone-hash/' + H(P.fatima));
  assert.equal((await w.call({ op: 'contacts' }, 'fatima')).status, 200);
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H(P.fatima))), { username: 'fatima' });
  w.K.data.set('db/phone-hash/' + H(P.fatima), JSON.stringify({ username: 'kept' }));
  await w.call({ op: 'contacts' }, 'fatima');
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H(P.fatima))), { username: 'kept' });
  const before = w.K.data.size;
  w.users.set('nophone', { username: 'nophone' });
  await w.call({ op: 'contacts' }, 'nophone');
  assert.equal(w.K.data.size, before, 'بلا رقم لا شيء');
});

test('بناء الفهرس للأرقام المربوطة قبله: للمالك وحده، ويكتب الغائب فقط', async () => {
  const w = world();
  for (const k of [...w.K.data.keys()]) if (k.startsWith('db/phone-hash/')) w.K.data.delete(k);
  w.K.data.set('db/phone-hash/' + H(P.ali), JSON.stringify({ username: 'ali' }));
  w.K.data.set('db/phone-index/' + P.fatima, JSON.stringify({ username: 'Fatima', at: 1 }));
  w.K.data.set('db/phone-index/' + P.ali, JSON.stringify({ username: 'ali', at: 1 }));
  w.K.data.set('db/phone-index/' + P.renamed, JSON.stringify({ username: 'oldname', at: 1 }));
  w.K.data.set('db/phone-index/bogus', JSON.stringify({ username: 'x' }));
  assert.equal((await w.call({ op: 'phone-hash-backfill' }, 'fatima')).status, 403);
  assert.equal((await w.call({ op: 'phone-hash-backfill' }, null)).status, 401);
  const r = await w.call({ op: 'phone-hash-backfill' }, 'omran');
  assert.deepEqual(r.json, { scanned: 4, written: 2 });
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H(P.fatima))), { username: 'fatima' });
  assert.deepEqual(JSON.parse(w.K.data.get('db/phone-hash/' + H(P.renamed))), { username: 'oldname' });
  assert.deepEqual((await w.call({ op: 'phone-hash-backfill' }, 'omran')).json, { scanned: 4, written: 0 }, 'تكراره لا يكتب شيئًا');
  assert.deepEqual((await w.call({ op: 'match', hashes: [H(P.fatima), H(P.renamed)] }, 'omran')).json.matches.length, 2);
});

test('مراجعة: حدّ المكالمات نفسه للرمز، وحدّ الرفع بعدّاد sync لكلّ عنوان، وعطل المخزن لا يصير «لا تذكرة»، وفشل الحذف لا يطبع رقمًا', async () => {
  const w = world();
  const t = (await w.call({ op: 'match', hashes: [H(P.fatima)] }, 'omran')).json.matches[0].t;
  const { code, key } = (await w.call({ op: 'open' }, 'omran')).json;
  const st = [];
  for (let i = 0; i < 8; i++) st.push((await w.call({ op: 'ring', code, key, callee: t }, 'omran')).status);
  assert.deepEqual(st, [200, 200, 200, 200, 200, 200, 429, 429], 'ستّ في الدقيقة كالمكالمة بالرقم');

  await w.call({ op: 'sync-put', id: 'e'.repeat(32), blob: 'A'.repeat(40) }, null, '7.7.7.7');
  assert.ok([...w.K.data.keys()].some((k) => k.startsWith('rl:talk-room:sync:7.7.7.7:')), 'عدّاد sync لكلّ عنوان');

  const id = (await w.call({ op: 'sync-ticket' }, 'omran')).json.id;
  const real = w.K.kvGetRaw;
  w.K.kvGetRaw = async (k) => { if (k.startsWith('talk/sync/')) throw new Error('down'); return real(k); };
  await assert.rejects(w.call({ op: 'sync-put', id, blob: 'A'.repeat(40) }), /down/, 'الرفع: عطل المخزن يرمي (503) فيُعاد');
  await assert.rejects(w.call({ op: 'sync-get', id }, 'omran'), /down/, 'السحب كذلك');
  w.K.kvGetRaw = real;

  w.users.set('sara', { username: 'sara', phone: '+971500000088' });
  w.K.data.set('db/phone-index/+971500000088', JSON.stringify({ username: 'sara' }));
  w.K.kvDel = async (k) => { if (k.startsWith('db/phone-index/')) throw new Error('down'); w.K.data.delete(k); };
  const logs = [], orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try { await deleteAccount({ username: 'sara', token: 't', confirmUsername: 'sara' }, { kv: w.K, auth: w.auth, now: 1, autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }) }); } finally { console.error = orig; }
  assert.ok(logs.some((l) => l.includes('db/phone-index')), 'الفشل يُسجَّل بنوع المفتاح');
  assert.ok(!logs.some((l) => /\d{6}/.test(l)), 'بلا الرقم');
});

test('مراجعة: عطل المخزن في قراءة الحساب يرمي (503 store) لا «ليس على التطبيق»، والسجلّ الغائب قراءة صارمة واحدة بلا إعادة', async () => {
  const w = world();
  const t = (await w.call({ op: 'match', hashes: [H(P.fatima)] }, 'omran')).json.matches[0].t;
  const tr = (await w.call({ op: 'match', hashes: [H(P.renamed)] }, 'omran')).json.matches[0].t;
  const { code, key } = (await w.call({ op: 'open' }, 'omran')).json;
  const down = () => Object.assign(new Error('kv GET failed: 429'), { status: 429 });

  w.failRead.set('fatima', down());
  await assert.rejects(w.call({ op: 'ring', code, key, callee: t }, 'omran'), /429/, 'الاتّصال بالرمز: يرمي فيصير 503 store، والصفحة لا تمحو رمز صديقه');
  await assert.rejects(w.call({ op: 'match', hashes: [H(P.fatima)] }, 'omran'), /429/, 'المطابقة كذلك: لا يسقط صديق من القائمة لعطل عابر');
  w.failRead.delete('fatima');
  w.failRead.set('newname', down());
  await assert.rejects(w.call({ op: 'ring', code, key, callee: tr }, 'omran'), /429/, 'وعطل القراءة في سلسلة تغيير الاسم كذلك');
  w.failRead.delete('newname');
  assert.equal(w.pushed.length, 0, 'لا مكالمة أثناء العطل');
  assert.deepEqual((await w.call({ op: 'ring', code, key, callee: t }, 'omran')).json, { ok: true, pushed: true }, 'وبعده الرمز نفسه يعمل');

  // المختوم (لا مفتاح يفكّه) لا يُقرأ أبدًا: غائب لا عطل يُسقط كلّ مزامنة فيها رقمه
  w.failRead.set('fatima', Object.assign(new Error('sealed'), { code: 'USER_RECORD_UNDECRYPTABLE' }));
  assert.deepEqual((await w.call({ op: 'match', hashes: [H(P.fatima), H(P.renamed)] }, 'omran')).json.matches.map((m) => m.h), [H(P.renamed)]);
  assert.equal((await w.call({ op: 'ring', code, key, callee: t }, 'omran')).json.error, 'not-on-app');
  w.failRead.delete('fatima');

  // بصمة قديمة تشير إلى سجلّ ممحوّ (محو المالك للمختوم لا يمسّ الفهرس): قراءة صارمة واحدة، ولا getUser بإعادته ونومه
  w.K.data.set('db/phone-hash/' + H('+971500000066'), JSON.stringify({ username: 'purged' }));
  w.reads.length = 0;
  assert.deepEqual((await w.call({ op: 'match', hashes: [H('+971500000066')] }, 'omran')).json, { matches: [] });
  assert.deepEqual(w.reads, ['sure:purged'], 'قراءة واحدة');
  w.reads.length = 0;
  const stale = sync.mintCallee('purged', 'omran', H('+971500000066'));
  assert.equal((await w.call({ op: 'ring', code, key, callee: stale }, 'omran')).json.error, 'not-on-app', 'الغائب فعلًا: ليس على التطبيق');
  assert.deepEqual(w.reads.filter((r) => r.endsWith(':purged')), ['sure:purged']);
  assert.ok(!w.reads.some((r) => r === 'getUser:purged'));
});

test('الملفّ لا يطبع ولا يقرأ سرًّا في نطاق الوحدة، والمكالمة برقم محفوظ باقية كما كانت', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api/_lib/talk-sync.js'), 'utf8');
  assert.ok(!/console\.(log|error|warn|info)/.test(src), 'لا طباعة');
  assert.ok(!/process\.env/.test(src), 'السرّ من _secrets.js عند النداء');
  assert.ok(!/swallow\(e\b/.test(src), 'المبتلع برسالة ثابتة لا بالخطأ');
  const w = world();
  w.K.data.set('db/phone-index/' + P.fatima, JSON.stringify({ username: 'fatima', at: 1 }));
  await w.call({ op: 'contact-add', phone: P.fatima, name: 'فاطمة' }, 'omran');
  const { code, key } = (await w.call({ op: 'open' }, 'omran')).json;
  assert.deepEqual((await w.call({ op: 'ring', code, key, phone: P.fatima }, 'omran')).json, { ok: true, pushed: true });
  assert.equal((await w.call({ op: 'ring', code, key, phone: '+971550000009' }, 'omran')).json.error, 'not-contact');
});
