'use strict';
/* v-oauth-bind (ثغرة استيلاء على الحساب — موافقة المالك):
   ١) دخول Google: state يختارها البادئ. مهاجم يرسل للضحيّة رابط google-start بـstate من عنده (أو بـ&app=1)،
      الضحيّة تكمل في جوجل، الكولباك يودع جلستها (٣٠ يومًا) تحت db/oauth-claim/<state>، والمهاجم يستلمها
      بـoauth-claim من جهازه. الآن الإيداع يحمل شبكة من أكمل الدخول، والاستلام من شبكة أخرى = 404 pending.
   ٢) ربط Gmail: state كانت رمز الجلسة نفسه — يمرّ في روابط جوجل، ومن أكمل رابطًا برمز غيره رُبطت Gmail الخاصّة
      به بحساب ذلك الغير. الآن تذكرة قصيرة العمر تُسكّ بنداء موثَّق، تُستهلك مرّة، ومن الشبكة نفسها.
   على المعالجات الحقيقيّة (والموجّه api/system.js لسكّ التذكرة) بـKV في الذاكرة وجوجل مستبدَلة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'oauth-bind-test-secret';
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

// جوجل: كلّ رمز تفويض يخصّ صاحبه (victim-code ← حساب الضحيّة، alice-code ← أليس).
const ACCOUNTS = { 'victim-code': 'victim', 'alice-code': 'alice' };
global.fetch = async (url, opts) => {
  const u = String(url);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
  if (/oauth2\.googleapis\.com\/token/.test(u)) {
    const code = new URLSearchParams(String((opts && opts.body) || '')).get('code');
    const who = ACCOUNTS[code];
    return who ? json({ access_token: 'at-' + who, refresh_token: 'rt-' + who }) : json({ error: 'invalid_grant' }, 400);
  }
  const who = String((opts && opts.headers && opts.headers.Authorization) || '').replace(/^Bearer at-/, '');
  if (/oauth2\/v3\/userinfo/.test(u)) return json({ email: who + '@gmail.com', email_verified: true, name: who });
  if (/gmail\/v1\/users\/me\/profile/.test(u)) return json({ emailAddress: who + '@gmail.com' });
  return json({}, 404);
};

const start = require(rp('api/_lib/auth-google-start.js'));
const cb = require(rp('api/_lib/auth-google-callback.js'));
const claim = require(rp('api/_lib/oauth-claim.js'));
const auth = require(rp('api/_lib/auth.js'));
const system = require(rp('api/system.js'));
const emailStart = require(rp('api/_lib/email-google-start.js'));
const emailCb = require(rp('api/_lib/email-callback.js'));

const mkRes = () => {
  const r = { code: 0, headers: null, j: null, headersSent: false };
  r.writeHead = (c, h) => { r.code = c; r.headers = h; r.headersSent = true; };
  r.end = () => {};
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.j = j; r.headersSent = true; return r; };
  r.setHeader = () => r;
  return r;
};
const xff = (ip) => ({ 'x-forwarded-for': ip, host: 'example.test' });
const HEX = (n) => require('node:crypto').randomBytes(n).toString('hex');

const VICTIM = '198.51.100.7';
const ATTACKER = '203.0.113.9';
const OFFICE = '192.0.2.50';

async function googleLogin({ state, app, ip }) {
  // حساب الضحيّة قائم (حساب Google) — فلا تمرّ القراءة بمهل إعادة getUser لسجلّ غائب.
  await auth.putUser('g_victim@gmail.com', { username: 'victim', email: 'victim@gmail.com', googleAuth: true, createdAt: Date.now(), points: 0 });
  const r1 = mkRes();
  await start({ query: app ? { state, app: '1' } : { state }, headers: {} }, r1);
  const atGoogle = new URL(r1.headers.Location).searchParams.get('state');
  const r2 = mkRes();
  await cb({ query: { code: 'victim-code', state: atGoogle }, headers: xff(ip) }, r2);
  return r2;
}
async function claimAs(state, ip) {
  const r = mkRes();
  await claim({ method: 'POST', body: { state }, headers: ip ? xff(ip) : {} }, r);
  return r;
}

for (const app of [false, true]) {
  const label = app ? 'غلاف (&app=1 / -app)' : 'ويب (بلا app)';
  test(`١${app ? 'ب' : 'أ'}. ${label}: المهاجم يبدأ والضحيّة تكمل — استلام المهاجم من شبكة أخرى لا يسلّم جلسة`, async () => {
    store.clear();
    const S = HEX(16);
    const r2 = await googleLogin({ state: S, app, ip: VICTIM });
    assert.equal(r2.code, 302);
    if (app) assert.equal(r2.headers.Location, 'https://example.test/login-done.html');
    else assert.match(r2.headers.Location, /[?&]gtoken=/, 'الضحيّة تستلم جلستها في متصفّحها كما كانت');
    const atk = await claimAs(S, ATTACKER);
    assert.equal(atk.code, 404, 'المهاجم من شبكة أخرى لا يستلم شيئًا');
    assert.deepEqual(atk.j, { error: 'pending' });
    assert.ok(!atk.j.token);
    const dep = JSON.parse(store.get('db/oauth-claim/' + S));
    assert.ok(dep.token, 'الإيداع باقٍ (تطبيق الشاشة الرئيسيّة والمعاينات يحتاجانه)');
    assert.equal(dep.net, VICTIM, 'الإيداع يحمل شبكة من أكمل الدخول');
    const noIp = await claimAs(S, null);
    assert.equal(noIp.code, 404, 'بلا عنوان = لا تسليم');
    // صاحب الجهاز نفسه (الشبكة نفسها) يستلم — مرّة واحدة.
    const own = await claimAs(S, VICTIM);
    assert.equal(own.code, 200);
    assert.equal(auth.verifyToken(own.j.token), 'g_victim@gmail.com');
    const again = await claimAs(S, VICTIM);
    assert.equal(again.code, 404, 'استلام واحد');
  });
}

test('٢. مكتب واحد خلف IPv4 واحد: الاستلام من العنوان نفسه يعمل (الإيداع والاستلام على الجهاز نفسه)', async () => {
  store.clear();
  const S = HEX(16);
  await googleLogin({ state: S, app: true, ip: OFFICE });
  const c = await claimAs(S, OFFICE);
  assert.equal(c.code, 200);
  assert.equal(auth.verifyToken(c.j.token), 'g_victim@gmail.com');
});

test('٣. IPv6: عنوان آخر في الـ/64 نفسها يستلم، و/64 مجاورة لا', async () => {
  store.clear();
  const S = HEX(16);
  await googleLogin({ state: S, app: true, ip: '2001:db8:abcd:12:1111:2222:3333:4444' });
  const other = await claimAs(S, '2001:db8:abcd:13::1');
  assert.equal(other.code, 404, '/64 أخرى');
  const same = await claimAs(S, '2001:db8:abcd:12::99');
  assert.equal(same.code, 200, 'الشبكة نفسها (الجهاز يدوّر عنوانه داخل /64)');
  assert.equal(auth.verifyToken(same.j.token), 'g_victim@gmail.com');
});

test('٤. إيداع قديم بلا net (قبل النشر) = 404 pending، وإيداع الفشل كما كان', async () => {
  store.clear();
  const S = HEX(16);
  store.set('db/oauth-claim/' + S, JSON.stringify({ token: 'tok', user: 'u', ts: Date.now() }));
  const c = await claimAs(S, VICTIM);
  assert.equal(c.code, 404);
  assert.deepEqual(c.j, { error: 'pending' });
  assert.ok(store.has('db/oauth-claim/' + S), 'لا يُحذف — ينتهي بمهلته');
  const E = HEX(16);
  store.set('db/oauth-claim/' + E, JSON.stringify({ error: 'access_denied', ts: Date.now() }));
  const e = await claimAs(E, ATTACKER);
  assert.equal(e.code, 200);
  assert.deepEqual(e.j, { error: 'access_denied' });
});

test('٥. مفتاح الطوارئ OAUTH_CLAIM_NET_BIND=off: الاستلام بلا فحص شبكة (يُقرأ عند النداء)', async () => {
  store.clear();
  const S = HEX(16);
  store.set('db/oauth-claim/' + S, JSON.stringify({ token: 'tok', user: 'u', ts: Date.now() }));
  process.env.OAUTH_CLAIM_NET_BIND = 'off';
  try {
    const c = await claimAs(S, ATTACKER);
    assert.equal(c.code, 200);
    assert.equal(c.j.token, 'tok');
  } finally {
    delete process.env.OAUTH_CLAIM_NET_BIND;
  }
  const S2 = HEX(16);
  store.set('db/oauth-claim/' + S2, JSON.stringify({ token: 'tok2', user: 'u', ts: Date.now() }));
  assert.equal((await claimAs(S2, ATTACKER)).code, 404, 'بعد إعادته: الفحص عاد');
});

// ——— ربط Gmail ———
async function mint(token, ip) {
  const r = mkRes();
  await system({ method: 'POST', query: { action: 'email-link-ticket' }, body: token === undefined ? {} : { token }, headers: xff(ip) }, r);
  return r;
}
async function gmailStart(state, ip) {
  const r = mkRes();
  await emailStart({ query: { state }, headers: xff(ip) }, r);
  return r;
}
async function gmailCallback(state, code, ip) {
  const r = mkRes();
  await emailCb({ query: { code, state }, headers: xff(ip) }, r);
  return r;
}
async function seedUser(name) {
  await auth.putUser(name, { username: name, email: name + '@x.test', createdAt: Date.now() });
  return auth.makeToken(name);
}

test('٦. سكّ التذكرة يحتاج جلسة صالحة (٤٠١ غيرها) ويعيد تذكرة سداسيّة مربوطة بالحساب والشبكة', async () => {
  store.clear();
  const tok = await seedUser('alice');
  assert.equal((await mint(undefined, OFFICE)).code, 401, 'بلا رمز');
  assert.equal((await mint('garbage.sig', OFFICE)).code, 401, 'رمز مزوَّر');
  const r = await mint(tok, OFFICE);
  assert.equal(r.code, 200);
  assert.match(String(r.j && r.j.ticket), /^[0-9a-f]{32}$/);
  const rec = JSON.parse(store.get('db/gmail-link/' + r.j.ticket));
  assert.equal(rec.u, 'alice');
  assert.equal(rec.net, OFFICE);
  assert.ok(!JSON.stringify(rec).includes(tok), 'رمز الجلسة لا يُخزَّن في التذكرة');
});

test('٧. البدء: رابط جوجل يحمل التذكرة لا رمز الجلسة، ورمز جلسة في state يُرفض بخطأ الربط القائم', async () => {
  store.clear();
  const tok = await seedUser('alice');
  const bad = await gmailStart(tok, OFFICE);
  assert.equal(bad.code, 302);
  assert.ok(!bad.headers.Location.includes(tok) && !bad.headers.Location.includes(encodeURIComponent(tok)), 'رمز الجلسة لا يصل جوجل');
  assert.equal(bad.headers.Location, 'https://example.test/?emailerror=session_expired');
  const t = (await mint(tok, OFFICE)).j.ticket;
  const ok = await gmailStart(t, OFFICE);
  assert.equal(ok.code, 302);
  const g = new URL(ok.headers.Location);
  assert.equal(g.origin, 'https://accounts.google.com');
  assert.equal(g.searchParams.get('state'), t);
  assert.ok(!ok.headers.Location.includes(tok), 'ولا مع التذكرة');
});

test('٨. الكولباك: يربط Gmail بصاحب التذكرة وحده من الشبكة نفسها — والتذكرة لاستعمال واحد', async () => {
  store.clear();
  const tok = await seedUser('alice');
  const t = (await mint(tok, OFFICE)).j.ticket;
  const r = await gmailCallback(t, 'alice-code', OFFICE);
  assert.equal(r.headers.Location, 'https://example.test/?emailconnected=1');
  const a = await auth.getUser('alice');
  assert.equal(a.emailAssist && a.emailAssist.gmailAddress, 'alice@gmail.com');
  assert.ok(!store.has('db/gmail-link/' + t), 'التذكرة استُهلكت');
  delete a.emailAssist; await auth.putUser('alice', a);
  const again = await gmailCallback(t, 'alice-code', OFFICE);
  assert.equal(again.headers.Location, 'https://example.test/?emailerror=session_expired', 'إعادة التذكرة نفسها تُرفض');
  assert.equal((await auth.getUser('alice')).emailAssist, undefined);
});

test('٩. المهاجم يسكّ تذكرته ويرسل الرابط للضحيّة: إكمالها من شبكة أخرى لا يربط شيئًا — ولا رمز الجلسة القديم', async () => {
  store.clear();
  const atkTok = await seedUser('attacker');
  const t = (await mint(atkTok, ATTACKER)).j.ticket;
  const r = await gmailCallback(t, 'victim-code', VICTIM);
  assert.equal(r.headers.Location, 'https://example.test/?emailerror=session_expired');
  assert.equal((await auth.getUser('attacker')).emailAssist, undefined, 'Gmail الضحيّة لم تُربط بحساب المهاجم');
  assert.ok(!store.has('db/gmail-link/' + t), 'والتذكرة احترقت فلا تُعاد');
});

test('٩ب. الهجوم كما كان: رمز جلسة المهاجم نفسه في state لا يربط Gmail الضحيّة بحسابه', async () => {
  store.clear();
  const atkTok = await seedUser('attacker');
  const old = await gmailCallback(atkTok, 'victim-code', VICTIM);
  assert.equal((await auth.getUser('attacker')).emailAssist, undefined, 'Gmail الضحيّة لم تُربط بحساب المهاجم');
  assert.equal(old.headers.Location, 'https://example.test/?emailerror=session_expired');
});

test('١٠. تذكرة أقدم من عشر دقائق تُرفض', async () => {
  store.clear();
  await seedUser('alice');
  const t = HEX(16);
  store.set('db/gmail-link/' + t, JSON.stringify({ u: 'alice', net: OFFICE, ts: Date.now() - 11 * 60 * 1000 }));
  const r = await gmailCallback(t, 'alice-code', OFFICE);
  assert.equal(r.headers.Location, 'https://example.test/?emailerror=session_expired');
  assert.equal((await auth.getUser('alice')).emailAssist, undefined);
});

test('١١. الواجهة والحزمة: state تذكرة مسكوكة لا رمز الجلسة', () => {
  for (const f of ['js/app-12-studios.js', 'js/app.bundle.js']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const i = s.indexOf("action=email-google-start&state=");
    assert.ok(i > 0, f);
    assert.ok(!/email-google-start&state='\s*\+\s*encodeURIComponent\(token\)/.test(s), f + ': رمز الجلسة لا يُرسل state');
    assert.ok(s.slice(i, i + 80).includes('encodeURIComponent(ticket)'), f + ': التذكرة هي state');
    assert.ok(s.includes("'/api/system?action=email-link-ticket'"), f + ': تُسكّ بنداء موثَّق');
    assert.ok(s.includes("window.open(location.origin + emStartUrl, '_blank')"), f + ': الغلاف يفتح سفاري كما كان');
  }
});
