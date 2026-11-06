'use strict';
/* v-google-retry (لقطة المالك ٦ نوفمبر من سفاري الآيفون: «تعذّر إكمال الدخول بجوجل — ألغيتَ الدخول من شاشة جوجل… ارجع إلى تطبيق
   om ai واضغط المتابعة عبر Google مرة ثانية»، و«عندي مشكله في التسجيل»):
   ١) access_denied تعيدها جوجل لضغطة «إلغاء» ولرفضها الحساب (تطبيق في وضع Testing والحساب ليس من المختبِرين) — الرابط لا يميّز،
      والصفحة والتطبيق كانا يقولان «ألغيتَ» بثقة. الآن «أُلغي أو لم تسمح جوجل»، والسبب في سجلّ Vercel (كان لا يُسجَّل).
   ٢) لا إعادة محاولة من سفاري: الطريق الوحيد كان الرجوع للتطبيق ثمّ سفاري من جديد. الآن الكولباك يمرّر state مع الفشل، والصفحة
      تعرض «حاول مرّة ثانية» بها، والنجاح يُودَع تحت ما ينتظره التطبيق.
   ٣) جسر التطبيق كان يمحو الانتظار عند استلام الفشل، فنجاح المحاولة الثانية يضيع. الآن يبقى ويتجدّد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'google-retry-secret';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
delete process.env.OAUTH_CLAIM_NET_BIND;

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
global.fetch = async (url, opts) => {
  const u = String(url);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
  if (/oauth2\.googleapis\.com\/token/.test(u)) return json({ access_token: 'at-sara' });
  if (/oauth2\/v3\/userinfo/.test(u)) return json({ email: 'sara@gmail.com', email_verified: true, name: 'sara' });
  return json({}, 404);
};

const start = require(rp('api/_lib/auth-google-start.js'));
const cb = require(rp('api/_lib/auth-google-callback.js'));
const claim = require(rp('api/_lib/oauth-claim.js'));
const mkRes = () => {
  const r = { code: 0, headers: null, j: null, headersSent: false };
  r.writeHead = (c, h) => { r.code = c; r.headers = h; r.headersSent = true; };
  r.end = () => {};
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.j = j; r.headersSent = true; return r; };
  r.setHeader = () => r;
  return r;
};
const NET = { 'x-forwarded-for': '198.51.100.7', host: 'example.test' };
const ST = 'c3'.repeat(16);

test('١. فشل مسار التطبيق: state مع الفشل لإعادة المحاولة، والسبب في السجلّ بلا state ولا بريد', async () => {
  store.clear();
  const logs = [];
  const warn = console.warn;
  console.warn = (...a) => logs.push(a.join(' '));
  try {
    const r = mkRes();
    await cb({ query: { error: 'access_denied', state: ST + '-app' }, headers: NET }, r);
    assert.equal(r.headers.Location, 'https://example.test/login-done.html?gerror=access_denied&st=' + ST);
    const w = mkRes();
    await cb({ query: { error: 'access_denied', state: ST }, headers: NET }, w);
    assert.equal(w.headers.Location, 'https://example.test/?gerror=access_denied', 'الويب كما كان: بلا st');
  } finally { console.warn = warn; }
  const line = logs.find((l) => l.includes('[Google OAuth] sign-in failed: access_denied (app)'));
  assert.ok(line, 'السبب في سجلّ Vercel: ' + JSON.stringify(logs));
  assert.ok(!logs.join('\n').includes(ST), 'لا state في السجلّ');
});

test('٢. المحاولة الثانية من سفاري: بدء بالـstate نفسها ← نجاح يكتب فوق الفشل المودع ← التطبيق يستلم الجلسة', async () => {
  store.clear();
  const f = mkRes();
  await cb({ query: { error: 'access_denied', state: ST + '-app' }, headers: NET }, f);
  // رابط «حاول مرّة ثانية» كما تبنيه الصفحة
  const s = mkRes();
  await start({ query: { action: 'google-start', app: '1', state: ST } }, s);
  const g = new URL(s.headers.Location);
  assert.equal(g.searchParams.get('state'), ST + '-app', 'جوجل تعيد state التطبيق نفسها');
  const ok = mkRes();
  await cb({ query: { code: 'c', state: g.searchParams.get('state') }, headers: NET }, ok);
  assert.equal(ok.headers.Location, 'https://example.test/login-done.html', 'صفحة «تمّ»');
  const c = mkRes();
  await claim({ method: 'POST', body: { state: ST }, headers: NET }, c);
  assert.ok(c.j && c.j.token && c.j.user === 'sara', 'التطبيق يستلم الدخول: ' + JSON.stringify(c.j));
});

/* صفحة سفاري نفسها (login-done.html) في vm بمستند مزيّف */
function page(search, ua) {
  const mk = (tag, text) => ({ tagName: tag, textContent: text || '', className: '', href: '', parentNode: null, nextSibling: null });
  const wrap = { kids: [], insertBefore(a, ref) { a.parentNode = wrap; const i = ref ? wrap.kids.indexOf(ref) : -1; if (i < 0) wrap.kids.push(a); else wrap.kids.splice(i, 0, a); } };
  const els = { '.check': mk('div', '✅'), 'h1': mk('h1', 'تم تسجيل الدخول بنجاح'), '.wrap p': mk('p', 'حسابك جاهز'), '.hint': mk('div', 'ارجع'), '.en': mk('p', 'Signed in') };
  wrap.kids = [els['.check'], els.h1, els['.wrap p'], els['.hint'], els['.en']];
  els['.wrap p'].parentNode = wrap;
  Object.defineProperty(els['.wrap p'], 'nextSibling', { get: () => wrap.kids[wrap.kids.indexOf(els['.wrap p']) + 1] || null });
  const doc = { title: 'تم', querySelector: (s) => els[s] || null, createElement: (t) => mk(t) };
  const html = read('login-done.html');
  const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const ctx = { document: doc, location: { search }, navigator: { userAgent: ua }, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { doc, els, link: wrap.kids.find((k) => k.className === 'retry') || null };
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

test('٣. صفحة «تعذّر»: لا «ألغيتَ»، وزرّ «حاول مرّة ثانية» بالـstate نفسها تحت السبب', () => {
  const p = page('?gerror=access_denied&st=' + ST, IPHONE);
  assert.equal(p.els.h1.textContent, 'تعذّر إكمال الدخول بجوجل');
  assert.equal(p.els['.wrap p'].textContent, 'لم يكتمل الدخول من شاشة جوجل: أُلغي هناك، أو لم تسمح جوجل بالدخول لهذا الحساب.');
  assert.ok(!/ألغيتَ|You cancelled/.test(read('login-done.html')), 'لا اتّهام بالإلغاء');
  assert.ok(p.link, 'الزرّ موجود');
  assert.equal(p.link.href, '/api/system?action=google-start&app=1&state=' + ST);
  assert.equal(p.link.textContent, 'حاول مرّة ثانية');
  assert.ok(p.els['.hint'].textContent.includes('بعد نجاح الدخول ارجع إلى تطبيق om ai (اسمه أعلى الشاشة بجانب الساعة)'));
  assert.ok(p.els['.en'].textContent.includes('Try again'));
  const a = page('?gerror=token_exchange_failed&st=' + ST, ANDROID + '; wv)');
  assert.equal(a.els['.wrap p'].textContent, 'حدث خطأ أثناء الدخول (token_exchange_failed).');
  assert.ok(a.link && a.els['.hint'].textContent.includes('✕ أعلى هذه الصفحة أو زرّ الرجوع'), 'أندرويد بنصّه');
});

test('٤. st غير صالحة أو غائبة: لا زرّ (لا حقن في الرابط) والطريق القديم؛ والنجاح كما كان', () => {
  for (const q of ['?gerror=access_denied', '?gerror=access_denied&st=abc', '?gerror=access_denied&st=' + ST + '%26app%3D0', '?gerror=x&st=javascript:alert(1)']) {
    const p = page(q, IPHONE);
    assert.equal(p.link, null, q);
    assert.ok(p.els['.hint'].textContent.includes('واضغط «المتابعة عبر Google» مرة ثانية'), q);
  }
  const ok = page('', IPHONE);
  assert.equal(ok.els.h1.textContent, 'تم تسجيل الدخول بنجاح', 'صفحة النجاح لا تُمسّ');
  assert.equal(ok.link, null);
});

/* جسر التطبيق نفسه (oauthClaimBridge في app-01) في vm */
function bridge(pick, replies) {
  const SRC = read('js/app-01-boot-auth.js');
  const s = SRC.indexOf('(function oauthClaimBridge(){');
  const e = SRC.indexOf('function updateAvatarUI(', s);
  const ls = new Map();
  const seen = { errors: [], authed: [], interval: null, cleared: false };
  const ctx = {
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { removeItem() {} },
    fetch: async () => { const d = replies.shift() || { error: 'pending' }; return { ok: !('pending' === d.error), json: async () => d }; },
    AbortSignal: { timeout: () => undefined },
    authGet: () => null, authSet: () => {}, noteSession: () => {},
    onAuthed: (u) => seen.authed.push(u), showGoogleAuthError: (e) => seen.errors.push(e), __swallow() {},
    window: { addEventListener() {} }, document: { addEventListener() {} },
    setInterval: (f) => { seen.interval = f; return 1; }, clearInterval: () => { seen.cleared = true; },
    JSON, Date, Number, String,
  };
  ls.set('aiapp_oauth_pending', ST + ':' + Date.now());
  vm.createContext(ctx);
  vm.runInContext('var __oauthPick = ' + JSON.stringify(pick) + ';\n' + SRC.slice(s, e), ctx);
  return { ls, seen };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

test('٥. الجسر: السبب يُعرض والانتظار يبقى، فنجاح المحاولة الثانية يُستلم عند العودة (كان يُمحى فيضيع)', async () => {
  const b = bridge(null, [{ error: 'access_denied' }, { token: 'tok', user: 'sara' }]);
  await flush();
  assert.deepEqual(b.seen.errors, ['access_denied'], 'السبب ظاهر في التطبيق');
  assert.ok(String(b.ls.get('aiapp_oauth_pending') || '').startsWith(ST + ':'), 'الانتظار باقٍ');
  b.seen.interval(); // نبضة الثلاث ثوانٍ
  await flush();
  assert.deepEqual(b.seen.authed, ['sara'], 'دخل');
  assert.equal(b.ls.has('aiapp_oauth_pending'), false, 'ثمّ يُمحى');
  // عودة الويب برمز الاستلام: الفشل ينهي الانتظار كما كان
  const w = bridge({ state: ST, claim: 'd'.repeat(32) }, [{ error: 'network_changed' }]);
  await flush();
  assert.deepEqual(w.seen.errors, ['network_changed']);
  assert.equal(w.ls.has('aiapp_oauth_pending'), false);
});

test('٦. نصّ access_denied في التطبيق بالـ١٤ لغة بلا «ألغيتَ»، والحزمة ووسم ملفّات اللغة محدَّثة', () => {
  const ar = 'أُلغي الدخول من شاشة جوجل أو لم تسمح به — أعد المحاولة', en = 'Google sign-in was cancelled or not allowed — please try again';
  for (const f of ['js/app-03-i18n-data.js', 'js/app.bundle.js']) { // القاموس هو ما يُعرض (authMsg يقرؤه قبل النصّ الاحتياطيّ)
    const s = read(f);
    assert.ok(s.includes('axBootGoogleCancelled: "' + ar + '"') && s.includes('axBootGoogleCancelled: "' + en + '"'), f + ': القاموس');
  }
  for (const f of ['js/app-01-boot-auth.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("authMsg('axBootGoogleCancelled', 'Google sign-in was cancelled or not allowed — please try again', 'أُلغي الدخول من شاشة جوجل أو لم تسمح به — أعد المحاولة')"), f);
    assert.ok(!s.includes('ألغيتَ الدخول'), f);
  }
  const OLD = /You cancelled|Cancelaste|Kinansela mo|Vous avez annulé|आपने Google|Anda membatalkan|നിങ്ങൾ Google|तपाईंले Google|Вы отменили|iptal ettiniz|آپ نے Google|您已取消|আপনি Google/;
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((f) => /^[a-z]+\.js$/.test(f) && f !== 'ad-studio.js');
  assert.equal(langs.length, 12);
  for (const f of langs) {
    const m = /axBootGoogleCancelled: "([^"]*)"/.exec(read('i18n/' + f));
    assert.ok(m && m[1].length > 10 && !OLD.test(m[1]), f + ': ' + (m && m[1]));
  }
  const t = /sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)';[^\n]*v-google-retry \((\d+)\)/.exec(read('js/app-04-i18n-state.js'));
  assert.ok(t && Number(t[1]) >= Number(t[2]) && Number(t[2]) >= 782, 'وسم ملفّات اللغة مرفوع والسبب ملحق');
});
