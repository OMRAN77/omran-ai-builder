// Known vision rejection is not a successful delivery in honest image mode.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const SRC = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-source.jpg')).toString('base64');
const EDIT = fs.readFileSync(path.join(root, 'tests/fixtures/styles-grid-swapped.jpg')).toString('base64');
// Both images differ from the source and each other. No pixel gate should mask a vision rejection.
const { settleCandidates } = require(rp('api/_lib/image-verify.js'));
const first = () => ({ b64: SRC, mime: 'image/jpeg', engine: 'pro' });
const alt = () => ({ b64: EDIT, mime: 'image/jpeg', engine: 'gpt' });
const verdict = (vs, pick, report) => ({ verdicts: vs, pick, text: 'none', report: report || 'report' });

function judgeFetch(answer, calls) {
  return async (url, init) => {
    assert.match(String(url), /gemini-flash-latest/, 'unit test must only call the vision judge');
    const parts = JSON.parse(init.body).contents[0].parts;
    const n = parts.filter((p) => /^RESULT [ABC]:/.test(p.text || '')).length;
    calls.push(n);
    const v = answer(n, calls.length);
    return v ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }] })
      : Response.json({ error: 'offline judge' }, { status: 503 });
  };
}
async function offline(fetchMock, fn) {
  const old = global.fetch;
  global.fetch = fetchMock;
  try { return await fn(); } finally { global.fetch = old; }
}

test('unit: rejected first, absent alternate, and all rejected fail; eligible alternative wins even against pick', async () => {
  const calls = [];
  await offline(judgeFetch((n, call) => verdict(n === 1 && call <= 2 ? ['not_done'] : (n === 2 ? ['not_done', 'partial'] : ['partial']), 0, 'claim about rejected result'), calls), async () => {
    const base = { apiKey: 'offline', request: 'make a change', first: first(), honest: true, deadlineOk: () => true };
    const lone = await settleCandidates(base);
    assert.equal(lone.ok, false);
    assert.equal(lone.tried, 'pro:not_done');
    const fallback = await settleCandidates({ ...base, first: first(), altFn: async () => alt() });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.best.engine, 'gpt');
    assert.equal(fallback.best.verdict, 'partial');
    assert.match(fallback.tried, /pro:not_done,gpt:partial/);
    assert.ok(calls.includes(2), 'judge considered both before selecting the eligible result');
  });
  await offline(judgeFetch((n) => verdict(Array(n).fill('not_done'), 0), []), async () => {
    const r = await settleCandidates({ apiKey: 'offline', request: 'change', first: first(), altFn: async () => alt(), honest: true });
    assert.equal(r.ok, false);
    assert.equal(r.tried, 'pro:not_done,gpt:not_done');
  });
});

test('unit: mixed verdicts cannot deliver the rejected pick, and report is regenerated for the eligible image', async () => {
  const ns = [];
  const result = await offline(judgeFetch((n) => n === 2
    ? verdict(['not_done', 'done'], 0, 'false report about A')
    : verdict(['done'], 0, 'report about B'), ns), () => settleCandidates({
    apiKey: 'offline', request: 'edit', first: [first(), alt()], honest: true,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.best.engine, 'gpt');
  assert.equal(result.report, 'report about B');
  assert.deepEqual(ns, [2, 1]);
});

test('unit: polish subset rejection falls back to eligible pool candidate, without stale report; none eligible fails', async () => {
  const ns = [];
  const judge = judgeFetch((n, call) => call === 1
    ? { ...verdict(['done', 'done'], 0, 'old report about pro'), text: 'broken' }
    : verdict(['not_done', 'not_done'], 0, 'false report about rejected polish'), ns);
  await offline(judge, async () => {
    const polished = () => ({ b64: EDIT, mime: 'image/jpeg', engine: 'pro+gpt-text' });
    const opts = { apiKey: 'offline', request: 'edit', first: [first(), alt()], honest: true, polishFn: async () => polished() };
    const r = await settleCandidates(opts);
    assert.equal(r.ok, true);
    assert.equal(r.best.engine, 'gpt', 'B survived outside the [A, polished] re-judgment subset');
    assert.equal(r.best.verdict, 'done');
    assert.equal(r.report, '', 'the rejected polish report describes the wrong image');
    assert.match(r.tried, /pro:not_done,gpt:done,pro\+gpt-text:not_done/);
    assert.deepEqual(ns, [2, 2], 'no unbounded extra vision calls');
  });
  await offline(judgeFetch((n, call) => call === 1
    ? { ...verdict(['done'], 0, 'old report'), text: 'broken' }
    : verdict(['not_done', 'not_done'], 0, 'false report'), []), async () => {
    const r = await settleCandidates({
      apiKey: 'offline', request: 'edit', first: first(), honest: true,
      polishFn: async () => ({ b64: EDIT, mime: 'image/jpeg', engine: 'pro+gpt-text' }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.tried, 'pro:not_done,pro+gpt-text:not_done');
  });
});

test('unit: unknown verdict is partial; raw/off and skipJudge retain their previous contracts; unavailable judge is not a rejection', async () => {
  await offline(judgeFetch(() => verdict(['not_done'], 0, 'honest rejection'), []), async () => {
    let alternates = 0;
    const r = await settleCandidates({ apiKey: 'offline', request: 'edit', first: first(), honest: false, altFn: async () => { alternates++; return alt(); } });
    assert.equal(r.ok, true);
    assert.equal(r.best.verdict, 'not_done');
    assert.equal(r.report, 'honest rejection');
    assert.equal(alternates, 0);
  });
  await offline(judgeFetch(() => ({ verdicts: [], pick: 0 }), []), async () => {
    const r = await settleCandidates({ apiKey: 'offline', request: 'edit', first: first(), honest: true });
    assert.equal(r.ok, true);
    assert.equal(r.best.verdict, 'partial');
  });
  await offline(judgeFetch(() => { throw Error('skipJudge called vision'); }, []), async () => {
    const r = await settleCandidates({ apiKey: 'offline', request: 'edit', first: first(), honest: false, skipJudge: true });
    assert.equal(r.ok, true);
    assert.equal(r.best.verdict, undefined);
  });
  await offline(judgeFetch(() => null, []), async () => {
    const r = await settleCandidates({ apiKey: 'offline', request: 'edit', first: first(), honest: true, altFn: async () => { throw Error('should not retry'); } });
    assert.equal(r.ok, true);
    assert.equal(r.best.verdict, undefined);
    assert.equal(r.report, '');
  });
});

// Actual image handler with mocked network and accounting: no real provider or KV calls.
process.env.GEMINI_API_KEY = 'offline-gemini';
process.env.OPENAI_API_KEY = 'offline-openai';
process.env.IMAGE_UPSCALE = 'off';
process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_VERIFY;
delete process.env.IMAGE_CAPTION;
const ledger = [];
function stub(f, exports) { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; }
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => 'offline', checkAndConsume: async () => ({ allowed: true }) });
stub('api/_lib/points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => t === 'user' ? 'sara' : null,
  isOwnerUsername: () => false,
  spendPoints: async (u, amount) => { ledger.push(['spend', u, amount]); return { ok: true, points: 80 }; },
  refundPoints: async (u, amount) => { ledger.push(['refund', u, amount]); },
});
stub('api/_lib/_mediaPlans.js', { imageQuality: async () => null });
stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('api/_lib/kv.js', {
  kvGetJSON: async () => null,
  kvSetIfAbsent: async () => {},
  kvIncr: async () => { ledger.push(['reserve']); return 1; },
  kvDecrBy: async (key, amount) => { ledger.push(['release', key, amount]); },
});
stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {} });
const handler = require(rp('api/_lib/maha-image.js'));
const editBody = { prompt: 'غيّر الأشخاص', userText: 'غيّر الأشخاص', editImageBase64: SRC, editMimeType: 'image/jpeg', token: 'user' };
const genBody = { prompt: 'ارسم قطة على كرسي', token: 'user' };
async function route(body, engine, judge) {
  const calls = [];
  ledger.length = 0;
  const fetchMock = async (url, init) => {
    const u = String(url);
    if (u.includes('api.openai.com/v1/images/')) {
      const kind = u.includes('/edits') ? 'gpt-edit' : 'gpt-gen';
      calls.push(kind);
      const b64 = engine[kind];
      return b64 ? Response.json({ data: [{ b64_json: b64 }] }) : Response.json({ error: { message: 'offline' } }, { status: 500 });
    }
    if (u.includes('gemini-flash-latest')) {
      const parts = JSON.parse(init.body).contents[0].parts;
      const n = parts.filter((p) => /^RESULT [ABC]:/.test(p.text || '')).length;
      calls.push('judge:' + n);
      const v = judge && judge(n, calls.filter((c) => c.startsWith('judge:')).length);
      return v ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }] })
        : Response.json({ error: 'offline judge' }, { status: 503 });
    }
    assert.match(u, /generativelanguage\.googleapis\.com/, 'no external call escapes mock');
    calls.push('pro');
    const b64 = engine.pro;
    return b64 ? Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType: 'image/jpeg' } }] } }] })
      : Response.json({ error: 'offline' }, { status: 400 });
  };
  const res = { code: 0, data: null, setHeader() {}, status(n) { this.code = n; return this; }, json(x) { this.data = x; return this; }, end() {} };
  await offline(fetchMock, () => handler({ method: 'POST', headers: {}, body }, res));
  return { status: res.code, data: res.data, calls, ledger: ledger.slice() };
}

test('handler: changed pixels but rejected vision, no alternate → 422 and refund exactly once', async () => {
  const r = await route(editBody, { pro: EDIT, 'gpt-edit': null }, () => verdict(['not_done'], 0));
  assert.equal(r.status, 422);
  assert.equal(r.data.error, 'image_unchanged');
  assert.equal(r.data.imageBase64, undefined);
  assert.match(r.data.__diag.tried, /nano-pro:not_done/);
  assert.deepEqual(r.calls, ['pro', 'judge:1', 'gpt-edit']);
  assert.deepEqual(r.ledger, [['spend', 'sara', 20], ['refund', 'sara', 20]]);
});

test('handler: guest rejection releases reservation once via existing refund helper', async () => {
  const r = await route({ ...editBody, token: undefined, guestId: 'guest123' }, { pro: EDIT, 'gpt-edit': null }, () => verdict(['not_done'], 0));
  assert.equal(r.status, 422);
  // v-share-guard: الضيف يُحجز له على المعرّف وعلى شبكته (clientIp المحاكى = 'offline') — وكلّ حجز يُردّ مرّة واحدة.
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(r.ledger, [['reserve'], ['reserve'], ['release', 'db/points/guest-image/guest123/count', 1], ['release', 'db/points/guest-image-ip/offline/' + day, 1]]);
});

test('handler: rejected primary uses eligible fallback; all rejected fail; partial succeeds', async () => {
  const fallback = await route(genBody, { pro: SRC, 'gpt-gen': EDIT },
    (n, call) => n === 2 ? verdict(['not_done', 'done'], 0) : verdict([call === 1 ? 'not_done' : 'done'], 0));
  assert.equal(fallback.status, 200);
  assert.equal(fallback.data.imageBase64, EDIT);
  assert.equal(fallback.data.verdict, 'done');
  assert.deepEqual(fallback.calls, ['pro', 'judge:1', 'gpt-gen', 'judge:2', 'judge:1']);
  assert.equal(fallback.ledger.filter((x) => x[0] === 'refund').length, 0);
  const failed = await route(genBody, { pro: SRC, 'gpt-gen': EDIT }, (n) => verdict(Array(n).fill('not_done'), 0));
  assert.equal(failed.status, 422);
  assert.deepEqual(failed.ledger, [['spend', 'sara', 20], ['refund', 'sara', 20]]);
  const partial = await route(genBody, { pro: SRC, 'gpt-gen': EDIT }, () => verdict(['partial'], 0));
  assert.equal(partial.status, 200);
  assert.equal(partial.data.verdict, 'partial');
  assert.deepEqual(partial.calls, ['pro', 'judge:1']);
});

test('handler: unchanged still fails, while raw, verify-off and unavailable judge preserve delivery', async () => {
  const unchanged = await route(editBody, { pro: SRC, 'gpt-edit': SRC }, () => { throw Error('unchanged must not reach judge'); });
  assert.equal(unchanged.status, 422);
  assert.deepEqual(unchanged.ledger, [['spend', 'sara', 20], ['refund', 'sara', 20]]);
  const raw = await route({ ...editBody, prompt: 'نانو: غيّر الأشخاص' }, { pro: SRC }, () => verdict(['not_done'], 0, 'لم يتغير'));
  assert.equal(raw.status, 200);
  assert.equal(raw.data.imageBase64, SRC);
  assert.equal(raw.data.verdict, 'not_done');
  const prev = process.env.IMAGE_VERIFY;
  process.env.IMAGE_VERIFY = 'off';
  try {
    const off = await route(editBody, { pro: EDIT }, () => verdict(['not_done'], 0));
    assert.equal(off.status, 200);
    assert.equal(off.data.verdict, 'not_done');
    assert.deepEqual(off.calls, ['pro', 'judge:1']);
  } finally { if (prev === undefined) delete process.env.IMAGE_VERIFY; else process.env.IMAGE_VERIFY = prev; }
  const unavailable = await route(editBody, { pro: EDIT }, null);
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.data.verdict, undefined);
  assert.equal(unavailable.data.caption, undefined);
  assert.deepEqual(unavailable.calls, ['pro', 'judge:1']);
});