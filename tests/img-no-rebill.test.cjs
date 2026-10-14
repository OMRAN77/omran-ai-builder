// v-img-no-rebill (المالك ١٤ أكتوبر: «رصيدي يخلص… على تفاهات»): العميل كان يعيد طلب الرسم كاملًا (برو ← نانو ← GPT) بعد فشل
// قد يكون حُسب على مفتاح المالك — مهلة انقطعت بعد أن بدأ المحرّك، أو ردّ ٢٠٠ بلا صورة — لأنّ maha-image كان يسمّيه retryable.
// الآن: الخادم يعلّم billed:true ولا retryable حين يكون الاحتساب ممكنًا، والحلقات الأربع في العميل تتوقّف عنده.
// الزحام (٤٢٩/٥xx) بلا أيّ ناتج يبقى قابلًا للإعادة كما كان، وعطل الشبكة قبل الطلب كما كان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai';
process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
delete process.env.IMAGE_FREE_FALLBACK; delete process.env.IMG_DIAG;
const store = new Map();
const kv = {
  kvGetJSON: async () => null,
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, Number(v)); return true; },
  kvIncr: async (k) => { const n = (store.get(k) || 0) + 1; store.set(k, n); return n; },
  kvDecrBy: async (k, by) => { const n = (store.get(k) || 0) - by; store.set(k, n); return n; },
};
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', kv);
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }) });
stub('api/_lib/points.js', {
  COSTS: { image: 20, image_creative: 35, image_4k: 30 },
  verifyPointsToken: (t) => ({ owner: 'omran' })[t] || null,
  isOwnerUsername: (u) => u === 'omran',
  spendPoints: async () => ({ ok: true, owner: true }),
  refundPoints: async () => {},
});
stub('api/_lib/_mediaPlans.js', { imageQuality: async () => null });
stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {} });
const handler = require(rp('api/_lib/maha-image.js'));

const timeoutErr = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; return e; };
// gem / nano / oai: 'busy' (٤٢٩) | 'timeout' (انقطاع بلا ردّ) | 'noimg' (٢٠٠ بلا صورة) | 'net' (عطل شبكة قبل الطلب)
async function run(plan, body) {
  const save = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    const who = u.includes('openai') ? 'oai' : (u.includes('gemini-3-pro-image') ? 'gem' : 'nano');
    calls.push(who);
    const m = plan[who] || 'busy';
    if (m === 'timeout') throw timeoutErr();
    if (m === 'net') { const e = new TypeError('fetch failed'); throw e; }
    if (m === 'noimg') return who === 'oai' ? Response.json({ data: [{}] }) : Response.json({ candidates: [{ content: { parts: [{ text: 'no' }] }, finishReason: 'STOP' }] });
    return Response.json({ error: { message: 'Resource exhausted' } }, { status: 429 });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', headers: {}, body: Object.assign({ prompt: 'A red apple on a wooden table, soft daylight', userText: 'ارسم تفاحة حمراء', token: 'owner' }, body) }, res);
  } finally { global.fetch = save; }
  return { status, json, calls };
}

test('١. الخادم: الزحام بلا ناتج يُعاد، والمهلة أو ردّ ٢٠٠ بلا صورة = billed ولا إعادة', async () => {
  const busy = await run({ gem: 'busy', nano: 'busy', oai: 'busy' });
  assert.equal(busy.json.retryable, true, 'زحام ٤٢٩ عند الكلّ يُعاد كما كان');
  assert.equal(busy.json.billed, undefined);

  const late = await run({ gem: 'timeout', nano: 'busy', oai: 'busy' });
  assert.equal(late.status, 504);
  assert.equal(late.json.retryable, false, 'برو انقطع بعد أن بدأ — قد يكون حُسب');
  assert.equal(late.json.billed, true);

  const oaiLate = await run({ gem: 'busy', nano: 'busy', oai: 'timeout' });
  assert.equal(oaiLate.json.retryable, false, 'إنقاذ GPT انقطع — قد يكون حُسب فلا تُعاد السلسلة');
  assert.equal(oaiLate.json.billed, true);

  const empty = await run({ gem: 'noimg', nano: 'noimg', oai: 'busy' });
  assert.equal(empty.status, 500);
  assert.equal(empty.json.retryable, false, 'ردّ ٢٠٠ بلا صورة محسوب');
  assert.equal(empty.json.billed, true);

  const net = await run({ gem: 'net', nano: 'net', oai: 'net' });
  assert.equal(net.json.billed, undefined, 'عطل شبكة قبل الطلب لا يُحسب');
});

test('٢. الخادم: GPT المفروض للمالك — زحامه يُعاد، ومهلته billed بلا إعادة', async () => {
  const busy = await run({ oai: 'busy' }, { forceEngine: 'gpt' });
  assert.ok(busy.calls.every((c) => c === 'oai'), 'المفروض لا يلمس Gemini');
  assert.equal(busy.json.retryable, true);
  assert.equal(busy.json.billed, undefined);
  const late = await run({ oai: 'timeout' }, { forceEngine: 'gpt' });
  assert.equal(late.json.retryable, false);
  assert.equal(late.json.billed, true);
  const noKey = await run({ oai: 'net' }, { forceEngine: 'gpt' });
  assert.equal(noKey.json.retryable, false, 'عطل شبكة/صلاحيّة ليس زحامًا — لا إعادة بلا فائدة');
});

function block(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'غير موجود: ' + head);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('غير مغلق: ' + head);
}
async function loop(code, decl, reply) {
  let n = 0;
  const fetch = async () => { n++; return { ok: reply.status === 200, status: reply.status, json: async () => reply.body }; };
  const ctx = {
    fetch, setTimeout: (f) => f(), Date, String, JSON, Promise,
    __runCtl: { signal: null }, authGet: () => 't', window: { getGuestId: () => 'g', authGet: () => 't' },
    __charImg: { b64: 'x', mime: 'image/png' }, __cartoonPrompt: 'p', prompt: 'p', text: 'p', gUserText: 'p',
    __genTextSpec: { visualPrompt: 'p' }, provEngine: () => '',
  };
  await vm.runInNewContext('(async () => { ' + decl + '\n' + code + '\n})()', ctx);
  return n;
}

test('٣. العميل: الحلقات الأربع تتوقّف عند billed، والزحام يُعاد كما كان — في الأجزاء والحزمة', async () => {
  for (const f of ['js/app-09-attach.js', 'js/app-17-agent-tools.js', 'js/app.bundle.js']) {
    const src = read(f);
    const loops = [];
    if (f !== 'js/app-17-agent-tools.js') {
      loops.push(['كرتون', block(src, 'for(let __ct = 0; __ct < 2 && !__cartoonB64; __ct++)'), "let __cartoonB64 = '', __cartoonMime = '';", 2]);
      loops.push(['معماريّ', block(src, 'for(let __t3 = 0; __t3 < 3 && !__k; __t3++)'), 'let __d = {}; let __k = false;', 3]);
      loops.push(['توليد', block(src, 'for(let __t2 = 0; __t2 < 2 && !__gOk; __t2++)'), 'let __gData = {}; let __gOk = false; const __gT0 = Date.now();', 2]);
    }
    if (f !== 'js/app-09-attach.js') loops.push(['أداة الرسم', block(src, 'for (var __att = 1; __att <= 2; __att++)'), 'var resp = null, j = null;', 2]);
    const billed = { status: 504, body: { error: 'image_generation_timeout', retryable: false, billed: true } };
    const busy = { status: 502, body: { error: 'image_generation_busy', retryable: true } };
    for (const [name, code, decl, max] of loops) {
      assert.equal(await loop(code, decl, billed), 1, f + ' ' + name + ': قد يكون حُسب ← نداء واحد');
      assert.equal(await loop(code, decl, busy), max, f + ' ' + name + ': الزحام يُعاد كما كان');
    }
  }
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/img-no-rebill.test.cjs'));
});
