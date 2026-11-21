// tests/funnel.test.cjs — v-funnel: عدّاد داخليّ مجهول لمسار الزائر الجديد.
// المالك (٢١ نوفمبر ٢٠٢٦) على أرقامه «١٠ آلاف متابع ← ١٥٠ دخول ← ٨ مشتركين»: «نجرب، ركّب» عن قياس يبيّن المسار من المتابع إلى التسجيل.
// سياسة الخصوصيّة تقول «لا نشارك بياناتك مع أطراف ثالثة»، فالقياس داخليّ: زيارة ← (متجر) ← موافقة ← أوّل رسالة ← دخول بحساب،
// حسب المصدر ونوع الجهاز — أعداد فقط، بلا هويّة ولا كوكيز. بلا شبكة: KV بديل، والواجهة في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'funnel-test-secret';
for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME']) delete process.env[k];
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const F = require(path.join(ROOT, 'api/_lib/funnel.js'));

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 trill_350003 BytedanceWebview/d8a21c6',
  tiktokIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/ar Region/AE',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36 Instagram 340.0.0.22.109 Android (34/14; 480dpi)',
  instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 Instagram 350.1.0.46.90 (iPhone15,3; iOS 18_0; ar_AE; ar; scale=3.00)',
  snapchat: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.90.0.46 (like Safari/8617.2.4.10.8, panda)',
  facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.31.105;FBBV/615]',
  twitter: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.50',
  linkedin: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 LinkedInApp',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  huawei: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ELS-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
const HOST = 'omran-ai-builder.vercel.app';
const URL_FN = '/api/system?action=funnel';

/* ── الواجهة: الجزء كاملًا في vm ببيئة متصفّح وهميّة ── */
const A10 = read('js/app-10-features.js');
const PART = A10.slice(A10.indexOf('/* v-funnel (المالك ٢١ نوفمبر ٢٠٢٦')); // الكتلة مُلحقة بآخر الجزء
if (!PART.startsWith('/* v-funnel') || !PART.includes('function omranFunnelBoot(')) throw new Error('كتلة v-funnel ليست آخر js/app-10-features.js');
function browser(o) {
  const opt = o || {};
  const store = new Map(Object.entries(opt.ls || {}));
  const sent = [], fetched = [], swallowed = [];
  const ctx = {
    navigator: Object.assign({ userAgent: opt.ua || UA.android, maxTouchPoints: opt.touch == null ? 5 : opt.touch }, opt.nav || {}),
    location: { search: opt.search || '', hostname: HOST },
    document: { referrer: opt.referrer || '' },
    localStorage: {
      getItem: (k) => { if (opt.lsThrows) throw new Error('SecurityError'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (opt.lsThrows || opt.lsReadOnly || opt.lsFailKey === k) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    },
    __swallow: (e, tag) => { swallowed.push(tag); },
    omranLikelyApp: () => !!opt.app,
    fetch: (u, init) => { fetched.push({ u, init }); return Promise.resolve({ ok: true, json: async () => opt.report || null }); },
    JSON, String, Object, Promise,
  };
  ctx.window = { matchMedia: () => ({ matches: !!opt.standalone }) };
  if (opt.beacon !== 'missing') ctx.navigator.sendBeacon = (u, b) => { sent.push({ u, b: JSON.parse(b) }); return opt.beacon !== 'refused'; };
  vm.runInNewContext(PART + '\nthis.api = { source: omranFunnelSource, platform: omranFunnelPlatform, mark: omranFunnelMark, lines: omranFunnelLines, panel: omranFunnelPanel };', ctx);
  return { api: ctx.api, sent, fetched, swallowed, store };
}
const PURE = browser({ ls: { aiapp_fn: '-' } }).api;

test('١. المصدر: الوسم الصريح، ثمّ متصفّح التطبيق الداخليّ، ثمّ الصفحة المُحيلة، ثمّ الدعوة، وإلّا مباشر', () => {
  const S = (search, ua, ref) => PURE.source(search || '', ua || UA.android, ref || '', HOST);
  // الوسم الصريح يغلب كلّ شيء
  assert.equal(S('?src=tiktok', UA.instagramAndroid, 'https://www.google.com/'), 'tiktok');
  assert.equal(S('?utm_source=IG&x=1'), 'instagram');
  assert.equal(S('?a=1&src=snap'), 'snapchat');
  assert.equal(S('?src=newsletter'), 'other', 'وسم غير معروف = other لا نصّه');
  assert.equal(S('?src=%E0%A4%A'), 'other', 'ترميز مكسور لا يرمي');
  // متصفّحات التطبيقات
  for (const [k, want] of [['tiktokAndroid', 'tiktok'], ['tiktokIphone', 'tiktok'], ['instagramAndroid', 'instagram'], ['instagramIphone', 'instagram'], ['snapchat', 'snapchat'], ['facebook', 'facebook'], ['twitter', 'x'], ['linkedin', 'linkedin']]) {
    assert.equal(S('', UA[k]), want, k);
    assert.equal(S('?ref=omran', UA[k]), want, k + ': التطبيق أدلّ من رمز الدعوة');
  }
  // الصفحة المُحيلة
  for (const [ref, want] of [['https://www.tiktok.com/@omran', 'tiktok'], ['https://l.instagram.com/?u=x', 'instagram'], ['https://t.co/abc', 'x'], ['https://x.com/home', 'x'], ['https://mobile.twitter.com/a', 'x'],
    ['https://www.youtube.com/watch?v=1', 'youtube'], ['https://youtu.be/1', 'youtube'], ['https://l.facebook.com/l.php', 'facebook'], ['https://web.whatsapp.com/', 'whatsapp'], ['https://t.me/s/ch', 'telegram'],
    ['https://www.linkedin.com/feed', 'linkedin'], ['https://www.google.ae/', 'google'], ['https://www.google.com/search?q=om', 'google'], ['https://www.bing.com/search', 'search'], ['https://duckduckgo.com/', 'search'],
    ['https://www.netflix.com/', 'other'], ['https://example.org/blog', 'other']]) assert.equal(S('', UA.windows, ref), want, ref);
  assert.equal(S('', UA.windows, 'https://' + HOST + '/en/tools/decor.html'), 'site', 'من صفحة أخرى في الموقع');
  assert.equal(S('', UA.windows, 'https://www.' + HOST + '/explore.html'), 'site');
  assert.equal(S('?ref=omran', UA.windows, ''), 'invite');
  assert.equal(S('?ref=ab', UA.windows, ''), 'direct', 'رمز دعوة غير صالح');
  assert.equal(S('', UA.windows, ''), 'direct');
  assert.equal(S('', UA.android, 'android-app://com.omran.aibuilder'), 'direct', 'مُحيل ليس http لا يُصنَّف');
  // كلّ ما يرجع من القائمة المغلقة في الخادم
  for (const v of ['tiktok', 'instagram', 'snapchat', 'youtube', 'facebook', 'x', 'whatsapp', 'telegram', 'linkedin', 'google', 'search', 'invite', 'site', 'direct', 'other']) assert.ok(F.SOURCES.includes(v), v);
});

test('٢. الجهاز: آيفون وآيباد بوضع الحاسوب = ios، أندرويد وهارموني = android، والباقي desktop', () => {
  assert.equal(PURE.platform(UA.iphone, 5), 'ios');
  assert.equal(PURE.platform(UA.ipadDesktop, 5), 'ios', 'آيباد يعرّف نفسه ماك وله لمس');
  assert.equal(PURE.platform(UA.mac, 0), 'desktop');
  assert.equal(PURE.platform(UA.android, 5), 'android');
  assert.equal(PURE.platform(UA.huawei, 5), 'android');
  assert.equal(PURE.platform(UA.windows, 0), 'desktop');
  for (const v of ['ios', 'android', 'desktop']) assert.ok(F.PLATFORMS.includes(v));
});

test('٣. زائر جديد: «visit» واحدة بمصدره وجهازه، ثمّ كلّ مرحلة مرّة واحدة في عمر المتصفّح بالمصدر نفسه', () => {
  const b = browser({ ua: UA.tiktokAndroid, search: '?ref=omran' });
  assert.deepEqual(b.sent, [{ u: URL_FN, b: { e: 'visit', s: 'tiktok', p: 'android' } }]);
  assert.equal(b.store.get('aiapp_fn'), 'v');
  assert.equal(b.store.get('aiapp_src'), 'tiktok|android');
  assert.equal(b.api.mark('consent'), true);
  assert.equal(b.api.mark('consent'), false, 'الموافقة لا تُعدّ مرّتين');
  assert.equal(b.api.mark('msg'), true);
  assert.equal(b.api.mark('account'), true);
  assert.equal(b.api.mark('account'), false);
  assert.equal(b.api.mark('visit'), false, 'الزيارة من الإقلاع وحده');
  assert.equal(b.api.mark('purchase'), false, 'حدث خارج القائمة');
  assert.deepEqual(b.sent.map((x) => x.b.e), ['visit', 'consent', 'msg', 'account']);
  assert.ok(b.sent.every((x) => x.u === URL_FN && x.b.s === 'tiktok' && x.b.p === 'android' && Object.keys(x.b).length === 3), 'ثلاثة حقول فقط: حدث ومصدر وجهاز');
  assert.equal(b.store.get('aiapp_fn'), 'vcma');
  assert.equal(b.fetched.length, 0);
  // زيارة ثانية للمتصفّح نفسه: لا شيء
  const again = browser({ ua: UA.tiktokAndroid, ls: { aiapp_fn: 'vcma', aiapp_src: 'tiktok|android' } });
  assert.equal(again.sent.length, 0);
  assert.equal(again.api.mark('msg'), false);
  // عدّته صفحة /app وأرسلته إلى التطبيق: المراحل تكمل من العلامة نفسها بمصدرها
  const fromApp = browser({ ua: UA.android, ls: { aiapp_fn: 'v', aiapp_src: 'instagram|android' } });
  assert.equal(fromApp.sent.length, 0, 'لا زيارة ثانية');
  assert.equal(fromApp.api.mark('consent'), true);
  assert.deepEqual(fromApp.sent[0].b, { e: 'consent', s: 'instagram', p: 'android' });
});

test('٤. لا يُعدّ: متصفّح قديم (وافق أو دخل قبل اليوم)، التطبيق المثبّت وأغلفة المتاجر، الزواحف والمتصفّحات الآليّة، و«عدم التتبّع»', () => {
  const quiet = [
    ['وافق سابقًا', { ls: { aiapp_privacy_ack: '1' } }], ['له جلسة', { ls: { aiapp_auth_token: 'tok' } }], ['له حساب', { ls: { aiapp_username: 'ali' } }],
    ['زاحف', { ua: UA.googlebot }], ['متصفّح آليّ', { nav: { webdriver: true } }], ['عدم التتبّع', { nav: { doNotTrack: '1' } }], ['GPC', { nav: { globalPrivacyControl: true } }],
    ['حزمة متجر', { search: '?store=huawei' }], ['مثبّت', { standalone: true }], ['آيفون مثبّت', { nav: { standalone: true } }], ['غلاف تطبيق', { app: true }],
  ];
  for (const [name, o] of quiet) {
    const b = browser(Object.assign({ ua: UA.tiktokAndroid }, o));
    assert.equal(b.sent.length + b.fetched.length, 0, name + ': لا إرسال');
    assert.equal(b.store.get('aiapp_fn'), '-', name + ': علامة «لا يُعدّ» تُحفظ');
    for (const ev of ['consent', 'msg', 'account']) assert.equal(b.api.mark(ev), false, name + ': ' + ev);
    assert.equal(b.sent.length + b.fetched.length, 0, name);
  }
  // تخزين محجوب أو لا يُكتب: لا عدّ ولا خطأ يصل الصفحة (العلامة تُكتب قبل الإرسال، فلا عدّ متكرّر)
  for (const o of [{ lsThrows: true }, { lsReadOnly: true }]) {
    const b = browser(Object.assign({ ua: UA.tiktokAndroid }, o));
    assert.equal(b.sent.length + b.fetched.length, 0);
    assert.equal(b.api.mark('consent'), false);
    assert.ok(b.swallowed.includes('funnel:boot'));
  }
  // العلامة نفسها لا تُكتب (امتلأ التخزين عندها): الإرسال بعدها لا قبلها، فلا يُعدّ الزائر في كلّ فتحة
  const noFlag = browser({ ua: UA.tiktokAndroid, lsFailKey: 'aiapp_fn' });
  assert.equal(noFlag.sent.length + noFlag.fetched.length, 0, 'علامة الزيارة لم تُكتب = لا زيارة');
  const noStage = browser({ ua: UA.tiktokAndroid, ls: { aiapp_fn: 'v', aiapp_src: 'tiktok|android' }, lsReadOnly: true });
  assert.equal(noStage.api.mark('consent'), false);
  assert.equal(noStage.sent.length + noStage.fetched.length, 0, 'علامة المرحلة لم تُكتب = لا مرحلة');
});

test('٥. الإرسال: sendBeacon نصًّا إلى النطاق نفسه، وإن رُفض أو غاب فـfetch بـkeepalive', () => {
  for (const mode of ['refused', 'missing']) {
    const b = browser({ ua: UA.iphone, referrer: 'https://www.google.ae/', beacon: mode });
    assert.equal(b.fetched.length, 1, mode);
    assert.equal(b.fetched[0].u, URL_FN);
    assert.equal(b.fetched[0].init.method, 'POST');
    assert.equal(b.fetched[0].init.keepalive, true);
    assert.deepEqual(JSON.parse(b.fetched[0].init.body), { e: 'visit', s: 'google', p: 'ios' });
  }
  assert.ok(!/https?:\/\//.test(PART.replace(/\/\^https\?:[^\n]*/g, '').replace(/https\?:/g, '')), 'لا عنوان خارجيّ في الجزء — لا طرف ثالث');
});

/* ── الخادم ── */
function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
function kvStub(o) {
  const opt = o || {};
  const calls = [];
  return { calls, kvPipeline: async (cmds) => { calls.push(cmds); if (opt.fail) throw new Error('Upstash pipeline error: HTTP 500'); return cmds.map((c) => (c[0] === 'HGETALL' ? ((opt.rows || {})[c[1]] || []) : 1)); } };
}
async function call(o) {
  const out = { status: 0, json: undefined, ended: false, headers: {} };
  const res = { setHeader(k, v) { out.headers[k] = v; }, status(c) { out.status = c; return this; }, json(v) { out.json = v; return this; }, end() { out.ended = true; return this; } };
  const req = { method: o.method || 'POST', query: o.query || {}, body: o.body, headers: Object.assign({ 'user-agent': UA.android, 'x-forwarded-for': o.ip || '203.0.113.7' }, o.headers || {}) };
  await F(req, res, { kv: o.kv, now: () => (o.now == null ? Date.UTC(2026, 10, 21, 12, 0, 0) : o.now) });
  return out;
}

test('٦. الخادم يعدّ: خانة واحدة «حدث|مصدر|جهاز» في مفتاح اليوم، والقيم من قوائم مغلقة', async () => {
  F.__resetLimiter();
  let kv = kvStub();
  let r = await call({ kv, body: { e: 'visit', s: 'tiktok', p: 'android' } });
  assert.equal(r.status, 204);
  assert.deepEqual(kv.calls, [[['HINCRBY', 'funnel/day/2026-11-21', 'visit|tiktok|android', '1']]]);
  assert.equal(r.headers['Cache-Control'], 'no-store');
  // sendBeacon يرسل نصًّا
  kv = kvStub();
  r = await call({ kv, body: JSON.stringify({ e: 'account', s: 'instagram', p: 'ios' }) });
  assert.deepEqual(kv.calls[0][0], ['HINCRBY', 'funnel/day/2026-11-21', 'account|instagram|ios', '1']);
  // مصدر وجهاز خارج القائمة = other؛ ولا يدخل نصّ الطلب مفتاحًا ولا خانة
  kv = kvStub();
  await call({ kv, body: { e: 'msg', s: 'evil|x\n', p: '<script>' } });
  assert.deepEqual(kv.calls[0][0], ['HINCRBY', 'funnel/day/2026-11-21', 'msg|other|other', '1']);
  // ما يُهمَل بصمت: حدث مجهول، جسم لا يُقرأ أو طويل، زاحف
  for (const o of [{ body: { e: 'purchase', s: 'tiktok', p: 'ios' } }, { body: {} }, { body: 'not json' }, { body: JSON.stringify({ e: 'visit', s: 'tiktok', p: 'ios', pad: 'x'.repeat(300) }) }, { body: { e: 'visit', s: 'google', p: 'android' }, headers: { 'user-agent': UA.googlebot } }]) {
    kv = kvStub();
    r = await call(Object.assign({ kv }, o));
    assert.equal(r.status, 204);
    assert.equal(kv.calls.length, 0, JSON.stringify(o.body).slice(0, 40));
  }
  // عطل التخزين لا يصل الزائر، وغير POST مرفوض
  r = await call({ kv: kvStub({ fail: true }), body: { e: 'visit', s: 'direct', p: 'desktop' } });
  assert.equal(r.status, 204);
  kv = kvStub();
  r = await call({ kv, method: 'GET' });
  assert.equal(r.status, 405);
  assert.equal(kv.calls.length, 0);
  assert.deepEqual(F.EVENTS, ['visit', 'store', 'consent', 'msg', 'account']);
});

test('٧. الحدّ في الذاكرة: ١٢ حدثًا لكلّ عنوان في عشر دقائق، وسقف للدالّة كلّها في الدقيقة — بلا أمر تخزين زائد', async () => {
  F.__resetLimiter();
  const t0 = Date.UTC(2026, 10, 21, 12, 0, 0);
  const kv = kvStub();
  for (let i = 0; i < 15; i++) await call({ kv, now: t0 + i, body: { e: 'visit', s: 'direct', p: 'desktop' }, ip: '198.51.100.9' });
  assert.equal(kv.calls.length, 12, 'الثالث عشر وما بعده يُهمَل');
  await call({ kv, now: t0 + 20, body: { e: 'visit', s: 'direct', p: 'desktop' }, ip: '198.51.100.10' });
  assert.equal(kv.calls.length, 13, 'عنوان آخر لا يتأثّر');
  await call({ kv, now: t0 + 11 * 60 * 1000, body: { e: 'visit', s: 'direct', p: 'desktop' }, ip: '198.51.100.9' });
  assert.equal(kv.calls.length, 14, 'بعد النافذة يعود');
  assert.ok(kv.calls.every((c) => c.length === 1 && c[0][0] === 'HINCRBY'), 'أمر واحد لكلّ حدث');
  // سقف الدالّة: ٣٠٠ في الدقيقة من عناوين مختلفة
  F.__resetLimiter();
  const kv2 = kvStub();
  for (let i = 0; i < 320; i++) await call({ kv: kv2, now: t0 + 60000 * 30 + i, body: { e: 'visit', s: 'direct', p: 'desktop' }, ip: '10.0.' + Math.floor(i / 250) + '.' + (i % 250) });
  assert.equal(kv2.calls.length, 300);
  F.__resetLimiter();
});

test('٨. التقرير للمالك وحده: مجموع الأيّام، وحسب المصدر (الأكثر زيارة أوّلًا) والجهاز واليوم', async () => {
  F.__resetLimiter();
  const rows = {
    'funnel/day/2026-11-21': ['visit|tiktok|android', '40', 'visit|tiktok|ios', '20', 'store|tiktok|ios', '18', 'consent|tiktok|android', '15', 'msg|tiktok|android', '9', 'account|tiktok|android', '4', 'visit|google|desktop', '5', 'account|google|desktop', '2'],
    'funnel/day/2026-11-20': { 'visit|instagram|android': '10', 'consent|instagram|android': '6', 'visit|tiktok|android': '10', 'weird': '7', 'visit|bad': '3', 'visit|martian|android': 'abc', 'visit|martian|toaster': '2' },
    'funnel/day/2026-11-10': ['visit|direct|desktop', '1'],
  };
  for (const tk of ['', 'garbage', token('someone')]) {
    const kv = kvStub({ rows });
    const r = await call({ kv, body: { op: 'report', token: tk } });
    assert.equal(r.status, 403, 'غير المالك: ' + (tk ? tk.slice(0, 8) : 'بلا رمز'));
    assert.equal(kv.calls.length, 0, 'لا قراءة قبل التحقّق');
  }
  const kv = kvStub({ rows });
  const r = await call({ kv, body: { op: 'report', token: token('omran'), days: 30 } });
  assert.equal(r.status, 200);
  assert.equal(kv.calls.length, 1);
  assert.equal(kv.calls[0].length, 30);
  assert.deepEqual(kv.calls[0][0], ['HGETALL', 'funnel/day/2026-11-21']);
  assert.deepEqual(kv.calls[0][29], ['HGETALL', 'funnel/day/2026-10-23']);
  const d = r.json;
  assert.equal(d.days, 30);
  assert.equal(d.today, '2026-11-21');
  assert.equal(d.since, '2026-11-10');
  assert.deepEqual(d.total, { visit: 88, store: 18, consent: 21, msg: 9, account: 6 });
  assert.deepEqual(d.bySource.map((x) => x.src), ['tiktok', 'instagram', 'google', 'other', 'direct']);
  assert.deepEqual(d.bySource[0], { src: 'tiktok', visit: 70, store: 18, consent: 15, msg: 9, account: 4 });
  assert.deepEqual(d.bySource[3], { src: 'other', visit: 2, store: 0, consent: 0, msg: 0, account: 0 }, 'مصدر وجهاز مجهولان = other');
  assert.deepEqual(d.byPlatform.map((x) => [x.plat, x.visit]), [['android', 60], ['ios', 20], ['desktop', 6], ['other', 2]]);
  assert.deepEqual(d.byDay.map((x) => x.day), ['2026-11-21', '2026-11-20', '2026-11-10'], 'الأيّام التي فيها أرقام، الأحدث أوّلًا');
  assert.deepEqual(d.byDay[1], { day: '2026-11-20', visit: 22, store: 0, consent: 6, msg: 0, account: 0 });
  // عبر العنوان أيضًا، والأيّام محدودة
  const kv2 = kvStub();
  const r2 = await call({ kv: kv2, method: 'GET', query: { op: 'report', token: token('omran'), days: '999' } });
  assert.equal(r2.status, 200);
  assert.equal(kv2.calls[0].length, 90);
  assert.deepEqual(r2.json.total, { visit: 0, store: 0, consent: 0, msg: 0, account: 0 });
  assert.equal(r2.json.since, null);
  assert.equal((await call({ kv: kvStub({ fail: true }), body: { op: 'report', token: token('omran') } })).status, 503);
  assert.ok(read('api/system.js').includes("case 'funnel': return require('./_lib/funnel.js');"), 'في موجّه قائم — لا دالّة Vercel جديدة');
});

/* ── صفحة /app: السكربت الحقيقيّ كاملًا ── */
const INTRO_IDS = ['intro', 'introTitle', 'introSub', 'introTry', 'introEx1', 'introEx2', 'introEx3', 'introShot', 'introGo'];
function landing(o) {
  const html = read('download.html');
  const m = /<script>\n([\s\S]*?)<\/script>/.exec(html);
  const els = {};
  for (const id of INTRO_IDS) els[id] = { id, hidden: id === 'intro', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const store = new Map(Object.entries(o.ls || {}));
  const out = { replaced: null, sent: [], order: [] };
  const ctx = {
    navigator: Object.assign({ userAgent: o.ua, maxTouchPoints: o.touch == null ? 5 : o.touch, language: 'ar', sendBeacon: (u, b) => { out.sent.push({ u, b: JSON.parse(b) }); out.order.push('beacon'); return true; } }, o.nav || {}),
    location: { search: o.search || '', hostname: HOST, replace: (u) => { out.replaced = u; out.order.push('replace'); } },
    window: { matchMedia: () => ({ matches: !!o.standalone }) },
    localStorage: { getItem: (k) => { if (o.lsThrows) throw new Error('SecurityError'); return store.has(k) ? store.get(k) : null; }, setItem: (k, v) => { if (o.lsThrows) throw new Error('SecurityError'); store.set(k, String(v)); } },
    document: { referrer: o.referrer || '', documentElement: { lang: 'ar', dir: 'rtl', className: '' }, getElementById: (id) => els[id] || null },
  };
  vm.runInNewContext(m[1], ctx);
  return { out, els, store };
}

test('٩. صفحة /app تعدّ الزائر قبل أن يغادر: «visit» دائمًا، و«store» لمن وجهته متجر — ثمّ تحوّله كما كانت', () => {
  // آيفون من تيك توك ← App Store: يُعدّ قبل التحويل، والعلامة تمنع عدّه ثانية
  let r = landing({ ua: UA.tiktokIphone, search: '?ref=omran' });
  assert.match(String(r.out.replaced), /^https:\/\/apps\.apple\.com\//);
  assert.deepEqual(r.out.sent.map((x) => x.b), [{ e: 'visit', s: 'tiktok', p: 'ios' }, { e: 'store', s: 'tiktok', p: 'ios' }]);
  assert.ok(r.out.sent.every((x) => x.u === URL_FN));
  assert.deepEqual(r.out.order, ['beacon', 'beacon', 'replace'], 'العدّ قبل المغادرة');
  assert.equal(r.store.get('aiapp_fn'), 'vt');
  assert.equal(r.store.get('aiapp_src'), 'tiktok|ios');
  // هواوي وويندوز كذلك
  r = landing({ ua: UA.huawei });
  assert.match(String(r.out.replaced), /^https:\/\/appgallery\.huawei\.com\//);
  assert.deepEqual(r.out.sent.map((x) => x.b.e + '|' + x.b.s + '|' + x.b.p), ['visit|direct|android', 'store|direct|android']);
  r = landing({ ua: UA.windows, touch: 0, referrer: 'https://www.google.com/' });
  assert.deepEqual(r.out.sent.map((x) => x.b.e + '|' + x.b.s + '|' + x.b.p), ['visit|google|desktop', 'store|google|desktop']);
  // أندرويد من إنستغرام (لا متجر منشور): التعريف يظهر والزيارة تُعدّ بلا «store»، والتطبيق يكمل المراحل
  r = landing({ ua: UA.instagramAndroid, search: '?ref=omran' });
  assert.equal(r.out.replaced, null);
  assert.equal(r.els.intro.hidden, false);
  assert.deepEqual(r.out.sent.map((x) => x.b), [{ e: 'visit', s: 'instagram', p: 'android' }]);
  assert.equal(r.store.get('aiapp_fn'), 'v');
  const inApp = browser({ ua: UA.instagramAndroid, ls: Object.fromEntries(r.store) });
  assert.equal(inApp.sent.length, 0, 'التطبيق لا يعدّ الزيارة ثانية');
  assert.equal(inApp.api.mark('consent'), true);
  assert.deepEqual(inApp.sent[0].b, { e: 'consent', s: 'instagram', p: 'android' });
  // ماك: إلى التطبيق مباشرة
  r = landing({ ua: UA.mac, touch: 0 });
  assert.equal(r.out.replaced, '/?install=1');
  assert.deepEqual(r.out.sent.map((x) => x.b), [{ e: 'visit', s: 'direct', p: 'desktop' }]);
  // لا يُعدّ: عائد، مثبّت، غلاف TWA، زاحف، متصفّح آليّ، عدم التتبّع، ومن عُدّ من قبل — والتحويل كما هو
  for (const [name, o] of [['عائد', { ls: { aiapp_privacy_ack: '1' } }], ['له حساب', { ls: { aiapp_username: 'ali' } }], ['مثبّت', { standalone: true }], ['TWA', { ls: { aiapp_twa: '1' } }],
    ['زاحف', { ua: UA.googlebot }], ['آليّ', { nav: { webdriver: true } }], ['عدم التتبّع', { nav: { doNotTrack: '1' } }], ['عُدّ من قبل', { ls: { aiapp_fn: 'v', aiapp_src: 'tiktok|ios' } }]]) {
    const q = landing(Object.assign({ ua: UA.tiktokIphone }, o));
    assert.equal(q.out.sent.length, 0, name);
    assert.ok(q.out.replaced || q.els.intro.hidden === false, name + ': يكمل كما كان (تحويل أو تعريف)');
  }
  // تخزين محجوب: لا عدّ، والزائر يكمل
  r = landing({ ua: UA.tiktokIphone, lsThrows: true });
  assert.equal(r.out.sent.length, 0);
  assert.match(String(r.out.replaced), /^https:\/\/apps\.apple\.com\//);
});

test('١٠. دالّتا المصدر والجهاز في صفحة /app نسخة حرفيّة من الجزء', () => {
  const from = PART.indexOf('function omranFunnelSource('), to = PART.indexOf('/* من لا يُعدّ إطلاقًا');
  assert.ok(from > 0 && to > from);
  const fns = PART.slice(from, to).trimEnd();
  const inPage = fns.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
  assert.ok(read('download.html').includes(inPage), 'النسخة في download.html تغيّرت عن js/app-10-features.js');
  assert.ok(fns.includes('function omranFunnelPlatform('));
});

test('١١. الربط: الموافقة، أوّل رسالة (خارج __sendPromptCore)، والدخول بحساب — كلّها عبر omranFunnelMark، والحزمة تحمل الجزء', () => {
  const a10 = A10, a09 = read('js/app-09-attach.js'), a01 = read('js/app-01-boot-auth.js'), bundle = read('js/app.bundle.js');
  assert.ok(a10.includes("try { localStorage.setItem(KEY, '1'); } catch(e){ __swallow(e, 'ui:privacy-ack'); }\n      if(typeof omranFunnelMark === 'function') omranFunnelMark('consent'); wrap.remove();"), 'عند ضغط «أوافق وأتابع»');
  const wrap = a09.slice(a09.indexOf('async function sendPrompt(){'), a09.indexOf('async function __sendPromptCore('));
  assert.ok(wrap.includes("if(typeof omranFunnelMark === 'function' && String(($('#prompt') || {}).value || '').trim()) omranFunnelMark('msg');"), 'في غلاف الإرسال');
  assert.ok(a09.indexOf("omranFunnelMark('msg')") < a09.indexOf('async function __sendPromptCore('), 'خارج __sendPromptCore (سقّاطة البنية)');
  assert.ok(a01.includes("authSet('aiapp_username', username); if(typeof omranFunnelMark === 'function') omranFunnelMark('account');"), 'في onAuthed');
  assert.ok(a01.includes("box.textContent = lines.join('\\n'); if(typeof omranFunnelPanel === 'function') omranFunnelPanel(box, ownT, ownLtr, token);"), 'لوحة الإحصائيات');
  for (const [src, name] of [[a10.slice(0, a10.length - PART.length), 'app-10'], [a09, 'app-09'], [a01, 'app-01']]) assert.ok(!/omranFunnelMark\((?!'(?:consent|msg|account)'\))/.test(src), name + ': لا حدث يحمل نصًّا أو اسمًا');
  assert.ok(bundle.includes(PART), 'الحزمة تحمل الجزء كما هو');
  assert.ok(bundle.indexOf('function omranFunnelMark(') > 0 && bundle.indexOf('function omranFunnelMark(') === bundle.lastIndexOf('function omranFunnelMark('), 'تعريف واحد');
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/funnel.test.cjs'));
});

test('١٢. لوحة المالك: أسطر المسار تُلحق بالإحصائيات — الكلّ ثمّ المصادر ثمّ الأجهزة، والرمز في الجسم لا في العنوان', async () => {
  const T = (k, p) => k + (p ? ':' + Object.keys(p).map((n) => n + '=' + p[n]).join(',') : '');
  const ltr = (s) => '<' + s + '>';
  const report = { days: 30, total: { visit: 70, store: 18, consent: 15, msg: 9, account: 4 }, bySource: [{ src: 'tiktok', visit: 60, store: 18, consent: 12, msg: 8, account: 3 }, { src: 'google', visit: 10, store: 0, consent: 3, msg: 1, account: 1 }], byPlatform: [{ plat: 'android', visit: 50, store: 0, consent: 15, msg: 9, account: 4 }, { plat: 'ios', visit: 20, store: 18, consent: 0, msg: 0, account: 0 }] };
  const b = browser({ ls: { aiapp_fn: '-' }, report });
  assert.deepEqual(Array.from(b.api.lines(report, T, ltr)), [
    'ownerFunnelTitle:n=30',
    '  • ownerFunnelRow:src=ownerFunnelAll,v=70,t=18,c=15,m=9,a=4',
    '  • ownerFunnelRow:src=<tiktok>,v=60,t=18,c=12,m=8,a=3',
    '  • ownerFunnelRow:src=<google>,v=10,t=0,c=3,m=1,a=1',
    '',
    '  • ownerFunnelRow:src=📱 <android>,v=50,t=0,c=15,m=9,a=4',
    '  • ownerFunnelRow:src=📱 <ios>,v=20,t=18,c=0,m=0,a=0',
  ]);
  assert.deepEqual(Array.from(b.api.lines({ days: 30, total: { visit: 0 } }, T, ltr)), ['ownerFunnelEmpty']);
  assert.deepEqual(Array.from(b.api.lines(null, T, ltr)), ['ownerFunnelEmpty']);
  const box = { textContent: 'إحصائيات' };
  await b.api.panel(box, T, ltr, 'TOKEN-1');
  assert.equal(b.fetched.length, 1);
  assert.equal(b.fetched[0].u, URL_FN, 'الرمز ليس في العنوان');
  assert.deepEqual(JSON.parse(b.fetched[0].init.body), { op: 'report', days: 30, token: 'TOKEN-1' });
  assert.ok(box.textContent.startsWith('إحصائيات\n\nownerFunnelTitle:n=30\n  • ownerFunnelRow:src=ownerFunnelAll'), box.textContent);
  // تحديثان متتاليان: الأوّل يُهمَل، فلا يتكرّر المسار في الصندوق
  const box2 = { textContent: 'x' };
  const p1 = b.api.panel(box2, T, ltr, 't'), p2 = b.api.panel(box2, T, ltr, 't');
  await Promise.all([p1, p2]);
  assert.equal(box2.textContent.split('ownerFunnelTitle').length - 1, 1);
  assert.equal(b.api.panel(null, T, ltr, 't'), null);
});

test('١٣. نصوص اللوحة بالـ١٤ لغة، بلا اسم مزوّد أو نموذج، ووسم ملفّات اللغات مرفوع', () => {
  const KEYS = ['ownerFunnelTitle', 'ownerFunnelRow', 'ownerFunnelAll', 'ownerFunnelEmpty'];
  const main = read('js/app-03-i18n-data.js');
  for (const k of KEYS) assert.equal(main.split(k + ': "').length - 1, 2, k + ': عربيّ وإنجليزيّ');
  assert.ok(main.includes('ownerFunnelTitle: "📈 مسار الزوّار الجدد — آخر {n} يومًا:\\nزيارة ← وافق ← كتب رسالة ← دخل بحساب (للمتجر)", ownerFunnelRow: "{src}: {v} ← {c} ← {m} ← {a} ({t})"'), 'شرح المراحل تحت العنوان، والسطر أرقام بترتيبه');
  assert.ok(main.includes('ownerFunnelRow: "{src}: {v} → {c} → {m} → {a} ({t})"'), 'الإنجليزيّة: السهم باتّجاه القراءة');
  const langs = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  const seen = new Set();
  for (const lg of langs) {
    const I18N = { [lg]: {} };
    const line = read('i18n/' + lg + '.js').split('\n').find((l) => l.includes('v-funnel (806)'));
    assert.ok(line, lg + ': سطر v-funnel');
    vm.runInNewContext(line, { I18N });
    const o = I18N[lg];
    assert.deepEqual(Object.keys(o).sort(), KEYS.slice().sort(), lg);
    assert.ok(o.ownerFunnelTitle.includes('{n}'), lg + ': {n}');
    for (const ph of ['{src}', '{v}', '{t}', '{c}', '{m}', '{a}']) assert.ok(o.ownerFunnelRow.includes(ph), lg + ': ' + ph);
    const arrow = lg === 'ur' ? '←' : '→'; // السهم باتّجاه قراءة اللغة، والشرح سطر ثانٍ في العنوان بالترتيب نفسه
    assert.equal(o.ownerFunnelRow, '{src}: {v} ' + arrow + ' {c} ' + arrow + ' {m} ' + arrow + ' {a} ({t})', lg);
    assert.equal(o.ownerFunnelTitle.split('\n').length, 2, lg + ': عنوان ثمّ شرح');
    assert.equal(o.ownerFunnelTitle.split('\n')[1].split(arrow).length, 4, lg + ': أربع مراحل في الشرح');
    assert.ok(!/claude|anthropic|gpt|openai|gemini|google|groq|grok/i.test(JSON.stringify(o)), lg + ': لا اسم مزوّد');
    assert.ok(!seen.has(o.ownerFunnelTitle), lg + ': ترجمة لا نسخة');
    seen.add(o.ownerFunnelTitle);
  }
  assert.equal(seen.size, 12);
  // الوسم يُقرأ من المصدر لا يُثبَّت هنا (سقّاطة البنية: لا اختبار جديد يثبّت وسمًا حرفيًّا) — المهمّ أنّه رُفع مع هذه النصوص
  const tag = /sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js'));
  assert.ok(tag && Number(tag[1]) >= 806, 'وسم ملفّات اللغات: ' + (tag && tag[1]));
});

test('١٤. سياسة الخصوصيّة تذكر العدّ المجهول، ووعد «لا أطراف ثالثة» كما هو', () => {
  const p = read('privacy.html');
  assert.ok(p.includes('<li>أعداد زيارات مجمّعة بلا هوية: من أين وصلت (مثل تطبيق تواصل أو بحث) ونوع جهازك. تُحفظ عندنا أرقامًا فقط ولا تُربط بحسابك، وتبقى على جهازك علامة صغيرة حتى لا تُعدّ زيارتك مرتين.</li>'));
  assert.ok(p.includes('<li>Anonymous, aggregated visit counts: where you arrived from (such as a social app or a search) and your device type. We keep numbers only, never linked to your account, and a small marker stays on your device so your visit is not counted twice.</li>'));
  assert.ok(p.includes('لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة.') && p.includes('We do not sell or share your data with third parties.'));
  // لا أداة قياس خارجيّة في الصفحات ولا في الأجزاء
  for (const f of ['index.html', 'download.html', 'js/app-10-features.js']) assert.ok(!/googletagmanager|google-analytics|gtag\(|fbq\(|ttq\./.test(read(f)), f);
});

test('١٥. الموجّه الحقيقيّ (api/system.js): طلب sendBeacon النصّيّ بلا رمز ← 204 وأمر تخزين واحد لا غير', async () => {
  F.__resetLimiter();
  const kvPath = require.resolve(path.join(ROOT, 'api/_lib/kv.js'));
  const saved = require.cache[kvPath];
  const calls = [], other = [];
  const stub = new Proxy({ kvPipeline: async (c) => { calls.push(c); return c.map(() => 1); } }, { get: (t, k) => (k in t ? t[k] : async () => { other.push(String(k)); return null; }) });
  require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: stub };
  try {
    const system = require(path.join(ROOT, 'api/system.js'));
    for (const [body, ct, want] of [[JSON.stringify({ e: 'visit', s: 'tiktok', p: 'android' }), 'text/plain;charset=UTF-8', 'visit|tiktok|android'], [{ e: 'consent', s: 'instagram', p: 'ios' }, 'application/json', 'consent|instagram|ios']]) {
      const out = { status: 0, ended: false };
      const res = { headersSent: false, setHeader() { return this; }, status(c) { out.status = c; return this; }, json(v) { out.json = v; return this; }, end() { out.ended = true; return this; } };
      await system({ method: 'POST', query: { action: 'funnel' }, body, headers: { host: HOST, 'user-agent': UA.android, 'content-type': ct, 'x-forwarded-for': '203.0.113.5' } }, res);
      assert.equal(out.status, 204, ct);
      assert.ok(out.ended && out.json === undefined, 'بلا جسم');
      const last = calls[calls.length - 1];
      assert.equal(last.length, 1);
      assert.deepEqual(last[0].slice(0, 1).concat(last[0].slice(2)), ['HINCRBY', want, '1']);
      assert.match(last[0][1], /^funnel\/day\/\d{4}-\d\d-\d\d$/);
    }
    assert.equal(calls.length, 2);
    /* ما يفحصه الدخان على كلّ نشرة (scripts/smoke.mjs) بلا كتابة: الجسم النصّيّ نفسه — تقرير بلا رمز ← 403، وحدث خارج القائمة ← 204 */
    const beacon = async (body) => {
      const out = { status: 0, ended: false };
      const res = { headersSent: false, setHeader() { return this; }, status(c) { out.status = c; return this; }, json(v) { out.json = v; return this; }, end() { out.ended = true; return this; } };
      await system({ method: 'POST', query: { action: 'funnel' }, body, headers: { host: HOST, 'user-agent': 'node', 'content-type': 'text/plain;charset=UTF-8' } }, res);
      return out;
    };
    const rep = await beacon('{"op":"report"}'), junk = await beacon('{"e":"smoke"}');
    assert.equal(rep.status, 403, 'التقرير بجسم نصّيّ بلا رمز');
    assert.deepEqual(rep.json, { error: 'forbidden' });
    assert.equal(junk.status, 204, 'حدث خارج القائمة');
    assert.ok(junk.ended && junk.json === undefined);
    assert.equal(calls.length, 2, 'فحص الدخان لا يكتب ولا يقرأ');
    const smoke = read('scripts/smoke.mjs');
    assert.ok(smoke.includes("const funnelPost = (body) => get('/api/system?action=funnel', { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body });"), 'الدخان يرسل كما يرسل sendBeacon');
    assert.ok(smoke.includes(`const fnRep = await funnelPost('{"op":"report"}'), fnEv = await funnelPost('{"e":"smoke"}');`), 'الدخان: الجسمان');
    assert.ok(smoke.includes("fnRep.status === 403 ? ok(") && smoke.includes("fnEv.status === 204 ? ok("), 'الدخان: ٤٠٣ و٢٠٤');
    assert.deepEqual(other, [], 'لا قراءة ولا كتابة أخرى في التخزين لطلب بلا رمز');
  } finally {
    if (saved) require.cache[kvPath] = saved; else delete require.cache[kvPath];
    F.__resetLimiter();
  }
});
