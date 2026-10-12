'use strict';
/* v-email-best (المالك: «افحص مساعد البريد من الصفر وعطني الأفضل»): على المعالجات الحقيقيّة بـKV في الذاكرة وGmail
   والذكاء والتقويم مستبدَلة. كلّ بند هنا كان يفشل قبل التغيير:
   ١) القائمة محادثات: ما رددت عليه يختفي، والمحادثة بعدّة رسائل بطاقة واحدة بآخر رسالة، والآليّ والمعروف عند الجهاز
      بلا نداء ذكاء، والمنطقة الزمنيّة ولغة الملخّص من الواجهة، والبريد «بيانات لا أوامر» في التعليمات.
   ٢) النصّ بترميزه (windows-1256) وHTML بلا CSS.
   ٣) الجلسة الصارمة: حمولة موقّعة بلا exp والمحظور والشاهد = ٤٠١ بلا نداء Gmail ولا ذكاء.
   ٤) انتهاء ربط جوجل = notConnected في القائمة والإرسال والتقويم.
   ٥) الإرسال: المستلم من Reply-To الرسالة نفسها، والسلسلة References كاملة، والنصّ base64، وحقن CR/LF في المسار القديم لا يمرّ.
   ٦) التقويم بمنطقة المستخدم، والتاريخ المستحيل يُرفض.
   ٧) الواجهة: لا innerHTML ببيانات البريد، وتُرسل tz وknown، والربط يختار الحساب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.AUTH_SECRET = 'email-best-test-secret';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.OPENAI_API_KEY = 'sk-test-not-real';
process.env.SITE_URL = 'https://example.test';

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvDel: async (k) => { store.delete(k); },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
const hdrs = (o) => Object.keys(o).map((name) => ({ name, value: o[name] }));
function gmsg(id, threadId, o) {
  const headers = hdrs(Object.assign({ From: o.from, Subject: o.subject || 'Hello', 'Message-ID': '<' + id + '@mail.test>' }, o.headers || {}));
  const part = o.html
    ? { mimeType: 'text/html', headers: hdrs({ 'Content-Type': 'text/html; charset=utf-8' }), body: { data: b64u(o.html) } }
    : { mimeType: 'text/plain', headers: hdrs({ 'Content-Type': 'text/plain; charset="' + (o.charset || 'UTF-8') + '"' }), body: { data: b64u(o.bytes || Buffer.from(o.body || 'Hi there', 'utf8')) } };
  return { id, threadId, labelIds: o.labels || ['INBOX'], snippet: o.snippet || 'snip &amp; more', internalDate: String(o.date || 1000), payload: { mimeType: 'multipart/alternative', headers, parts: [part] } };
}

// صندوق أليس: ٦ محادثات.
const THREADS = {
  t1: [gmsg('f00daa01', 't1', { from: 'Bob <bob@x.test>', subject: 'Contract', date: 10 }), gmsg('f00daa02', 't1', { from: 'Me <alice@gmail.com>', labels: ['SENT'], date: 20 })], // رددت ← تختفي
  t2: [gmsg('f00dbb01', 't2', { from: 'Sara <sara@x.test>', date: 30 }), gmsg('f00dbb02', 't2', { from: 'Sara <sara@x.test>', date: 40 }), gmsg('f00dbb03', 't2', { from: 'Sara <sara@x.test>', subject: 'Re: plan', date: 50, body: 'Can we meet?' })],
  t3: [gmsg('f00dcc01', 't3', { from: 'GitHub <noreply@github.com>', subject: 'CI passed', date: 60 })],
  t4: [gmsg('f00ddd01', 't4', { from: 'Omar <omar@x.test>', subject: 'سلام', date: 70, charset: 'windows-1256', bytes: Buffer.from([0xC7, 0xE1, 0xD3, 0xE1, 0xC7, 0xE3, 0x20, 0xDA, 0xE1, 0xED, 0xDF, 0xE3]) })],
  t5: [gmsg('f00dee01', 't5', { from: 'Shop <hello@shop.test>', subject: 'Order', date: 80, html: '<html><head><style>.x{color:red}</style></head><body><p>Your order&nbsp;is &amp; ready</p></body></html>', headers: { 'List-Unsubscribe': '<mailto:u@shop.test>' } })],
  t6: [gmsg('f00dff01', 't6', { from: 'Spammer <spam@x.test>', date: 90 })],
  t7: [gmsg('f00dab07', 't7', { from: 'Lina <lina@x.test>', subject: 'Invoice', date: 100, body: 'Please pay the invoice.' })],
};

let calls = [];
let aiPrompts = [];
let sent = null;
let calendarBody = null;
let aiReply = (prompt) => ({ priority: 'urgent', lang: 'en', summary: 'ملخّص', draft: 'Hello, [time]', meeting: { title: 'Call', start: '2026-10-13T15:00', durationMin: 30 } });

global.fetch = async (url, opts) => {
  const u = String(url);
  calls.push(u);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
  if (/oauth2\.googleapis\.com\/token/.test(u)) {
    const rt = new URLSearchParams(String((opts && opts.body) || '')).get('refresh_token');
    return rt === 'rt-revoked' ? json({ error: 'invalid_grant' }, 400) : json({ access_token: 'at-' + rt });
  }
  if (/api\.openai\.com/.test(u)) {
    const prompt = JSON.parse(opts.body).messages[0].content;
    aiPrompts.push(prompt);
    return json({ choices: [{ message: { content: JSON.stringify(aiReply(prompt)) } }] });
  }
  if (/gmail\/v1\/users\/me\/messages\?maxResults=8&labelIds=SENT/.test(u)) return json({ messages: [] });
  if (/gmail\/v1\/users\/me\/threads\?/.test(u)) return json({ threads: Object.keys(THREADS).map((id) => ({ id })) });
  let m = /gmail\/v1\/users\/me\/threads\/([a-z0-9]+)\?format=full/.exec(u);
  if (m) return THREADS[m[1]] ? json({ id: m[1], messages: THREADS[m[1]] }) : json({ error: { message: 'nf' } }, 404);
  if (/gmail\/v1\/users\/me\/messages\/send/.test(u)) { sent = JSON.parse(opts.body); return json({ id: 'sent1' }); }
  m = /gmail\/v1\/users\/me\/messages\/([a-z0-9]+)\?format=metadata/.exec(u);
  if (m) {
    return json({ id: m[1], threadId: 'tq', payload: { headers: hdrs({
      From: 'Lina <lina@x.test>', 'Reply-To': 'Billing <billing@x.test>', Subject: 'Invoice',
      'Message-ID': '<m3@mail.test>', References: '<m1@mail.test> <m2@mail.test>',
    }) } });
  }
  if (/calendar\/v3\/calendars\/primary\/events/.test(u)) { calendarBody = JSON.parse(opts.body); return json({ htmlLink: 'https://cal/ev' }); }
  return json({}, 404);
};

const auth = require(rp('api/_lib/auth.js'));
const { encrypt } = require(rp('api/_lib/_emailCrypto.js'));
const list = require(rp('api/_lib/email-list.js'));
const send = require(rp('api/_lib/email-send.js'));
const cal = require(rp('api/_lib/email-calendar.js'));
const ignore = require(rp('api/_lib/email-ignore.js'));
const start = require(rp('api/_lib/email-google-start.js'));

const mkRes = () => { const r = { code: 0, j: null, headers: null }; r.status = (c) => { r.code = c; return r; }; r.json = (j) => { r.j = j; return r; }; r.setHeader = () => {}; r.end = () => r; r.writeHead = (c, h) => { r.code = c; r.headers = h; }; return r; };
const call = async (h, body) => { const r = mkRes(); await h({ method: 'POST', body, headers: {} }, r); return r; };

async function seed(name, extra) {
  await auth.putUser(name, Object.assign({
    username: name, createdAt: Date.now(),
    emailAssist: { connected: true, gmailAddress: name + '@gmail.com', refreshTokenEnc: encrypt(name === 'rev' ? 'rt-revoked' : 'rt-' + name), ignoreList: ['spam@x.test'] },
  }, extra || {}));
  return auth.makeToken(name);
}
const reset = () => { calls = []; aiPrompts = []; sent = null; calendarBody = null; };

test('١. القائمة محادثات: ما رددت عليه يختفي، المحادثة بطاقة واحدة بآخر رسالة، والآليّ والمعروف بلا ذكاء', async () => {
  store.clear(); reset();
  const token = await seed('alice');
  const r = await call(list, { token, lang: 'fr', tz: 'Asia/Riyadh', known: ['f00dab07', 'not-an-id!'] });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  const byId = Object.fromEntries(r.j.emails.map((e) => [e.id, e]));
  const ids = Object.keys(byId).sort();
  assert.deepEqual(ids, ['f00dab07', 'f00dbb03', 'f00dcc01', 'f00ddd01', 'f00dee01'], 'لا t1 (رددت) ولا t6 (متجاهل)، وt2 بطاقة واحدة');
  assert.equal(byId.f00dbb03.count, 3);
  assert.equal(byId.f00dbb03.threadId, 't2');
  assert.equal(byId.f00dcc01.auto, true, 'noreply آليّ');
  assert.equal(byId.f00dee01.auto, true, 'List-Unsubscribe آليّ');
  assert.equal(byId.f00dcc01.draft, '');
  assert.equal(byId.f00dab07.known, true);
  assert.equal(byId.f00dab07.draft, undefined, 'المعروف عند الجهاز لا يُصاغ');
  assert.equal(byId.f00dbb03.snippet, 'snip & more', 'كيانات المقتطف مفكوكة (العرض نصًّا لا HTML)');
  assert.equal(aiPrompts.length, 2, 'ذكاء لـbb03 وdd01 فقط');
  for (const p of aiPrompts) {
    assert.match(p, /Asia\/Riyadh/, 'منطقة المستخدم لا دبيّ');
    assert.match(p, /language whose code is fr/, 'الملخّص بلغة الواجهة');
    assert.match(p, /untrusted content/i);
    assert.match(p, /Never invent facts/);
  }
  assert.equal(byId.f00dbb03.priority, 'urgent');
  assert.deepEqual(byId.f00dbb03.meeting, { title: 'Call', start: '2026-10-13T15:00', durationMin: 30 });
  assert.equal(byId.f00dbb03.summary, 'ملخّص');
  assert.equal(r.j.emails[r.j.emails.length - 1].priority, 'low', 'الآليّ في الآخر');
});

test('٢. نصّ الرسالة بترميزها (windows-1256) وHTML بلا CSS وبكياناته', async () => {
  const G = require(rp('api/_lib/_gmail.js'));
  assert.match(G.messageText(THREADS.t4[0]), /^السلام عليكم$/);
  assert.equal(G.messageText(THREADS.t5[0]), 'Your order is & ready');
  store.clear(); reset();
  const token = await seed('alice');
  await call(list, { token, tz: 'Bad/Zone!!' });
  const p = aiPrompts.find((x) => /From: Omar/.test(x));
  assert.ok(p && p.includes('السلام عليكم'), 'العربيّ بترميزه يصل الذكاء مقروءًا');
  assert.match(p, /Asia\/Dubai/, 'منطقة غير صالحة = دبيّ');
});

test('٣. الجلسة الصارمة: بلا exp، والمحظور، والشاهد = ٤٠١ بلا Gmail ولا ذكاء', async () => {
  store.clear(); reset();
  await seed('alice');
  const payload = Buffer.from(JSON.stringify({ u: 'alice' })).toString('base64url');
  const noExp = payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  assert.equal(auth.verifyToken(noExp), 'alice', 'verifyToken القديم يقبلها — لذلك لا يُستعمل هنا');
  for (const h of [list, send, cal, ignore]) {
    const r = await call(h, { token: noExp, id: 'f00dab07', text: 'x', title: 't', start: '2026-10-13T10:00', pattern: 'a@b.c' });
    assert.equal(r.code, 401);
  }
  const banned = await seed('bad', { banned: true });
  assert.equal((await call(list, { token: banned })).code, 401, 'المحظور');
  await auth.putUser('gone', { deleted: true, movedTo: 'alice2', emailAssist: { connected: true, refreshTokenEnc: encrypt('rt-gone') } });
  assert.equal((await call(list, { token: auth.makeToken('gone') })).code, 401, 'الشاهد');
  assert.equal(calls.filter((u) => /gmail|openai|oauth2/.test(u)).length, 0, 'ولا نداء واحد خارجيّ');
});

test('٤. ربط جوجل المنتهي (invalid_grant) = notConnected في القائمة والإرسال والتقويم', async () => {
  store.clear(); reset();
  const token = await seed('rev');
  for (const [h, extra] of [[list, {}], [send, { id: 'f00dab07', text: 'hi' }], [cal, { title: 'x', start: '2026-10-13T10:00' }]]) {
    const r = await call(h, Object.assign({ token }, extra));
    assert.equal(r.code, 401);
    assert.equal(r.j.notConnected, true);
    assert.equal(r.j.reconnect, true);
  }
});

test('٥. الإرسال: المستلم من Reply-To الرسالة نفسها، References كاملة، النصّ base64، ولا حقن CR/LF', async () => {
  store.clear(); reset();
  const token = await seed('alice');
  const r = await call(send, { token, id: 'f00dab07', text: 'شكرًا، تمّ\nمع التحيّة', to: 'attacker@evil.test' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.equal(sent.threadId, 'tq');
  const raw = Buffer.from(sent.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const [head, body] = raw.split('\r\n\r\n');
  assert.match(head, /^To: billing@x\.test\r\n/, 'Reply-To يغلب، والعميل لا يختار المستلم');
  assert.ok(!/evil/.test(head));
  assert.match(head, /In-Reply-To: <m3@mail\.test>/);
  assert.match(head, /References: <m1@mail\.test> <m2@mail\.test> <m3@mail\.test>/);
  assert.match(head, /Content-Transfer-Encoding: base64/);
  assert.match(head, new RegExp('Subject: =\\?UTF-8\\?B\\?' + Buffer.from('Re: Invoice').toString('base64').replace(/[+/=]/g, '\\$&')));
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'شكرًا، تمّ\r\nمع التحيّة');

  reset();
  const legacy = await call(send, { token, to: 'Bob <bob@x.test>\r\nBcc: spy@evil.test', subject: 'Hi\r\nBcc: spy2@evil.test', messageIdHeader: '<ok@x>\r\nBcc: spy3@evil.test', threadId: 't1', text: 'hello' });
  assert.equal(legacy.code, 200);
  const raw2 = Buffer.from(sent.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').split('\r\n\r\n')[0];
  assert.ok(!/Bcc/i.test(raw2), 'لا ترويسة محقونة: ' + raw2);
  assert.match(raw2, /^To: bob@x\.test\r\n/);
});

test('٦. التقويم بمنطقة المستخدم، والتاريخ المستحيل يُرفض', async () => {
  store.clear(); reset();
  const token = await seed('alice');
  const r = await call(cal, { token, tz: 'America/New_York', title: 'Call', start: '2026-10-13T23:30', durationMin: 60 });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.deepEqual(calendarBody.start, { dateTime: '2026-10-13T23:30:00', timeZone: 'America/New_York' });
  assert.deepEqual(calendarBody.end, { dateTime: '2026-10-14T00:30:00', timeZone: 'America/New_York' });
  await call(cal, { token, title: 'Call', start: '2026-10-13T10:00' });
  assert.equal(calendarBody.start.timeZone, 'Asia/Dubai', 'بلا tz = دبيّ كالسابق');
  assert.equal((await call(cal, { token, title: 'x', start: '2026-02-30T10:00' })).code, 400);
  assert.equal((await call(cal, { token, title: 'x', start: '2026-10-13T25:00' })).code, 400);
});

test('٧. التجاهل للحساب الحيّ وبسقف، والربط يختار الحساب', async () => {
  store.clear(); reset();
  const token = await seed('alice');
  const r = await call(ignore, { token, pattern: '  Lina@X.test ' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.j.ignoreList, ['spam@x.test', 'lina@x.test']);
  const res = mkRes();
  await start({ query: { state: 'ab'.repeat(16) }, headers: { host: 'example.test' } }, res);
  assert.equal(new URL(res.headers.Location).searchParams.get('prompt'), 'consent select_account');
});

test('٨. الواجهة: لا innerHTML ببيانات البريد، وتُرسل tz وknown والمعرّف لا المستلم', () => {
  const s = read('js/app-12-studios.js');
  const a = s.indexOf('📧 AI Email Assistant');
  const b = s.indexOf('Handle the redirect back from /api/email-callback');
  assert.ok(a > 0 && b > a);
  const part = s.slice(a, b);
  assert.ok(!/\.innerHTML\s*=/.test(part), 'بطاقات البريد تُبنى بـtextContent/value');
  assert.match(part, /draftEl\.value = mail\.draft/);
  assert.match(part, /tz: emTz\(\)/);
  assert.match(part, /known: fresh === true/);
  assert.match(part, /JSON\.stringify\(\{ token: emToken\(\), id: mail\.id, text \}\)/);
  assert.match(part, /if\(!mail\.auto\)/);
  assert.ok(read('js/app.bundle.js').includes("const EM_CACHE_KEY = 'aiapp_email_ai_v1';"), 'الحزمة مبنيّة');
});
