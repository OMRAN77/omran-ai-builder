'use strict';
/* v-video-dialogue-clips (المالك ١٧ نوفمبر ٢٠٢٦، بعد تنبيه القصّ #1342: «لا مااريد خياراتك الي اريد فيديو يبني اقصى حده على نفس الكلمات
   مرتب ويكون على مستوى مش شغل عشوائي»). الحوار لا يُقصّ: «سريع» و«سينمائي» يوزّعانه بكلماته وترتيبه على مقاطع متتالية — كلّ مقطع بما
   يتّسع له بنطق متّزن ومدّته على قدّ كلامه، والتالي يبدأ من آخر لقطة في سابقه — ثمّ تُلصق في فيديو واحد.
   يثبت: (١) الخطّة: كلّ الكلمات بترتيبها، توزيع متوازن، ولا مقطع يُقصّ منه شيء على الخادم؛ (٢) مقطع واحد إن اتّسع ومدّته لا تقلّ عن
   حاجة كلامه؛ (٣) الكلام الطويل يُقسم عند نهاية الجملة؛ (٤) فوق أربعة مقاطع تنبيه؛ (٥) التسلسل: السعر مرّة بالمجموع ثمّ المقاطع
   بآخر لقطة واللصق، والتوقّف يعرض المكتمل؛ (٦) الربط في المسارين؛ (٧) سؤال السعر على الخادم؛ (٨) النصوص بالـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'dialogue-clips-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.VIDEO_FIRST_FRAME = 'off';

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
const vip = new Set();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async (u) => vip.has(u) });
const lockLog = [];
mock('api/_lib/abuse-guard.js', { videoLock: async (u) => { lockLog.push('lock:' + u); return { ok: true }; }, releaseVideoLock: async (u) => { lockLog.push('release:' + u); }, videoCooldownLeft: async () => 150, imageHourlyGuard: async () => ({ ok: true }) });
mock('api/_lib/_videoSubs.js', { CODE: 'video_subscribers', videoAllowed: async () => true, denyFree: async () => false });

const VT = require(rp('api/_lib/video-trends.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const COSTS = require(rp('api/_lib/points.js')).COSTS;
const NOW = Date.now();
const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
function account(u, plan, pts) { users.set(u, { username: u, plan, planUpdatedAt: NOW - DAY, points: pts }); kv.set('points:' + u, String(pts)); }
account('none1', 'free', 1000);   // بلا صلاحيّة فيديوهات باقة
account('plus1', 'basic', 1000);  // صلاحيّة فيديو واحد
account('poor1', 'free', 100);
account('vip1', 'free', 0); vip.add('vip1');
let upstream = 0;
let omniBlocked = false; // v-video-dialogue-reject: المحرّك يرفض المدخل (٤٠٠ «Input blocked») كما في سجلّ الإنتاج
const BLOCKED = "Input blocked: Sorry, we can't create videos with real people's names or likenesses. Please remove the reference and try again.";
let omniCalls = null; // v-video-one-shot: أجسام نداءات المحرّك (ومعرّف تفاعل لكلّ ردّ)
const seenUrls = [];
let mmCalls = null;
global.fetch = async (url, init) => {
  upstream++; seenUrls.push(String(url));
  if (omniBlocked && /\/interactions$/.test(String(url))) return new Response(JSON.stringify({ error: { code: 400, message: BLOCKED } }), { status: 400 });
  if (omniCalls && /\/interactions$/.test(String(url))) {
    omniCalls.push(JSON.parse(init.body));
    /* v-video-full-dialogue: قاعدة المحرّك كما ردّها في تشغيلة المالك ١٩ نوفمبر — معرّف التفاعل السابق مع مهمّة فيديو = ٤٠٠ */
    const sent = omniCalls[omniCalls.length - 1];
    if (sent.previous_interaction_id && sent.generation_config && sent.generation_config.video_config && sent.generation_config.video_config.task) {
      return new Response(JSON.stringify({ error: { code: 400, message: 'previous_interaction_id is not allowed when video task is set.' } }), { status: 400 });
    }
    return new Response(JSON.stringify({ id: 'v1_' + omniCalls.length, status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://g/files/v' + omniCalls.length }] }] }), { status: 200 });
  }
  if (mmCalls && /\/v2\/video_generation$/.test(String(url))) { mmCalls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ task_id: 'mm-' + mmCalls.length }), { status: 200 }); }
  return new Response('{}', { status: 200 });
};

/* كتلة دالّة من ملفّ بعدّ الأقواس */
function block(src, needle) {
  const a = src.indexOf(needle); assert.ok(a >= 0, needle);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
}
const CLIENT = read('js/app-11-video.js');
const PLAN_SRC = 'const DIALOGUE_CLIPS_MAX = 4;\n' + (/const DIALOGUE_ONE = [^\n]+/.exec(CLIENT) || [''])[0] + '\n' + block(CLIENT, 'function dialogueTurns(desc) {') + '\n' + block(CLIENT, 'function planDialogue(desc, maxClips, caps, one) {') + '\n' + block(CLIENT, 'function planDialogueOne(desc) {');
const P = {}; vm.runInNewContext(PLAN_SRC + '\nthis.plan = planDialogue; this.one = planDialogueOne;', P);
const plan = (d, n, caps) => JSON.parse(JSON.stringify(P.plan(d, n, caps)));
const planOne = (d) => JSON.parse(JSON.stringify(P.one(d))); // v-video-one-shot: خطّة «سينمائي» (توليدة ثمّ تمديدات المحرّك)
const wordsOf = (s) => String(s).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).map((w) => w.replace(/[«»"“”]/g, ''));

/* حوار المالك كما سمعه Whisper من مقاطعه (أمّ وبنت عن اليوم الوطني) */
const SCENE = 'أم وبنتها في حديقة، أعلام الإمارات.';
const LINES = ['البنت: أمي لماذا نحتفل باليوم الوطني؟', 'الأم: نحتفل باتحاد الإمارات يا بنتي', 'البنت: ومن أسّس الاتحاد؟',
  'الأم: الشيخ زايد وإخوانه حكّام الإمارات', 'البنت: أنا فخورة بوطني', 'الاثنتان: كل عام والإمارات بخير'];
const DIALOGUE = [SCENE].concat(LINES).join('\n');

test('١. حوار المالك (٦ جمل، ٢٥ كلمة): مقطعان متوازنان بكلّ الجمل وترتيبها، المشهد أوّل كلّ مقطع، والمدّة على قدّ الكلام — ولا يُقصّ من مقطع شيء على الخادم', () => {
  const p = plan(DIALOGUE);
  assert.equal(p.turns, 6); assert.equal(p.words, 25); assert.equal(p.dropped, 0);
  assert.equal(p.clips.length, 2);
  assert.equal(p.clips[0].text, [SCENE].concat(LINES.slice(0, 3)).join('\n'));
  assert.equal(p.clips[1].text, [SCENE].concat(LINES.slice(3)).join('\n'));
  assert.deepEqual(p.clips.map((c) => [c.words, c.sec]), [[13, 9], [12, 9]], 'متوازن لا ١٥ ثمّ ١٠');
  assert.equal(p.seconds, 18);
  for (const c of p.clips) {
    assert.ok(c.words <= VT.wordBudget(c.sec), 'كلام المقطع يتّسع له بنطق متّزن');
    const f = VT.fitDialogue(c.text, c.sec);
    assert.equal(f.dropped, 0, 'الخادم لا يقصّ من المقطع شيئًا'); assert.equal(f.text, c.text);
  }
  assert.equal(p.last, 'كل عام والإمارات بخير');
});

test('٢. يتّسع في مقطع = مقطع واحد ومدّته لا تقلّ عن حاجة كلامه؛ وبلا حوار لا خطّة', () => {
  const two = [SCENE].concat(LINES.slice(0, 2)).join('\n');
  let p = plan(two);
  assert.equal(p.clips.length, 1); assert.equal(p.need, 7, '١٠ كلمات تحتاج ٧ ثوانٍ'); assert.equal(p.dropped, 0);
  assert.equal(plan(LINES[4]).need, 4, 'جملة قصيرة لا ترفع المدّة');
  for (const d of ['صقر يحلّق فوق الكثبان', 'المكان: حديقة\nالكاميرا: لقطة واسعة', '', null]) {
    p = plan(d);
    assert.deepEqual([p.clips.length, p.need, p.turns], [0, 0, 0], String(d));
  }
  /* «ممثل يتكلم»: كلامه بالحرف — لا خطّة */
  assert.equal(plan('رجل. The person speaks, saying exactly these Arabic words: "' + 'مرحبا '.repeat(40).trim() + '".').clips.length, 0);
});

test('٣. الكلمات نفسها بترتيبها مهما كان الشكل: حوار بالتنصيص داخل الجملة (والوصف في مكانه)، وكلام طويل يُقسم عند نهاية الجملة ثمّ الفاصلة', () => {
  const INLINE = 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» والأم ترد: «عشان اتحاد الإمارات السبع يا بنتي» ثمّ البنت تقول «أنا فخورة بوطني وبالشيخ زايد» وتضحك.';
  let p = plan(INLINE);
  assert.deepEqual(p.clips.map((c) => c.text), [
    'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» وتضحك.',
    'والأم ترد: «عشان اتحاد الإمارات السبع يا بنتي» ثمّ البنت تقول «أنا فخورة بوطني وبالشيخ زايد» وتضحك.']);
  const SAID = 'حيّاكم الله في تطبيقنا الجديد. اليوم بنعرض عليكم أقوى الأدوات اللي تساعدكم في شغلكم اليومي، من تصميم الصور لين كتابة النصوص وصناعة الفيديو. جرّبوه الحين وخبّرونا رايكم، ولا تنسون تشاركونه مع ربعكم وأهلكم.';
  const LEAD = 'رجل إماراتي يقف في المجلس ويقول: ';
  p = plan(LEAD + '«' + SAID + '»');
  assert.equal(p.turns, 1); assert.equal(p.words, 33); assert.equal(p.dropped, 0);
  assert.deepEqual(p.clips.map((c) => c.text), [
    LEAD + '«حيّاكم الله في تطبيقنا الجديد. اليوم بنعرض عليكم أقوى الأدوات اللي تساعدكم في شغلكم اليومي،»',
    LEAD + '«من تصميم الصور لين كتابة النصوص وصناعة الفيديو.»',
    LEAD + '«جرّبوه الحين وخبّرونا رايكم، ولا تنسون تشاركونه مع ربعكم وأهلكم.»'], 'القطع عند الفاصلة ونهاية الجملة، والمتكلّم مرّة في كلّ مقطع');
  assert.deepEqual(p.clips.map((c) => c.sec), [10, 6, 7]);
  /* لا كلمة ضاعت ولا تبدّل ترتيبها — في كلّ شكل */
  const SPEAKER = 'المذيع: ' + SAID;
  const NOPUNCT = 'رجل يقول: «' + Array.from({ length: 40 }, (_, i) => 'كلمة' + (i + 1)).join(' ') + '»';
  for (const [d, said] of [[LEAD + '«' + SAID + '»', SAID], [SPEAKER, SAID], [NOPUNCT, NOPUNCT.slice(NOPUNCT.indexOf('«'))]]) {
    const q = plan(d);
    const spoken = [].concat(...q.clips.map((c) => wordsOf(c.text.replace(LEAD, '').replace(/^المذيع: /, '').replace(/^رجل يقول: /, ''))));
    assert.deepEqual(spoken, wordsOf(said), d.slice(0, 24));
    for (const c of q.clips) { assert.ok(c.words <= 15, 'لا مقطع فوق متّسعه'); assert.equal(VT.fitDialogue(c.text, c.sec).dropped, 0); }
  }
  assert.deepEqual(plan(NOPUNCT).clips.map((c) => c.words), [14, 14, 12], 'بلا ترقيم: أجزاء متساوية');
});

test('٤. فوق أربعة مقاطع: يُقال ما تتّسع له الأربعة بالترتيب، والتنبيه يسأل قبل أيّ شيء بآخر جملة تُقال ومجموع الثواني', () => {
  const long = [SCENE].concat(Array.from({ length: 14 }, (_, i) => (i % 2 ? 'الأم' : 'البنت') + ': هذي جملة رقم ' + (i + 1) + ' في الحوار الطويل جدًّا')).join('\n');
  const p = plan(long);
  assert.equal(p.clips.length, 4); assert.equal(p.dropped, 10);
  assert.equal(p.last, 'هذي جملة رقم 4 في الحوار الطويل جدًّا');
  assert.equal(plan(long, 2).clips.length, 2);
  const run = (answer, pl) => {
    const asked = [];
    const ctx = { window: { confirm: (m) => { asked.push(m); return answer; } }, __swallow: () => {}, vmkT: (k, ar) => ar };
    vm.runInNewContext(block(CLIENT, 'function dialogCapOk(plan){') + '\nthis.ok = dialogCapOk;', ctx);
    return { ok: ctx.ok(pl), asked };
  };
  let r = run(true, p);
  assert.equal(r.ok, true); assert.equal(r.asked.length, 1);
  assert.match(r.asked[0], /^⚠️ الحوار أطول من أقصى مدّة للفيديو \(24 ثانية\)\./);
  assert.ok(r.asked[0].includes('سيُقال إلى: «هذي جملة رقم 4 في الحوار الطويل جدًّا»'));
  assert.equal(run(false, p).ok, false, 'الإلغاء يوقف');
  r = run(true, plan(DIALOGUE));
  assert.deepEqual([r.ok, r.asked.length], [true, 0], 'حوار يتّسع = بلا سؤال');
});

/* تسلسل المقاطع كما في المعالج — بشبكة ومحرّك وهميّين */
function flow(opts) {
  const o = opts || {};
  const net = [], status = [], partial = [], joined = [];
  let made = 0, okd = o.idBase || 0;
  const store = o.store || {}; // v-video-dialogue-merge: localStorage وهميّ يبقى بين تشغيلتين (إعادة الضغط)
  const ctx = {
    window: { postWithConfirm: async (url, payload) => { net.push(['price', url, payload]); return o.price ? o.price() : { ok: true, status: 200, json: async () => ({ ok: true, priceOk: true }) }; } },
    fetch: async (url, init) => {
      const u = String(url);
      if (/-create$/.test(u)) {
        const body = JSON.parse(init.body); made++;
        net.push(['create', u, body]);
        if (o.failAt === made) return { ok: false, status: 402, json: async () => ({ error: 'points_insufficient' }) };
        /* v-video-dialogue-reject: رفض المحرّك للطلب نفسه — ٤٠٠ video_rejected كما يردّه الخادم (_videoFail) */
        /* v-video-real-person: المحرّك يرفض كلّ طلب في نصّه اسم شخص حقيقيّ — كما ردّ في تشغيلتَي المالك ١٩ نوفمبر (reason من الخادم) */
        if (o.realName && body.promptText.includes(o.realName)) return { ok: false, status: 400, json: async () => ({ error: 'video_rejected', reason: 'real_person', message_ar: 'محرّك الفيديو لا يقبل أسماء الأشخاص الحقيقيّين', retryable: false }) };
        if (o.reject && o.reject(body, okd + 1)) return { ok: false, status: 400, json: async () => ({ error: 'video_rejected', message_ar: 'تعذّر بدء الفيديو بهذا الطلب', retryable: false }) };
        if (o.unavail && o.unavail(body, okd + 1)) return { ok: false, status: 503, json: async () => ({ error: 'unavailable', retryable: false }) }; // v-video-one-shot
        okd++;
        return { ok: true, status: 200, json: async () => (/minimax/.test(u) ? { task_id: 'T' + okd } : { op: 'omni/' + okd }) };
      }
      const id = decodeURIComponent(u.split('=').pop());
      net.push(['status', u]);
      return { ok: true, status: 200, json: async () => ({ status: 'SUCCEEDED', output: ['https://cdn/' + id.replace('/', '-') + '.mp4'] }) };
    },
    makePollGuard: () => ({ tick: () => true, ok() {}, fail() {} }),
    setInterval: (fn) => setInterval(fn, 1), clearInterval,
    setStatus: (t) => status.push(t), bT: (a) => a,
    throwIfDeclined: (r) => { if (r && r.status === 428) throw Object.assign(new Error('cancelled'), { code: 'confirm_declined' }); },
    sceneInSequence: async (i, n, run) => run(),
    proxyBlob: async (u) => { if (o.noBlob || (o.gone && o.gone(u))) throw new Error('proxy'); return { of: u, size: 5000 }; },
    clipFrameB64: async (b, where) => (o.noFrame ? null : (where === 'first' ? 'FIRST<' : 'FRAME<') + b.of + '>'),
    dialogRetryText: (i, n) => 'retry ' + i + '/' + n, dialogNoRefText: (i) => 'noref ' + i, dialogPartText: (k, n) => 'part ' + k + '/' + n,
    joinDialogClips: async (list) => { if (o.noJoin) return null; joined.push(list.slice()); return { type: 'video/mp4' }; },
    dialogResumeText: (k, n) => 'resume ' + k + '/' + n, dialogJoinFailText: () => 'joinfail',
    /* v-video-one-shot: سطرا «فيديو واحد متّصل»، ومدّة الفيديو (الافتراضيّ أطول من أيّ تكملة = الفيديو كلّه) */
    dialogOneText: (i, n, s) => 'one ' + i + '/' + n + ' ~' + s, dialogOnePartText: (k, n) => 'onepart ' + k + '/' + n,
    clipDims: async (b) => (o.dims ? o.dims(b) : { w: 1280, h: 720, d: 60 }),
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    showPartialScenes: (urls, n, why) => partial.push([urls.slice(), n, why]),
    friendlyError: (e) => 'ERR:' + (e.code || e.message) + (e.reason ? '/' + e.reason : ''),
    dialogRefusedText: (say) => 'refused<' + say.split('\n').join(' / ') + '>', // v-video-real-person
    wantCanvasWrap: () => false, wrapWithCanvas: async () => {},
    dialogCapOk: () => o.cap !== false, dialogClipsText: (i, n, s) => 'clip ' + i + '/' + n + ' ~' + s,
    dlName: (b) => b + '.mp4', URL: { createObjectURL: (b) => 'blob:' + (b.of || 'joined') },
    resultEl: { style: {} }, downloadEl: { style: {} }, narrationText: { value: '' },
    ratio: '1280:720', token: 'tok', wantQuality: false, style: 'realistic', filmHeroBase64: o.hero || null, filmHeroMime: 'image/png',
    scenesDone: 0, text: DIALOGUE, signature: '', wantNarration: false, __swallow: () => {},
  };
  vm.runInNewContext(CHAIN_SRC + '\n' + block(CLIENT, 'async function engineClip(mode, payload, onTick, meta){') + '\n' + block(CLIENT, 'async function runDialogueClips(plan, mode){') + '\nthis.run = runDialogueClips;', ctx);
  /* كائنات الـvm من نطاق آخر: تُطبَّع بـJSON للمقارنة */
  const plain = (x) => JSON.parse(JSON.stringify(x));
  return { ctx, status, store, get net() { return plain(net); }, get partial() { return plain(partial); }, get joined() { return plain(joined); },
    creates: () => plain(net.filter((x) => x[0] === 'create').map((x) => x[2])) };
}
const CONT = 'Continue the same scene from the attached first frame — the same people, voices, clothes and place; the conversation simply carries on.';
/* v-video-dialogue-merge: «واقعي» بلا صورة بطل يُقال في كلّ مقطع (سطر مستقلّ آخر الوصف)، والسلسلة المحفوظة بدوالّها الحقيقيّة */
const LOOK = '\nPhotorealistic live-action footage with real-looking people, not animation.';
const CHAIN_SRC = (/const DLG_CHAIN_KEY = [^\n]+/.exec(CLIENT) || [''])[0] + '\n' + ['function dlgChainSig(parts){', 'function dlgChainLoad(sig, more){', 'function dlgChainSave(sig, urls, ops, base, more){'].map((n) => block(CLIENT, n)).join('\n');

test('٥. التسلسل: السعر مرّة بالمجموع قبل الأوّل، ثمّ كلّ مقطع بجمله ومدّته، والتالي من آخر لقطة في سابقه بأمر «أكمل»، ثمّ اللصق والعرض', async () => {
  const p = plan(DIALOGUE);
  let f = flow();
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 2, engine: 'minimax', promptText: 'dialogue', token: 'tok' }]);
  const c = f.creates();
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { promptText: p.clips[0].text + LOOK, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 9, confirmed: true });
  assert.deepEqual(c[1], { promptText: CONT + '\n' + p.clips[1].text + LOOK, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 9, confirmed: true,
    imageBase64: 'FRAME<https://cdn/T1.mp4>', imageMime: 'image/jpeg', keepPhoto: true });
  assert.ok(f.net.filter((x) => x[0] === 'create').every((x) => x[1] === '/api/video?action=minimax-create'));
  /* ما يُرسَل فعلًا لا يقصّ منه الخادم شيئًا: سطر «أكمل» ليس دورًا ولا يلتصق بكلام (كان ملتصقًا بآخر جملة فتُحذف) */
  for (const x of c) {
    assert.equal(VT.fitDialogue(x.promptText, x.durationSeconds).dropped, 0);
    assert.deepEqual(VT.dialogueTurns(x.promptText).map((t) => t.said), VT.dialogueTurns(x.promptText.replace(CONT + '\n', '').replace(LOOK, '')).map((t) => t.said));
    assert.equal(VT.dialogueTurns(x.promptText).length, 3);
  }
  assert.equal(VT.dialogueTurns(CONT).length, 0); assert.ok(!/[:：«»"“”]/.test(CONT));
  assert.deepEqual(f.joined, [['blob:https://cdn/T1.mp4', 'blob:https://cdn/T2.mp4']], 'اللصق بالترتيب');
  assert.equal(f.ctx.resultEl.src, 'blob:joined'); assert.equal(f.ctx.downloadEl.style.display, 'block');
  assert.equal(f.ctx.scenesDone, 2);
  assert.ok(f.status.includes('clip 1/2 ~18') && f.status.includes('clip 2/2 ~18') && f.status[f.status.length - 1] === '✅ تم الانتهاء!');
  /* «سينمائي» بمساره، وصورة البطل للمقطع الأوّل وحده */
  f = flow({ hero: 'HERO' });
  await f.ctx.run(p, 'veo');
  assert.equal(f.net[0][2].engine, 'veo');
  assert.ok(f.net.filter((x) => x[0] === 'create').every((x) => x[1] === '/api/video?action=veo-create'));
  assert.deepEqual([f.creates()[0].imageBase64, f.creates()[0].imageMime, f.creates()[0].keepPhoto], ['HERO', 'image/png', undefined]);
  assert.deepEqual([f.creates()[1].imageBase64, f.creates()[1].extendOp], [undefined, 'omni/1'], 'v-video-one-shot: التالي يمدّه المحرّك نفسه — لا لقطة مرجعيّة (الحالة ٢١)');
  /* تعذّرت اللقطة: المقطع التالي يكمل بالوصف وحده (بلا صورة ولا «أكمل من اللقطة») */
  f = flow({ noFrame: true });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.creates()[1].promptText, f.creates()[1].imageBase64], [p.clips[1].text + LOOK, undefined]);
  /* ومع صورة بطل: المقطع الذي تعذّرت لقطته يبدأ من صورة البطل (الوجه نفسه) لا بلا صورة */
  f = flow({ noFrame: true, hero: 'HERO' });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.creates()[1].promptText, f.creates()[1].imageBase64, f.creates()[1].keepPhoto], [p.clips[1].text, 'HERO', undefined]);
});

test('٦. لا صرف بلا موافقة ولا ضياع مدفوع: إلغاء السعر أو التنبيه = لا مقطع؛ نقص الرصيد قبل البدء؛ توقّف مقطع لاحق أو تعذّر اللصق يعرض المكتمل', async () => {
  const p = plan(DIALOGUE);
  let f = flow({ price: () => ({ ok: false, status: 428, json: async () => ({ error: 'confirm_required' }) }) });
  await assert.rejects(f.ctx.run(p, 'veo'), (e) => e.code === 'confirm_declined');
  assert.equal(f.creates().length, 0, 'إلغاء السعر');
  f = flow({ price: () => ({ ok: false, status: 402, json: async () => ({ error: 'points_insufficient', needed: 350 }) }) });
  await assert.rejects(f.ctx.run(p, 'veo'), (e) => e.code === 'points_insufficient');
  assert.equal(f.creates().length, 0, 'الرصيد لا يكفي المجموع');
  f = flow({ cap: false });
  await f.ctx.run(p, 'minimax');
  assert.equal(f.net.length, 0, 'إلغاء تنبيه الطول: لا سؤال سعر ولا مقطع');
  f = flow({ failAt: 2 });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.partial, [[['https://cdn/T1.mp4'], 2, 'ERR:points_insufficient']], 'المكتمل المدفوع يُعرض مع السبب');
  assert.equal(f.joined.length, 0);
  f = flow({ failAt: 1 });
  await assert.rejects(f.ctx.run(p, 'minimax'), (e) => e.code === 'points_insufficient');
  assert.equal(f.partial.length, 0, 'فشل الأوّل = خطأ عاديّ');
  f = flow({ noJoin: true });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.partial, [[['https://cdn/T1.mp4', 'https://cdn/T2.mp4'], 2, 'joinfail']], 'تعذّر الدمج بطريقتيه: المقاطع بروابطها وسطر «أعد الضغط»');
  assert.ok(Object.keys(f.store).length === 1, 'السلسلة باقية محفوظة ليُعاد الدمج بلا خصم');
});

test('٧. الربط: «سريع» و«سينمائي» يبنيان الخطّة قبل أيّ نداء، والمقطع الواحد مدّته لا تقلّ عن حاجة كلامه، والممثّل بلا خطّة، والحزمة مبنيّة', () => {
  const mmPlan = CLIENT.search(/const dlg = planDialogue\(text, 0, isOwnerAccount\(\) \? \[15\] : \[10\]\);[^\n]*\n        if\(dlg\.clips\.length > 1\)\{ await runDialogueClips\(dlg, 'minimax'\); return; \}/);
  assert.ok(mmPlan > 0 && mmPlan < CLIENT.indexOf("window.postWithConfirm('/api/video?action=minimax-create', payload)"));
  assert.ok(CLIENT.includes("style, durationSeconds: Math.max(durSecs, dlg.need) || undefined };"));
  const veoPlan = CLIENT.search(/const dlg = creationMode === 'veo' \? planDialogueOne\(veoPrompt\) : \{ clips: \[\], need: 0 \};[^\n]*\n        if\(dlg\.clips\.length > 1\)\{ await runDialogueClips\(dlg, 'veo'\); return; \}/);
  assert.ok(veoPlan > CLIENT.indexOf("const ac = await fetch('/api/video?action=actor-create'") && veoPlan < CLIENT.indexOf("window.postWithConfirm('/api/video?action=veo-create', veoPayload)"));
  assert.ok(CLIENT.includes("durationSeconds: (creationMode === 'veo' && Math.max(durSecs, dlg.need)) || undefined };"));
  assert.match(block(CLIENT, 'function clipFrameB64(blob, where, ms){'), /for\(let i = 3; i < a\.length; i \+= 4\) if\(a\[i\]\)/, 'ينتظر أوّل بكسل معتم (PITFALLS)');
  assert.ok(block(CLIENT, 'function clipFrameB64(blob, where, ms){').includes("v.currentTime = where === 'first' ? Math.min(0.05, d / 2) : Math.max(0, d - 0.02);"), 'أوّل لقطة أو آخرها');
  const B = read('js/app.bundle.js');
  assert.ok(B.includes("await runDialogueClips(dlg, 'veo')") && B.includes('function planDialogue(desc, maxClips, caps, one) {'), 'الحزمة مبنيّة');
});

async function price(u, body) {
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  await veo({ method: 'POST', query: { action: 'veo-price' }, body: Object.assign({ promptText: 'dialogue', token: token(u) }, body) }, res);
  return res;
}

test('٨. سؤال السعر على الخادم: المجموع مرّة واحدة — «سينمائي» بسعره لكلّ مقطع، و«سريع» بعد صلاحيّة الباقة — بلا خصم ولا مزوّد، ولا تردّه المهلة', async () => {
  let r = await price('none1', { clips: 2, engine: 'veo' });
  assert.equal(r.code, 428, JSON.stringify(r.body));
  assert.equal(r.body.cost, 2 * COSTS.veo_video);
  assert.match(r.body.message_ar, new RegExp('تخصم ' + 2 * COSTS.veo_video + ' نقطة \\(فيديو حوار بعدّة مقاطع متتالية'));
  r = await price('none1', { clips: 3, engine: 'minimax' });
  assert.equal(r.body.cost, 3 * COSTS.minimax_video);
  r = await price('plus1', { clips: 3, engine: 'minimax' });
  assert.equal(r.body.cost, 2 * COSTS.minimax_video, 'فيديو الباقة يغطّي مقطعًا من «سريع»');
  r = await price('plus1', { clips: 3, engine: 'veo' });
  assert.equal(r.body.cost, 3 * COSTS.veo_video, '«سينمائي» بالوصف الحرّ لا تغطّيه صلاحيّة الباقة (كالمقطع المفرد)');
  r = await price('none1', { clips: 9, engine: 'veo' });
  assert.equal(r.body.cost, 4 * COSTS.veo_video, 'أربعة مقاطع على الأكثر');
  assert.equal((await price('none1', { clips: 2, engine: 'veo', confirmed: true })).body.priceOk, true, 'بعد الموافقة');
  r = await price('poor1', { clips: 2, engine: 'veo' });
  assert.deepEqual([r.code, r.body.error, r.body.needed], [402, 'points_insufficient', 2 * COSTS.veo_video], 'الرصيد لا يكفي المجموع قبل أيّ مقطع');
  for (const u of ['vip1', 'omran']) { r = await price(u, { clips: 4, engine: 'veo' }); assert.deepEqual([r.code, r.body.priceOk], [200, true], u); }
  /* مقطع واحد = السؤال المفرد كما كان (وتردّه المهلة)، والترند لا يقرأ clips */
  r = await price('none1', { clips: 1, engine: 'veo' });
  assert.deepEqual([r.code, r.body.error], [429, 'video_cooldown']);
  r = await price('none1', { clips: 3, trend: 'pixarstory', scenes: 2, params: {} });
  assert.equal(r.body.cost, 2 * COSTS.veo_video);
  assert.match(r.body.message_ar, /قصّة ترند بعدّة مشاهد/);
  assert.equal(upstream, 0, 'لا مزوّد'); assert.equal(kv.get('points:none1'), '1000', 'لا خصم');
  assert.equal(veo.DIALOGUE_CLIPS_MAX, 4);
  assert.match(CLIENT, /const DIALOGUE_CLIPS_MAX = 4;/, 'العميل والخادم بالحدّ نفسه');
});

test('٩. نصّا الواجهة بالـ١٤ لغة بعناصرهما، بلا عربيّة في غير العربيّة والأرديّة، وسقوط العميل = نصّ القاموس، ووسم اللغات مرفوع', () => {
  const ctx = { console, localStorage: { getItem: () => null }, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, $: () => null };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const add = src.slice(src.indexOf('/* v-video-dialogue-clips (800)')).split('\n').slice(1, 3).join('\n');
  assert.match(add, /^Object\.assign\(I18N\.ar, \{"vmkDialogLong":/);
  vm.runInContext(add, ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const d = ctx.I18N[L] || {};
    assert.ok(d.vmkDialogLong && d.vmkDialogLong.includes('{s}') && d.vmkDialogLong.includes('{last}') && d.vmkDialogLong.split('\n').length === 3, L + ' long');
    assert.ok(d.vmkDialogClips && ['{n}', '{s}', '{i}'].every((k) => d.vmkDialogClips.includes(k)) && !d.vmkDialogClips.includes('\n'), L + ' clips');
    if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(d.vmkDialogLong + d.vmkDialogClips), L + ': عربيّة');
  }
  for (const [lang, key] of [['ar', 0], ['en', 1]]) {
    const c = { window: { confirm: (m) => { c.msg = m; return true; } }, __swallow: () => {}, vmkT: (k, ar, en) => (key ? en : ar) };
    vm.runInNewContext(block(CLIENT, 'function dialogCapOk(plan){') + '\n' + block(CLIENT, 'function dialogClipsText(i, n, secs){') + '\nthis.cap = dialogCapOk; this.line = dialogClipsText;', c);
    c.cap({ dropped: 2, last: 'آخر جملة', seconds: 30 });
    assert.equal(c.msg, ctx.I18N[lang].vmkDialogLong.replace('{s}', '30').replace('{last}', 'آخر جملة'), lang);
    assert.equal(c.line(2, 3, 27), ctx.I18N[lang].vmkDialogClips.split('{i}').join('2').split('{n}').join('3').replace('{s}', '27'), lang);
  }
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 800 && st.includes('v-video-dialogue-clips (800)'), 'وسم اللغات مرفوع وسببه في التعليق');
});

/* ── v-video-dialogue-reject (المالك ١٧ نوفمبر بعد #1344: مقطعان تولّدا والثالث رفضه المحرّك «Input blocked… real people's names or
   likenesses» فرأى مشهدين متفرّقين ورسالة رفض — «انته غبي ولا تريد ان تخسرني فقط»). المقطع المرفوض يُعاد بمرجع آخر (أوّل لقطة في
   سابقه، ثمّ صورة البطل، ثمّ بلا صورة)، وما اكتمل يُسلَّم فيديو واحدًا، والمرفوض لا يُخصم. ── */
const LINES3 = ['البنت: أمي لماذا نحتفل باليوم الوطني؟', 'الأم: نحتفل باتحاد الإمارات السبع ووطننا الغالي', 'البنت: ومن الذي أسّس اتحاد الإمارات؟',
  'الأم: الشيخ زايد بن سلطان آل نهيان رحمه الله', 'البنت: مع إخوانه حكّام الإمارات', 'الاثنتان: كل عام والإمارات بخير'];
const D3 = [SCENE].concat(LINES3).join('\n');
const has = (b, tag) => String(b.imageBase64 || '').startsWith(tag);

test('١٠. حالة المالك: المقطع الثالث يرفضه المحرّك بآخر لقطة — يُعاد بأوّل لقطة في سابقه فيكتمل الفيديو كلّه ملصوقًا، بلا مشاهد متفرّقة', async () => {
  const p = plan(D3);
  assert.equal(p.clips.length, 3, 'حواره الأطول على ثلاثة مقاطع'); assert.equal(p.dropped, 0);
  const f = flow({ reject: (b, clipNo) => clipNo === 3 && has(b, 'FRAME<') });
  await f.ctx.run(p, 'minimax');
  const c = f.creates();
  assert.equal(c.length, 4, 'ثلاثة مقاطع + إعادة واحدة');
  assert.deepEqual([c[2].imageBase64, c[2].keepPhoto, c[2].promptText], ['FRAME<https://cdn/T2.mp4>', true, CONT + '\n' + p.clips[2].text + LOOK], 'المحاولة الأولى بآخر لقطة');
  assert.deepEqual([c[3].imageBase64, c[3].keepPhoto, c[3].promptText, c[3].confirmed, c[3].durationSeconds],
    ['FIRST<https://cdn/T2.mp4>', true, CONT + '\n' + p.clips[2].text + LOOK, true, p.clips[2].sec], 'الإعادة بأوّل لقطة في المقطع السابق — الكلام نفسه');
  assert.deepEqual(f.joined, [['blob:https://cdn/T1.mp4', 'blob:https://cdn/T2.mp4', 'blob:https://cdn/T3.mp4']], 'الثلاثة ملصوقة بترتيبها');
  assert.equal(f.partial.length, 0, 'لا مشاهد متفرّقة');
  assert.equal(f.ctx.resultEl.src, 'blob:joined');
  assert.ok(f.status.includes('retry 3/3'), 'سطر الإعادة');
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!', 'بمرجع = بلا تنبيه شكل');
  assert.equal(f.ctx.scenesDone, 3);
});

test('١١. ترتيب المراجع عند الرفض: آخر لقطة ← أوّل لقطة ← صورة البطل ← بلا صورة (وبلا «أكمل من اللقطة»)، وينبَّه أنّ شكل الشخصيّات قد يختلف', async () => {
  const p = plan(D3);
  /* المحرّك يرفض كلّ لقطة من الفيديو: يسقط إلى صورة البطل */
  let f = flow({ hero: 'HERO', reject: (b, clipNo) => clipNo > 1 && (has(b, 'FRAME<') || has(b, 'FIRST<')) });
  await f.ctx.run(p, 'minimax');
  let c = f.creates();
  assert.deepEqual(c.map((x) => String(x.imageBase64).slice(0, 5)), ['HERO', 'FRAME', 'FIRST', 'HERO', 'FRAME', 'FIRST', 'HERO']);
  assert.deepEqual([c[3].keepPhoto, c[3].imageMime, c[3].promptText], [undefined, 'image/png', p.clips[1].text], 'صورة البطل كالمقطع الأوّل');
  assert.equal(f.joined[0].length, 3); assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  /* بلا بطل ويرفض كلّ صورة: بلا صورة — الوصف وحده كما كان يمرّ قبل #1344 */
  f = flow({ reject: (b, clipNo) => clipNo > 1 && !!b.imageBase64 });
  await f.ctx.run(p, 'minimax');
  c = f.creates();
  assert.equal(c.length, 7);
  assert.deepEqual([c[3].imageBase64, c[3].keepPhoto, c[3].promptText], [undefined, undefined, p.clips[1].text + LOOK]);
  assert.equal(f.joined[0].length, 3, 'الفيديو كامل');
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء! noref 2', 'أوّل مقطع بلا لقطة مرجعيّة يُذكر');
  for (const x of c) assert.equal(VT.fitDialogue(x.promptText, x.durationSeconds).dropped, 0, 'الخادم لا يقصّ من أيّ محاولة');
  /* اللقطة تعذّرت أصلًا (لا رفض): بلا صورة ويُنبَّه كذلك */
  f = flow({ noFrame: true });
  await f.ctx.run(plan(DIALOGUE), 'minimax');
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء! noref 2');
});

test('١٢. ما اكتمل لا يضيع: رفض نهائيّ أو عطب في مقطع لاحق = المكتمل ملصوقًا في فيديو واحد مع السبب و«الباقي لم يُخصم»؛ وغير الرفض لا يُعاد', async () => {
  const p = plan(D3);
  /* المحرّك يرفض المقطع الثالث بكلّ مرجع وبلاه */
  let f = flow({ reject: (b, clipNo) => clipNo === 3 });
  await f.ctx.run(p, 'minimax');
  assert.equal(f.creates().length, 5, 'مقطعان + ثلاث محاولات للثالث');
  assert.deepEqual(f.joined, [['blob:https://cdn/T1.mp4', 'blob:https://cdn/T2.mp4']], 'المكتملان ملصوقان');
  assert.equal(f.partial.length, 0, 'فيديو واحد لا مشاهد متفرّقة');
  assert.equal(f.ctx.resultEl.src, 'blob:joined'); assert.equal(f.ctx.downloadEl.style.display, 'block');
  assert.equal(f.status[f.status.length - 1], 'ERR:video_rejected part 2/3');
  /* عطب غير الرفض (رصيد، انقطاع): لا إعادة — يُسلَّم المكتمل */
  f = flow({ failAt: 3 });
  await f.ctx.run(p, 'minimax');
  assert.equal(f.creates().length, 3, 'لا محاولة ثانية لغير الرفض');
  assert.equal(f.joined[0].length, 2); assert.equal(f.status[f.status.length - 1], 'ERR:points_insufficient part 2/3');
  /* تعذّر لصق المكتمل: المشاهد بروابطها كما كان */
  f = flow({ failAt: 3, noJoin: true });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.partial, [[['https://cdn/T1.mp4', 'https://cdn/T2.mp4'], 3, 'ERR:points_insufficient']]);
  /* المقطع الأوّل مرفوض: خطأ عاديّ بمحاولة واحدة — صورة البطل المرفوضة لا تُستبدل بفيديو بلا وجه صاحبها */
  f = flow({ hero: 'HERO', reject: (b, clipNo) => clipNo === 1 });
  await assert.rejects(f.ctx.run(p, 'minimax'), (e) => e.code === 'video_rejected');
  assert.equal(f.creates().length, 1); assert.equal(f.partial.length, 0); assert.equal(f.joined.length, 0);
});

test('١٣. الخادم: المقطع الذي يرفضه المحرّك لا يُخصم — النقاط تُردّ والقفل يُفكّ والردّ video_rejected، والسجلّ يقول هل كان معه لقطة', async () => {
  account('cust1', 'free', 1000);
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  const errs = []; const realErr = console.error; console.error = (m) => errs.push(String(m));
  omniBlocked = true; lockLog.length = 0;
  try {
    await veo({ method: 'POST', query: { action: 'veo-create' }, body: { promptText: CONT + '\n' + plan(D3).clips[2].text, ratio: '1280:720', token: token('cust1'), quality: 'fast', style: 'realistic',
      durationSeconds: 8, confirmed: true, imageBase64: 'RlJBTUU=', imageMime: 'image/jpeg', keepPhoto: true } }, res);
  } finally { omniBlocked = false; console.error = realErr; }
  assert.deepEqual([res.code, res.body.error, res.body.retryable], [400, 'video_rejected', false], JSON.stringify(res.body));
  assert.equal(kv.get('points:cust1'), '1000', 'خُصم ثمّ رُدّ كاملًا');
  assert.deepEqual(lockLog, ['lock:cust1', 'release:cust1'], 'القفل فُكّ — الإعادة لا تنتظر مهلة الثلاث دقائق');
  assert.ok(errs.some((m) => /omni upstream 400 \(image=kept-frame\): Input blocked/.test(m)), errs.join(' | '));
});

test('١٤. نصوص الإعادة والمقطع بلا مرجع وتسليم المكتمل بالـ١٤ لغة بعناصرها، وسقوط العميل = نصّ القاموس، ووسم اللغات مرفوع', () => {
  const ctx = { console, localStorage: { getItem: () => null }, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, $: () => null };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const add = src.slice(src.indexOf('/* v-video-dialogue-reject (801)')).split('\n').slice(1, 3).join('\n');
  assert.match(add, /^Object\.assign\(I18N\.ar, \{"vmkDialogRetry":/);
  vm.runInContext(add, ctx);
  const add2 = src.slice(src.indexOf('/* v-video-dialogue-merge (802)')).split('\n').slice(1, 3).join('\n');
  assert.match(add2, /^Object\.assign\(I18N\.ar, \{"vmkDialogPart":/);
  vm.runInContext(add2, ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  const NEED = { vmkDialogRetry: ['{i}', '{n}'], vmkDialogNoRef: ['{i}'], vmkDialogPart: ['{k}', '{n}'], vmkDialogResume: ['{k}', '{n}'], vmkDialogJoin: [] };
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const d = ctx.I18N[L] || {};
    for (const [key, ph] of Object.entries(NEED)) {
      assert.ok(d[key] && ph.every((x) => d[key].includes(x)) && !d[key].includes('\n'), L + ' ' + key);
      if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(d[key]), L + ' ' + key + ': عربيّة');
    }
  }
  for (const [lang, en] of [['ar', 0], ['en', 1]]) {
    const c = { vmkT: (k, ar, e) => (en ? e : ar) };
    vm.runInNewContext(['function dialogNoteText(key, ar, en, vals){', 'function dialogRetryText(i, n){', 'function dialogNoRefText(i){', 'function dialogPartText(k, n){', 'function dialogResumeText(k, n){', 'function dialogJoinFailText(){'].map((n) => block(CLIENT, n)).join('\n')
      + '\nthis.r = dialogRetryText; this.x = dialogNoRefText; this.p = dialogPartText; this.u = dialogResumeText; this.j = dialogJoinFailText;', c);
    const D = ctx.I18N[lang];
    assert.equal(c.r(3, 3), D.vmkDialogRetry.replace('{i}', '3').replace('{n}', '3'), lang);
    assert.equal(c.x(2), D.vmkDialogNoRef.replace('{i}', '2'), lang);
    assert.equal(c.p(2, 3), D.vmkDialogPart.replace('{k}', '2').replace('{n}', '3'), lang);
    assert.equal(c.u(2, 3), D.vmkDialogResume.replace('{k}', '2').replace('{n}', '3'), lang);
    assert.equal(c.j(), D.vmkDialogJoin, lang);
  }
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 802 && st.includes('v-video-dialogue-reject (801)') && st.includes('v-video-dialogue-merge (802)'), 'وسم اللغات مرفوع وسبباه في التعليق');
  assert.ok(read('js/app.bundle.js').includes('function dialogPartText(k, n){'), 'الحزمة مبنيّة');
});

/* ── v-video-dialogue-merge (المالك ١٧ نوفمبر بعد #1345: «الي اريده فيديو مدموج وليس مقاطع» — أمامه مشهدان متفرّقان من تشغيلة دُفع
   ثمنها ثمّ توقّفت، ولم يُعد التشغيل). إعادة الضغط تكمل الناقص وحده وتدمج الكلّ؛ والدمج له طريق احتياطيّ؛ و«واقعي» يُقال في كلّ مقطع. ── */
test('١٥. الاستئناف: سلسلة توقّفت عند المقطع الثالث — إعادة الضغط لا تولّد ولا تدفع المقطعين المكتملين: سعر الباقي وحده، مقطع واحد يكمل من آخر لقطة، والثلاثة في فيديو واحد', async () => {
  const p = plan(D3);
  const store = {};
  let f = flow({ store, failAt: 3 });
  await f.ctx.run(p, 'minimax');
  assert.equal(f.status[f.status.length - 1], 'ERR:points_insufficient part 2/3');
  const saved = JSON.parse(Object.values(store)[0]);
  assert.deepEqual(saved.urls, ['https://cdn/T1.mp4', 'https://cdn/T2.mp4'], 'المكتملان محفوظان');
  /* إعادة الضغط بالحوار نفسه */
  f = flow({ store, idBase: 2 });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 1, engine: 'minimax', promptText: 'dialogue', token: 'tok', resume: true }], 'سعر المقطع الباقي وحده');
  const c = f.creates();
  assert.equal(c.length, 1, 'مقطع واحد يُولَّد');
  assert.deepEqual([c[0].promptText, c[0].imageBase64, c[0].keepPhoto], [CONT + '\n' + p.clips[2].text + LOOK, 'FRAME<https://cdn/T2.mp4>', true], 'يكمل من آخر لقطة في المقطع المحفوظ');
  assert.deepEqual(f.joined, [['blob:https://cdn/T1.mp4', 'blob:https://cdn/T2.mp4', 'blob:https://cdn/T3.mp4']], 'الثلاثة في فيديو واحد');
  assert.ok(f.status.includes('resume 2/3'));
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  assert.deepEqual(Object.keys(store), [], 'اكتمل الفيديو = تُمحى السلسلة (الضغطة التالية توليد جديد)');
  assert.equal(f.ctx.scenesDone, 1);
});

test('١٦. الاستئناف بحدوده: تعذّر الدمج يُعاد بلا خصم ولا توليد؛ حوار أو وضع آخر لا يستعير؛ مقطع محفوظ لا يُحمَّل يُسقط هو وما بعده؛ والمحفوظ يسقط بعد ٢٠ ساعة', async () => {
  const p = plan(D3);
  let store = {};
  let f = flow({ store, noJoin: true });
  await f.ctx.run(p, 'minimax');
  assert.equal(f.creates().length, 3); assert.equal(JSON.parse(Object.values(store)[0]).urls.length, 3);
  f = flow({ store });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.net.length, f.creates().length], [0, 0], 'لا سؤال سعر ولا توليد — دمج فقط');
  assert.equal(f.joined[0].length, 3); assert.equal(f.ctx.resultEl.src, 'blob:joined');
  assert.deepEqual(Object.keys(store), []);
  /* حوار آخر، أو الوضع الآخر، لا يستعير مقاطع غيره */
  store = {};
  f = flow({ store, failAt: 3 }); await f.ctx.run(p, 'minimax');
  f = flow({ store, idBase: 5 }); await f.ctx.run(plan(DIALOGUE), 'minimax');
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, f.creates().length], [2, undefined, 2], 'حوار آخر = من أوّله');
  store = {};
  f = flow({ store, failAt: 3 }); await f.ctx.run(p, 'minimax');
  f = flow({ store, idBase: 5 }); await f.ctx.run(p, 'veo');
  assert.equal(f.creates().length, 3, 'الوضع الآخر = من أوّله');
  /* المقطع الثاني المحفوظ لم يعد يُحمَّل: يُستعار الأوّل وحده */
  store = {};
  f = flow({ store, failAt: 3 }); await f.ctx.run(p, 'minimax');
  f = flow({ store, idBase: 5, gone: (u) => /T2\.mp4$/.test(u) }); await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, f.creates().length], [2, true, 2]);
  assert.equal(f.creates()[0].imageBase64, 'FRAME<https://cdn/T1.mp4>');
  /* ثلاثة محفوظة والأوسط لم يعد يُحمَّل: يُسقط هو وما بعده — لا يُلصق الثالث بعد الأوّل بترتيب مكسور */
  store = {};
  f = flow({ store, noJoin: true }); await f.ctx.run(p, 'minimax');
  assert.equal(JSON.parse(Object.values(store)[0]).urls.length, 3);
  f = flow({ store, idBase: 5, gone: (u) => /T2\.mp4$/.test(u) }); await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.net[0][2].clips, f.creates().length], [2, 2], 'الثاني والثالث يُولَّدان');
  assert.deepEqual(f.joined, [['blob:https://cdn/T1.mp4', 'blob:https://cdn/T6.mp4', 'blob:https://cdn/T7.mp4']]);
  /* بعد ٢٠ ساعة يسقط المحفوظ */
  store = {};
  f = flow({ store, failAt: 3 }); await f.ctx.run(p, 'minimax');
  const k = Object.keys(store)[0], j = JSON.parse(store[k]); j.at = Date.now() - 21 * 3600 * 1000; store[k] = JSON.stringify(j);
  f = flow({ store, idBase: 5 }); await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.net[0][2].clips, f.creates().length], [3, 3]);
});

test('١٧. الدمج في ملفّ واحد: النسخ السريع حين تتطابق المقاسات ويخرج بحجم مدخلاته، وإلّا إعادة الترميز بمقاس الأوّل؛ null حين يتعذّر الاثنان', async () => {
  const mk = (o) => {
    const log = [];
    const ctx = { __swallow: () => {}, Promise,
      clipDims: async (b) => (o.dims ? o.dims(b) : { w: 1280, h: 720 }),
      concatScenes: async (list) => { log.push(['copy', list.length]); if (o.copy === 'throw') throw new Error('x'); return { size: o.copy === 'small' ? 100 : 9000 }; },
      concatScenesEncode: async (list, w, h) => { log.push(['encode', list.length, w, h]); if (o.encode === 'throw') throw new Error('y'); return { size: 8000, encoded: true }; } };
    vm.runInNewContext(block(CLIENT, 'async function joinDialogClips(list, blobs){') + '\nthis.join = joinDialogClips;', ctx);
    return { join: ctx.join, log };
  };
  const B = (n, extra) => Object.assign({ size: 3000, n }, extra);
  let t = mk({});
  let out = await t.join(['a', 'b', 'c'], [B(1), B(2), B(3)]);
  assert.deepEqual([JSON.parse(JSON.stringify(t.log)), out.size], [[['copy', 3]], 9000], 'مقاسات متطابقة = نسخ سريع');
  t = mk({ dims: (b) => (b.n === 2 ? { w: 1344, h: 768 } : { w: 1280, h: 720 }) });
  out = await t.join(['a', 'b'], [B(1), B(2)]);
  assert.deepEqual([JSON.parse(JSON.stringify(t.log)), out.encoded], [[['encode', 2, 1280, 720]], true], 'مقاس مختلف = إعادة ترميز بمقاس الأوّل، بلا نسخ');
  t = mk({ copy: 'small' });
  out = await t.join(['a', 'b'], [B(1), B(2)]);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log)), [['copy', 2], ['encode', 2, 1280, 720]], 'ناتج النسخ أصغر من مدخلاته = إعادة ترميز');
  assert.equal(out.encoded, true);
  t = mk({ copy: 'throw' });
  assert.equal((await t.join(['a', 'b'], [B(1), B(2)])).encoded, true, 'فشل النسخ = إعادة ترميز');
  t = mk({ copy: 'throw', encode: 'throw' });
  assert.equal(await t.join(['a', 'b'], [B(1), B(2)]), null, 'تعذّر الاثنان');
  /* مقطع لم يُحمَّل محلّيًّا (رابطه وحده): لا مقاس ولا حجم — النسخ يُقبل بلا شرط الحجم */
  t = mk({ copy: 'small', dims: () => null });
  out = await t.join(['a', 'b'], [B(1), null]);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log)), [['copy', 2], ['encode', 2, 1280, 720]], 'ناتج تافه يُرفض ولو جُهل الحجم');
  /* إعادة الترميز نفسها: كلّ مقطع يُضبط إلى المقاس و٣٠ إطارًا وصوت ٤٨ك ستيريو ثمّ concat بصورة وصوت */
  const enc = block(CLIENT, 'async function concatScenesEncode(urls, w, h){');
  assert.ok(enc.includes("'concat=n=' + urls.length + ':v=1:a=1[v][a]'") && enc.includes('aresample=48000') && enc.includes(',fps=30,format=yuv420p[v'));
  assert.ok(enc.includes("'-c:v', 'libx264', '-preset', 'ultrafast'") && enc.includes("'-c:a', 'aac'"));
});

test('١٨. الخادم: سعر الاستئناف = الباقي وحده ولو مقطعًا واحدًا بسعر محرّكه؛ وبلا resume المقطع الواحد سؤاله المفرد كما كان', async () => {
  let r = await price('none1', { clips: 1, engine: 'minimax', resume: true });
  assert.deepEqual([r.code, r.body.cost], [428, COSTS.minimax_video], JSON.stringify(r.body));
  assert.match(r.body.message_ar, /فيديو حوار بعدّة مقاطع متتالية/);
  r = await price('none1', { clips: 1, engine: 'veo', resume: true });
  assert.equal(r.body.cost, COSTS.veo_video);
  r = await price('poor1', { clips: 1, engine: 'veo', resume: true });
  assert.deepEqual([r.code, r.body.error], [402, 'points_insufficient']);
  r = await price('none1', { clips: 1, engine: 'minimax' });
  assert.deepEqual([r.code, r.body.error], [429, 'video_cooldown'], 'بلا resume: المسار المفرد');
  r = await price('none1', { clips: 1, engine: 'minimax', resume: 'yes' });
  assert.equal(r.body.error, 'video_cooldown', 'resume يجب أن يكون true حرفيًّا');
});

test('١٩. «واقعي» يُقال في كلّ مقطع بلا صورة بطل (سطر مستقلّ لا يُعدّ كلامًا)، وصورة البطل والأنمي بلا السطر', async () => {
  const p = plan(D3);
  let f = flow();
  await f.ctx.run(p, 'minimax');
  for (const x of f.creates()) { assert.ok(x.promptText.endsWith(LOOK)); assert.equal(VT.dialogueTurns(x.promptText).length, VT.dialogueTurns(x.promptText.replace(LOOK, '')).length); }
  assert.equal(VT.dialogueTurns(LOOK).length, 0); assert.ok(!/[:：«»"“”]/.test(LOOK));
  f = flow({ hero: 'HERO' });
  await f.ctx.run(p, 'minimax');
  assert.ok(f.creates().every((x) => !x.promptText.includes('Photorealistic')), 'صورة البطل بأسلوبها');
  f = flow();
  f.ctx.style = 'anime';
  await f.ctx.run(p, 'minimax');
  assert.ok(f.creates().every((x) => !x.promptText.includes('Photorealistic')), 'الأنمي له سطره على الخادم');
  assert.ok(read('js/app.bundle.js').includes('async function joinDialogClips(list, blobs){') && read('js/app.bundle.js').includes('function dlgChainLoad(sig, more){'), 'الحزمة مبنيّة');
});

/* ── v-video-one-shot (المالك ١٧ نوفمبر بعد #1348: «الي اريده فيديو كامل مره وحده مااريد فيديو مقاطع… الفيديو مش على حسابك»). التوليدة
   الواحدة حتّى ١٥ ثانية (أقصى ما يصنعه المحرّكان في مرّة)، و«سينمائي» ما زاد يمدّه المحرّك نفسه في آخر الفيديو (٣–١٠ث للمرّة، ≤ ٣٠ث)
   فيخرج فيديو واحد متّصل بلا لصق؛ تعذّر التمديد = اللقطة المرجعيّة واللصق كما كانا. ── */
/* v-video-full-dialogue: نصّ المالك الحرفيّ في تشغيلة ١٩ نوفمبر («الفيديو بني ١٤ ثانية ما كمل الي اخر شي») — عنوانان ثمّ سبعة أدوار (٤٤ كلمة).
   خطّته ثلاث خطوات (توليدة ثمّ تمديدان) فهي مثال الخطوات الثلاث في الحالات ٢١–٢٥ */
const RUN19_HEAD = ['🇦🇪 مشهد قصير: أحب وطني', 'الشخصيات: طفلة وأمها.'];
const RUN19_LINES = ['الطفلة: أمي، لماذا نحتفل باليوم الوطني؟', 'الأم: لأننا نحتفل باتحاد الإمارات السبع ووطننا الغالي.', 'الطفلة: ومن الذي أسس اتحاد الإمارات؟',
  'الأم: الشيخ زايد بن سلطان آل نهيان، رحمه الله، مع إخوانه الحكام.', 'الطفلة: أنا فخورة بوطننا، وأحب علم الإمارات!', 'الأم: حفظ الله الإمارات وأدام عزها.', 'معاً: كل عام والإمارات عز وفخر! 🇦🇪'];
const RUN19 = RUN19_HEAD.concat(RUN19_LINES).join('\n') + '\n';
const LONG3 = planOne(RUN19);
const EXT_LEAD = (i) => (i ? VT.EXTEND_SAY_LEAD : 1); // ميزانيّة كلام الخطوة: التمديد بلا ثانية افتتاح
const D21 =[SCENE].concat(LINES.slice(0, 5)).join('\n');           // ٢١ كلمة
const D23 = D21 + '\nالأم: نعم صحيح';                                // ٢٣ كلمة — آخر ما تتّسع له توليدة واحدة
const D24 = D21 + '\nالأم: نعم هذا صحيح';                            // ٢٤ كلمة

test('٢٠. الخطّة: توليدة واحدة حتّى ١٥ ثانية (٢٣ كلمة) بمدّة كلامها، و«سينمائي» ما زاد يمدّه المحرّك — الفيديو كلّه ≤ ٣٠ ثانية وبلا كلمة ناقصة', () => {
  assert.equal(plan(D21).clips.length, 2, 'بحدّ ١٠ ثوانٍ (الافتراضيّ كما كان): مقطعان');
  let p = plan(D21, 0, [15]);
  assert.deepEqual([p.clips.length, p.words, p.need, p.dropped], [1, 21, 14, 0], 'بحدّ ١٥: توليدة واحدة بمدّة كلامها');
  assert.ok(p.words <= VT.wordBudget(p.need) && p.words > VT.wordBudget(p.need - 1), 'أقلّ مدّة تتّسع لكلامها');
  assert.equal(VT.fitDialogue(D21, p.need).dropped, 0, 'الخادم لا يقصّ منها شيئًا');
  assert.equal(VT.wordBudget(15), 23);
  assert.deepEqual([plan(D23, 0, [15]).clips.length, plan(D23, 0, [15]).need], [1, 15]);
  assert.equal(plan(D24, 0, [15]).clips.length, 2, 'فوق متّسع التوليدة الواحدة: لا يُحشر');
  /* «سينمائي»: ما تتّسع له توليدة = توليدة واحدة */
  for (const d of [D21, D23]) { p = planOne(d); assert.deepEqual([p.clips.length, p.dropped, p.need <= 15], [1, 0, true]); }
  /* حوار المالك الأقصر (٢٥ كلمة): توليدة ثمّ تمديد واحد */
  p = planOne(DIALOGUE);
  assert.deepEqual(p.clips.map((c) => [c.words, c.sec, c.fresh]), [[13, 9, undefined], [12, 8, 9]]);
  assert.equal(p.clips[1].text, [SCENE].concat(LINES.slice(3)).join('\n'));
  /* حواره الأطول يومها (٣٢ كلمة): توليدة ثمّ تمديد واحد — خطوتان متوازنتان بدل ثلاث */
  p = planOne(D3);
  assert.deepEqual([p.words, p.dropped, p.seconds], [32, 0, 21]);
  assert.deepEqual(p.clips.map((c) => [c.words, c.sec, c.fresh]), [[16, 11, undefined], [16, 10, 11]]);
  assert.deepEqual(p.clips.map((c) => c.text), [[SCENE].concat(LINES3.slice(0, 3)).join('\n'), [SCENE].concat(LINES3.slice(3)).join('\n')]);
  /* v-video-full-dialogue — نصّ تشغيلة ١٩ نوفمبر: الحوار كلّه (٤٤ كلمة، سبعة أدوار) في فيديو واحد ٢٩ ثانية بلا سطر ناقص؛ كانت الخطّة
     تُسقط آخر دورين. العنوانان ليسا كلامًا (لا يُعدّان) ويبقيان وصفًا أوّل كلّ جزء، والسؤال مع جوابه في جزء واحد */
  p = LONG3;
  assert.deepEqual([p.turns, p.words, p.dropped, p.seconds], [7, 44, 0, 29]);
  assert.deepEqual(p.clips.map((c) => [c.words, c.sec, c.fresh]), [[12, 9, undefined], [16, 10, 11], [16, 10, 11]]);
  assert.deepEqual(p.clips.map((c) => c.text), [[0, 2], [2, 4], [4, 7]].map(([a, b]) => RUN19_HEAD.concat(RUN19_LINES.slice(a, b)).join('\n')));
  assert.equal(p.last, 'كل عام والإمارات عز وفخر! 🇦🇪', 'آخر ما يُقال آخر سطر في حواره');
  assert.deepEqual([].concat(...p.clips.map((c) => wordsOf(c.text.split('\n').slice(2).join('\n')))), wordsOf(RUN19_LINES.join('\n')), 'الكلمات نفسها بترتيبها');
  p.clips.forEach((c, i) => {
    assert.ok(c.sec <= (i ? 10 : 15) && c.words <= VT.wordBudget(c.sec, EXT_LEAD(i)), 'جزء ' + (i + 1) + ' داخل حدّه');
    assert.equal(VT.fitDialogue(c.text, c.sec, EXT_LEAD(i)).dropped, 0, 'الخادم لا يقصّ منه');
    if (i) assert.equal(VT.fitDialogue(c.text, c.fresh).dropped, 0, 'ولا حين يُولَّد مقطعًا جديدًا بمدّته مقطعًا');
  });
  assert.equal(VT.fitDialogue(p.clips[1].text, p.clips[1].sec).dropped, 1, 'بمدّة التمديد مقطعًا جديدًا كان الخادم يقصّ آخر سطر — لذلك fresh');
  assert.deepEqual([VT.wordBudget(10), VT.wordBudget(10, VT.EXTEND_SAY_LEAD), VT.wordBudget(3, VT.EXTEND_SAY_LEAD), VT.EXTEND_SAY_LEAD], [15, 16, 4, 0.5]);
  assert.equal(P.one.toString().includes('DIALOGUE_ONE'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext((/const DIALOGUE_ONE = [^\n]+/.exec(CLIENT) || [''])[0] + '\nDIALOGUE_ONE'))), { first: 15, step: 10, total: 30, lead: VT.EXTEND_SAY_LEAD }, 'حدود المحرّك وميزانيّة التمديد كالخادم');
  /* أطول من ٣٠ ثانية: يُقال ما يتّسع ويُنبَّه (dropped) — ولا يتجاوز الفيديو ٣٠ ثانية في أيّ توزيع */
  const long = [SCENE].concat(Array.from({ length: 14 }, (_, i) => (i % 2 ? 'الأم' : 'البنت') + ': هذي جملة رقم ' + (i + 1) + ' في الحوار الطويل جدًّا')).join('\n');
  p = planOne(long);
  assert.ok(p.dropped > 0 && p.clips.length >= 2 && p.seconds <= 30, JSON.stringify([p.dropped, p.seconds]));
  for (const n of [5, 6, 7, 9, 12]) {
    const q = planOne([SCENE].concat(Array.from({ length: n }, (_, i) => (i % 2 ? 'الأم' : 'البنت') + ': كلمة كلمة كلمة كلمة كلمة ' + i)).join('\n'));
    assert.ok(q.seconds <= 30 && q.clips.every((c, i) => c.sec <= (i ? 10 : 15) && c.words <= VT.wordBudget(c.sec, EXT_LEAD(i))), n + ' أدوار: ' + JSON.stringify(q.clips.map((c) => [c.words, c.sec])));
  }
  /* لا سطر يسقط ما دام الحوار يتّسع له الفيديو: مقارنة بعدّ مستقلّ لكلّ تقسيم ممكن (≤ ٤ خطوات، ≤ ٣٠ث) — وأقلّ خطوات */
  const secOf = (w, k) => { for (let s = k ? 3 : 6; s <= (k ? 10 : 15); s++) if (VT.wordBudget(s, EXT_LEAD(k)) >= w) return s; return 99; };
  const fewest = (ws) => {
    let min = 0;
    const go = (at, k, secs) => {
      if (at === ws.length) { if (!min || k < min) min = k; return; }
      if (k === 4) return;
      for (let to = at + 1, w = 0; to <= ws.length; to++) { w += ws[to - 1]; const t = secs + secOf(w, k); if (t > 30) break; go(to, k + 1, t); }
    };
    go(0, 0, 0);
    return min;
  };
  let seed = 19, whole = 0, cut = 0;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let t = 0; t < 400; t++) {
    const ws = Array.from({ length: 2 + rnd(9) }, () => 2 + rnd(11));
    const d = [SCENE].concat(ws.map((w, i) => (i % 2 ? 'الأم' : 'البنت') + ': ' + Array.from({ length: w }, (_, j) => 'كلمة' + j).join(' '))).join('\n');
    const q = planOne(d), min = fewest(ws);
    if (min) { whole++; assert.deepEqual([q.dropped, q.clips.length], [0, min], JSON.stringify(ws)); }
    else {
      /* لا يتّسع كلّه: يُقال أطول ما يتّسع من أوّله — لا سطر يسقط فوق اللازم */
      cut++;
      let m = ws.length - 1; while (m > 1 && !fewest(ws.slice(0, m))) m--;
      assert.deepEqual([q.dropped, q.clips.length], [ws.length - m, fewest(ws.slice(0, m))], JSON.stringify(ws));
    }
    assert.ok(q.seconds <= 30 && q.clips.length <= 4, JSON.stringify(ws));
  }
  assert.ok(whole > 100 && cut > 50, 'العيّنة تغطّي الحالتين: ' + whole + '/' + cut);
  assert.deepEqual([planOne('صقر يحلّق فوق الكثبان').clips.length, planOne('').need], [0, 0], 'بلا حوار لا خطّة');
  /* «سريع» بحساب المالك: مقاطع حتّى ١٥ ثانية (مقطعان بدل ثلاثة)، وغيره كما كان */
  assert.deepEqual(plan(D3, 0, [15]).clips.map((c) => [c.words, c.sec]), [[16, 11], [16, 11]]);
  assert.deepEqual(plan(D3, 0, [10]).clips.map((c) => [c.words, c.sec]), plan(D3).clips.map((c) => [c.words, c.sec]));
  assert.equal(plan(D3).clips.length, 3);
});

test('٢١. «سينمائي»: الجزء التالي يمدّه المحرّك نفسه (extendOp) — بلا لقطة مرجعيّة ولا لصق، والناتج آخر فيديو كما هو', async () => {
  const p = LONG3;
  let f = flow();
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 3, engine: 'veo', promptText: 'dialogue', token: 'tok' }]);
  const c = f.creates();
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { promptText: p.clips[0].text + LOOK, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 9, confirmed: true, extendable: true });
  assert.deepEqual(c[1], { promptText: p.clips[1].text, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 10, confirmed: true, extendOp: 'omni/1' });
  assert.deepEqual(c[2], { promptText: p.clips[2].text, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 10, confirmed: true, extendOp: 'omni/2' });
  for (const x of c) assert.equal(VT.fitDialogue(x.promptText, x.durationSeconds, EXT_LEAD(x.extendOp ? 1 : 0)).dropped, 0, 'الخادم لا يقصّ من أيّ جزء');
  assert.ok(c[2].promptText.endsWith(RUN19_LINES[6]), 'آخر سطر في حواره يصل المحرّك');
  assert.deepEqual(f.joined, [], 'بلا لصق');
  assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4', 'آخر فيديو يحوي كلّ ما قبله');
  assert.equal(f.ctx.downloadEl.style.display, 'block'); assert.equal(f.partial.length, 0);
  assert.ok(f.status.includes('one 1/3 ~29') && f.status.includes('one 3/3 ~29'), f.status.join(' | '));
  assert.ok(!f.status.some((s) => /^clip /.test(s) || s.includes('دمج')), 'لا «مقاطع» ولا «دمج» في الحالة');
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  assert.equal(f.ctx.scenesDone, 3);
  assert.deepEqual(Object.keys(f.store), [], 'اكتمل = لا سلسلة محفوظة');
  /* صورة البطل للجزء الأوّل وحده */
  f = flow({ hero: 'HERO' });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.creates().map((x) => [x.imageBase64, x.extendOp, x.extendable]), [['HERO', undefined, true], [undefined, 'omni/1', undefined], [undefined, 'omni/2', undefined]]);
  /* «سريع» لا تمديد عنده: مقاطعه ولصقها كما كانت */
  f = flow();
  await f.ctx.run(plan(D3), 'minimax');
  assert.ok(f.creates().every((x) => !x.extendOp && !x.extendable)); assert.equal(f.joined[0].length, 3);
});

test('٢٢. تعذّر التمديد لا يضيّع شيئًا: رفضه أو تعذّره = لقطة مرجعيّة ولصق كما كان، وغير ذلك يسلّم ما وصل إليه الفيديو', async () => {
  const p = LONG3;
  /* المحرّك يرفض تمديد الجزء الثالث: يُعاد بآخر لقطة في الفيديو، ويُلصق بالفيديو الممدود قبله (الجزءان الأوّلان فيديو واحد لا يُكرَّر) */
  let f = flow({ reject: (b, no) => !!b.extendOp && no === 3 });
  await f.ctx.run(p, 'veo');
  let c = f.creates();
  assert.equal(c.length, 4);
  assert.deepEqual([c[2].extendOp, c[2].imageBase64], ['omni/2', undefined]);
  assert.deepEqual([c[3].extendOp, c[3].imageBase64, c[3].keepPhoto, c[3].promptText, c[3].extendable], [undefined, 'FRAME<https://cdn/omni-2.mp4>', true, CONT + '\n' + p.clips[2].text + LOOK, undefined]);
  /* v-video-full-dialogue: التمديد بمدّته (١٠ث)، والجزء نفسه مقطعًا جديدًا بثانية افتتاحه (١١ث) — فلا يقصّ الخادم آخر سطر فيه */
  assert.deepEqual([c[2].durationSeconds, c[3].durationSeconds], [10, 11]);
  assert.equal(VT.fitDialogue(c[3].promptText, c[3].durationSeconds).dropped, 0);
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-2.mp4', 'blob:https://cdn/omni-3.mp4']]);
  assert.ok(f.status.includes('retry 3/3')); assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  /* التمديد متعذّر عندنا (unavailable): الجزء الثاني بلقطة مرجعيّة، والثالث يمدّ فيديو الثاني */
  f = flow({ unavail: (b, no) => !!b.extendOp && no === 2 });
  await f.ctx.run(p, 'veo');
  c = f.creates();
  assert.deepEqual(c.map((x) => [x.extendOp, String(x.imageBase64 || '').slice(0, 5), x.extendable]), [[undefined, '', true], ['omni/1', '', undefined], [undefined, 'FRAME', true], ['omni/2', '', undefined]]);
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-3.mp4']], 'الأوّل ثمّ فيديو الثاني ممدودًا بالثالث');
  assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  /* unavailable على غير التمديد لا يُعاد: يُسلَّم ما وصل إليه الفيديو، بلا مشاهد متفرّقة */
  f = flow({ unavail: (b, no) => no === 2 });
  await f.ctx.run(p, 'veo');
  assert.equal(f.creates().length, 3, 'التمديد ثمّ اللقطة — ثمّ يقف');
  assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-1.mp4');
  assert.equal(f.status[f.status.length - 1], 'ERR:unavailable onepart 1/3');
  assert.deepEqual([f.partial.length, f.joined.length], [0, 0]);
  /* الجزء الثالث مرفوض بكلّ طريق: الفيديو بما وصل إليه (جزءان في فيديو واحد بلا لصق)، ومحفوظ ليُكمَل */
  f = flow({ reject: (b, no) => no === 3 });
  await f.ctx.run(p, 'veo');
  assert.equal(f.creates().length, 6, 'جزءان + تمديد ولقطتان وبلا صورة');
  assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-2.mp4');
  assert.deepEqual([f.partial.length, f.joined.length], [0, 0]);
  assert.equal(f.status[f.status.length - 1], 'ERR:video_rejected onepart 2/3');
  assert.equal(JSON.parse(Object.values(f.store)[0]).urls.length, 2);
  /* الجزء الأوّل مرفوض: خطأ عاديّ بمحاولة واحدة */
  f = flow({ reject: (b, no) => no === 1 });
  await assert.rejects(f.ctx.run(p, 'veo'), (e) => e.code === 'video_rejected');
  assert.equal(f.creates().length, 1);
});

test('٢٣. تأمين: لو أعاد المحرّك التكملة وحدها (مدّتها مدّة التكملة) تُلصق بما قبلها؛ والأطول منها = الفيديو كلّه كما هو', async () => {
  const p = LONG3; // ٩ث ثمّ +١٠ ثمّ +١٠
  const dur = (m) => (b) => ({ w: 1280, h: 720, d: m[(/omni-(\d)/.exec(b.of) || [])[1]] });
  let f = flow({ dims: dur({ 1: 11, 2: 9, 3: 5 }) });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-2.mp4', 'blob:https://cdn/omni-3.mp4']], 'ثلاث تكملات منفردة: تُلصق الثلاثة');
  assert.equal(f.ctx.resultEl.src, 'blob:joined');
  f = flow({ dims: dur({ 1: 11, 2: 20, 3: 5 }) });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-2.mp4', 'blob:https://cdn/omni-3.mp4']], 'الثاني كامل والثالث تكملة');
  f = flow({ dims: dur({ 1: 11, 2: 20, 3: 25 }) });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.joined, []); assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4');
  /* الحدّ: التكملة + ٢٫٥ث — وعنده تكملة، وفوقه الفيديو كلّه */
  f = flow({ dims: dur({ 1: 11, 2: 12.5, 3: 12.6 }) });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-3.mp4']]);
  /* مدّة لا تُقرأ = الفيديو كلّه (توثيق المحرّك) */
  for (const unknown of [() => null, () => ({ w: 1280, h: 720, d: 0 })]) {
    f = flow({ dims: unknown });
    await f.ctx.run(p, 'veo');
    assert.deepEqual(f.joined, []); assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4');
  }
});

test('٢٤. الاستئناف في «سينمائي»: إعادة الضغط تمدّ الفيديو المحفوظ من حيث وقف — سعر الباقي وحده، وبلا لصق؛ وسلسلة بلا معرّفات تكمل بلقطة', async () => {
  const p = LONG3;
  let store = {};
  let f = flow({ store, failAt: 3 });
  await f.ctx.run(p, 'veo');
  assert.equal(f.status[f.status.length - 1], 'ERR:points_insufficient onepart 2/3');
  assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-2.mp4', 'ما وصل إليه الفيديو — لا مشاهد متفرّقة');
  const saved = JSON.parse(Object.values(store)[0]);
  assert.deepEqual([saved.urls, saved.ops, saved.base], [['https://cdn/omni-1.mp4', 'https://cdn/omni-2.mp4'], ['omni/1', 'omni/2'], [0, 0]]);
  f = flow({ store, idBase: 2 });
  await f.ctx.run(p, 'veo');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 1, engine: 'veo', promptText: 'dialogue', token: 'tok', resume: true }]);
  let c = f.creates();
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].extendOp, c[0].promptText, c[0].imageBase64, c[0].durationSeconds], ['omni/2', p.clips[2].text, undefined, 10]);
  assert.deepEqual(f.joined, []); assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4');
  assert.ok(f.status.includes('resume 2/3')); assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  assert.deepEqual(Object.keys(store), []);
  /* سجلّ بلا معرّفات ولا base: يكمل بآخر لقطة ويلصق الثلاثة */
  store = {};
  f = flow({ store, failAt: 3 }); await f.ctx.run(p, 'veo');
  const k = Object.keys(store)[0], j = JSON.parse(store[k]); delete j.ops; delete j.base; store[k] = JSON.stringify(j);
  f = flow({ store, idBase: 2 }); await f.ctx.run(p, 'veo');
  c = f.creates();
  assert.deepEqual([c.length, c[0].extendOp, c[0].imageBase64], [1, undefined, 'FRAME<https://cdn/omni-2.mp4>']);
  assert.equal(f.joined[0].length, 3);
  /* تكملة منفردة محفوظة (base) تبقى جزءًا يُلصق بعد الاستئناف */
  store = {};
  f = flow({ store, failAt: 3, dims: (b) => ({ w: 1280, h: 720, d: /omni-2/.test(b.of) ? 9 : 30 }) }); await f.ctx.run(p, 'veo');
  assert.deepEqual(JSON.parse(Object.values(store)[0]).base, [0, 1]);
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-2.mp4']], 'المكتمل ملصوقًا عند التوقّف');
  f = flow({ store, idBase: 2 }); await f.ctx.run(p, 'veo');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-3.mp4']], 'الثالث يمدّ الثاني (فيحويه) ويُلصق بعد الأوّل');
});

async function createVeo(u, body) {
  const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
  await veo({ method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ ratio: '1280:720', token: token(u), quality: 'fast', style: 'realistic', confirmed: true }, body) }, res);
  return res;
}

test('٢٥. الخادم «سينمائي»: التوليدة حتّى ١٥ ثانية على إصدار المحرّك الذي يصنعها، والتمديد بمعرّف التفاعل وحده (٣–١٠ث، بلا صور ولا مهمّة فيديو — المحرّك يرفضهما معًا)، وما لا يُمدّ يُرفض بلا خصم', async () => {
  omniCalls = [];
  const realLog = console.log; const logs = []; console.log = (m) => logs.push(String(m));
  try {
    let r = await createVeo('omran', { promptText: D23, durationSeconds: 15 });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    let q = omniCalls[0];
    assert.equal(q.model, 'gemini-omni-1.2-flash');
    assert.deepEqual(q.response_format, { type: 'video', resolution: '720p', aspect_ratio: '16:9', delivery: 'uri', duration: '15s' });
    assert.ok(!('previous_interaction_id' in q) && !('generation_config' in q)); assert.equal(q.store, true);
    assert.deepEqual(q.input.map((x) => x.type), ['text']);
    for (const l of D23.split('\n')) assert.ok(q.input[0].text.includes(l), 'لا يُقصّ: ' + l);
    assert.match(q.input[0].text, /in this 15-second clip/);
    const op1 = r.body.op;
    assert.deepEqual(JSON.parse(kv.get(veo.omniOpKey(op1))), { uri: 'https://g/files/v1', iid: 'v1_1' }, 'معرّف التفاعل محفوظ — به يُمدّ');
    assert.ok(logs.some((m) => /cinematic ready on omni \(long 15s\) in /.test(m)), logs.join(' | '));
    /* ١٠ ثوانٍ وأقلّ على إصداره كما كان؛ وما سيُمدّ على إصدار التمديد ولو قصر */
    r = await createVeo('omran', { promptText: D21, durationSeconds: 8 });
    assert.deepEqual([omniCalls[1].model, omniCalls[1].response_format.duration], ['gemini-omni-1.1-flash', '8s']);
    r = await createVeo('omran', { promptText: LONG3.clips[0].text, durationSeconds: 9, extendable: true });
    assert.deepEqual([omniCalls[2].model, omniCalls[2].response_format.duration], ['gemini-omni-1.2-flash', '9s']);
    r = await createVeo('omran', { promptText: 'صقر يحلّق فوق الكثبان', durationSeconds: 20 });
    assert.deepEqual([omniCalls[3].model, omniCalls[3].response_format.duration], ['gemini-omni-1.1-flash', '8s'], 'فوق ١٥ ليست مدّة');
    /* التمديد: معرّف تفاعل السابق وحده — بلا مهمّة فيديو (v-video-full-dialogue: المحرّك ردّ ٤٠٠ «previous_interaction_id is not allowed
       when video task is set» في تشغيلة المالك، والمحاكاة أعلاه تردّه مثله)، بلا صور ولا نسبة ولا الدقّة الافتراضيّة، وأمره سطر مستقلّ
       لا يُعدّ كلامًا. الجزء: السؤال وجوابه (١٦ كلمة في ١٠ث) — ميزانيّة التمديد تتّسع له فلا يُقصّ سطره الأخير */
    const part = LONG3.clips[1];
    assert.deepEqual([part.words, part.sec], [16, 10]);
    const seen = logs.length;
    r = await createVeo('omran', { promptText: part.text, durationSeconds: part.sec, extendOp: op1, imageBase64: 'RlJBTUU=', imageMime: 'image/jpeg', keepPhoto: true });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    q = omniCalls[4];
    assert.deepEqual([q.model, q.previous_interaction_id, 'generation_config' in q], ['gemini-omni-1.2-flash', 'v1_1', false]);
    assert.deepEqual(q.response_format, { type: 'video', delivery: 'uri', duration: '10s' });
    assert.deepEqual([q.store, q.background, q.stream], [true, false, false]);
    assert.deepEqual(q.input.map((x) => x.type), ['text'], 'بلا صور');
    const lead = q.input[0].text.split('\n')[0];
    assert.match(lead, /^Extend this video — /);
    assert.ok(!/[:：«»"“”]/.test(lead) && VT.dialogueTurns(lead).length === 0, 'سطر مستقلّ لا يُعدّ كلامًا');
    for (const l of part.text.split('\n')) assert.ok(q.input[0].text.includes(l), 'لا يُقصّ: ' + l);
    assert.match(q.input[0].text, /in this 10-second clip/);
    assert.match(q.input[0].text, /\(about 16 words at most\)/, 'قاعدة الإيقاع بميزانيّة التمديد لا تطلب «جملًا أقلّ»');
    assert.ok(!logs.slice(seen).some((m) => /dialogue fitted to the clip/.test(m)), 'لم يُقصّ شيء: ' + logs.slice(seen).join(' | '));
    assert.equal(JSON.parse(kv.get(veo.omniOpKey(r.body.op))).iid, 'v1_5', 'الممدود يُمدّ بعده');
    assert.ok(logs.some((m) => /cinematic ready on omni \(extension \+10s\) in /.test(m)));
    /* الجودة العالية وحدها تُرسل دقّتها مع التمديد (الافتراضيّة تُورَّث) */
    r = await createVeo('omran', { promptText: part.text, durationSeconds: part.sec, extendOp: op1, quality: 'high' });
    assert.deepEqual(omniCalls[5].response_format, { type: 'video', resolution: '1080p', delivery: 'uri', duration: '10s' });
    /* الجزء نفسه مقطعًا جديدًا (رُفض تمديده): بمدّته مقطعًا (١١ث) لا يُقصّ، وبمدّة التمديد كان يُقصّ آخر سطر فيه */
    r = await createVeo('omran', { promptText: part.text, durationSeconds: part.fresh });
    assert.deepEqual([omniCalls[6].model, omniCalls[6].response_format.duration], ['gemini-omni-1.2-flash', '11s']);
    for (const l of part.text.split('\n')) assert.ok(omniCalls[6].input[0].text.includes(l), 'لا يُقصّ: ' + l);
    assert.ok(!logs.slice(seen).some((m) => /dialogue fitted to the clip/.test(m)));
    r = await createVeo('omran', { promptText: part.text, durationSeconds: part.sec });
    assert.ok(!omniCalls[7].input[0].text.includes(RUN19_LINES[3]) && logs.slice(seen).some((m) => /dialogue fitted to the clip: 1\/2 lines/.test(m)), 'شبكة الأمان كما كانت للمقطع الجديد');
    omniCalls.splice(5, 3);
    r = await createVeo('omran', { promptText: part.text, durationSeconds: 15, extendOp: op1 });
    assert.equal(omniCalls[5].response_format.duration, '8s', 'التمديد ٣–١٠ ثوانٍ');
    /* ما لا يُمدّ: رقم مجهول، أو سجلّ بلا معرّف (أنتجه الاحتياط أو قبل هذا الإصدار) — رفض بلا مزوّد ولا خصم ولا قفل */
    account('cust2', 'free', 1000); lockLog.length = 0;
    kv.set(veo.omniOpKey('omni/old'), JSON.stringify({ uri: 'https://g/files/old' }));
    const before = omniCalls.length;
    for (const op of ['omni/none', 'omni/old']) {
      r = await createVeo('cust2', { promptText: part.text, durationSeconds: 9, extendOp: op });
      assert.deepEqual([r.code, r.body.error, r.body.retryable], [409, 'video_rejected', false], op);
    }
    assert.equal(omniCalls.length, before); assert.equal(kv.get('points:cust2'), '1000'); assert.deepEqual(lockLog, []);
    /* العميل الدافع: التمديد خطوة بسعر الفيديو المفرد، بخصمها وقفلها */
    r = await createVeo('cust2', { promptText: part.text, durationSeconds: 9, extendOp: op1 });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(kv.get('points:cust2'), String(1000 - COSTS.veo_video)); assert.deepEqual(lockLog, ['lock:cust2']);
    assert.equal(omniCalls[omniCalls.length - 1].previous_interaction_id, 'v1_1');
    /* رفض المحرّك للتمديد: يُردّ الخصم ويُفكّ القفل والردّ video_rejected (العميل يكمل بلقطة) */
    account('cust3', 'free', 1000); lockLog.length = 0; omniBlocked = true;
    const realErr = console.error; const errs = []; console.error = (m) => errs.push(String(m));
    try { r = await createVeo('cust3', { promptText: part.text, durationSeconds: 9, extendOp: op1 }); } finally { omniBlocked = false; console.error = realErr; }
    assert.deepEqual([r.code, r.body.error], [400, 'video_rejected']);
    assert.equal(kv.get('points:cust3'), '1000'); assert.deepEqual(lockLog, ['lock:cust3', 'release:cust3']);
    assert.ok(errs.some((m) => /omni upstream 400 \(image=extension, long 9s\): Input blocked/.test(m)), errs.join(' | '));
    /* المحاكاة تحمل قاعدة المحرّك: نداء بمعرّف سابق ومهمّة فيديو معًا = ٤٠٠ — فلو عادت المهمّة إلى طلب التمديد احمرّ ما فوق */
    const probe = await fetch('https://g/v1beta/interactions', { method: 'POST', body: JSON.stringify({ previous_interaction_id: 'v1_1', generation_config: { video_config: { task: 'extend' } } }) });
    assert.deepEqual([probe.status, (await probe.json()).error.message], [400, 'previous_interaction_id is not allowed when video task is set.']);
    omniCalls.pop();
    assert.deepEqual([veo.OMNI_ONE_MAX, veo.OMNI_EXTEND_MAX], [15, 10]);
    /* الاحتياط لا يمدّ فيديو: رصيد المزوّد «نافد» والاحتياط مفعّل — التمديد لا يذهب إليه، والتوليدة العاديّة تذهب كما كانت */
    process.env.FAL_KEY = 'fal-test';
    try {
      await require(rp('api/_lib/fal-fallback.js')).markGeminiOut();
      seenUrls.length = 0;
      r = await createVeo('omran', { promptText: part.text, durationSeconds: 9, extendOp: op1 });
      assert.ok(seenUrls.length > 0 && seenUrls.every((u) => /\/interactions$/.test(u)), 'التمديد عند المحرّك نفسه: ' + seenUrls.join(' '));
      seenUrls.length = 0;
      r = await createVeo('omran', { promptText: D21, durationSeconds: 8 });
      assert.ok(seenUrls.some((u) => !/\/interactions$/.test(u)), 'التوليدة العاديّة تجرّب الاحتياط أوّلًا كما كانت');
    } finally { delete process.env.FAL_KEY; }
  } finally { omniCalls = null; console.log = realLog; }
});

test('٢٦. الخادم «سريع»: حساب المالك حتّى ١٥ ثانية للتوليدة (حواره كلّه بلا قصّ)، وغيره ١٠ كما كان — السعر الثابت باب مال لا يُفتح', async () => {
  const mm = require(rp('api/_lib/minimax-create.js'));
  const run = async (u, body) => {
    const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } };
    await mm({ method: 'POST', query: { action: 'minimax-create' }, body: Object.assign({ ratio: '1280:720', token: token(u), quality: 'fast', style: 'realistic', confirmed: true }, body) }, res);
    return res;
  };
  const savedKey = process.env.MINIMAX_API_KEY; process.env.MINIMAX_API_KEY = 'mm-test';
  mmCalls = [];
  const realLog = console.log; console.log = () => {};
  try {
    let r = await run('omran', { promptText: D23, durationSeconds: 15 });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(mmCalls[0].duration, 15);
    for (const l of D23.split('\n')) assert.ok(mmCalls[0].content[0].text.includes(l), 'لا يُقصّ: ' + l);
    r = await run('omran', { promptText: D21, durationSeconds: 30 });
    assert.equal(mmCalls[1].duration, 15, 'أقصى توليدة عند المحرّك');
    account('cust4', 'free', 1000);
    r = await run('cust4', { promptText: D23, durationSeconds: 15 });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(mmCalls[2].duration, 10, 'غير المالك: ١٠ كما كان');
    assert.equal(kv.get('points:cust4'), String(1000 - COSTS.minimax_video), 'والسعر كما كان');
    r = await run('cust4', { promptText: D21, durationSeconds: 8, confirmed: true });
    assert.ok(r.code === 429 || mmCalls[mmCalls.length - 1].duration === 8, 'المدّة المختارة كما هي');
  } finally { mmCalls = null; console.log = realLog; if (savedKey === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = savedKey; }
});

test('٢٧. نصّا «فيديو واحد متّصل» بالـ١٤ لغة بعناصرهما وبلا «مقاطع»، ووسم اللغات مرفوع، والربط والحزمة', () => {
  const ctx = { console, localStorage: { getItem: () => null }, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, $: () => null };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const add = src.slice(src.indexOf('/* v-video-one-shot (803)')).split('\n').slice(1, 3).join('\n');
  assert.match(add, /^Object\.assign\(I18N\.ar, \{"vmkDialogOne":/);
  vm.runInContext(add, ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  const NEED = { vmkDialogOne: ['{s}', '{i}', '{n}'], vmkDialogOnePart: ['{k}', '{n}'] };
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const d = ctx.I18N[L] || {};
    for (const [key, ph] of Object.entries(NEED)) {
      assert.ok(d[key] && ph.every((x) => d[key].includes(x)) && !d[key].includes('\n'), L + ' ' + key);
      if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(d[key]), L + ' ' + key + ': عربيّة');
    }
  }
  assert.ok(!/مقطع|مقاطع/.test(ctx.I18N.ar.vmkDialogOne + ctx.I18N.ar.vmkDialogOnePart) && !/clip/i.test(ctx.I18N.en.vmkDialogOne + ctx.I18N.en.vmkDialogOnePart), 'فيديو واحد لا مقاطع');
  for (const [lang, en] of [['ar', 0], ['en', 1]]) {
    const c = { vmkT: (k, ar, e) => (en ? e : ar) };
    vm.runInNewContext(['function dialogNoteText(key, ar, en, vals){', 'function dialogOneText(i, n, secs){', 'function dialogOnePartText(k, n){'].map((n) => block(CLIENT, n)).join('\n') + '\nthis.o = dialogOneText; this.p = dialogOnePartText;', c);
    const D = ctx.I18N[lang];
    assert.equal(c.o(2, 3, 25), D.vmkDialogOne.replace('{s}', '25').replace('{i}', '2').replace('{n}', '3'), lang);
    assert.equal(c.p(2, 3), D.vmkDialogOnePart.replace('{k}', '2').replace('{n}', '3'), lang);
  }
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 803 && st.includes('v-video-one-shot (803)'), 'وسم اللغات مرفوع وسببه في التعليق');
  /* الربط: «سريع» بحدّ حساب المالك، و«سينمائي» بخطّة الفيديو الواحد، والمدّة المفردة على قدّ الكلام حتّى ١٥ */
  assert.ok(CLIENT.includes('const dlg = planDialogue(text, 0, isOwnerAccount() ? [15] : [10]);'));
  assert.ok(CLIENT.includes("const dlg = creationMode === 'veo' ? planDialogueOne(veoPrompt) : { clips: [], need: 0 };"));
  const run = block(CLIENT, 'async function runDialogueClips(plan, mode){');
  assert.ok(run.indexOf('refs.push({ ext: ops[i - 1] })') > 0 && run.indexOf('refs.push({ ext: ops[i - 1] })') < run.indexOf('refs.push({ img: last, cont: true })'), 'التمديد قبل أيّ لقطة مرجعيّة');
  assert.match(block(CLIENT, 'function clipDims(blob, ms){'), /d: isFinite\(v\.duration\) \? v\.duration : 0/);
  const B = read('js/app.bundle.js');
  assert.ok(B.includes('function planDialogueOne(desc) {') && B.includes('payload.extendOp = r.ext') && B.includes('function dialogOneText(i, n, secs){'), 'الحزمة مبنيّة');
  const srv = read('api/_lib/minimax-create.js');
  assert.ok(srv.includes('const durMax = (durSec > 10 && (await checkOwnerBypass(token)).allowed) ? 15 : 10;'));
});

/* ── v-video-real-person (المالك ١٩ نوفمبر بعد #1352: «شوف التوقيت يعني ماعطاني الكلام الي كتبته بالضبط» — فيديو ٩ ثوانٍ ورسالة «غيّر الوصف
   أو الصورة»). سجلّ الإنتاج: طلب التمديد قُبلت صيغته، والمحرّك رفض الجزء الثاني بكلّ طريق (تمديد، لقطتان، بلا صورة) «Input blocked… real
   people's names or likenesses» — في كلامه «الشيخ زايد بن سلطان آل نهيان». قاعدة المحرّك لا تُلتفّ؛ الذي عندنا: يُقال السبب والكلام المرفوض،
   وبعد تعديل السطر يُكمَل الفيديو من الجزء المكتمل بلا توليد ولا خصم ثانٍ له. ── */
const REAL_NAME = 'الشيخ زايد بن سلطان آل نهيان';
const RUN19_FIXED = RUN19.replace(REAL_NAME + '،', 'الوالد المؤسّس،');
const REAL_MSG = "Input blocked: Sorry, we can't create videos with real people's names or likenesses. Please remove the reference and try again. If you think this was an error, [send feedback](https://aistudio.google.com/docs/troubleshooting).";

test('٢٨. الخادم: رفض المحرّك لاسم شخص حقيقيّ يُعلَّم بسببه (reason) ونصّه، بلا خصم؛ وأيّ رفض آخر كما كان', async () => {
  const { startFail, BAD } = require(rp('api/_lib/_videoFail.js'));
  const real = startFail(400, REAL_MSG);
  assert.deepEqual([real.code, real.body.error, real.body.reason, real.body.retryable], [400, 'video_rejected', 'real_person', false]);
  assert.ok(/أسماء الأشخاص الحقيقيّين/.test(real.body.message_ar) && real.body.message_ar !== BAD);
  assert.ok(!/gemini|omni|google|veo|minimax/i.test(real.body.message_ar), 'بلا اسم مزوّد');
  for (const other of ['Your prompt was flagged by our content moderation system.', 'previous_interaction_id is not allowed when video task is set.', 'Invalid argument: duration']) {
    assert.deepEqual(startFail(400, other).body, { error: 'video_rejected', message_ar: BAD, retryable: false }, other);
  }
  assert.equal(startFail(429, REAL_MSG).body.error, 'video_busy', 'الزحام أوّلًا كما كان');
  assert.equal(startFail(402, REAL_MSG).body.error, 'unavailable', 'وعطبنا أوّلًا كما كان');
  /* عبر «سينمائي»: الردّ يحمل السبب، والنقاط تُردّ والقفل يُفكّ */
  account('cust5', 'free', 1000); lockLog.length = 0; omniBlocked = true;
  const realErr = console.error; console.error = () => {};
  let r;
  try { r = await createVeo('cust5', { promptText: LONG3.clips[1].text, durationSeconds: 10 }); } finally { omniBlocked = false; console.error = realErr; }
  assert.deepEqual([r.code, r.body.error, r.body.reason], [400, 'video_rejected', 'real_person']);
  assert.equal(kv.get('points:cust5'), '1000'); assert.deepEqual(lockLog, ['lock:cust5', 'release:cust5']);
});

test('٢٩. تشغيلة المالك: المحرّك يرفض الجزء الذي فيه الاسم بكلّ طريق — الفيديو بما وصل إليه، والسبب نفسه والكلام المرفوض كما كتبه (لا «غيّر الوصف أو الصورة»)', async () => {
  const p = LONG3;
  assert.equal(p.clips[1].say, RUN19_LINES.slice(2, 4).join('\n'), 'كلام الجزء وحده بلا وصف المشهد');
  const store = {};
  const f = flow({ store, realName: REAL_NAME });
  await f.ctx.run(p, 'veo');
  const c = f.creates();
  assert.deepEqual(c.map((x) => [x.extendOp || '', String(x.imageBase64 || '').slice(0, 5), x.durationSeconds]), [['', '', 9], ['omni/1', '', 10], ['', 'FRAME', 11], ['', 'FIRST', 11], ['', '', 11]], 'الأوّل، ثمّ التمديد واللقطتان وبلا صورة — كلّها مرفوضة');
  assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-1.mp4');
  assert.equal(f.status[f.status.length - 1], 'ERR:video_rejected/real_person refused<' + RUN19_LINES[2] + ' / ' + RUN19_LINES[3] + '> onepart 1/3');
  assert.deepEqual([f.partial.length, f.joined.length], [0, 0]);
  /* رفض بلا هذا السبب: الحالة كما كانت بلا «الكلام المرفوض» */
  const g = flow({ reject: (b, no) => no === 2 });
  await g.ctx.run(p, 'veo');
  assert.equal(g.status[g.status.length - 1], 'ERR:video_rejected onepart 1/3');
  /* نصّ السبب في رسالة الخطأ الحقيقيّة: قبل النصّ العامّ، وبلغة الواجهة، وللفيديو المفرد أيضًا (reason يُحمل من ردّ الإنشاء) */
  for (const [lang, word] of [['ar', 'أسماء الأشخاص الحقيقيّين'], ['en', "real people's names"]]) {
    const ctx = { window: { t: (k) => 'T:' + k }, vmkT: (k, ar, en) => (lang === 'ar' ? ar : en), bT: (a) => a, scenesDone: 0 };
    vm.runInNewContext(block(CLIENT, 'function friendlyError(err){') + '\nthis.fe = friendlyError;', ctx);
    assert.ok(ctx.fe({ code: 'video_rejected', reason: 'real_person' }).startsWith('⚠️ ') && ctx.fe({ code: 'video_rejected', reason: 'real_person' }).includes(word), lang);
    assert.equal(ctx.fe({ code: 'video_rejected' }), '⚠️ T:vidRejected');
    assert.equal(ctx.fe({ code: 'video_busy', reason: 'real_person' }), '⚠️ T:vidBusy');
  }
  assert.equal(CLIENT.split('reason: crData.reason').length - 1, 2, 'الفيديو المفرد («سينمائي» و«سريع») يحمل السبب');
  assert.ok(CLIENT.includes("{ code: c0.error, reason: c0.reason, retryAfter: c0.retryAfter || 0 }"), 'وأجزاء الحوار');
  /* سطر «الكلام المرفوض»: في سطر واحد وبحدّ */
  const d = { vmkT: (k, ar) => ar };
  vm.runInNewContext(['function dialogNoteText(key, ar, en, vals){', 'function dialogRefusedText(say){'].map((n) => block(CLIENT, n)).join('\n') + '\nthis.r = dialogRefusedText;', d);
  assert.equal(d.r(p.clips[1].say), 'الكلام المرفوض: «' + RUN19_LINES[2] + ' / ' + RUN19_LINES[3] + '»');
  assert.ok(d.r('كلمة '.repeat(200)).length < 260 && d.r('كلمة '.repeat(200)).endsWith('…»'));
});

test('٣٠. بعد تعديل السطر المرفوض: الجزء المكتمل لا يُولَّد ولا يُدفع ثانيةً — سعر الباقي وحده، والمحرّك يمدّ الفيديو نفسه إلى آخر الحوار', async () => {
  const p = LONG3, q = planOne(RUN19_FIXED);
  assert.deepEqual([q.dropped, q.clips.length, q.clips[0].text === p.clips[0].text, q.clips[1].text === p.clips[1].text], [0, 3, true, false], 'الجزء الأوّل لم يتغيّر، والثاني تغيّر كلامه');
  const store = {};
  let f = flow({ store, realName: REAL_NAME });
  await f.ctx.run(p, 'veo');
  const saved = JSON.parse(Object.values(store)[0]);
  assert.deepEqual([saved.urls, saved.ops, saved.base, saved.keys.length, typeof saved.ctx], [['https://cdn/omni-1.mp4'], ['omni/1'], [0], 1, 'string']);
  f = flow({ store, idBase: 1, realName: REAL_NAME });
  await f.ctx.run(q, 'veo');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 2, engine: 'veo', promptText: 'dialogue', token: 'tok', resume: true }], 'سعر الجزأين الباقيين وحدهما');
  let c = f.creates();
  assert.deepEqual(c.map((x) => [x.extendOp, x.promptText, x.durationSeconds]), [['omni/1', q.clips[1].text, q.clips[1].sec], ['omni/2', q.clips[2].text, q.clips[2].sec]], 'تمديد الفيديو المحفوظ — بلا توليد الجزء الأوّل');
  assert.ok(f.status.includes('resume 1/3')); assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  assert.deepEqual(f.joined, [], 'فيديو واحد بلا لصق'); assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4');
  assert.deepEqual(Object.keys(store), []);
  /* حدود الاستعارة: إعدادات أخرى (الوضع، النسبة، الأسلوب، الجودة، صورة البطل) = من أوّله */
  const stuck = async () => { const s = {}; const x = flow({ store: s, realName: REAL_NAME }); await x.ctx.run(p, 'veo'); return s; };
  for (const [name, o, mode] of [['الوضع', {}, 'minimax'], ['صورة البطل', { hero: 'HERO' }, 'veo']]) {
    f = flow(Object.assign({ store: await stuck(), idBase: 1 }, o));
    await f.ctx.run(mode === 'veo' ? q : plan(RUN19_FIXED, 0, [15]), mode);
    assert.deepEqual([f.net[0][2].resume, f.creates()[0].extendOp], [undefined, undefined], name);
  }
  for (const [name, key, val] of [['النسبة', 'ratio', '720:1280'], ['الأسلوب', 'style', 'anime'], ['الجودة', 'wantQuality', true]]) {
    f = flow({ store: await stuck(), idBase: 1 }); f.ctx[key] = val;
    await f.ctx.run(q, 'veo');
    assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume], [3, undefined], name);
  }
  /* الجزء الأوّل نفسه تغيّر كلامه = من أوّله؛ وسجلّ قديم بلا keys لا يُستعار منه ببصمة أخرى (كما كان)؛ وبعد ٢٠ ساعة يسقط */
  f = flow({ store: await stuck(), idBase: 1 });
  await f.ctx.run(planOne(RUN19_FIXED.replace('أمي، لماذا', 'ماما، لماذا')), 'veo');
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, f.creates().length], [3, undefined, 3]);
  for (const edit of [(j) => { delete j.keys; }, (j) => { delete j.ctx; }, (j) => { j.at = Date.now() - 21 * 3600 * 1000; }, (j) => { j.keys = ['x']; }]) {
    const s = await stuck(); const k = Object.keys(s)[0], j = JSON.parse(s[k]); edit(j); s[k] = JSON.stringify(j);
    f = flow({ store: s, idBase: 1 });
    await f.ctx.run(q, 'veo');
    assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume], [3, undefined], edit.toString());
  }
  /* جزءان مكتملان والتعديل في الثالث: يُستعار الاثنان (الثاني يحوي الأوّل) ويُمدّ الثاني */
  const s2 = {};
  f = flow({ store: s2, failAt: 3 }); await f.ctx.run(p, 'veo');
  assert.equal(JSON.parse(Object.values(s2)[0]).keys.length, 2);
  const q3 = planOne(RUN19.replace('عز وفخر!', 'عز ومجد!'));
  assert.deepEqual([q3.clips[0].text === p.clips[0].text, q3.clips[1].text === p.clips[1].text, q3.clips[2].text === p.clips[2].text], [true, true, false]);
  f = flow({ store: s2, idBase: 2 }); await f.ctx.run(q3, 'veo');
  c = f.creates();
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, c.length, c[0].extendOp, c[0].promptText], [1, true, 1, 'omni/2', q3.clips[2].text]);
  assert.deepEqual(f.joined, []); assert.equal(f.ctx.resultEl.src, 'blob:https://cdn/omni-3.mp4');
  /* جزءان مكتملان والتعديل في الثاني: يُستعار الأوّل وحده (لا الثاني بكلامه القديم)، ويُمدّ الأوّل */
  const s4 = {};
  f = flow({ store: s4, failAt: 3 }); await f.ctx.run(p, 'veo');
  const q2 = planOne(RUN19.replace('ومن الذي أسس', 'ومن الذي وحّد'));
  assert.deepEqual([q2.clips[0].text === p.clips[0].text, q2.clips[1].text === p.clips[1].text], [true, false]);
  f = flow({ store: s4, idBase: 2 }); await f.ctx.run(q2, 'veo');
  c = f.creates();
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, c.length, c[0].extendOp, c[0].promptText, c[1].extendOp], [2, true, 2, 'omni/1', q2.clips[1].text, 'omni/3']);
  assert.ok(f.status.includes('resume 1/3'));
  /* تكملة منفردة (التأمين) تُحفظ ببصمات أجزائها كذلك — فتُستعار بعد التعديل */
  const s5 = {};
  f = flow({ store: s5, failAt: 3, dims: (b) => ({ w: 1280, h: 720, d: /omni-2/.test(b.of) ? 9 : 30 }) }); await f.ctx.run(p, 'veo');
  const j5 = JSON.parse(Object.values(s5)[0]);
  assert.deepEqual([j5.base, j5.keys.length, typeof j5.ctx], [[0, 1], 2, 'string']);
  f = flow({ store: s5, idBase: 2 }); await f.ctx.run(q3, 'veo');
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, f.creates()[0].extendOp], [1, true, 'omni/2']);
  /* البصمة الكاملة كما كانت: الحوار نفسه يُستأنف من سجلّ قديم بلا keys */
  const s3 = {};
  f = flow({ store: s3, failAt: 3 }); await f.ctx.run(p, 'veo');
  const k3 = Object.keys(s3)[0], j3 = JSON.parse(s3[k3]); delete j3.keys; delete j3.ctx; s3[k3] = JSON.stringify(j3);
  f = flow({ store: s3, idBase: 2 }); await f.ctx.run(p, 'veo');
  assert.deepEqual([f.net[0][2].clips, f.net[0][2].resume, f.creates()[0].extendOp], [1, true, 'omni/2']);
});

test('٣١. نصّا «المحرّك لا يقبل أسماء الأشخاص الحقيقيّين» و«الكلام المرفوض» بالـ١٤ لغة بعناصرهما وبلا اسم مزوّد، ووسم اللغات مرفوع، والحزمة مبنيّة', () => {
  const ctx = { console, localStorage: { getItem: () => null }, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, $: () => null };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const add = src.slice(src.indexOf('/* v-video-real-person (805)')).split('\n').slice(1, 3).join('\n');
  assert.match(add, /^Object\.assign\(I18N\.ar, \{"vidRealPerson":/);
  vm.runInContext(add, ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const d = ctx.I18N[L] || {};
    assert.ok(d.vidRealPerson && d.vidRealPerson.length > 30 && !d.vidRealPerson.includes('{') && !d.vidRealPerson.includes('\n'), L + ' vidRealPerson');
    assert.ok(d.vmkDialogRefused && d.vmkDialogRefused.split('{lines}').length === 2 && !d.vmkDialogRefused.includes('\n'), L + ' vmkDialogRefused');
    for (const key of ['vidRealPerson', 'vmkDialogRefused']) {
      if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(d[key]), L + ' ' + key + ': عربيّة');
      assert.ok(!/gemini|omni\b|google|veo\b|minimax|hailuo|fal\b/i.test(d[key]), L + ' ' + key + ': اسم مزوّد');
    }
  }
  assert.equal(ctx.I18N.ar.vidRealPerson, require(rp('api/_lib/_videoFail.js')).startFail(400, REAL_MSG).body.message_ar, 'نصّ الخادم العربيّ هو نصّ الواجهة');
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 805 && st.includes('v-video-real-person (805)'), 'وسم اللغات مرفوع وسببه في التعليق');
  const B = read('js/app.bundle.js');
  assert.ok(B.includes('function dialogRefusedText(say){') && B.includes('function dlgChainSave(sig, urls, ops, base, more){') && B.includes("err.reason === 'real_person'") && B.includes('"vidRealPerson"'), 'الحزمة مبنيّة');
});
