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
global.fetch = async (url) => {
  upstream++;
  if (omniBlocked && /\/interactions$/.test(String(url))) return new Response(JSON.stringify({ error: { code: 400, message: BLOCKED } }), { status: 400 });
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
const PLAN_SRC = 'const DIALOGUE_CLIPS_MAX = 4;\n' + block(CLIENT, 'function dialogueTurns(desc) {') + '\n' + block(CLIENT, 'function planDialogue(desc, maxClips) {');
const P = {}; vm.runInNewContext(PLAN_SRC + '\nthis.plan = planDialogue;', P);
const plan = (d, n) => JSON.parse(JSON.stringify(P.plan(d, n)));
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
  let made = 0, okd = 0;
  const ctx = {
    window: { postWithConfirm: async (url, payload) => { net.push(['price', url, payload]); return o.price ? o.price() : { ok: true, status: 200, json: async () => ({ ok: true, priceOk: true }) }; } },
    fetch: async (url, init) => {
      const u = String(url);
      if (/-create$/.test(u)) {
        const body = JSON.parse(init.body); made++;
        net.push(['create', u, body]);
        if (o.failAt === made) return { ok: false, status: 402, json: async () => ({ error: 'points_insufficient' }) };
        /* v-video-dialogue-reject: رفض المحرّك للطلب نفسه — ٤٠٠ video_rejected كما يردّه الخادم (_videoFail) */
        if (o.reject && o.reject(body, okd + 1)) return { ok: false, status: 400, json: async () => ({ error: 'video_rejected', message_ar: 'تعذّر بدء الفيديو بهذا الطلب', retryable: false }) };
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
    proxyBlob: async (u) => { if (o.noBlob) throw new Error('proxy'); return { of: u }; },
    clipFrameB64: async (b, where) => (o.noFrame ? null : (where === 'first' ? 'FIRST<' : 'FRAME<') + b.of + '>'),
    dialogRetryText: (i, n) => 'retry ' + i + '/' + n, dialogNoRefText: (i) => 'noref ' + i, dialogPartText: (k, n) => 'part ' + k + '/' + n,
    concatScenes: async (list) => { if (o.noJoin) throw new Error('join'); joined.push(list.slice()); return { type: 'video/mp4' }; },
    showPartialScenes: (urls, n, why) => partial.push([urls.slice(), n, why]),
    friendlyError: (e) => 'ERR:' + (e.code || e.message),
    wantCanvasWrap: () => false, wrapWithCanvas: async () => {},
    dialogCapOk: () => o.cap !== false, dialogClipsText: (i, n, s) => 'clip ' + i + '/' + n + ' ~' + s,
    dlName: (b) => b + '.mp4', URL: { createObjectURL: (b) => 'blob:' + (b.of || 'joined') },
    resultEl: { style: {} }, downloadEl: { style: {} }, narrationText: { value: '' },
    ratio: '1280:720', token: 'tok', wantQuality: false, style: 'realistic', filmHeroBase64: o.hero || null, filmHeroMime: 'image/png',
    scenesDone: 0, text: DIALOGUE, signature: '', wantNarration: false, __swallow: () => {},
  };
  vm.runInNewContext(block(CLIENT, 'async function engineClip(mode, payload, onTick){') + '\n' + block(CLIENT, 'async function runDialogueClips(plan, mode){') + '\nthis.run = runDialogueClips;', ctx);
  /* كائنات الـvm من نطاق آخر: تُطبَّع بـJSON للمقارنة */
  const plain = (x) => JSON.parse(JSON.stringify(x));
  return { ctx, status, get net() { return plain(net); }, get partial() { return plain(partial); }, get joined() { return plain(joined); },
    creates: () => plain(net.filter((x) => x[0] === 'create').map((x) => x[2])) };
}
const CONT = 'Continue the same scene from the attached first frame — the same people, voices, clothes and place; the conversation simply carries on.';

test('٥. التسلسل: السعر مرّة بالمجموع قبل الأوّل، ثمّ كلّ مقطع بجمله ومدّته، والتالي من آخر لقطة في سابقه بأمر «أكمل»، ثمّ اللصق والعرض', async () => {
  const p = plan(DIALOGUE);
  let f = flow();
  await f.ctx.run(p, 'minimax');
  assert.deepEqual(f.net[0], ['price', '/api/video?action=veo-price', { clips: 2, engine: 'minimax', promptText: 'dialogue', token: 'tok' }]);
  const c = f.creates();
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { promptText: p.clips[0].text, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 9, confirmed: true });
  assert.deepEqual(c[1], { promptText: CONT + '\n' + p.clips[1].text, ratio: '1280:720', token: 'tok', quality: 'fast', style: 'realistic', durationSeconds: 9, confirmed: true,
    imageBase64: 'FRAME<https://cdn/T1.mp4>', imageMime: 'image/jpeg', keepPhoto: true });
  assert.ok(f.net.filter((x) => x[0] === 'create').every((x) => x[1] === '/api/video?action=minimax-create'));
  /* ما يُرسَل فعلًا لا يقصّ منه الخادم شيئًا: سطر «أكمل» ليس دورًا ولا يلتصق بكلام (كان ملتصقًا بآخر جملة فتُحذف) */
  for (const x of c) {
    assert.equal(VT.fitDialogue(x.promptText, x.durationSeconds).dropped, 0);
    assert.deepEqual(VT.dialogueTurns(x.promptText).map((t) => t.said), VT.dialogueTurns(x.promptText.replace(CONT + '\n', '')).map((t) => t.said));
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
  assert.deepEqual([f.creates()[1].imageBase64, f.creates()[1].keepPhoto], ['FRAME<https://cdn/omni-1.mp4>', true]);
  /* تعذّرت اللقطة: المقطع التالي يكمل بالوصف وحده (بلا صورة ولا «أكمل من اللقطة») */
  f = flow({ noFrame: true });
  await f.ctx.run(p, 'minimax');
  assert.deepEqual([f.creates()[1].promptText, f.creates()[1].imageBase64], [p.clips[1].text, undefined]);
  /* ومع صورة بطل: المقطع الذي تعذّرت لقطته يبدأ من صورة البطل (الوجه نفسه) لا بلا صورة */
  f = flow({ noFrame: true, hero: 'HERO' });
  await f.ctx.run(p, 'veo');
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
  assert.deepEqual(f.partial, [[['https://cdn/T1.mp4', 'https://cdn/T2.mp4'], 2, '⚠️']], 'تعذّر اللصق: المقاطع بروابطها');
});

test('٧. الربط: «سريع» و«سينمائي» يبنيان الخطّة قبل أيّ نداء، والمقطع الواحد مدّته لا تقلّ عن حاجة كلامه، والممثّل بلا خطّة، والحزمة مبنيّة', () => {
  const mmPlan = CLIENT.indexOf("const dlg = planDialogue(text);\n        if(dlg.clips.length > 1){ await runDialogueClips(dlg, 'minimax'); return; }");
  assert.ok(mmPlan > 0 && mmPlan < CLIENT.indexOf("window.postWithConfirm('/api/video?action=minimax-create', payload)"));
  assert.ok(CLIENT.includes("style, durationSeconds: Math.max(durSecs, dlg.need) || undefined };"));
  const veoPlan = CLIENT.indexOf("const dlg = creationMode === 'veo' ? planDialogue(veoPrompt) : { clips: [], need: 0 };\n        if(dlg.clips.length > 1){ await runDialogueClips(dlg, 'veo'); return; }");
  assert.ok(veoPlan > CLIENT.indexOf("const ac = await fetch('/api/video?action=actor-create'") && veoPlan < CLIENT.indexOf("window.postWithConfirm('/api/video?action=veo-create', veoPayload)"));
  assert.ok(CLIENT.includes("durationSeconds: (creationMode === 'veo' && Math.max(durSecs, dlg.need)) || undefined };"));
  assert.match(block(CLIENT, 'function clipFrameB64(blob, where, ms){'), /for\(let i = 3; i < a\.length; i \+= 4\) if\(a\[i\]\)/, 'ينتظر أوّل بكسل معتم (PITFALLS)');
  assert.ok(block(CLIENT, 'function clipFrameB64(blob, where, ms){').includes("v.currentTime = where === 'first' ? Math.min(0.05, d / 2) : Math.max(0, d - 0.02);"), 'أوّل لقطة أو آخرها');
  const B = read('js/app.bundle.js');
  assert.ok(B.includes("await runDialogueClips(dlg, 'veo')") && B.includes('function planDialogue(desc, maxClips) {'), 'الحزمة مبنيّة');
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
  await f.ctx.run(p, 'veo');
  const c = f.creates();
  assert.equal(c.length, 4, 'ثلاثة مقاطع + إعادة واحدة');
  assert.deepEqual([c[2].imageBase64, c[2].keepPhoto, c[2].promptText], ['FRAME<https://cdn/omni-2.mp4>', true, CONT + '\n' + p.clips[2].text], 'المحاولة الأولى بآخر لقطة');
  assert.deepEqual([c[3].imageBase64, c[3].keepPhoto, c[3].promptText, c[3].confirmed, c[3].durationSeconds],
    ['FIRST<https://cdn/omni-2.mp4>', true, CONT + '\n' + p.clips[2].text, true, p.clips[2].sec], 'الإعادة بأوّل لقطة في المقطع السابق — الكلام نفسه');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-2.mp4', 'blob:https://cdn/omni-3.mp4']], 'الثلاثة ملصوقة بترتيبها');
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
  await f.ctx.run(p, 'veo');
  let c = f.creates();
  assert.deepEqual(c.map((x) => String(x.imageBase64).slice(0, 5)), ['HERO', 'FRAME', 'FIRST', 'HERO', 'FRAME', 'FIRST', 'HERO']);
  assert.deepEqual([c[3].keepPhoto, c[3].imageMime, c[3].promptText], [undefined, 'image/png', p.clips[1].text], 'صورة البطل كالمقطع الأوّل');
  assert.equal(f.joined[0].length, 3); assert.equal(f.status[f.status.length - 1], '✅ تم الانتهاء!');
  /* بلا بطل ويرفض كلّ صورة: بلا صورة — الوصف وحده كما كان يمرّ قبل #1344 */
  f = flow({ reject: (b, clipNo) => clipNo > 1 && !!b.imageBase64 });
  await f.ctx.run(p, 'minimax');
  c = f.creates();
  assert.equal(c.length, 7);
  assert.deepEqual([c[3].imageBase64, c[3].keepPhoto, c[3].promptText], [undefined, undefined, p.clips[1].text]);
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
  await f.ctx.run(p, 'veo');
  assert.equal(f.creates().length, 5, 'مقطعان + ثلاث محاولات للثالث');
  assert.deepEqual(f.joined, [['blob:https://cdn/omni-1.mp4', 'blob:https://cdn/omni-2.mp4']], 'المكتملان ملصوقان');
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
  await assert.rejects(f.ctx.run(p, 'veo'), (e) => e.code === 'video_rejected');
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
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  const NEED = { vmkDialogRetry: ['{i}', '{n}'], vmkDialogNoRef: ['{i}'], vmkDialogPart: ['{k}', '{n}'] };
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const d = ctx.I18N[L] || {};
    for (const [key, ph] of Object.entries(NEED)) {
      assert.ok(d[key] && ph.every((x) => d[key].includes(x)) && !d[key].includes('\n'), L + ' ' + key);
      if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(d[key]), L + ' ' + key + ': عربيّة');
    }
  }
  for (const [lang, en] of [['ar', 0], ['en', 1]]) {
    const c = { vmkT: (k, ar, e) => (en ? e : ar) };
    vm.runInNewContext(['function dialogNoteText(key, ar, en, vals){', 'function dialogRetryText(i, n){', 'function dialogNoRefText(i){', 'function dialogPartText(k, n){'].map((n) => block(CLIENT, n)).join('\n')
      + '\nthis.r = dialogRetryText; this.x = dialogNoRefText; this.p = dialogPartText;', c);
    const D = ctx.I18N[lang];
    assert.equal(c.r(3, 3), D.vmkDialogRetry.replace('{i}', '3').replace('{n}', '3'), lang);
    assert.equal(c.x(2), D.vmkDialogNoRef.replace('{i}', '2'), lang);
    assert.equal(c.p(2, 3), D.vmkDialogPart.replace('{k}', '2').replace('{n}', '3'), lang);
  }
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 801 && st.includes('v-video-dialogue-reject (801)'), 'وسم اللغات مرفوع وسببه في التعليق');
  assert.ok(read('js/app.bundle.js').includes('function dialogPartText(k, n){'), 'الحزمة مبنيّة');
});
