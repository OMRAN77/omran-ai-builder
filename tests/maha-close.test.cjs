'use strict';
/* v-maha-close (المالك ١٧ أكتوبر: «افحص مها المتحدث الصوتي اريدها قريبه من المستخدم افحصها من الصفر»):
   الفحص وجد مها غريبة على من يكلّمها: تقول «أنا مها» في أوّل كلّ مكالمة، وتعليماتها «مثل مذيعة تلفزيون إماراتيّة»،
   والذاكرة الحيّة (ما تعلّمه التطبيق عن المستخدم من محادثاته) لا تصلها أصلًا، والمسار الاحتياطيّ يعطي وقت دبي لكلّ أحد.
   الآن: صديقة قريبة لا مذيعة، تعرّف بنفسها في أوّل مكالمة على الجهاز وحدها، وتعرف ما يعرفه التطبيق عنه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'maha-close-secret';
process.env.OPENAI_API_KEY = 'sk-test';
const kv = new Map();
function sessionToken(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}

function loadHandler() {
  stub('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1' });
  stub('api/_lib/points.js', { verifyPointsToken: () => 'noura', isOwnerUsername: () => true, readPoints: async () => null, COSTS: { maha_minute: 10 } });
  stub('api/_lib/kv.js', { kvGetJSON: async (k) => (kv.has(k) ? structuredClone(kv.get(k)) : null), kvPutJSON: async (k, v) => { kv.set(k, v); } });
  for (const f of ['api/_lib/memory.js', 'api/_lib/living-memory.js', 'api/_lib/realtime-session.js']) delete require.cache[rp(f)];
  return require(rp('api/_lib/realtime-session.js'));
}

async function mint(body) {
  const handler = loadHandler();
  const save = global.fetch;
  const sessions = [];
  global.fetch = async (url, init) => {
    sessions.push(JSON.parse(init.body).session);
    return new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 });
  };
  const res = { code: 0, setHeader() { return res; }, status(c) { res.code = c; return res; }, json() { return res; }, send() { return res; }, end() { return res; } };
  try {
    await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ token: 't' }, body) }, res);
  } finally {
    global.fetch = save;
  }
  assert.equal(res.code, 200);
  return sessions[sessions.length - 1].instructions;
}

const FACTS = [
  { kind: 'name', subject: 'الاسم', text: 'اسمها نورة', at: 5, n: 1 },
  { kind: 'style', subject: 'اللهجة', text: 'تتكلّم بلهجة إماراتيّة', at: 4, n: 1 },
  { kind: 'style', subject: 'التنسيق', text: 'تفضّل الجداول والنقاط', at: 4, n: 1 },
  { kind: 'project', subject: 'مطعم', text: 'تبني موقعًا لمطعمها «سنابل»', at: 3, n: 3 },
  { kind: 'interest', subject: 'قهوة', text: 'تحبّ القهوة العربيّة', at: 2, n: 1 },
  { kind: 'failure', subject: 'فيديو', text: 'فشل فيديو طويل لنفاد الرصيد', at: 6, n: 1 },
];

test('١. صديقة قريبة لا مذيعة: قسم القرب، واللهجة بلا «مذيعة تلفزيون»، والتعريف بالاسم مربوط بسجلّ المكالمات — وعبدالله كما هو', async () => {
  const f = await mint({});
  for (const line of [
    "the user's close friend, not a formal assistant",
    '# Closeness - their close friend, not a host',
    'never a TV host, presenter, receptionist, or call-center agent',
    'VOICE: talk warmly and personally, in the tone of a close one-to-one conversation',
    'KNOW THEM: the memory below (USER MEMORY and الذاكرة الحيّة)',
    'never recite it and never say you have a memory',
    'CARE: when they mention something from their life',
    'THIS CALL: remember everything said earlier in this call',
    'like a close Emirati friend on the phone',
    'Say your own name only when CALL HISTORY below says this is your first call together',
  ]) assert.ok(f.includes(line), line);
  assert.ok(!f.includes('like a friendly Emirati TV host'), 'لا مذيعة');
  assert.ok(!f.includes('Introduce yourself by name only on your very first reply of the call.'), 'لا «أنا مها» في كلّ مكالمة');
  for (const kept of ['TOP PRIORITY: give ACCURATE', 'FULL BULLETIN RULE', 'HONESTY OF EXECUTION', '# Conversation Style - a real person on a phone call', 'EDUCATION MODE']) {
    assert.ok(f.includes(kept), 'باقٍ: ' + kept);
  }
  const m = await mint({ voiceGender: 'male' });
  assert.ok(m.includes('You are "عبدالله" (Abdullah), a warm, smart male voice assistant'), 'تبديل عبدالله يعمل مع السطر الجديد');
  assert.ok(m.includes('Your name is ALWAYS عبدالله (Abdullah)'));
  assert.ok(m.includes('# Closeness - their close friend, not a host') && m.includes('CALL HISTORY:'));
});

test('٢. سجلّ المكالمات: أوّل مكالمة تعرّف بنفسها، ومن تعرفه لا — ومن غاب أيّامًا «وينك من زمان؟» — والبنّاء بلا سجلّ', async () => {
  for (const body of [{}, { lastCallAgoMs: -1 }, { lastCallAgoMs: '3600000' }, { lastCallAgoMs: 1e15 }, { lastCallAgoMs: null }]) {
    const f = await mint(body);
    assert.ok(f.includes('CALL HISTORY: as far as this device knows, this is your FIRST call with this user - say your name once'), JSON.stringify(body));
    assert.ok(!f.includes('you already know this user'), JSON.stringify(body));
  }
  const soon = await mint({ lastCallAgoMs: 5 * 60000 });
  assert.ok(soon.includes('your last call together was about 5 minutes ago. Do not introduce yourself or say your name unless they ask'));
  assert.ok(soon.includes('calling right back') && !soon.includes('وينك من زمان'));
  const hours = await mint({ lastCallAgoMs: 2 * 3600000 });
  assert.ok(hours.includes('about 2 hours ago') && !hours.includes('calling right back') && !hours.includes('وينك من زمان'));
  const away = await mint({ lastCallAgoMs: 5 * 86400000 });
  assert.ok(away.includes('about 5 days ago') && away.includes("'وينك من زمان؟'") && !away.includes('FIRST call'));
  const builder = await mint({ mode: 'builder', lastCallAgoMs: 5 * 86400000 });
  assert.ok(!builder.includes('CALL HISTORY'), 'البنّاء بتعليماته وحدها');
});

test('٣. الذاكرة الحيّة تصل مها للمسجَّل: الاسم والأسلوب ومشاريعه واهتماماته — بلا «التنسيق» ولا «فشل سابق» — والضيف بلا ذاكرة', async () => {
  kv.clear();
  kv.set('db/memory/noura.json', { memory: '- عندها ولد اسمه سيف', updatedAt: 1 });
  kv.set('db/living/noura.json', { facts: FACTS, updatedAt: 1 });
  const f = await mint({ token: sessionToken('noura') });
  for (const want of ['عندها ولد اسمه سيف', '[الذاكرة الحيّة', '- الاسم: اسمها نورة', '- الأسلوب: تتكلّم بلهجة إماراتيّة', 'سنابل', 'تحبّ القهوة العربيّة', 'هذه معرفتك بالمستخدم كصديق', 'MEMORY SAVING']) {
    assert.ok(f.includes(want), want);
  }
  assert.ok(!f.includes('الجداول') && !f.includes('نفاد الرصيد'), 'لا تنسيق مكتوب ولا فشل أدوات');
  assert.ok(f.indexOf('[الذاكرة الحيّة') < f.indexOf('MEMORY SAVING') && f.indexOf('MEMORY SAVING') < f.indexOf(' CALL HISTORY: '), 'الترتيب');
  const guest = await mint({});
  assert.ok(!guest.includes('[الذاكرة الحيّة') && !guest.includes('MEMORY SAVING'), 'الضيف (رمز غير صالح) بلا ذاكرة');
  // تعطّل قراءة الحقائق لا يُسقط المكالمة ولا ذاكرتها النصّيّة
  kv.set('db/living/noura.json', { facts: 'not-a-list' });
  const broken = await mint({ token: sessionToken('noura') });
  assert.ok(broken.includes('عندها ولد اسمه سيف') && !broken.includes('[الذاكرة الحيّة'));
});

test('٤. voiceContext: الاسم أوّلًا ثمّ الأقوى، تحت سقف ٣٥٠ توكن، وفارغ بلا حقائق', () => {
  const living = require(rp('api/_lib/living-memory.js'));
  assert.equal(living.voiceContext([]), '');
  assert.equal(living.voiceContext([{ kind: 'failure', subject: 'x', text: 'فشل شيء ما', at: 1 }]), '', 'لا شيء يخصّ المكالمة');
  const many = [{ kind: 'name', subject: 'الاسم', text: 'اسمه خالد', at: 1, n: 1 }].concat(Array.from({ length: 50 }, (_, i) =>
    ({ kind: 'interest', subject: 'هواية ' + i, text: 'يحبّ هواية رقم ' + i + ' كثيرًا ويتكلّم عنها دائمًا مع أصدقائه في المجلس', at: 100 + i, n: 1 })));
  const out = living.voiceContext(many);
  assert.ok(living.estimateTokens(out) <= 350, 'السقف');
  assert.ok(out.indexOf('- الاسم: اسمه خالد') > 0 && out.indexOf('- الاسم: اسمه خالد') < out.indexOf('هواية'), 'الاسم أوّلًا ولو كان أقدم');
  assert.ok(out.includes('هواية رقم 49') && !out.includes('هواية رقم 0 '), 'الأحدث قبل الأقدم');
  const ranked = living.voiceContext([
    { kind: 'interest', subject: 'شاي', text: 'يحبّ الشاي', at: Date.now(), n: 1 },
    { kind: 'project', subject: 'متجر', text: 'يبني متجرًا للعطور', at: Date.now() - 3 * 86400000, n: 5 },
  ]);
  assert.ok(ranked.indexOf('متجرًا') < ranked.indexOf('الشاي'), 'التأكيد المتكرّر يعلو على الحداثة كما في الدمج');
});

const client = read('js/app-08-maha.js');
const slice = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return s.slice(i, j + b.length); };

test('٥. العميل: وقت آخر مكالمة على الجهاز يُقرأ ويُكتب بأمان', () => {
  const src = slice(client, "const MAHA_LAST_CALL_KEY = 'aiapp_maha_last_call';", "__swallow(e, 'maha:last-call'); }\n}");
  let now = 1000000, store = {}, broken = false;
  const ctx = {
    __swallow() {},
    Date: { now: () => now },
    localStorage: {
      getItem: (k) => { if (broken) throw new Error('blocked'); return k in store ? store[k] : null; },
      setItem: (k, v) => { if (broken) throw new Error('blocked'); store[k] = String(v); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.read = mahaReadPrevCallAgo; this.mark = mahaMarkCallAt; this.first = mahaPrevCallAgoMs;', ctx);
  assert.equal(ctx.first, -1);
  assert.equal(ctx.read(), -1, 'لا مكالمة سابقة');
  ctx.mark();
  now += 3 * 86400000;
  assert.equal(ctx.read(), 3 * 86400000);
  store.aiapp_maha_last_call = String(now + 5000);
  assert.equal(ctx.read(), -1, 'وقت في المستقبل (ساعة الجهاز رجعت) = غير معروف');
  store.aiapp_maha_last_call = 'x';
  assert.equal(ctx.read(), -1);
  broken = true;
  assert.equal(ctx.read(), -1, 'تخزين محجوب لا يرمي');
  assert.doesNotThrow(() => ctx.mark());
});

test('٦. العميل: التحيّة تتبع سجلّ المكالمات، والقيمة تُقرأ مرّة لكلّ مكالمة وتُرسل وتُكتب بعد نجاح الفتح — والحزمة محدَّثة', () => {
  const block = slice(client, "if(!preBufSent && !mahaRtReconnecting && mahaCallMode !== 'builder'){", "__swallow(e, 'maha:greet'); }\n        });\n      }");
  const sent = [];
  const dc = { readyState: 'open', send: (m) => sent.push(JSON.parse(m)) };
  // v-maha-first-audio: التحيّة تنتظر صوتًا يشتغل — هنا يشتغل فتُرسل فورًا
  const ctx = { preBufSent: false, mahaRtReconnecting: false, mahaCallMode: 'assistant', lang: 'ar', __swallow() {}, dc, mahaRtDc: dc, mahaRtResponded: false, mahaRtTrace() {}, mahaRtWhenAudio: (fn) => fn(), mahaRtFirst: null };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const ins = sent[0].response.instructions;
  assert.match(ins, /like a close friend picking up/);
  assert.match(ins, /Follow CALL HISTORY: on a first call say your name; otherwise do not introduce yourself/);
  assert.ok(!/invite them to talk\. Speak|, say your name, and invite/.test(ins), 'لا «قولي اسمك» في كلّ مكالمة');
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const inner = s.slice(s.indexOf('async function mahaStartCallInner(mode){'));
    const readAt = inner.indexOf('mahaPrevCallAgoMs = mahaReadPrevCallAgo();');
    const start = inner.indexOf('const rtAttempt = mahaStartRealtimeCall();');
    const hd = inner.indexOf("mahaShowModeTag('hd');\n    if(mahaCallMode !== 'builder') mahaMarkCallAt();");
    const basic = inner.indexOf("mahaShowModeTag('basic');\n  if(mahaCallMode !== 'builder') mahaMarkCallAt();");
    assert.ok(readAt > 0 && readAt < start && start < hd && hd < basic, f + ': يُقرأ قبل الفتح ويُكتب بعد نجاحه (فائق أو أساسيّ)');
    const rt = s.slice(s.indexOf('async function mahaStartRealtimeCall(){'), s.indexOf('const pc = new RTCPeerConnection();'));
    assert.ok(rt.includes('lastCallAgoMs: mahaPrevCallAgoMs,'), f + ': يُرسل للخادم');
    assert.ok(!rt.includes('mahaReadPrevCallAgo('), f + ': إعادة الاتّصال تستعمل المقروء نفسه لا وقت هذه المكالمة');
  }
});

test('٧. المسار الاحتياطيّ: التعريف بالاسم في أوّل مكالمة وحدها، والوقت بتوقيت المستخدم لا دبي', () => {
  const block = slice(client, 'if(!mahaIntroduced){', 'mahaIntroduced = true;\n      }');
  const run = (ago) => {
    const ctx = { mahaIntroduced: false, mahaPrevCallAgoMs: ago, mahaPersonaName: 'Maha', mahaSystemMsgs: [] };
    vm.createContext(ctx);
    vm.runInContext(block, ctx);
    assert.equal(ctx.mahaIntroduced, true);
    return ctx.mahaSystemMsgs;
  };
  assert.equal(run(-1).length, 1);
  assert.match(run(-1)[0].content, /introduce yourself by saying your name is "Maha"/);
  assert.equal(run(2 * 86400000).length, 0, 'من تعرفه لا تعرّف بنفسها');
  const loop = client.slice(client.indexOf('async function mahaCallLoop(){'), client.indexOf('let mahaPointsTimer = null;'));
  assert.ok(!loop.includes("timeZone: 'Asia/Dubai' })"), 'لا توقيت دبي ثابت');
  assert.ok(loop.includes("mahaTz = Intl.DateTimeFormat().resolvedOptions().timeZone || mahaTz;") && loop.includes("timeZone: mahaTz })"));
  assert.ok(loop.includes("(the user's local time, timezone ${mahaTz})"));
});
