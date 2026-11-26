'use strict';
// v-talk-room-phone: «غرفة الربع» تربط رقم الحساب من داخلها بضغطة (مثل الواتساب: رقمك هو اللي يلقاك فيه ربعك).
// الخادم: `contacts` يرجع القنوات المجّانيّة المفعّلة (linkVia) ومتى تلزم كلمة المرور (linkPw) — لمن ليس له رقم فقط.
// الصفحة: الدوالّ الحقيقيّة من room.html (طريقة fnSrc) على fetch ونافذة مزيّفتين — الربط، كلمة المرور، رابط القناة، الانتظار والنتيجة.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'room.html'), 'utf8');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const fns = (...heads) => heads.map((h) => fnSrc(html, h)).join('\n');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// ---- the server
const { contactsAct } = require('../api/_lib/talk-contacts.js');
const pl = require('../api/_lib/phone-link.js');
function kv() {
  const m = new Map();
  return { kvGetRaw: async (k) => (m.has(k) ? m.get(k) : null), kvSetRaw: async (k, v) => { m.set(k, v); }, kvSetIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; },
    kvGetJSON: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null) };
}
const USERS = {
  pw: { username: 'pw', hash: 'h', salt: 's' },                                   // signed up with a password
  google: { username: 'google', hash: 'h', salt: 's', googleAuth: true, passwordSet: false },
  linked: { username: 'linked', phone: '+971500000009', hash: 'h', salt: 's' },
};
const opts = (ready) => ({
  phoneLink: { normalizePhone: pl.normalizePhone, maskPhone: pl.maskPhone, phoneOwner: async () => null, channelReady: (ch, purpose) => purpose === 'link' && ready.includes(ch) },
  auth: { getUser: async (u) => USERS[u] || null },
  push: async () => false,
});

test('الخادم: بلا رقم ← القنوات المفعّلة وحدها وهل تلزم كلمة المرور؛ مع رقم ← لا شيء منهما', async () => {
  let r = await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', opts(['telegram']));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.me, { phone: null, name: 'pw', linkVia: ['telegram'], linkPw: true });
  r = await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', opts(['telegram', 'whatsapp']));
  assert.deepEqual(r.json.me.linkVia, ['whatsapp', 'telegram'], 'الواتساب أوّلًا متى ما تفعّل');
  r = await contactsAct({ op: 'contacts' }, 'ip', kv(), 'google', opts(['telegram']));
  assert.equal(r.json.me.linkPw, false, 'حساب Google بلا كلمة مرور وضعها: لا خانة');
  r = await contactsAct({ op: 'contacts' }, 'ip', kv(), 'linked', opts(['telegram']));
  assert.equal(r.json.me.phone, '+971•••••09');
  assert.ok(!('linkVia' in r.json.me) && !('linkPw' in r.json.me), 'الرقم مربوط: لا عرض ربط');
  r = await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', opts([]));
  assert.deepEqual(r.json.me.linkVia, [], 'لا قناة مفعّلة: لا زرّ');
  const bare = opts([]); delete bare.phoneLink.channelReady;
  assert.deepEqual((await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', bare)).json.me.linkVia, []);
  assert.equal((await contactsAct({ op: 'contacts' }, 'ip', kv(), null, opts(['telegram']))).status, 401, 'بلا جلسة: لا شيء');
});

test('الخادم: القنوات الحقيقيّة من البيئة — تيليجرام بمفتاح البوت، والواتساب يحتاج رقمه وسرّ التطبيق', async () => {
  const keep = { t: process.env.TELEGRAM_BOT_TOKEN, n: process.env.WHATSAPP_NUMBER, s: process.env.WHATSAPP_APP_SECRET };
  try {
    process.env.TELEGRAM_BOT_TOKEN = 'x'; delete process.env.WHATSAPP_NUMBER; delete process.env.WHATSAPP_APP_SECRET;
    const o = opts([]); o.phoneLink.channelReady = pl.channelReady;
    assert.deepEqual((await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', o)).json.me.linkVia, ['telegram']);
    process.env.WHATSAPP_NUMBER = '971500000000'; process.env.WHATSAPP_APP_SECRET = 'y';
    assert.deepEqual((await contactsAct({ op: 'contacts' }, 'ip', kv(), 'pw', o)).json.me.linkVia, ['whatsapp', 'telegram']);
  } finally {
    for (const [k, v] of [['TELEGRAM_BOT_TOKEN', keep.t], ['WHATSAPP_NUMBER', keep.n], ['WHATSAPP_APP_SECRET', keep.s]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

// ---- the page
const T = { myPhone: 'Your number: {n}', myPhoneNone: 'NONE', linkWhy: 'WHY', linkTg: 'TG', linkWa: 'WA', linkPw: 'PW', linkBadPw: 'BADPW', linkHowTg: 'HOWTG',
  linkHowWa: 'HOWWA', linkOpen: 'OPEN', linkWait: 'WAIT', linkCancel: 'CANCEL', linkOk: 'OK', linkTaken: 'TAKEN', linkExpired: 'EXPIRED', linkLogin: 'LOGIN',
  linkOff: 'OFF', slow: 'SLOW', offline: 'OFFLINE' };
function page(over) {
  const timers = [], posts = [], opened = [];
  let answer = null;
  const ctx = Object.assign({
    T, token: 'tok', contacts: [], myPhone: null, linkVia: ['telegram'], linkPw: false, plink: null, plinkT: 0, linkedNow: false, clearTyped: null,
    JSON, Number, Math, Date, Promise, draws: 0, loads: 0, pwBox: null,
    fmt: (s, n) => s.replace('{n}', n),
    draw() { ctx.draws++; }, loadContacts() { ctx.loads++; },
    $: (id) => (id === 'plpw' ? ctx.pwBox : null),
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
    window: { open: () => { const w = { closed: false, location: { href: '' }, opener: 'me', close() { w.closed = true; } }; opened.push(w); return w; } },
    fetch: (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); const a = typeof answer === 'function' ? answer(JSON.parse(o.body)) : answer; return a instanceof Error ? Promise.reject(a) : Promise.resolve({ json: () => Promise.resolve(a) }); },
  }, over || {});
  vm.runInNewContext(fns('function phoneBox(', 'function linkStart(', 'function linkPoll(', 'function linkCancel(', 'var esc = function'), ctx);
  return { ctx, timers, posts, opened, answer: (a) => { answer = a; } };
}

test('الصفحة: مربّع الرقم — رقمك ظاهر، أو أزرار القنوات المفعّلة وحدها، وخانة كلمة المرور حين تلزم', () => {
  const { ctx } = page();
  ctx.myPhone = '+971•••••09';
  assert.match(ctx.phoneBox(), /Your number: <bdi dir="ltr">\+971•••••09<\/bdi>/, 'الرقم من اليسار حتى في العربيّ');
  ctx.linkedNow = true; assert.match(ctx.phoneBox(), /OK Your number/);
  ctx.myPhone = '<b>'; assert.match(ctx.phoneBox(), /<bdi dir="ltr">&lt;b&gt;<\/bdi>/, 'مهرَّب');
  ctx.myPhone = null; ctx.contacts = null;
  assert.equal(ctx.phoneBox(), '', 'قبل أن تصل القائمة: لا شيء');
  ctx.contacts = []; ctx.linkVia = [];
  assert.match(ctx.phoneBox(), /class="err".*NONE/, 'لا قناة مفعّلة: النصّ القديم (من الإعدادات)');
  ctx.linkVia = ['telegram'];
  let h = ctx.phoneBox();
  assert.match(h, /WHY/); assert.match(h, /data-plink="telegram"[^>]*>TG</); assert.ok(!/data-plink="whatsapp"/.test(h)); assert.ok(!/id="plpw"/.test(h));
  ctx.linkVia = ['whatsapp', 'telegram']; ctx.linkPw = true;
  h = ctx.phoneBox();
  assert.ok(h.indexOf('data-plink="whatsapp"') < h.indexOf('data-plink="telegram"'));
  assert.match(h, /<input id="plpw" type="password" autocomplete="current-password"/);
  ctx.plink = { busy: true }; assert.match(ctx.phoneBox(), /data-plink="telegram" disabled/);
  ctx.plink = { ch: 'telegram', code: 'PLAAAAAAAA', href: 'https://t.me/bot?start=PLAAAAAAAA&x="<y>' };
  h = ctx.phoneBox();
  assert.match(h, /HOWTG/); assert.match(h, /WAIT/); assert.match(h, /data-plinkx="1"/); assert.ok(!/id="plpw"/.test(h), 'وقت الانتظار: لا خانة');
  assert.match(h, /href="https:\/\/t\.me\/bot\?start=PLAAAAAAAA&amp;x=&quot;&lt;y&gt;" target="_blank" rel="noopener"/, 'الرابط مهرَّب');
  ctx.plink = { bad: true, msg: 'TAKEN' }; assert.match(ctx.phoneBox(), /class="err"[^>]*>TAKEN/);
});

test('الصفحة: الربط — الطلب بالجلسة وكلمة المرور، القناة تُفتح على رابطها، والانتظار يبدأ', async () => {
  const p = page({ linkPw: true }); const { ctx } = p;
  ctx.pwBox = { value: 'secret' };
  p.answer({ ok: true, code: 'PLAAAAAAAA', link: 'https://t.me/OmranAIBuilder_bot?start=PLAAAAAAAA', expiresIn: 600, channel: 'telegram' });
  ctx.linkStart('telegram');
  assert.equal(p.opened.length, 1, 'النافذة تُفتح لحظة الضغط (قبل أن يحجبها المتصفّح)');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.plink)), { busy: true });
  await flush();
  assert.deepEqual(p.posts[0], { url: '/api/auth', body: { action: 'phone-link-start', channel: 'telegram', token: 'tok', password: 'secret' } });
  assert.equal(p.opened[0].location.href, 'https://t.me/OmranAIBuilder_bot?start=PLAAAAAAAA');
  assert.equal(p.opened[0].opener, null);
  assert.equal(ctx.plink.code, 'PLAAAAAAAA'); assert.equal(ctx.plink.ch, 'telegram');
  assert.ok(ctx.plink.until > Date.now() + 590000);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.clearTyped)), { plpw: 'secret' }, 'كلمة المرور تُمسح من الخانة');
  assert.equal(p.timers.length, 1); assert.equal(p.timers[0].ms, 3000);
  ctx.linkStart('telegram'); await flush();
  assert.equal(p.posts.length, 1, 'ضغطة ثانية وقت الانتظار: لا رمز جديد');
});

test('الصفحة: ما يُرفض — قناة غير مفعّلة، كلمة مرور فارغة، رابط ليس لتيليجرام/واتساب، وأخطاء الخادم', async () => {
  let p = page({ linkVia: ['telegram'] });
  p.ctx.linkStart('whatsapp'); await flush();
  assert.equal(p.posts.length, 0); assert.equal(p.opened.length, 0);
  p = page({ token: '' }); p.ctx.linkStart('telegram'); await flush(); assert.equal(p.posts.length, 0, 'بلا جلسة');

  p = page({ linkPw: true }); p.ctx.pwBox = { value: '', focus() { this.f = 1; } };
  p.ctx.linkStart('telegram'); await flush();
  assert.equal(p.posts.length, 0); assert.equal(p.opened.length, 0); assert.equal(p.ctx.plink.msg, 'PW');

  for (const bad of ['javascript:alert(1)', 'https://evil.example/t.me/x', 'https://t.me/x"><img', 'http://t.me/x']) {
    p = page(); p.answer({ ok: true, code: 'PLAAAAAAAA', link: bad });
    p.ctx.linkStart('telegram'); await flush();
    assert.ok(p.opened[0].closed, bad + ': النافذة تُغلق'); assert.equal(p.opened[0].location.href, ''); assert.equal(p.ctx.plink.msg, 'OFFLINE'); assert.equal(p.timers.length, 0);
  }
  const cases = [['password_required', 'PW', true], ['wrong_password', 'BADPW', true], ['session', 'LOGIN', false], ['too_many', 'SLOW', false], ['retry', 'OFFLINE', false]];
  for (const [code, msg, pw] of cases) {
    p = page(); p.answer({ error: 'x', code });
    p.ctx.linkStart('telegram'); await flush();
    assert.equal(p.ctx.plink.msg, msg, code); assert.equal(p.ctx.plink.bad, true); assert.equal(p.ctx.linkPw, pw, code + ': الخانة'); assert.ok(p.opened[0].closed);
  }
  p = page({ linkVia: ['whatsapp', 'telegram'] }); p.answer({ error: 'x', code: 'channel_off_wa' });
  p.ctx.linkStart('whatsapp'); await flush();
  assert.deepEqual(Array.from(p.ctx.linkVia), ['telegram'], 'قناة طفئت: زرّها يختفي'); assert.equal(p.ctx.plink.msg, 'OFF');
  p = page(); p.answer(new Error('net'));
  p.ctx.linkStart('telegram'); await flush();
  assert.equal(p.ctx.plink.msg, 'OFFLINE'); assert.ok(p.opened[0].closed);
});

test('الصفحة: الانتظار — ينتظر، ثمّ رقمك يظهر؛ أو «مربوط بحساب ثاني»؛ وانتهاء الوقت والإلغاء يوقفانه', async () => {
  const start = async (p) => { p.answer({ ok: true, code: 'PLAAAAAAAA', link: 'https://t.me/b?start=PLAAAAAAAA', expiresIn: 600 }); p.ctx.linkStart('telegram'); await flush(); p.timers.length = 0; };
  let p = page(); await start(p);
  p.answer({ ok: true, status: 'pending' });
  p.ctx.linkPoll(); await flush();
  assert.deepEqual(p.posts[1].body, { action: 'phone-link-status', code: 'PLAAAAAAAA' });
  assert.equal(p.timers.length, 1, 'ما زال ينتظر'); assert.ok(p.ctx.plink.code);
  p.answer({ ok: true, status: 'linked', phone: '+971•••••77' });
  p.ctx.linkPoll(); await flush();
  assert.equal(p.ctx.plink, null); assert.equal(p.ctx.linkedNow, true); assert.equal(p.ctx.myPhone, '+971•••••77'); assert.equal(p.ctx.loads, 1, 'القائمة من الحساب من جديد');
  assert.equal(p.timers.length, 1, 'وبعدها لا انتظار');

  p = page(); await start(p);
  p.answer({ ok: true, status: 'taken' }); p.ctx.linkPoll(); await flush();
  assert.equal(p.ctx.plink.msg, 'TAKEN'); assert.equal(p.ctx.myPhone, null); assert.equal(p.timers.length, 0); assert.equal(p.ctx.loads, 1, 'والحساب يُسأل');
  p = page(); await start(p);
  p.answer({ ok: true, status: 'expired' }); p.ctx.linkPoll(); await flush();
  assert.equal(p.ctx.plink.msg, 'EXPIRED');

  p = page(); await start(p);
  p.ctx.plink.until = Date.now() - 1; const n = p.posts.length;
  p.ctx.linkPoll(); await flush();
  assert.equal(p.posts.length, n, 'انتهى الوقت: لا سؤال عن الرمز'); assert.equal(p.ctx.plink.msg, 'EXPIRED'); assert.equal(p.ctx.loads, 1, 'لكنّ الحساب يُسأل (ربّما انربط والصفحة نائمة)');

  p = page(); await start(p);
  p.answer({ ok: true, status: 'linked', phone: '+971•••••77' });
  p.ctx.linkPoll(); p.ctx.linkCancel(); await flush();
  assert.equal(p.ctx.plink, null); assert.equal(p.ctx.myPhone, null, 'ردّ وصل بعد الإلغاء: لا يُعرض بنفسه'); assert.equal(p.timers.length, 0);
  assert.equal(p.ctx.loads, 2, 'الإلغاء يسأل الحساب، و«انربط» المتأخّر يسأله مرّة ثانية');
  p = page(); await start(p); p.ctx.linkCancel(); assert.equal(p.ctx.loads, 1, 'الإلغاء وحده: الحساب يُسأل');
});

test('الصفحة موصولة: الحالة، القائمة من الخادم، الأزرار، والمربّع مكان سطر «رقمك مو مربوط»', () => {
  assert.match(html, /var linkVia = \[\], linkPw = false, plink = null, plinkT = 0, linkedNow = false;/);
  assert.match(html, /linkVia = r\.me && Array\.isArray\(r\.me\.linkVia\) \? r\.me\.linkVia\.filter\(function \(x\) \{ return x === 'whatsapp' \|\| x === 'telegram'; \}\) : \[\]; linkPw = !!\(r\.me && r\.me\.linkPw\);/);
  assert.match(html, /else if \(d\.plink\) linkStart\(d\.plink\);\n/); assert.match(html, /else if \(d\.plinkx\) linkCancel\(\);\n/);
  assert.match(fnSrc(html, 'function contactsCard('), /esc\(T\.contactsNote\) \+ '<\/p>' \+ \(needPhone\(\) \? '' : phoneBox\(\)\) \+ \(needSync\(\) \? '' : syncBox\(\)\);/, 'مرّة واحدة: فوق في «خل ربعك يلقونك» ما دام ناقصًا (v-talk-room-simple)');
});
