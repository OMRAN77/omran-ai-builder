'use strict';
// v-talk-room-plan: صفحة «غرفة الربع» — خطّة صاحب الغرفة (ساعة مجّانيّة و٤ أشخاص في اليوم، أو اشتراك ٣٧ نقطة لـ٣٠ يومًا).
// تُستخرج الدوالّ الحقيقيّة من room.html وتُشغَّل كما هي (طريقة fnSrc في tests/room-sync.test.cjs) مع خادم مزيّف يسجّل كلّ نداء.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}
const I18N = new Function(html.slice(html.indexOf('var I18N = {'), html.indexOf('var T = Object.assign')) + '; return I18N;')();
const T = I18N.en;
const fmt = (s, n) => s.replace('{n}', n);
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const PLAN_FNS = ['function capOf(', 'function fullText(', 'function leftLine(', 'function setPlan(', 'function loadPlan(', 'function subscribe(', 'function confirmBuy(',
  'function subAnswer(', 'function setAuto(', 'function planCard(', 'function host(', 'function poll(', 'function admit(', 'function closeRoom(', 'function endFree(',
  'function when(', 'var esc = function'];

/** The page's plan code in a sandbox; reply(body) is the server. */
function page(reply, init) {
  const sent = [];
  let now = 1_000_000;
  const ctx = {
    MAX: 10, T, fmt, L: 'en', token: 'tok', linkCode: '', role: null, code: '', key: '', myId: '', myName: 'Omran', error: '', busy: '', q: '',
    plan: null, cap: 10, roomPlan: '', roomLeft: null, roomLeftAt: 0, timeUp: false, quote: null, noPoints: false, planBusy: false,
    peers: new Map(), asks: [], lines: [], pollT: null, quiet: 0, iceFor: '', icePromise: null, RTC: {},
    Date: class extends Date { static now() { return now; } }, draws: 0,
    call: (b) => { sent.push(JSON.parse(JSON.stringify(b))); return Promise.resolve(reply(b)); },
    draw: () => { ctx.draws++; }, $: () => null, ice: (c) => { ctx.iceFor = c; ctx.icePromise = Promise.resolve(); return ctx.icePromise; },
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0,
    history: { replaceState: () => {} }, location: { pathname: '/room' },
    setMic: () => Promise.resolve(true), setCam: () => Promise.resolve(true), drop: (id) => { ctx.peers.delete(id); },
    cleanName: (v) => String(v || 'guest'), send: () => {}, remix: () => {}, say: () => {},
    RTCPeerConnection: class { constructor() { this.created = true; } setRemoteDescription() { return new Promise(() => {}); } getTransceivers() { return []; } },
  };
  Object.assign(ctx, init || {});
  vm.runInNewContext(PLAN_FNS.map((h) => fnSrc(html, h)).join('\n'), ctx);
  return { ctx, sent, ops: () => sent.map((b) => b.op), advance: (ms) => { now += ms; } };
}
const FREE = { plan: 'free', cap: 4, left: 1500, sub: null, cost: 37 };
const SUB = { plan: 'sub', cap: 10, left: null, sub: { active: true, until: Date.UTC(2026, 11, 24), auto: true }, cost: 37 };

test('السقف من الخادم يحكم «دخّله»: غرفة مجّانيّة ٤ (صاحبها + ٣)، والاشتراك ١٠، وMAX = 10 يبقى السقف الأعلى', async () => {
  let open = { code: '1234', key: 'k'.repeat(24), plan: 'free', cap: 4, left: 1800 };
  const p = page((b) => (b.op === 'open' ? open : b.op === 'plan' ? FREE : { ok: true }));
  await p.ctx.host(); await tick();
  assert.equal(p.ctx.role, 'host'); assert.equal(p.ctx.cap, 4); assert.equal(p.ctx.roomPlan, 'free');
  const fill = (n) => { p.ctx.peers.clear(); for (let i = 0; i < n; i++) p.ctx.peers.set('g' + i, { name: 'g' + i }); };
  const ask = (id) => { p.ctx.asks.push({ id, name: id, offer: 'v=0' }); p.ctx.admit(id); };

  fill(2); ask('a3');
  assert.ok(p.ctx.peers.has('a3'), 'الضيف الثالث يدخل');
  assert.ok(!p.sent.some((b) => b.op === 'deny'));
  ask('a4');
  assert.ok(!p.ctx.peers.has('a4'), 'الرابع (الخامس مع صاحب الغرفة) لا يدخل');
  assert.deepEqual(p.sent.filter((b) => b.op === 'deny').map((b) => b.id), ['a4']);
  assert.equal(p.ctx.error, fmt(T.full, 4) + ' ' + fmt(T.fullSub, 10), 'الرسالة بالسقف ومع تلميح الاشتراك');
  assert.match(p.ctx.error, /\(4\)/);

  open = { code: '5678', key: 'k'.repeat(24), plan: 'sub', cap: 10, left: null };
  await p.ctx.host(); await tick();
  assert.equal(p.ctx.cap, 10); assert.equal(p.ctx.roomPlan, 'sub');
  fill(3); ask('b'); assert.ok(p.ctx.peers.has('b'), 'المشترك: الخامس يدخل');
  fill(9); p.ctx.error = ''; ask('c');
  assert.ok(!p.ctx.peers.has('c')); assert.equal(p.ctx.error, fmt(T.full, 10), 'عشرة: ممتلئة بلا تلميح اشتراك');

  open = { code: '9999', key: 'k'.repeat(24), plan: 'own', cap: 50 };
  await p.ctx.host(); await tick();
  assert.equal(p.ctx.cap, 10, 'سقف غريب من الخادم لا يتجاوز MAX');
  open = { code: '9998', key: 'k'.repeat(24) };
  await p.ctx.host(); await tick();
  assert.equal(p.ctx.cap, 10, 'خادم لا يرسل سقفًا: MAX كما كان');

  assert.match(html, /MAX = 10, MAX_LINE = 300;/);
  assert.match(fnSrc(html, 'function admit('), /if \(peers\.size >= Math\.min\(cap, MAX\) - 1\) \{ call\(\{ op: 'deny'/);
});

test('انتهاء الاشتراك وسط الغرفة: السقف ٤ للدخول الجديد فقط، ولا يُطلَّع أحد', async () => {
  let pend = { joins: [] };
  const p = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'sub', cap: 10, left: null } : b.op === 'pending' ? pend : b.op === 'plan' ? { ...FREE, left: 1200 } : {}));
  await p.ctx.host(); await tick();
  for (let i = 0; i < 6; i++) p.ctx.peers.set('g' + i, { name: 'g' + i });
  pend = { joins: [], plan: 'free', cap: 4 };
  p.ctx.poll(); await tick();
  assert.equal(p.ctx.roomPlan, 'free'); assert.equal(p.ctx.cap, 4);
  assert.equal(p.ctx.peers.size, 6, 'من في الغرفة يبقى');
  assert.ok(p.ops().includes('plan'), 'يقرأ ما بقي من ساعة اليوم');
  assert.equal(p.ctx.leftLine(), fmt(T.minLeft, 20));
  p.ctx.asks.push({ id: 'new', name: 'new', offer: 'v=0' }); p.ctx.admit('new');
  assert.ok(!p.ctx.peers.has('new'), 'الجديد لا يدخل فوق الأربعة');

  // the lapse reply that carries left: no extra plan call
  pend = { joins: [] };
  const q = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'sub', cap: 10, left: null } : b.op === 'pending' ? pend : {}));
  await q.ctx.host(); await tick();
  pend = { joins: [], plan: 'free', cap: 4, left: 600 };
  q.ctx.poll(); await tick();
  assert.equal(q.ctx.cap, 4); assert.equal(q.ctx.leftLine(), fmt(T.minLeft, 10));
  assert.ok(!q.ops().includes('plan'));

  // a lapse reply without cap or left: the plan read that follows still brings the free cap
  pend = { joins: [] };
  const w = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'sub', cap: 10, left: null } : b.op === 'pending' ? pend : b.op === 'plan' ? FREE : {}));
  await w.ctx.host(); await tick();
  pend = { joins: [], plan: 'free' };
  w.ctx.poll(); await tick();
  assert.equal(w.ctx.roomPlan, 'free'); assert.equal(w.ctx.cap, 4); assert.equal(w.ctx.leftLine(), fmt(T.minLeft, 25));
});

test('صاحب الغرفة المجّانيّة يرى الدقائق الباقية: في الغرفة عدًّا حيًّا، وفي الشاشة الأولى بطاقة الخطّة', async () => {
  const p = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'free', cap: 4, left: 1800 } : b.op === 'plan' ? FREE : { joins: [] }));
  await p.ctx.host(); await tick();
  assert.equal(p.ctx.leftLine(), '30 min left today');
  p.advance(61000);
  assert.equal(p.ctx.leftLine(), '29 min left today', 'يعدّ بين نبضات الخادم');
  p.advance(3600000);
  assert.equal(p.ctx.leftLine(), '0 min left today', 'لا سالب');
  const k = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'free', cap: 4, left: 1800 } : { joins: [], left: 900 }));
  await k.ctx.host(); await tick();
  k.ctx.poll(); await tick();
  assert.equal(k.ctx.leftLine(), '15 min left today', 'نبضة الخادم (keep) تصحّح العدّ: غرفة ثانية لنفس الصاحب تأكل من الساعة نفسها');
  const host = fnSrc(html, 'function draw(');
  assert.match(host, /\(leftLine\(\) \? '<p class="note" id="planLeft" style="margin:0">' \+ esc\(leftLine\(\)\) \+ '<\/p>' : ''\)/, 'السطر في بطاقة الكود');
  assert.match(fnSrc(html, 'function poll('), /var pl = \$\('planLeft'\); if \(pl\) pl\.textContent = leftLine\(\);/, 'ويتحدّث مع كلّ نبضة');

  const s = page((b) => (b.op === 'open' ? { code: '1', key: 'k', plan: 'sub', cap: 10, left: null } : {}));
  await s.ctx.host(); await tick();
  assert.equal(s.ctx.leftLine(), '', 'المشترك لا عدّ له');

  // the home screen card
  const c = page(() => FREE);
  c.ctx.loadPlan(); await tick();
  assert.deepEqual(c.sent, [{ op: 'plan', token: 'tok' }]);
  const card = c.ctx.planCard();
  assert.ok(card.includes('Free: 25 min left today · up to 4 people'), card);
  assert.ok(card.includes('Subscribe — 37 points / 30 days') && card.includes('Up to 10 people, no time limit.') && card.includes('data-sub="1"'));
  c.ctx.setPlan(SUB);
  const sc = c.ctx.planCard();
  assert.ok(sc.includes('Subscribed until ') && sc.includes(T.autoOn) && sc.includes('data-auto="0"'), sc);
  assert.ok(sc.includes('Each renewal takes 37 points'), 'التجديد يقول كم يأخذ');
  assert.ok(!sc.includes('data-sub='), 'لا زرّ اشتراك للمشترك');
  c.ctx.setPlan({ plan: 'own', cap: 10, left: null, sub: null, cost: 37 });
  assert.equal(c.ctx.planCard(), '', 'صاحب التطبيق وVIP: لا بطاقة');
  assert.match(fnSrc(html, 'function draw('), /\+ planCard\(\) \+ '<div class="card"><h2>' \+ T\.joinCode/, 'البطاقة في الشاشة الأولى');
});

test('{timeUp:true}: الغرفة تُسكَّر للكلّ (closeRoom) وتظهر «خلصت ساعتك المجانية» مع زرّ الاشتراك؛ وفتح غرفة بعدها يُرفض بالرسالة نفسها', async () => {
  let pend = { joins: [] };
  const p = page((b) => (b.op === 'open' ? { code: '1234', key: 'K'.repeat(24), plan: 'free', cap: 4, left: 30 } : b.op === 'pending' ? pend : b.op === 'plan' ? { ...FREE, left: 0 } : {}));
  await p.ctx.host(); await tick();
  p.ctx.peers.set('g1', { name: 'a' }); p.ctx.peers.set('g2', { name: 'b' });
  pend = { joins: [{ id: 'late', name: 'x', offer: 'v=0' }], timeUp: true };
  p.ctx.poll(); await tick();
  assert.equal(p.ctx.role, null, 'صاحب الغرفة خارجها');
  assert.equal(p.ctx.peers.size, 0, 'الكلّ خارج');
  assert.deepEqual(p.sent.find((b) => b.op === 'close'), { op: 'close', code: '1234', key: 'K'.repeat(24) });
  assert.equal(p.ctx.asks.length, 0, 'لا دخول بعد انتهاء الوقت');
  assert.equal(p.ctx.timeUp, true);
  const card = p.ctx.planCard();
  assert.ok(card.includes(T.timeUp) && card.includes('data-sub="1"') && card.includes('Free: 0 min left today'), card);
  assert.equal(T.timeUp, 'Your free hour for today is over.');

  const n = p.sent.length;
  p.ctx.endFree(); await tick();
  assert.equal(p.sent.length, n, 'مرّة واحدة: خارج الغرفة لا شيء');

  const o = page((b) => (b.op === 'open' ? { error: 'free-time' } : b.op === 'plan' ? { ...FREE, left: 0 } : {}));
  o.ctx.loadPlan(); await tick();
  await o.ctx.host(); await tick();
  assert.equal(o.ctx.role, null); assert.equal(o.ctx.timeUp, true); assert.equal(o.ctx.error, '', 'the card says it: no second line');
  assert.ok(o.ctx.planCard().includes(T.timeUp));
  // no card on screen yet (the plan did not load): the refusal still says why, instead of a button that does nothing
  const o2 = page((b) => (b.op === 'open' ? { error: 'free-time' } : { error: 'offline' }));
  await o2.ctx.host(); await tick();
  assert.equal(o2.ctx.role, null); assert.equal(o2.ctx.error, T.timeUp);

  // a late keep answer after the room closed changes nothing of the plan
  const z = page((b) => (b.op === 'open' ? { code: '1234', key: 'k'.repeat(24), plan: 'sub', cap: 10, left: null } : b.op === 'pending' ? { joins: [], plan: 'free', cap: 4, left: 60 } : {}));
  await z.ctx.host(); await tick();
  z.ctx.poll(); z.ctx.closeRoom(); await tick();
  assert.equal(z.ctx.roomPlan, ''); assert.equal(z.ctx.cap, 10); assert.equal(z.ctx.leftLine(), '');
});

test('الاشتراك: sub-buy مرّتين بالضبط — السعر أوّلًا بلا confirmed، ثمّ confirmed:true من زرّ «أكّد» وحده', async () => {
  const p = page((b) => (b.op === 'plan' ? FREE : b.op === 'sub-buy' ? (b.confirmed === true ? { ...SUB, charged: 37, points: 13 } : { error: 'confirm_required', cost: 37, points: 50 }) : {}));
  p.ctx.loadPlan(); await tick();
  p.ctx.confirmBuy(); await tick();
  assert.ok(!p.ops().includes('sub-buy'), 'بلا عرض سعر: «أكّد» لا يرسل شيئًا');

  p.ctx.subscribe(); await tick();
  const buys = () => p.sent.filter((b) => b.op === 'sub-buy');
  assert.deepEqual(buys(), [{ op: 'sub-buy', token: 'tok' }], 'الخطوة الأولى بلا confirmed');
  assert.deepEqual({ ...p.ctx.quote }, { cost: 37, points: 50 });
  const q = p.ctx.planCard();
  assert.ok(q.includes('This takes 37 points from your balance.') && q.includes('Your balance: 50 points.') && q.includes('data-subok="1"') && q.includes('data-subno="1"'), q);
  assert.equal(p.ctx.plan.plan, 'free', 'لا شيء تغيّر قبل «أكّد»');

  p.ctx.confirmBuy(); p.ctx.confirmBuy();      // نقرتان سريعتان
  await tick();
  assert.deepEqual(buys(), [{ op: 'sub-buy', token: 'tok' }, { op: 'sub-buy', token: 'tok', confirmed: true }], 'مرّتان بالضبط');
  assert.equal(p.ctx.plan.plan, 'sub'); assert.equal(p.ctx.quote, null);

  // an answer without a price shows no Confirm; an unknown balance is left out (never «0 points»)
  for (const [ans, cost, bal] of [[{ error: 'confirm_required' }, 0, null], [{ error: 'confirm_required', cost: 0, points: 9 }, 0, null], [{ error: 'confirm_required', cost: 37, points: null }, 37, null]]) {
    const x = page((b) => (b.op === 'sub-buy' ? (b.confirmed ? { ...SUB, charged: 37 } : ans) : FREE));
    x.ctx.loadPlan(); await tick(); x.ctx.subscribe(); await tick();
    const xc = x.ctx.planCard();
    if (!cost) {
      assert.equal(x.ctx.quote, null); assert.equal(x.ctx.error, T.planFailed); assert.ok(!xc.includes('data-subok'), xc);
      x.ctx.confirmBuy(); await tick();
      assert.equal(x.sent.filter((b) => b.confirmed).length, 0, 'no price, no charge');
    } else {
      assert.ok(xc.includes('This takes 37 points') && xc.includes('data-subok="1"') && !xc.includes('Your balance'), xc);
    }
  }

  // «إلغاء» يمسح العرض بلا نداء
  const c = page((b) => (b.op === 'sub-buy' ? { error: 'confirm_required', cost: 37, points: 50 } : FREE));
  c.ctx.loadPlan(); await tick(); c.ctx.subscribe(); await tick();
  assert.match(html, /else if \(d\.subno\) \{ quote = null; draw\(\); \}/);
  vm.runInNewContext('quote = null;', c.ctx);
  c.ctx.confirmBuy(); await tick();
  assert.equal(c.sent.filter((b) => b.confirmed).length, 0);

  // confirmed:true في مكان واحد، وconfirmBuy لا تُنادى إلّا من زرّ «أكّد»
  assert.equal((html.match(/confirmed: true/g) || []).length, 1);
  assert.match(fnSrc(html, 'function confirmBuy('), /if \(!token \|\| planBusy \|\| !quote\) return;[\s\S]*confirmed: true/);
  assert.equal((html.match(/confirmBuy\(/g) || []).length, 2, 'تعريفها + زرّ «أكّد»');
  assert.match(html, /else if \(d\.subok\) confirmBuy\(\);/);
  assert.ok(!/confirmed: true/.test(fnSrc(html, 'function subscribe(')));
});

test('402: «نقاطك ما تكفي» مع رابط شراء النقاط في التطبيق، والخطّة كما هي؛ 409 active يقرأ الخطّة من جديد', async () => {
  let confirmReply = { error: 'points_insufficient', needed: 37, points: 5 };
  const p = page((b) => (b.op === 'plan' ? FREE : b.op === 'sub-buy' ? (b.confirmed ? confirmReply : { error: 'confirm_required', cost: 37, points: 5 }) : {}));
  p.ctx.loadPlan(); await tick();
  p.ctx.subscribe(); await tick(); p.ctx.confirmBuy(); await tick();
  assert.equal(p.ctx.noPoints, true); assert.equal(p.ctx.plan.plan, 'free');
  const card = p.ctx.planCard();
  assert.ok(card.includes('Not enough points.') && card.includes('<a href="/"') && card.includes(T.buyPoints), card);
  assert.ok(card.includes('data-sub="1"'), 'يقدر يحاول بعد ما يشتري');

  confirmReply = { error: 'active' };
  const before = p.ops().filter((o) => o === 'plan').length;
  p.ctx.subscribe(); await tick(); p.ctx.confirmBuy(); await tick();
  assert.equal(p.ops().filter((o) => o === 'plan').length, before + 1, '409 active: تُقرأ الخطّة');
  confirmReply = { error: 'busy' };
  p.ctx.subscribe(); await tick(); p.ctx.confirmBuy(); await tick();
  assert.equal(p.ctx.error, T.planFailed, 'مشغول: جرّب بعد شوي');
});

test('التجديد التلقائي: الزرّ يرسل sub-auto بـon، ولا شراء', async () => {
  const p = page((b) => (b.op === 'plan' ? SUB : b.op === 'sub-auto' ? { ...SUB, sub: { ...SUB.sub, auto: b.on } } : {}));
  p.ctx.loadPlan(); await tick();
  p.ctx.setAuto(false); await tick();
  assert.deepEqual(p.sent[1], { op: 'sub-auto', token: 'tok', on: false });
  assert.equal(p.ctx.plan.sub.auto, false);
  const off = p.ctx.planCard();
  assert.ok(off.includes(T.autoOff) && off.includes('data-auto="1"') && !off.includes('Each renewal takes'), off);
  p.ctx.setAuto(true); await tick();
  assert.deepEqual(p.sent[2], { op: 'sub-auto', token: 'tok', on: true });
  assert.equal(p.ctx.plan.sub.auto, true);
  assert.ok(!p.ops().includes('sub-buy'));
  assert.match(html, /else if \(d\.auto\) setAuto\(d\.auto === '1'\);/);

  // the period ended while the card was on screen: the server refuses (409 expired) and the page reads the plan again — still no buy
  const e = page((b) => (b.op === 'plan' ? (e.ctx.plan ? FREE : SUB) : b.op === 'sub-auto' ? { error: 'expired' } : {}));
  e.ctx.loadPlan(); await tick();
  e.ctx.setAuto(true); await tick();
  assert.deepEqual(e.ops(), ['plan', 'sub-auto', 'plan']);
  assert.equal(e.ctx.plan.plan, 'free'); assert.equal(e.ctx.error, '');
});

test('الضيف لا يرى شيئًا من الخطّة ولا ينادي plan / sub-buy / sub-auto', async () => {
  for (const init of [{ role: 'guest' }, { linkCode: '1234' }, { token: '' }]) {
    const p = page(() => FREE, init);
    p.ctx.loadPlan(); await tick();
    assert.deepEqual(p.sent, [], JSON.stringify(init));
    p.ctx.plan = null;
    assert.equal(p.ctx.planCard(), '');
    p.ctx.endFree();
    assert.deepEqual(p.sent, [], 'endFree للضيف لا شيء');
  }
  // دوالّ الضيف وشاشته لا تلمس الخطّة
  for (const h of ['function join(', 'function fromHost(', 'function left(', 'function peek(', 'function answer(']) {
    assert.doesNotMatch(fnSrc(html, h), /plan|sub-buy|sub-auto|loadPlan|planCard|leftLine|timeUp/i, h);
  }
  const d = fnSrc(html, 'function draw(');
  const guest = d.slice(d.indexOf("} else if (role === 'guest') {"), d.indexOf('} else if (busy) {'));
  assert.ok(guest.length > 0);
  assert.doesNotMatch(guest, /planCard|leftLine/);
  // كلّ نداءات الخطّة في دوالّها وحدها
  assert.equal((html.match(/op: 'plan'/g) || []).length, 1);
  assert.equal((html.match(/op: 'sub-buy'/g) || []).length, 2);
  assert.equal((html.match(/op: 'sub-auto'/g) || []).length, 1);
  assert.match(fnSrc(html, 'function loadPlan('), /if \(!token \|\| role === 'guest' \|\| linkCode\) return;/);
});

test('«الغرفة مليانة ({n})» بكلّ اللغات الـ١٤ بلا ١٠ ثابتة، والنصوص الجديدة بالإنجليزيّة والعربيّة', () => {
  assert.equal(Object.keys(I18N).length, 14);
  for (const l of Object.keys(I18N)) {
    assert.equal((I18N[l].full.match(/\{n\}/g) || []).length, 1, l);
    assert.ok(!/10|١٠/.test(I18N[l].full), l + ': ' + I18N[l].full);
  }
  const keys = ['planFree', 'upTo', 'subOffer', 'subPerks', 'subUntil', 'autoOn', 'autoOff', 'subRenewNote', 'quote', 'quoteBal', 'quoteAuto', 'subOk', 'subNo', 'noPoints', 'buyPoints', 'minLeft', 'timeUp', 'fullSub', 'planFailed'];
  const n = (s) => (String(s).match(/\{n\}/g) || []).length;
  for (const k of keys) {
    for (const l of ['en', 'ar']) assert.ok(typeof I18N[l][k] === 'string' && I18N[l][k].trim() && !/</.test(I18N[l][k]), l + '.' + k);
    assert.equal(n(I18N.ar[k]), n(I18N.en[k]), k);
  }
});
