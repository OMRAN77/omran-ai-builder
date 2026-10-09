// tests/plans-gate.test.cjs — v-plans-gate (طلب المالك ٦ أكتوبر: «انتهاء الخدمة ولا تجديد ولا انتهاء النقاط تحوّله إلى
// الاشتراك» — عُرضت الفكرة فقال «أبدأ بالكلّ»): مسار واحد يفتح «الباقات والنقاط» على قسمه مع سطر السبب عند نفاد النقاط
// وحدّ اليوم في كلّ الميزات، وتنبيه مرّة قبل انتهاء الاشتراك بثلاثة أيّام ومرّة بعده؛ وعطل المزوّد عندنا لا يحوّل أحدًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'plans-gate-test-secret';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(() => 1),
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, r) => { users.set(u, structuredClone(r)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const points = require(rp('api/_lib/points.js'));
const tier = require(rp('api/_lib/tier.js'));
const mediaPlans = require(rp('api/_lib/_mediaPlans.js'));
const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const planOf = (kind) => Object.keys(mediaPlans.MEDIA_PLANS).find((k) => mediaPlans.MEDIA_PLANS[k].media === kind);

test('١. الخادم: نهاية كلّ اشتراك من سجلّ الحساب — المحادثة والوسائط، والمنتهي قبل شهر لا يُرسل', () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const at = now - 33 * DAY;
  assert.deepEqual(points.subsOf({ plan: 'pro', planUpdatedAt: at }, now), [{ kind: 'chat', plan: 'pro', endsAt: at + 35 * DAY, active: true }]);
  const u = {
    plan: 'basic', planUpdatedAt: now - 40 * DAY, // انتهى قبل ٥ أيّام
    media: { image: { plan: planOf('image'), at: now - 36 * DAY }, video: { plan: planOf('video'), at: now - 2 * DAY }, maha: { plan: planOf('image'), at: now } },
  };
  const s = points.subsOf(u, now);
  assert.deepEqual(s.map((x) => [x.kind, x.active]), [['chat', false], ['image', false], ['video', true]], 'خطّة بنوع غير نوعها لا تُحسب');
  assert.deepEqual(points.subsOf({ plan: 'pro', planUpdatedAt: now - 70 * DAY }, now), [], 'انتهى قبل أكثر من شهر');
  assert.deepEqual(points.subsOf({ plan: 'gold', planUpdatedAt: at }, now), []);
  assert.deepEqual(points.subsOf({ plan: 'pro' }, now), [], 'بلا تاريخ دفع');
  assert.deepEqual(points.subsOf({ plan: 'pro', planUpdatedAt: at, deleted: true }, now), []);
  assert.deepEqual(points.subsOf(null, now), []);
});

test('٢. «ساري» في التنبيه = سريان الباقة نفسه (tier.planActive وmediaActive) على حدود النافذة', () => {
  const now = Date.UTC(2026, 9, 6, 12);
  for (const d of [0, 1, 30, 34.9, 35, 35.01, 40, 60]) {
    const user = { plan: 'max', planUpdatedAt: now - d * DAY, media: { video: { plan: planOf('video'), at: now - d * DAY } } };
    const s = points.subsOf(user, now);
    const chat = s.find((x) => x.kind === 'chat');
    const vid = s.find((x) => x.kind === 'video');
    assert.equal(chat ? chat.active : false, tier.planActive(user, now), 'chat ' + d);
    assert.equal(vid ? vid.active : false, mediaPlans.mediaActive(user, 'video', now), 'video ' + d);
  }
});

test('٣. ردّ الرصيد يحمل subs للحساب العاديّ، وفارغة لمن لا اشتراك له', async () => {
  const call = async (u) => {
    const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, end() { return res; } };
    await points({ method: 'POST', body: { action: 'balance', token: token(u) } }, res);
    return res;
  };
  users.set('sara', { username: 'sara', points: 40, plan: 'pro', planUpdatedAt: Date.now() - 33 * DAY });
  users.set('noor', { username: 'noor', points: 70 });
  const a = await call('sara');
  assert.equal(a.code, 200, JSON.stringify(a.j));
  assert.deepEqual(a.j.subs.map((x) => [x.kind, x.plan, x.active]), [['chat', 'pro', true]]);
  assert.ok(a.j.subs[0].endsAt - Date.now() < 3 * DAY, 'ينتهي خلال ثلاثة أيّام');
  assert.deepEqual((await call('noor')).j.subs, []);
});

test('٤. الخادم: حدّ المشترك في المحادثة يُعلَّم limit:true، ونفاد المجّانيّ ردّ عاديّ بشارته', () => {
  const src = read('api/_lib/chat.js');
  const i = src.indexOf('if (!usage.allowed) {');
  const block = src.slice(i, src.indexOf('res.end();', i));
  assert.match(block, /else send\(\{ error: usage\.message \|\| [^\n]*, limit: true \}\);/);
  assert.match(block, /send\(\{ tier: usage\.tier === 'guest' \? 'guest-limit' : 'free-limit' \}\);/);
  assert.equal((block.match(/limit: true/g) || []).length, 1, 'العلامة على حدّ المشترك وحده');
});

// ── الواجهة: الجزء app-33 في vm بـDOM صغير ──
function makeDom() {
  const all = [];
  function mark(e, on) { e.attached = on; e.children.forEach((c) => mark(c, on)); }
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', style: { cssText: '', display: '' }, textContent: '', children: [], parentNode: null, attached: false, attrs: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { c.parentNode = this; this.children.push(c); mark(c, this.attached); return c; },
      insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); mark(c, this.attached); return c; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; mark(this, false); },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn({ type })); },
      click() { this.dispatch('click'); if (typeof this.onclick === 'function') this.onclick({}); },
    };
    all.push(e);
    return e;
  }
  const body = el('body');
  body.attached = true;
  return { el, body, doc: { body, createElement: el, getElementById: (id) => all.find((x) => x.attached && x.id === id) || null } };
}
const T = {
  plansWhyPoints: 'POINTS', plansWhyLimit: 'LIMIT', plansWhyExpired: 'EXPIRED {plan}', plansWhyExpiring: 'EXPIRING {plan} {date}',
  plansRenew: 'RENEW', plansLater: 'LATER', priceTabImg: '🖼️ الصور', priceTabVid: '🎬 الفيديو', priceTabMaha: '🎙️ مها',
};
function fakeRes(status, body) { return { status, ok: status >= 200 && status < 300, clone() { return fakeRes(status, body); }, json: async () => body }; }
const flush = () => new Promise((r) => setImmediate(r));
function gate(opts) {
  const o = opts || {};
  const { el, body, doc } = makeDom();
  const dlg = el('dialog'); dlg.id = 'settingsDialog'; body.appendChild(dlg);
  const sec = el('div'); sec.id = 'pricingSection'; dlg.appendChild(sec);
  const tabs = el('div'); tabs.id = 'priceTabs'; sec.appendChild(tabs);
  const btn = el('button'); btn.id = 'btnSettings'; body.appendChild(btn);
  const log = [];
  btn.addEventListener('click', () => log.push('settings'));
  const store = new Map();
  const replies = o.replies || {};
  const ctx = {
    window: {}, document: doc, location: { href: 'https://omran.test/chat', origin: 'https://omran.test' }, URL,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    lang: 'ar', console, Date, Object, Array, String, Number, Promise, JSON, setTimeout,
    t: (k) => (k in T ? T[k] : k),
    authGet: (k) => (k === 'aiapp_auth_token' && !o.guest ? 'tok' : ''),
    showSettingsPage: (sid) => log.push('page:' + sid),
    showPriceTab: (tab) => log.push('tab:' + tab),
    stripUiEmoji: (s) => String(s).replace(/[^\p{L}\p{N}\s]/gu, '').trim(),
    __swallow: () => {},
  };
  ctx.window.fetch = async (url) => { const r = replies[url] || { status: 200, body: {} }; return fakeRes(r.status, r.body); };
  ctx.window.requireLogin = (why) => log.push('login:' + why);
  vm.createContext(ctx);
  vm.runInContext(read('js/app-33-plans-gate.js'), ctx);
  return { ctx, log, doc, store, why: () => doc.getElementById('plansWhy') };
}

test('٥. التصنيف: رموز جدار الوسائط والاستوديوهات وحدها، بقسمها؛ حدّ المحادثة وأعطال المزوّد ليست جدارًا هنا', () => {
  const { classify } = gate().ctx.window.__omranPlansGate;
  const P = { error: 'points_insufficient', needed: 10, points: 2 };
  const L = { error: 'daily_limit_reached' };
  const cases = [
    // v-media-merge: الصور والفيديو قسم واحد «صور وفيديو» (كان img · vid)
    ['/api/maha-image', 402, P, 'points', 'media'],
    ['/api/media?action=maha-image', 402, P, 'points', 'media'],
    ['/api/video?action=veo-create', 402, P, 'points', 'media'],
    ['/api/video?action=actor-create', 402, P, 'points', 'media'],
    ['/api/video-create', 402, L, 'limit', 'media'],
    ['/api/video-script', 403, L, 'limit', 'media'],
    ['/api/video?action=video-watch&step=start', 402, P, 'points', 'pts'],
    ['/api/realtime-session', 402, P, 'points', 'maha'],
    ['/api/design-create', 402, L, 'limit', 'chat'],
    ['/api/tools?action=stocks', 402, L, 'limit', 'chat'],
  ];
  for (const [url, st, body, reason, tab] of cases) assert.deepEqual(JSON.parse(JSON.stringify(classify(url, st, body))), { reason, tab }, url);
  for (const [url, st, body] of [
    ['/api/claude', 402, { error: 'وصلت للحد', subscribeOnly: false }], // مسار المحادثة يجرّب غيره — يفتحها من نهايته
    ['/api/claude', 402, { error: 'x', reason: 'engine_limit' }],
    ['/api/openai', 402, { error: 'insufficient_points', reason: 'points' }],
    ['/api/maha-image', 402, { error: 'guest_image_used' }], // للضيف مساره: شاشة التسجيل
    ['/api/video?action=video-watch&step=start', 503, { error: 'unavailable' }], // رصيد المزوّد عندنا
    ['/api/maha-image', 500, P],
    ['/api/account?action=create-checkout-session', 402, { ok: false, error: 'الدفع لم يكتمل بعد' }],
  ]) assert.equal(classify(url, st, body), null, url + ' ' + st);
});

test('٦. ردّ 402 من خادمنا يفتح الإعدادات ← الباقات على قسمه بسطر السبب، مرّة لكلّ محاولة، والاستجابة كما هي', async () => {
  const g = gate({ replies: { '/api/maha-image': { status: 402, body: { error: 'points_insufficient', needed: 10, points: 0 } } } });
  const res = await g.ctx.window.fetch('/api/maha-image', { method: 'POST' });
  await flush();
  assert.equal(res.status, 402, 'الميزة تقرأ ردّها كما كان');
  assert.deepEqual((await res.json()).error, 'points_insufficient');
  assert.deepEqual(g.log, ['settings', 'page:pricingSection', 'tab:media']); // v-media-merge (كان tab:img)
  assert.equal(g.why().textContent, 'POINTS');
  const sec = g.doc.getElementById('pricingSection');
  assert.ok(sec.children.indexOf(g.why()) < sec.children.indexOf(g.doc.getElementById('priceTabs')), 'السطر فوق الأقسام');
  await g.ctx.window.fetch('/api/maha-image', { method: 'POST' });
  await flush();
  assert.equal(g.log.length, 3, 'الاحتياط داخل المحاولة نفسها لا يفتحها ثانيةً');
  g.doc.getElementById('btnSettings').click();
  assert.equal(g.why().style.display, 'none', 'فتح الإعدادات باليد بلا سطر قديم');
  g.doc.getElementById('settingsDialog').dispatch('close');
  assert.equal(g.why().textContent, '');
});

test('٧. الضيف ← شاشة التسجيل؛ ورابط خارجيّ أو 402 ليس جدارًا لا يفتح شيئًا', async () => {
  const g = gate({ guest: true, replies: { '/api/design-create': { status: 402, body: { error: 'daily_limit_reached' } } } });
  await g.ctx.window.fetch('/api/design-create', { method: 'POST' });
  await flush();
  assert.deepEqual(g.log, ['login:guestLimit']);
  const h = gate({ replies: {
    'https://api.example.com/api/maha-image': { status: 402, body: { error: 'points_insufficient' } },
    '/api/claude': { status: 402, body: { error: 'x', subscribeOnly: true } },
    '/api/video?action=video-watch&step=start': { status: 503, body: { error: 'unavailable' } },
  } });
  for (const u of ['https://api.example.com/api/maha-image', '/api/claude', '/api/video?action=video-watch&step=start']) await h.ctx.window.fetch(u, {});
  await flush();
  assert.deepEqual(h.log, []);
});

test('٨. تنبيه الاشتراك: قبل الانتهاء بثلاثة أيّام وبعده، المنتهي أوّلًا والمحادثة قبل الوسائط، ومرّة لكلّ فترة', () => {
  const g = gate();
  const pick = g.ctx.window.__omranPlansGate.pickNotice;
  const now = Date.UTC(2026, 9, 6, 12);
  const s = (kind, days, active) => ({ kind, plan: kind === 'chat' ? 'pro' : planOf(kind), endsAt: now + days * DAY, active });
  const p = (subs) => { const r = pick(subs, now); return r ? [r.s.kind, r.state] : null; };
  assert.equal(p([s('chat', 4, true)]), null, 'أربعة أيّام — ليس بعد');
  assert.deepEqual(p([s('chat', 2.5, true)]), ['chat', 'expiring']);
  assert.deepEqual(p([s('video', 1, true), s('chat', 2, true)]), ['chat', 'expiring']);
  assert.deepEqual(p([s('chat', 2, true), s('image', -3, false)]), ['image', 'expired'], 'من خسر مزاياه الآن أوّلًا');
  assert.equal(p([]), null);
  assert.equal(p([{ kind: 'gold', endsAt: now, active: false }]), null);
  const sub = s('chat', -1, false);
  g.store.set('omran_sub_notice_chat_expired_' + sub.endsAt, '1');
  assert.equal(p([sub]), null, 'رآه مرّة');
  assert.deepEqual(p([Object.assign({}, sub, { endsAt: sub.endsAt + 30 * DAY, active: true })]), null, 'التجديد = فترة جديدة بمفاتيح جديدة');
});

test('٩. ردّ الرصيد يُظهر شريط التنبيه مرّة: «جدّد» يفتح قسمه بسطر السبب، والاسم بلا رمز', async () => {
  const endsAt = Date.now() + 2 * DAY;
  const g = gate({ replies: { '/api/points': { status: 200, body: { ok: true, authed: true, subs: [{ kind: 'chat', plan: 'pro', endsAt, active: true }] } } } });
  await g.ctx.window.fetch('/api/points', { method: 'POST' });
  await flush();
  const bar = g.doc.getElementById('plansNoticeBar');
  assert.ok(bar, 'الشريط ظهر');
  const [txt, renew, later] = bar.children;
  assert.match(txt.textContent, /^EXPIRING Pro \S/);
  assert.deepEqual([renew.textContent, later.textContent], ['RENEW', 'LATER']);
  assert.equal(g.store.get('omran_sub_notice_chat_expiring_' + endsAt), '1');
  renew.click();
  assert.equal(g.doc.getElementById('plansNoticeBar'), null);
  assert.deepEqual(g.log, ['settings', 'page:pricingSection', 'tab:chat']);
  assert.match(g.why().textContent, /^EXPIRING Pro /);
  await g.ctx.window.fetch('/api/points', { method: 'POST' });
  await flush();
  assert.equal(g.doc.getElementById('plansNoticeBar'), null, 'مرّة واحدة');
  const m = gate({ replies: { '/api/points': { status: 200, body: { ok: true, subs: [{ kind: 'image', plan: planOf('image'), endsAt: Date.now() - DAY, active: false }] } } } });
  await m.ctx.window.fetch('/api/points', {});
  await flush();
  assert.equal(m.doc.getElementById('plansNoticeBar').children[0].textContent, 'EXPIRED الصور');
});

test('١٠. حدّ المحادثة يُفتح من نهاية مسارها: الخادم يعلّمه، الأدوات تحمله، لا مزوّد آخر يُجرَّب، ونصّه بدل «أدخل مفتاحك»', () => {
  const a18 = read('js/app-18-chat-tools.js');
  assert.match(a18, /if \(ev\.error && ev\.limit === true\) __planLimit = true;/);
  assert.match(a18, /if \(__planLimit\) __er\.planLimit = true; throw __er;/);
  const a9 = read('js/app-09-attach.js');
  assert.equal((a9.match(/e\.name === 'AbortError' \|\| e\.planLimit\)\) throw e;/g) || []).length, 2, 'المسار الأوّل وفريق الأدوات');
  assert.match(a9, /\} else if\(err && err\.planLimit\)\{\s*\/\/[^\n]*\n\s*cur\.messages\.push\(\{role: 'assistant', content: '⚠️ ' \+ t\('plansWhyLimit'\)\}\);\s*try\{ if\(typeof window\.omranOpenPlans === 'function'\) window\.omranOpenPlans\('limit', 'chat'\);/);
  assert.match(a9, /if\(__ctTier === 'free-limit' \|\| __ctTier === 'guest-limit'\)\{\s*try\{ if\(typeof window\.omranOpenPlans === 'function'\) window\.omranOpenPlans\('limit', 'chat'\);/);
  assert.match(a9, /window\.omranOpenPlans\('points', 'pts'\); \/\* v-plans-gate \*\/ else if\(typeof openPremiumBuyPoints/);
  assert.match(read('js/app-08-maha.js'), /if\(!guest && typeof window\.omranOpenPlans === 'function'\)\{ window\.omranOpenPlans\('points', 'maha'\); return; \}/);
  // throwProviderError نفسها في vm: حدّنا ≠ رصيد مزوّد خارجيّ ≠ نقاط الوضع الاحترافيّ
  const a6 = read('js/app-06-checkout.js');
  const fn = a6.slice(a6.indexOf('function throwProviderError('), a6.indexOf('function toOpenAIVisionMessages('));
  const ctx = { t: (k) => k, __swallow() {}, JSON, Object, String };
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  const run = (st, body) => { try { ctx.throwProviderError(st, body); } catch (e) { return e; } return null; };
  const lim = run(402, JSON.stringify({ error: 'وصلت للحد', subscribeOnly: false }));
  assert.deepEqual([lim.message, lim.planLimit, lim.status], ['plansWhyLimit', true, 402]);
  assert.equal(run(402, JSON.stringify({ error: 'x', reason: 'engine_limit' })).planLimit, true);
  const up = run(402, JSON.stringify({ error: { message: 'Insufficient credits' } }));
  assert.deepEqual([up.message, up.planLimit], ['dailyLimitError', undefined], 'رصيد مزوّد خارجيّ ليس حدّ باقة');
  const pts = run(402, JSON.stringify({ error: 'insufficient_points', reason: 'points' }));
  assert.deepEqual([pts.premiumNoPoints, pts.planLimit], [true, undefined]);
});

test('١١. النصوص السبعة بالـ١٤ لغة بمواضعها {plan} {date}، بلا اسم مزوّد ولا أحرف خفيّة؛ والحزمة مبنيّة', () => {
  const KEYS = ['plansWhyPoints', 'plansWhyLimit', 'plansWhyExpired', 'plansWhyExpiring', 'plansRenew', 'plansLater', 'vwUnavailable'];
  const BAD = /gemini|google|openai|gpt|claude|anthropic|جيمناي|جيميني|[​-‏‪-‮⁦-⁩﻿]/i;
  const a3 = read('js/app-03-i18n-data.js');
  const dicts = {};
  for (const k of KEYS) {
    const m = [...a3.matchAll(new RegExp('\\b' + k + ":\\s*'([^']*)'", 'g'))];
    assert.equal(m.length, 2, k + ' في العربيّة والإنجليزيّة');
    m.forEach((x, i) => { (dicts[i ? 'en' : 'ar'] = dicts[i ? 'en' : 'ar'] || {})[k] = x[1]; });
  }
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    dicts[l] = ctx.I18N[l];
  }
  assert.equal(Object.keys(dicts).length, 14);
  for (const [l, d] of Object.entries(dicts)) {
    for (const k of KEYS) { assert.ok(d[k], l + ' ' + k); assert.doesNotMatch(d[k], BAD, l + ' ' + k); }
    assert.ok(d.plansWhyExpired.includes('{plan}'), l);
    assert.ok(d.plansWhyExpiring.includes('{plan}') && d.plansWhyExpiring.includes('{date}'), l);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=727'"));
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('window.omranOpenPlans = openPlans;') && bundle.includes("if(c === 'unavailable') return t('vwUnavailable');"), 'الحزمة مبنيّة');
});
