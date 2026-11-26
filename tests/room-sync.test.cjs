'use strict';
// v-talk-contacts-sync: صفحة «غرفة الربع» — جهات الهاتف تبقى على الجهاز. تُستخرج الدوالّ الحقيقيّة من room.html وتُشغَّل كما هي
// (طريقة fnSrc في tests/talk-room.test.cjs): تطبيع الرقم إلى E.164، البصمة، قراءة جزء الرابط بالـnonce، دمج المطابقة، والاتّصال بالرمز.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

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
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const { normalizePhone } = require('../api/_lib/phone-link.js');

// كلّ رموز ISO-3166 alpha-2 الـ٢٤٩ (قائمة مستقلّة عن الصفحة)
const ISO = ('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz '
  + 'ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr '
  + 'ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp '
  + 'ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz '
  + 'na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw '
  + 'sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz '
  + 'ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw').split(' ');

function phoneCtx() {
  const ctx = { CC: null };
  vm.runInNewContext(fns('function ccMap(', 'function toE164(') + '\nvar CC = null;', ctx);
  return ctx;
}

test('خريطة مفاتيح الدول كاملة: كلّ دولة لها مفتاحها، والمفاتيح المشتركة صحيحة (+1، +7، +44…)', () => {
  assert.equal(ISO.length, 249);
  const ctx = phoneCtx(), m = ctx.ccMap();
  for (const c of ISO) assert.match(String(m[c]), /^[1-9]\d{0,2}$/, c);
  assert.equal(m.xk, '383', 'كوسوفو');
  const same = { 1: ['us', 'ca', 'pr', 'jm', 'bs', 'bb', 'tt', 'do', 'gu', 'vi', 'ag', 'ai', 'bm', 'dm', 'gd', 'kn', 'ky', 'lc', 'mp', 'ms', 'sx', 'tc', 'vc', 'vg', 'as', 'um'],
    7: ['ru', 'kz'], 44: ['gb', 'gg', 'je', 'im'], 47: ['no', 'sj', 'bv'], 61: ['au', 'cx', 'cc'], 39: ['it', 'va'], 212: ['ma', 'eh'],
    262: ['re', 'yt', 'tf'], 358: ['fi', 'ax'], 590: ['gp', 'bl', 'mf'], 599: ['cw', 'bq'], 672: ['nf', 'aq', 'hm'], 64: ['nz', 'pn'], 500: ['fk', 'gs'] };
  for (const [cc, list] of Object.entries(same)) for (const c of list) assert.equal(m[c], cc, c + ' → +' + cc);
  const gulf = { ae: '971', sa: '966', kw: '965', qa: '974', bh: '973', om: '968', eg: '20', jo: '962', iq: '964', ye: '967', in: '91', pk: '92', ph: '63', id: '62', bd: '880', np: '977', cn: '86', tr: '90', fr: '33', es: '34' };
  for (const [c, cc] of Object.entries(gulf)) assert.equal(m[c], cc, c);
});

test('toE164: محلّي الإمارات والسعوديّة، الصفر، 00، +، الأرقام العربيّة والفارسيّة، وما لا يصحّ يُسقط', () => {
  const { toE164 } = phoneCtx();
  const ok = [
    ['050 123 4567', 'ae', '+971501234567'], ['0501234567', 'AE', '+971501234567'], ['501234567', 'ae', '+971501234567'],
    ['٠٥٠١٢٣٤٥٦٧', 'ae', '+971501234567'], ['۰۵۰۱۲۳۴۵۶۷', 'ae', '+971501234567'], ['+٩٧١ ٥٠ ١٢٣ ٤٥٦٧', '', '+971501234567'],
    ['00971 50-123-4567', 'sa', '+971501234567'], ['+971 (50) 123.4567', '', '+971501234567'], ['tel:+966551234567', '', '+966551234567'],
    ['‪+971 50 123 4567‬', '', '+971501234567'], ['971501234567', 'ae', '+971501234567'], ['04 123 4567', 'ae', '+97141234567'],
    ['0551234567', 'sa', '+966551234567'], ['055 123 4567', 'sa', '+966551234567'], ['551234567', 'sa', '+966551234567'], ['966551234567', 'sa', '+966551234567'],
    ['+97141234567,123', '', '+97141234567'], ['8 916 123-45-67', 'ru', '+79161234567'], ['8 701 123 4567', 'kz', '+77011234567'],
    ['(415) 555-1234', 'us', '+14155551234'], ['1 415 555 1234', 'ca', '+14155551234'], ['011 971 50 123 4567', 'us', '+971501234567'],
    ['06 1234 5678', 'it', '+390612345678'], ['138 1234 5678', 'cn', '+8613812345678'], ['07 07 12 34 56', 'ci', '+2250707123456'],
    ['0300 1234567', 'pk', '+923001234567'], ['0917 123 4567', 'ph', '+639171234567'],
    // مراجعة: «(0)» الاختياريّة بعد المفتاح تسقط (إلّا حيث الصفر من الرقم)، والامتداد «ext» لا يُسقط الرقم كلّه
    ['+44 (0) 20 7946 0958', '', '+442079460958'], ['+44(0)7911 123456', 'ae', '+447911123456'], ['+971 (0)50 123 4567', '', '+971501234567'],
    ['+39 (0)6 1234 5678', '', '+390612345678'], ['050 123 4567 ext 12', 'ae', '+971501234567'], ['050 123 4567 x12', 'ae', '+971501234567'],
  ];
  for (const [raw, iso, want] of ok) {
    assert.equal(toE164(raw, iso), want, JSON.stringify(raw) + ' / ' + iso);
    assert.equal(normalizePhone(want), want, 'الخادم يقبله كما هو: ' + want);
  }
  const bad = [['123', 'ae'], ['0501234567', ''], ['501234567', 'zz'], ['abc', 'ae'], ['+0123456789', ''], ['+1234567', ''], ['*100#', 'ae'], ['', 'ae'], [null, 'ae'], [undefined, ''],
    ['+9715012345678901', ''], ['050 123 4567 ext', ''], ['+971 50 abc 4567', ''], ['0', 'ae']];
  for (const [raw, iso] of bad) assert.equal(toE164(raw, iso), null, JSON.stringify(raw) + ' / ' + iso);
});

test('البصمة: SHA-256 بالـhex الصغير مثل الخادم تمامًا (crypto.subtle في الصفحة = crypto في Node)', async () => {
  const ctx = { crypto: globalThis.crypto, TextEncoder };
  vm.runInNewContext(fns('function hex(', 'function hashHex('), ctx);
  for (const p of ['+971501234567', '+966551234567', '+14155551234']) {
    const h = await ctx.hashHex(p);
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(h, sha(p), p);
    const pl = require('../api/_lib/phone-link.js');
    if (typeof pl.phoneHash === 'function') assert.equal(h, pl.phoneHash(p), 'نفس دالّة الخادم');
  }
});

function hashCtx(hash, pend, now) {
  const log = [], store = new Map(pend === undefined ? [] : [['room-sync-pend', JSON.stringify(pend)]]);
  const ctx = {
    JSON, Date: { now: () => now || Date.now() },
    location: { hash, pathname: '/room.html', search: '?lang=en' },
    history: { replaceState: (s, t, u) => { log.push('replace:' + u); ctx.location.hash = ''; } },
    localStorage: {
      getItem: (k) => { log.push('get:' + k); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { log.push('set:' + k); store.set(k, v); },
      removeItem: (k) => { log.push('del:' + k); store.delete(k); },
    },
  };
  vm.runInNewContext(fns('function lsGet(', 'function lsSet(', 'function lsDel(', 'function readSyncHash('), ctx);
  return { ctx, log, store };
}

test('جزء الرابط من التطبيق: يُمحى من العنوان أوّلًا، ثمّ يُقبل بالـnonce الذي حفظته الصفحة فقط، ومرّة واحدة', () => {
  const t = 'a'.repeat(32), n = 'Nonce_123-abc', K = Buffer.alloc(32, 7).toString('base64url');
  const pend = { n, t, at: 1000 };

  let r = hashCtx('#cs=' + t + '.' + n + '.' + K, pend, 2000);
  const got = r.ctx.readSyncHash();
  assert.deepEqual({ ...got }, { kind: 'cs', t, k: K });
  assert.equal(r.log[0], 'replace:/room.html?lang=en', 'replaceState قبل أيّ شيء آخر');
  assert.equal(r.ctx.location.hash, '');
  assert.ok(r.log.includes('del:room-sync-pend'), 'التذكرة لمرّة واحدة');
  assert.equal(r.ctx.readSyncHash(), null, 'مرّة ثانية: لا شيء');

  // مراجعة (#5): رابط بلا مزامنة منتظرة مطابقة لا يُقبل، لكنّه لا يُهمَل بصمت: {kind:'stray'} ← «ما قدرت أقرأ جهاتك»
  const STRAY = { kind: 'stray' };
  r = hashCtx('#cs=' + t + '.WRONGnonce1.' + K, pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'nonce غريب (رابط مصنوع)');
  assert.equal(r.log[0].slice(0, 8), 'replace:');
  assert.ok(r.store.has('room-sync-pend') && !r.log.includes('del:room-sync-pend'), 'رابط مصنوع لا يُفسد مزامنة جارية');

  r = hashCtx('#cs=' + 'b'.repeat(32) + '.' + n + '.' + K, pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'تذكرة غير التي طُلبت');
  assert.ok(r.store.has('room-sync-pend'));
  r = hashCtx('#cs=' + t + '.' + n + '.' + K, undefined, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'بلا طلب محفوظ (فُتحت الصفحة في متصفّح آخر أو في الـWebView)');
  assert.equal(r.log[0], 'replace:/room.html?lang=en', 'ويُمحى من العنوان أوّلًا كما كان');
  r = hashCtx('#csd=' + n, undefined, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, '#csd= بلا طلب محفوظ');
  r = hashCtx('#cse=' + n, { n: 'otherNonce1', t, at: 1000 }, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, '#cse= بـnonce غير المحفوظ');
  assert.ok(r.store.has('room-sync-pend'));
  r = hashCtx('#cs=' + t + '.' + n + '.' + K, pend, 1000 + 11 * 60000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'طلب أقدم من ١٠ دقائق');
  r = hashCtx('#cs=' + t + '.' + n + '.short', pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'مفتاح ليس ٣٢ بايتًا');
  assert.ok(r.store.has('room-sync-pend'));

  r = hashCtx('#csd=' + n, pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, { kind: 'csd' });
  assert.equal(r.log[0].slice(0, 8), 'replace:');
  r = hashCtx('#cse=' + n, pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, { kind: 'cse' });

  r = hashCtx('#cs=<script>alert(1)</script>', pend, 2000);
  assert.deepEqual({ ...r.ctx.readSyncHash() }, STRAY, 'مشوّه: لا يُقبل منه شيء');
  assert.equal(r.log[0].slice(0, 8), 'replace:', 'حتّى المشوّه يُمحى من العنوان');
  assert.ok(r.store.has('room-sync-pend'));

  r = hashCtx('#top', pend, 2000);
  assert.equal(r.ctx.readSyncHash(), null);
  assert.equal(r.log.length, 0, 'جزء آخر لا يُلمس');

  // في الصفحة: أوّل سطر بعد قراءة location.search، قبل اللغة والرمز وأيّ نداء
  const a = html.indexOf('var syncHash = readSyncHash();');
  assert.ok(a > 0 && a < html.indexOf("localStorage.getItem('aiapp_lang')") && a < html.indexOf('function call('), 'تُقرأ أوّلًا');
});

test('الرزمة المشفّرة (طريق Chrome): gzip ثمّ AES-256-GCM في التطبيق ← فكّها في الصفحة بالمفتاح من جزء الرابط', async () => {
  const payload = { v: 1, iso: 'ae', list: [['فاطمة', '050 000 0002'], ['Ali', '+971 55 123 4567']] };
  const K = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', K, iv);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))), c.final()]);
  const blob = Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64url');
  const ctx = { crypto: globalThis.crypto, atob, Response, Blob, DecompressionStream, JSON, String };
  vm.runInNewContext(fns('function b64u(', 'function openBlob('), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(await ctx.openBlob(blob, K.toString('base64url')))), payload);
  await assert.rejects(ctx.openBlob(blob, crypto.randomBytes(32).toString('base64url')), 'مفتاح آخر لا يفكّها');
});

function pipeCtx(matchFor) {
  const sent = [];
  const ctx = {
    window: { crypto: globalThis.crypto, TextEncoder }, crypto: globalThis.crypto, TextEncoder, Promise, JSON, Date,
    token: 'tok', book: null, syncBusy: 'x', CC: null,
    call: (body) => { sent.push(JSON.parse(JSON.stringify(body))); return Promise.resolve(matchFor(body)); },
    draw: () => {}, lsSet: () => true, lsGet: (k) => (k === 'aiapp_username' ? ' Omran ' : null),
  };
  vm.runInNewContext(fns('function ccMap(', 'function toE164(', 'function cleanLabel(', 'function bookRows(', 'function mergeMatches(', 'function hex(', 'function hashHex(',
    'function matchAll(', 'function saveBook(', 'function bookUser(', 'function gotPayload(') + '\nvar CC = null;', ctx);
  return { ctx, sent };
}

test('من الهاتف إلى القائمة: تطبيع وإزالة المكرّر، والخادم لا يصله إلّا بصمات بالـ٥٠٠، والمطابقة تُدمج على الجهاز وحده', async () => {
  const list = [['فاطمة', '050 000 0002'], ['Fatima copy', '+971500000002'], ['', '0501234567'], ['bad', '12'], ['  Ali‮ ', '+966 55 123 4567'], 'junk'];
  for (let i = 0; i < 1200; i++) list.push(['n' + i, '+97155' + String(1000000 + i)]);
  const winner = sha('+971500000002'), other = sha('+966551234567');
  const { ctx, sent } = pipeCtx((b) => ({ matches: b.hashes.filter((h) => h === winner || h === other).map((h) => ({ h, t: 'T-' + h.slice(0, 6) })).concat([{ h: 'f'.repeat(64), t: 'stranger' }, { h: winner.toUpperCase(), t: 'x' }]) }));
  await ctx.gotPayload({ v: 1, iso: 'ae', list });
  assert.equal(sent.length, 3, '١٢٠٣ رقمًا = ثلاث دفعات');
  assert.deepEqual(sent.map((b) => b.hashes.length), [500, 500, 203]);
  for (const b of sent) {
    assert.deepEqual(Object.keys(b).sort(), ['hashes', 'op', 'token']);
    assert.equal(b.op, 'match');
    assert.ok(b.hashes.every((h) => /^[0-9a-f]{64}$/.test(h)), 'بصمات فقط');
    assert.ok(!/\+971|فاطمة|Ali/.test(JSON.stringify(b)), 'لا رقم ولا اسم');
  }
  const book = ctx.book;
  assert.equal(book.iso, 'ae'); assert.ok(book.at > 0);
  assert.equal(book.u, 'omran', 'القائمة مربوطة بالحساب الذي زامنها');
  assert.equal(book.list.length, 1203, 'المكرّر والتالف خارج');
  const f = book.list.find((r) => r.p === '+971500000002');
  assert.equal(f.n, 'فاطمة', 'الاسم الأوّل يبقى'); assert.equal(f.h, winner); assert.equal(f.t, 'T-' + winner.slice(0, 6));
  assert.equal(book.list.find((r) => r.p === '+966551234567').n, 'Ali', 'الاسم منظَّف من علامات الاتّجاه');
  assert.equal(book.list.filter((r) => r.t).length, 2, 'الرمز للمطابقين فقط (لا لبصمة غريبة)');
  assert.equal(book.list.find((r) => r.p === '+971501234567').n, '');
  assert.equal(ctx.syncBusy, '');

  // دمج مستقلّ: نتيجة جديدة تمسح رمزًا قديمًا لم يعد مطابقًا
  const merged = ctx.mergeMatches([{ n: 'a', p: '+971500000001', h: 'a'.repeat(64), t: 'old' }, { n: 'b', p: '+971500000002', h: 'b'.repeat(64) }], [{ h: 'b'.repeat(64), t: 'new' }, { h: 'b'.repeat(64), t: 5 }, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), [{ n: 'a', p: '+971500000001', h: 'a'.repeat(64) }, { n: 'b', p: '+971500000002', h: 'b'.repeat(64), t: 'new' }]);

  // فارغ أو مشوّه
  const e = pipeCtx(() => { throw new Error('no call expected'); });
  await e.ctx.gotPayload({ v: 1, iso: 'ae', list: [['x', '12']] });
  assert.equal(e.sent.length, 0, 'لا أرقام صالحة: لا نداء'); assert.equal(e.ctx.book.list.length, 0);
  await assert.rejects(e.ctx.gotPayload({ v: 2, list: [] }));
  await assert.rejects(e.ctx.gotPayload(null));
  // الخادم يرفض (السقف اليوميّ HASHES_PER_DAY): لا تُستبدل القائمة المحفوظة، والخطأ «sync-cap» لا «انتظر دقيقة»
  const s = pipeCtx(() => ({ error: 'slow-down' }));
  const kept = { at: 1, u: 'omran', list: [{ n: 'Old', p: '+971500000001', h: 'a'.repeat(64), t: 'tok' }] };
  s.ctx.book = kept;
  await assert.rejects(s.ctx.gotPayload({ v: 1, iso: 'ae', list: [['a', '0501234567']] }), /^Error: sync-cap$/);
  assert.equal(s.ctx.book, kept); assert.equal(s.ctx.book.at, 1); assert.equal(s.ctx.book.list[0].t, 'tok');
  // مراجعة (#9): التحديث اليدويّ يبلغ السقف في الدفعة الثالثة بعد نجاح دفعتين — القائمة السابقة كما هي
  let n3 = 0;
  const m = pipeCtx(() => (++n3 >= 3 ? { error: 'slow-down' } : { matches: [] }));
  m.ctx.book = kept;
  const many = []; for (let i = 0; i < 1200; i++) many.push(['n' + i, '+97155' + String(1000000 + i)]);
  await assert.rejects(m.ctx.gotPayload({ v: 1, iso: 'ae', list: many }), /sync-cap/);
  assert.equal(m.sent.length, 3, 'يقف عند الدفعة المرفوضة'); assert.equal(m.ctx.book, kept, 'لا حفظ لنصف تحديث');
  // خطأ آخر يبقى كما هو
  const o = pipeCtx(() => ({ error: 'login' }));
  await assert.rejects(o.ctx.gotPayload({ v: 1, iso: 'ae', list: [['a', '0501234567']] }), /^Error: login$/);
});

test('السقف اليوميّ يقول «حدّ اليوم، جرّب بكرة» (syncCap) لا «انتظر دقيقة»، وslow-down في غير المطابقة كما كان', () => {
  const T = { badPhone: 'b', selfPhone: 's', notOnAppErr: 'n', noRoom: 'r', busy: 'busy', slow: 'WAIT-A-MINUTE', store: 'st', offline: 'off', needLogin: 'login', syncCap: 'DAILY-CAP', syncFailed: 'failed' };
  const ctx = { T };
  vm.runInNewContext(fnSrc(html, 'var WHY = ') + ';\n' + fnSrc(html, 'function syncWhy('), ctx);
  assert.equal(ctx.syncWhy(new Error('sync-cap')), 'DAILY-CAP');
  assert.equal(ctx.syncWhy(new Error('slow-down')), 'WAIT-A-MINUTE', 'التذكرة (١٠ في الساعة) تبقى «انتظر»');
  assert.equal(ctx.syncWhy(new Error('bad')), 'failed');
  assert.match(fnSrc(html, 'function matchAll('), /r\.error === 'slow-down' \? 'sync-cap' : r\.error/, 'في المطابقة وحدها');
});

test('رابط من التطبيق بلا مزامنة منتظرة: «ما قدرت أقرأ جهاتك» حتّى بلا حساب، ولا قراءة ولا نداء', () => {
  function run(s, token) {
    const done = [], got = [];
    const ctx = { token, T: { syncDenied: 'denied!', syncFailed: 'failed!' }, syncDone: (m) => done.push(m), syncFromTicket: (t, k) => got.push([t, k]) };
    vm.runInNewContext(fnSrc(html, 'function handleSyncHash('), ctx);
    ctx.handleSyncHash(s);
    return { done, got };
  }
  assert.deepEqual(run({ kind: 'stray' }, 'tok'), { done: ['failed!'], got: [] });
  assert.deepEqual(run({ kind: 'stray' }, ''), { done: ['failed!'], got: [] }, 'الصفحة فُتحت حيث لا أحد مسجَّل');
  assert.deepEqual(run(null, 'tok'), { done: [], got: [] }, 'لا جزء من التطبيق: لا شيء');
  assert.deepEqual(run({ kind: 'cs', t: 'T', k: 'K' }, ''), { done: [], got: [] }, 'بلا حساب لا sync-get');
  assert.deepEqual(run({ kind: 'cs', t: 'T', k: 'K' }, 'tok'), { done: [], got: [['T', 'K']] });
  assert.deepEqual(run({ kind: 'csd' }, 'tok'), { done: ['denied!'], got: [] });
  assert.deepEqual(run({ kind: 'cse' }, 'tok'), { done: ['failed!'], got: [] });
  // الجزء يُقرأ ويُعالَج عند الفتح وعند تغيّره
  assert.match(html, /handleSyncHash\(syncHash\);/);
  assert.match(html, /window\.addEventListener\('hashchange', function \(\) \{ handleSyncHash\(readSyncHash\(\)\); \}\);/);
});

test('الموافقة للحساب لا للجهاز: room-sync-ok يحمل اسم من ضغط «اسمح»، وحساب آخر على الجوال نفسه يرى الإفصاح', () => {
  const store = new Map();
  const ctx = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  vm.runInNewContext(fns('function lsGet(', 'function lsSet(', 'function bookUser(', 'function syncOk('), ctx);
  store.set('aiapp_username', ' Omran ');
  assert.equal(ctx.syncOk(), false, 'قبل «اسمح»');
  ctx.lsSet('room-sync-ok', ctx.bookUser());
  assert.equal(store.get('room-sync-ok'), 'omran', 'اسم الحساب بالحروف الصغيرة لا «1»');
  assert.equal(ctx.syncOk(), true);
  store.set('aiapp_username', 'someone-else');
  assert.equal(ctx.syncOk(), false, 'حساب ثانٍ: لا مزامنة صامتة ولا تخطّي للإفصاح');
  store.set('aiapp_username', 'Omran'); store.set('room-sync-ok', '1');
  assert.equal(ctx.syncOk(), false, 'القيمة القديمة «1» ليست موافقة حساب');
  store.delete('aiapp_username'); store.set('room-sync-ok', '');
  assert.equal(ctx.syncOk(), false, 'بلا اسم حساب: لا موافقة محفوظة');
  // كلّ من يقرأ الموافقة يمرّ بـsyncOk: زرّ المزامنة، «اسمح»، والتحديث الهادئ
  assert.equal((html.match(/'room-sync-ok'/g) || []).length, 2, 'في syncOk و«اسمح» وحدهما');
  assert.match(html, /else if \(d\.syncok\) \{ lsSet\('room-sync-ok', bookUser\(\)\); startSync\(\); \}/);
});

test('الاتّصال بصديق من جهات الهاتف يرسل رمز المتّصَل به لا رقمه، و«مو على التطبيق» يعيده لقائمة الدعوة', async () => {
  const h = 'c'.repeat(64);
  const sent = [];
  let reply = { ok: true, pushed: true }, saved = 0;
  const ctx = {
    role: 'host', code: '1234', key: 'k'.repeat(24), token: 'tok', error: '', contacts: [{ phone: '+971500000009', name: 'Saved', onApp: true }],
    book: { at: 1, list: [{ n: 'Ali', p: '+971551234567', h, t: 'CALLEE-TOKEN' }, { n: 'Nope', p: '+971551234568', h: 'd'.repeat(64) }] },
    T: { calling: 'Calling {n}…', pushOff: '{n} off', offline: 'offline', notOnAppErr: 'not on app' }, say: () => {}, draw: () => {},
    fmt: (s, n) => s.replace('{n}', n), host: () => Promise.resolve(), lsSet: () => { saved++; return true; },
    call: (b) => { sent.push(JSON.parse(JSON.stringify(b))); return Promise.resolve(reply); },
  };
  ctx.WHY = { 'not-on-app': 'not on app' };
  vm.runInNewContext(fns('function bookEntry(', 'function saveBook(', 'function ring('), ctx);
  const tick = () => new Promise((r) => setImmediate(r));

  ctx.ring('', h); await tick();
  assert.deepEqual(sent[0], { op: 'ring', token: 'tok', code: '1234', key: 'k'.repeat(24), callee: 'CALLEE-TOKEN' });
  assert.ok(!('phone' in sent[0]) && !JSON.stringify(sent[0]).includes('+971551234567'), 'الرقم لا يخرج');

  ctx.ring('', 'd'.repeat(64)); await tick();
  assert.equal(sent.length, 1, 'من ليس على التطبيق (بلا رمز) لا يُتّصل به');

  ctx.ring('+971500000009'); await tick();
  assert.deepEqual(sent[1], { op: 'ring', token: 'tok', code: '1234', key: 'k'.repeat(24), phone: '+971500000009' }, 'الرقم المحفوظ يدويًّا كما كان');

  reply = { error: 'not-on-app' };
  ctx.ring('', h); await tick(); await tick();
  assert.equal(ctx.book.list[0].t, undefined, 'الرمز يُمسح');
  assert.ok(saved >= 1, 'ويُحفظ على الجهاز');
  assert.equal(ctx.error, 'not on app');
});

test('جسر الـWebView: الجواب يُقبل بالـnonce نفسه فقط، والرفض يقول «ما في إذن»', () => {
  const calls = [];
  const ctx = { syncNonce: 'n1n1n1n1', syncQuiet: false, T: { syncDenied: 'denied!', syncFailed: 'failed!' }, JSON, window: {},
    syncDone: (m) => calls.push(['done', m]), gotPayload: (p) => { calls.push(['payload', p.v]); return Promise.resolve(); }, syncWhy: () => 'why' };
  vm.runInNewContext(fnSrc(html, 'window.__omranContacts = function') + ';', ctx);
  ctx.window.__omranContacts('other-nonce', { v: 1, list: [] }, '');
  assert.equal(calls.length, 0, 'جواب لطلب غيره');
  ctx.window.__omranContacts('n1n1n1n1', { v: 1, list: [] }, '');
  assert.deepEqual(calls, [['payload', 1]]);
  ctx.window.__omranContacts('n1n1n1n1', { v: 1, list: [] }, '');
  assert.equal(calls.length, 1, 'الـnonce لمرّة واحدة');
  vm.runInNewContext("syncNonce = 'n2n2n2n2'", ctx);
  ctx.window.__omranContacts('n2n2n2n2', null, 'denied');
  assert.deepEqual(calls[1], ['done', 'denied!']);
  vm.runInNewContext("syncNonce = 'n3n3n3n3'; syncQuiet = true", ctx);
  ctx.window.__omranContacts('n3n3n3n3', null, 'error');
  assert.deepEqual(calls[2], ['done', ''], 'المزامنة الهادئة لا تُظهر خطأً');
});

test('الشاشة: المزامنة بالحساب فقط (أندرويد بالتطبيق، وغيره بالملفّ)، والإفصاح قبل أيّ شيء أصليّ، ولا رقم في رابط، والدعوات مطويّة ومحدودة بالبحث', () => {
  assert.match(html, /var bridge = !!\(window\.OmranContacts && typeof window\.OmranContacts\.read === 'function'\), androidUA = \/Android\/i\.test/);
  assert.match(fnSrc(html, 'function syncBox('), /var fileWay = !\(bridge \|\| androidUA\);/, 'iPhone والحاسوب: طريق الملفّ (v-talk-room-file، tests/room-file.test.cjs)');
  assert.match(fnSrc(html, 'function startSync('), /if \(bridge\) syncNative\(false\); else if \(androidUA\) syncViaApp\(\); else \{ fileCC = guessCC\(\); fileOpen = true; draw\(\); \}/);
  assert.match(fnSrc(html, 'function contactsCard('), /if \(!token\) return '';/, 'بلا حساب لا شيء');
  assert.match(html, /else if \(d\.sync\) \{ if \(syncOk\(\)\) startSync\(\); else \{ syncAsk = true; draw\(\); \} \}/, 'أوّل مرّة لهذا الحساب: الإفصاح');
  assert.match(html, /else if \(d\.syncok\) \{ lsSet\('room-sync-ok', bookUser\(\)\); startSync\(\); \}/);
  assert.match(html, /if \(bridge && token && syncOk\(\) && \(!book \|\| Date\.now\(\) - book\.at > 24 \* 3600000\)\)/, 'التحديث الهادئ بعد موافقة هذا الحساب فقط ومرّة في اليوم (حدّ المطابقة اليوميّ)');
  assert.match(html, /setTimeout\(function \(\) \{ if \(syncNonce === mine\) \{ syncNonce = ''; syncDone\(silent \? '' : T\.syncFailed\); \} \}, 90000\);/, 'جواب التطبيق الضائع لا يترك «نقرأ جهاتك…» للأبد');
  assert.match(html, /ok = window\.OmranContacts\.granted\(\) === '1'/);
  assert.match(html, /syncGo = 'omranai:\/\/contacts-sync\?t=' \+ r\.id \+ '&n=' \+ n;/, 'رابط التطبيق: تذكرة وnonce فقط');
  assert.match(html, /<a href="\/android\.html"/, 'بلا التطبيق: رابط التنزيل');
  assert.match(fnSrc(html, 'function inviteRows('), /inviteFilter\(book \? book\.list : \[\], inviteQ, manualPhones\(\), 50\)/, '٥٠ صفًّا على الأكثر');
  assert.match(fnSrc(html, 'function inviteBox('), /\(inviteOpen \?/, 'مطويّة');
  assert.ok(!/call\(\{[^}]*\bbook\b/.test(html), 'القائمة لا تُرسل للخادم');
  for (const k of ['syncTitle', 'syncDisclose', 'syncCap', 'syncRelay', 'syncAllow', 'syncLater', 'inviteMany', 'searchPh']) {
    const en = new RegExp('\\b' + k + ": '"), seen = (html.match(new RegExp('\\b' + k + ": '", 'g')) || []).length;
    assert.ok(en.test(html) && seen >= 2, k + ' بالإنجليزيّة والعربيّة');
  }

  const ctx = { JSON };
  vm.runInNewContext(fnSrc(html, 'function inviteFilter('), ctx);
  const list = [{ n: 'Ali', p: '+971501234567' }, { n: 'علي', p: '+971551112222' }, { n: 'Sara', p: '+971509999999', t: 'x' }, { n: '', p: '+966551234567' }];
  for (let i = 0; i < 300; i++) list.push({ n: 'Friend ' + i, p: '+97156' + String(1000000 + i) });
  const all = ctx.inviteFilter(list, '', {}, 50);
  assert.equal(all.rows.length, 50); assert.equal(all.more, 303 - 50, 'المطابَق (بالرمز) ليس في الدعوة');
  assert.deepEqual(ctx.inviteFilter(list, 'ali', {}, 50).rows.map((r) => r.p), ['+971501234567']);
  assert.deepEqual(ctx.inviteFilter(list, 'علي', {}, 50).rows.map((r) => r.p), ['+971551112222']);
  assert.deepEqual(ctx.inviteFilter(list, '055 111', {}, 50).rows.map((r) => r.p), ['+971551112222'], 'الرقم المحلّي بصفره');
  assert.deepEqual(ctx.inviteFilter(list, '٩٦٦', {}, 50).rows.map((r) => r.p), ['+966551234567'], 'أرقام عربيّة');
  assert.equal(ctx.inviteFilter(list, 'ali', { '+971501234567': 1 }, 50).rows.length, 0, 'المحفوظ يدويًّا لا يتكرّر');
});

// ---- مراجعة عدائيّة: ما كان يمرّ على تطبيق معطوب

test('لا شيء أصليّ قبل «اسمح»: كلّ مسار إلى read وsync-ticket يمرّ بالموافقة، والتحديث الهادئ وحده بلا زرّ', () => {
  const count = (re) => (html.match(re) || []).length;
  assert.equal(count(/OmranContacts\.read\(/g), 1, 'read في syncNative وحدها');
  assert.match(fnSrc(html, 'function syncNative('), /OmranContacts\.read\(syncNonce\)/);
  assert.equal(count(/'sync-ticket'/g), 1, 'التذكرة في syncViaApp وحدها');
  assert.match(fnSrc(html, 'function syncViaApp('), /op: 'sync-ticket'/);
  assert.equal(count(/syncViaApp\(/g), 2, 'تعريفها + startSync');
  assert.equal(count(/syncNative\(/g), 3, 'تعريفها + startSync + التحديث الهادئ');
  assert.equal(count(/startSync\(\)/g), 3, 'تعريفها + زرّ المزامنة بعد الموافقة + «اسمح»');
  // التحديث الهادئ داخل شرط الموافقة والإذن
  const quiet = html.slice(html.indexOf('if (bridge && token && syncOk()'), html.indexOf('window.__ROOM ='));
  assert.ok(quiet.length > 0, 'شرط التحديث الهادئ موجود');
  assert.match(quiet, /granted\(\) === '1'/); assert.match(quiet, /syncNative\(true\)/);
  assert.match(quiet, /!role && !busy && !syncBusy/, 'لا وهو في غرفة');
});

test('العودة من التطبيق (#cs=): sync-get بالتذكرة وحدها — المفتاح لا يخرج أبدًا — وانتظار ٥ مرّات ثمّ فشل واضح', async () => {
  const payload = { v: 1, iso: 'ae', list: [['Ali', '0501234567']] };
  const K = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', K, iv);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))), c.final()]);
  const blob = Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64url'), k = K.toString('base64url'), t = 'e'.repeat(32);
  function run(replies) {
    const sent = [], done = [], got = [];
    const ctx = {
      crypto: globalThis.crypto, atob, Response, Blob, DecompressionStream, JSON, String, Error,
      window: { DecompressionStream, crypto: globalThis.crypto }, token: 'tok', syncBusy: '', error: '', T: { syncing: 'syncing', offline: 'offline', syncFailed: 'failed' },
      draw: () => {}, setTimeout: (f) => setImmediate(f),
      call: (b) => { sent.push(JSON.parse(JSON.stringify(b))); return Promise.resolve(replies.length > 1 ? replies.shift() : replies[0]); },
      gotPayload: (p) => { got.push(p); return Promise.resolve(); },
      syncDone: (m) => done.push(m), syncWhy: (e) => (e && e.message === 'no-ticket' ? 'no-ticket!' : 'failed'),
    };
    vm.runInNewContext(fns('function b64u(', 'function openBlob(', 'function syncFromTicket('), ctx);
    ctx.syncFromTicket(t, k);
    return { sent, done, got };
  }
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

  let r = run([{ wait: true }, { wait: true }, { blob }]);
  await settle();
  assert.equal(r.sent.length, 3);
  for (const b of r.sent) {
    assert.deepEqual(b, { op: 'sync-get', token: 'tok', id: t });
    assert.ok(!JSON.stringify(b).includes(k), 'المفتاح لا يصل الخادم');
  }
  assert.deepEqual(JSON.parse(JSON.stringify(r.got)), [payload], 'فُكّت على الجهاز');
  assert.deepEqual(r.done, []);

  r = run([{ wait: true }]);
  await settle();
  assert.equal(r.sent.length, 5, 'خمس محاولات فقط'); assert.deepEqual(r.done, ['failed']); assert.equal(r.got.length, 0);

  r = run([{ error: 'no-ticket' }]);
  await settle();
  assert.deepEqual(r.done, ['no-ticket!']);

  r = run([{ blob: blob.slice(0, -4) + 'AAAA' }]);      // نصّ عُبث به: GCM يرفضه
  await settle();
  assert.equal(r.got.length, 0); assert.deepEqual(r.done, ['failed']);
});

test('«نزّل التطبيق» لا يظهر والتطبيق فُتح فوق الصفحة (شاشة شفّافة: الصفحة تفقد التركيز ولا تختفي)', () => {
  const go = 'omranai://contacts-sync?t=' + 'a'.repeat(32) + '&n=abcdefgh';
  function run(ev) {
    const ls = {}, timers = [];
    const on = (k) => (n, f) => { ls[k + n] = f; }, off = (k) => (n) => { delete ls[k + n]; };
    const ctx = {
      syncGo: go, installNote: false, draw: () => {},
      location: {}, window: { addEventListener: on('w:'), removeEventListener: off('w:') },
      document: { hidden: false, addEventListener: on('d:'), removeEventListener: off('d:') },
      setTimeout: (f) => timers.push(f),
    };
    vm.runInNewContext(fnSrc(html, 'function openApp('), ctx);
    ctx.openApp();
    assert.equal(ctx.location.href, go);
    assert.equal(ctx.syncGo, '', 'الرابط لمرّة واحدة');
    if (ev === 'blur') ls['w:blur']();
    if (ev === 'hidden') { ctx.document.hidden = true; ls['d:visibilitychange'](); }
    timers.forEach((f) => f());
    assert.equal(Object.keys(ls).length, 0, 'المستمعان يُزالان');
    return ctx.installNote;
  }
  assert.equal(run('blur'), false, 'فقدت التركيز: التطبيق فُتح');
  assert.equal(run('hidden'), false);
  assert.equal(run(''), true, 'بقيت في التركيز: التطبيق غير موجود');
});

test('الأسماء من الهاتف لا تُحقن في الصفحة، وسجلّ تالف في room-book لا يكسر الرسم', () => {
  const evil = '<img src=x onerror=alert(1)>"\'';
  const store = new Map([['aiapp_username', 'Omran'], ['room-book', JSON.stringify({ at: 5, u: 'omran', iso: 'ae', list: [
    { n: evil, p: '+971501234567', h: 'a'.repeat(64), t: 'tok-a' },
    { n: evil + 'b', p: '+971501234568', h: 'b'.repeat(64) },
    { n: 42, p: '+971501234569', h: 'c'.repeat(64), t: 7 },
    { n: 'bad', p: '0501234567', h: 'd'.repeat(64) }, null,
  ] })]]);
  const ctx = {
    JSON, Number, Array, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: () => {}, removeItem: () => {} },
    token: 'tok', contacts: [], myPhone: '+971•••••99', inviteOpen: true, inviteQ: '',
    T: { contactsTitle: 'Contacts', callMore: 'Call', contactsNote: 'note', myPhoneNone: 'none', myPhone: 'Your number: {n}', onApp: 'on app', notOnApp: 'not', callBtn: 'Call', inviteBtn: 'Invite', del: 'Remove', noContacts: 'No', labelPh: 'Name', phonePh: '+971', addContact: 'Add', inviteMany: 'Invite {n} friends', searchPh: 'Search', moreHidden: '{n} more' },
    fmt: (s, n) => s.replace('{n}', n), syncBox: () => '', linkVia: [], linkPw: false, plink: null, linkedNow: false,      // v-talk-room-phone
  };
  vm.runInNewContext(fns('function lsGet(', 'function bookUser(', 'function loadBook(', 'function manualPhones(', 'function inviteFilter(', 'function inviteRows(', 'function inviteBox(', 'function contactsCard(', 'function phoneBox(', 'var esc = function'), ctx);
  store.set('aiapp_username', 'someone-else');
  assert.equal(ctx.loadBook(), null, 'حساب آخر على الجوال نفسه لا يرى قائمة الأوّل');
  store.set('aiapp_username', 'Omran');
  ctx.book = ctx.loadBook();
  assert.equal(ctx.book.list.length, 3, 'الرقم غير E.164 والصفّ الفارغ خارج');
  const odd = ctx.book.list.find((r) => r.h === 'c'.repeat(64));
  assert.equal(odd.n, ''); assert.equal('t' in odd, false, 'رمز ليس نصًّا يُهمَل');
  const out = ctx.contactsCard(false) + ctx.contactsCard(true);
  assert.ok(!out.includes('<img'), 'لا وسم من اسم');
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;'));
  assert.match(out, /data-ringt="a{64}"/, 'زرّ الاتّصال بالبصمة لا بالرقم');
  assert.ok(!/data-ringt="[^"]*\+/.test(out));
});

// ---- المراجعة النهائيّة: الصياغة (#3) والخروج

test('الإفصاح وسياسة الخصوصيّة لا يسمّيان بصمة الرقم «مشفّرة»: رمز باتّجاه واحد للمطابقة، لا يُحفظ ولا يُسجَّل — والمرحَّل مشفّر حقًّا', () => {
  const I18N = new Function(html.slice(html.indexOf('var I18N = {'), html.indexOf('var T = Object.assign')) + '; return I18N;')();
  const ENC = /encrypt|مشفّر|مشفر|تشفير/i;
  for (const l of ['en', 'ar']) {
    assert.ok(I18N[l].syncDisclose && I18N[l].syncCap, l);
    assert.doesNotMatch(I18N[l].syncDisclose, ENC, l + ': لا «مشفّرة» للبصمة');
    assert.match(I18N[l].syncDisclose, /hash/, l + ': تسمّي البصمة');
    assert.match(I18N[l].syncRelay, l === 'en' ? /encrypted/ : /مشفّرة/, l + ': نقل القائمة كاملة مشفّر فعلًا');
  }
  // مراجعة: اللغات الـ١٢ الأخرى كانت تقول «بصمة مشفّرة» أيضًا — كلمة «مشفّر» بكلّ لغة (تظهر في syncRelay، فالنمط يُثبت نفسه هناك)
  const ENC_ALL = /encrypt|مشفّر|chiffr|cifrad|şifrel|зашифр|加密|एन्क्रिप्ट|خفیہ|এনক্রিপ্ট|इन्क्रिप्ट|എൻക്രിപ്റ്റ്|terenkripsi|naka-encrypt/i;
  assert.equal(Object.keys(I18N).length, 14);
  for (const l of Object.keys(I18N)) {
    assert.ok(I18N[l].syncDisclose, l);
    assert.doesNotMatch(I18N[l].syncDisclose, ENC_ALL, l + ': لا «مشفّرة» للبصمة');
    assert.match(I18N[l].syncRelay, ENC_ALL, l + ': النمط يعرف كلمة «مشفّر» في هذه اللغة');
  }
  assert.match(I18N.en.syncDisclose, /one-way code \(a hash\)/); assert.match(I18N.en.syncDisclose, /not stored or logged/);
  assert.match(I18N.ar.syncDisclose, /رمز باتجاه واحد \(hash\)/); assert.match(I18N.ar.syncDisclose, /ما ينحفظ ولا يتسجّل/);
  assert.match(I18N.en.syncCap, /today's limit/); assert.match(I18N.ar.syncCap, /حد اليوم/);

  const pv = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
  assert.ok(!pv.includes('encrypted fingerprints') && !pv.includes('بصماتٍ مشفّرة'), 'العبارة القديمة ذهبت');
  const hashLi = (re) => (pv.match(re) || [])[0] || '';
  const en = hashLi(/<li>Numbers are sent to our server[^<]*<\/li>/), ar = hashLi(/<li>الأرقام تُرسل إلى خادمنا[^<]*<\/li>/);
  assert.ok(en && ar, 'سطر البصمة بالإنجليزيّة والعربيّة');
  assert.doesNotMatch(en, ENC); assert.doesNotMatch(ar, ENC);
  assert.match(en, /one-way codes \(SHA-256 hashes\), used only for matching/); assert.match(en, /not stored or logged/);
  assert.match(ar, /رموزًا باتّجاه واحد فقط \(بصمات SHA-256\)، تُستخدم للمطابقة وحدها/); assert.match(ar, /ولا تُحفظ ولا تُسجَّل/);
  assert.match(pv, /passes through our server on its way to the page, encrypted with a key only your phone has/, 'المرحَّل كاملًا مشفّر');
  assert.match(pv, /تمرّ القائمة \(الأسماء والأرقام\) بخادمنا في طريقها إلى الصفحة مشفّرةً بمفتاح لا يملكه إلا هاتفك/);
});

test('الخروج وحذف الحساب يمسحان نسخة جهات الهاتف وموافقتها وطلبها المنتظر — في آخر LOGOUT_WIPE_KEYS (‎.slice(5)‎ لا تتغيّر لما قبلها)', () => {
  const a4 = fs.readFileSync(path.join(ROOT, 'js/app-04-i18n-state.js'), 'utf8');
  const m = /const LOGOUT_WIPE_KEYS = (\[[^\]]*\]);/.exec(a4);
  assert.ok(m, 'LOGOUT_WIPE_KEYS');
  const keys = vm.runInNewContext(m[1]);
  assert.deepEqual(Array.from(keys.slice(0, 9)), ['aiapp_projects', 'aiapp_projects_slim', 'aiapp_current_id', 'aiapp_provider_projects', 'aiapp_deleted_chats',
    'aiapp_studio_favorites', 'aiapp_fashion_favorites', 'omran_hero_b64', 'omran_hero_mime'], 'ما قبلها بترتيبه');
  assert.deepEqual(Array.from(keys.slice(9)), ['room-book', 'room-sync-ok', 'room-sync-pend']);
  for (const k of ['room-book', 'room-sync-ok', 'room-sync-pend']) assert.ok(html.includes("'" + k + "'"), 'الصفحة تستعمل ' + k);
});
