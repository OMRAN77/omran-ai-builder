'use strict';
/* v-maha-turn (المالك ٢٤ سبتمبر: «شوفلي مها الصوتيّة من أوّل شي لآخر شي — أريدها كأنّك
   تكلّم شخص — الإنصات»): المسار الفائق (HD) كان يقرّر متى يتكلّم بالمسطرة وحدها —
   صمت ١١٠٠م.ث في الخادم ثمّ ردّ بعد ٣٥٠م.ث مهما كان الذي سمعه: سكتة تفكير وسط
   الجملة = ردّ في منتصف الكلام، وضجيج أو همهمة أو هلوسة تفريغ = ردّ على لا شيء.
   الآن يقرأ تفريغ نوبة المستخدم (المفعَّل أصلًا في الجلسة) ويقرّر كإنسان:
   سؤال مكتمل = ردّ فورًا · فكرة معلّقة = إمهال ١٤٠٠م.ث يسقط إن عاد يتكلّم ·
   ضجيج أو هلوسة = صمت وإنصات. هذا الاختبار يشغّل المنطق فعليًّا بمؤقّتات وهميّة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
const RT = fs.readFileSync(path.join(root, 'api/_lib/realtime-session.js'), 'utf8');

// شريحة المنطق الحقيقيّ من الملفّ نفسه: الحارس + محرّك القرار (بلا DOM ولا شبكة).
const SLICE = SRC.slice(
  SRC.indexOf('    let mahaRtResponseWatchdog = null;'),
  SRC.indexOf('window.mahaTurnPlan = mahaTurnPlan;') + 'window.mahaTurnPlan = mahaTurnPlan;'.length
);
assert.ok(SLICE.length > 500, 'شريحة المنطق موجودة في app-08-maha.js');

// بيئة مصغّرة بمؤقّتات وهميّة: الزمن نحرّكه بأنفسنا فلا اختبار بطيء ولا هشّ.
function load() {
  let now = 0;
  const timers = [];
  const sent = [];
  const states = [];
  const dc = { readyState: 'open', send: (m) => sent.push(JSON.parse(m)) };
  const ctx = {
    mahaRtDc: dc,
    mahaRtReady: true,
    mahaCallActive: true,
    mahaSetState: (s) => states.push(s),
    window: {},
    JSON,
    String,
    console,
    __swallow() {},
    setTimeout: (fn, ms) => { const t = { fn, at: now + ms, dead: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.dead = true; },
  };
  vm.createContext(ctx);
  vm.runInContext(SLICE + '\n;this.__api = { mahaTurnPlan, mahaTurnOnTranscript, mahaArmRtResponseWatchdog, mahaClearRtResponseWatchdog, get awaiting(){ return mahaTurnAwaiting; }, set awaiting(v){ mahaTurnAwaiting = v; }, set itemId(v){ mahaTurnItemId = v; } };', ctx);
  const advance = (ms) => {
    now += ms;
    timers.filter((t) => !t.dead && t.at <= now).forEach((t) => { t.dead = true; t.fn(); });
  };
  return { api: ctx.__api, sent, states, advance, dc };
}

// ——— القرار نفسه: ماذا يفعل إنسان سمع هذه النوبة؟ ———
test('فكرة مكتملة = ردّ فورًا', () => {
  const { api } = load();
  for (const line of ['كم الساعة الحين؟', 'شغّل لي أغنية', 'نعم', 'لا', 'تمام يا مها', 'what is the weather today?']) {
    assert.equal(api.mahaTurnPlan(line).act, 'reply', line);
  }
  // كلمة واحدة تمرّ كما هي (v-maha-oneword) — و«اه/إي/ايوه» نعم لا همهمة
  for (const yes of ['اه', 'إي', 'إيه', 'ايوه', 'أوكي']) {
    assert.equal(api.mahaTurnPlan(yes).act, 'reply', yes);
  }
  // جمل خليجيّة كاملة تنتهي بكلمة تبدو «معلّقة» — لا تُمهَل ولا تتأخّر
  for (const done of ['شفته من قبل', 'لسّه ما خلّصت بعد', 'تجي معي ولا']) {
    assert.equal(api.mahaTurnPlan(done).act, 'reply', done);
  }
});

test('فكرة معلّقة على حرف ربط أو همهمة = إمهال لا ردّ', () => {
  const { api } = load();
  const open = ['أبي أسوّي لي تطبيق و', 'خلّينا نشوف الموضوع بس', 'يعني', 'أمم', 'ودّي أسألك عن',
    'المشكلة في', 'سويت اللي قلت لي عليه، لكن', 'I want to build an app and', 'give me the'];
  for (const line of open) {
    const p = api.mahaTurnPlan(line);
    assert.equal(p.act, 'hold', line);
    assert.equal(p.waitMs, 1400, 'مهلة الإمهال ١٤٠٠م.ث');
  }
  // فاصلة أو نقاط متتابعة في آخر السطر = لم يخلّص
  assert.equal(api.mahaTurnPlan('أوّل شي،').act, 'hold');
  assert.equal(api.mahaTurnPlan('يعني ممكن...').act, 'hold');
  // سؤال صريح يغلب آخر كلمة معلّقة
  assert.equal(api.mahaTurnPlan('وش رايك في؟').act, 'reply');
});

test('ضجيج وهلوسة تفريغ = تجاهل تامّ، لا ردّ على لا شيء', () => {
  const { api } = load();
  for (const junk of ['', '   ', '...', '。', null, undefined,
    'شكرا على المشاهدة', 'شكراً جزيلاً على المتابعة', 'اشتركوا في القناة',
    'ترجمة نانسي قنقر', 'Thanks for watching!', 'Please subscribe']) {
    assert.equal(api.mahaTurnPlan(junk).act, 'ignore', String(junk));
  }
});

// ——— السلوك الحيّ: متى يخرج response.create فعلًا ———
test('نوبة مكتملة: ردّ واحد فورًا بعد وصول التفريغ', () => {
  const { api, sent, advance } = load();
  api.awaiting = true;                       // = ما يفعله speech_stopped
  api.mahaArmRtResponseWatchdog(400);
  advance(250);
  api.mahaTurnOnTranscript('كم الساعة؟');
  assert.deepEqual(sent, [], 'لا ردّ قبل مهلته');
  advance(100);
  assert.deepEqual(sent, [{ type: 'response.create' }], 'ردّ واحد لا أكثر');
});

test('نوبة معلّقة: تبقى منصتة، وإن أكمل كلامه سقط الردّ كلّيًّا', () => {
  const { api, sent, states, advance } = load();
  api.awaiting = true;
  api.mahaArmRtResponseWatchdog(400);
  advance(300);
  api.mahaTurnOnTranscript('أبي أسوّي لي تطبيق و');
  assert.equal(states[states.length - 1], 'listening', 'الحالة تبقى «أستمع» لا «أفكّر»');
  advance(900);
  assert.deepEqual(sent, [], 'ما زالت تنتظره يكمّل');
  // عاد يتكلّم قبل انتهاء الإمهال = ما يفعله speech_started حرفيًّا
  api.awaiting = false;
  api.mahaClearRtResponseWatchdog();
  advance(5000);
  assert.deepEqual(sent, [], 'لم تقاطعه أبدًا');
});

test('نوبة معلّقة ثمّ سكوت: تردّ بعد الإمهال لا قبله', () => {
  const { api, sent, advance } = load();
  api.awaiting = true;
  api.mahaArmRtResponseWatchdog(400);
  advance(300);
  api.mahaTurnOnTranscript('يعني');
  advance(1399);
  assert.deepEqual(sent, [], 'لا ردّ قبل ١٤٠٠م.ث');
  advance(2);
  assert.deepEqual(sent, [{ type: 'response.create' }], 'ثمّ تردّ مرّة واحدة');
});

test('ضجيج: لا ردّ إطلاقًا وتعود للإنصات', () => {
  const { api, sent, states, advance } = load();
  api.awaiting = true;
  api.mahaArmRtResponseWatchdog(400);
  advance(200);
  api.mahaTurnOnTranscript('شكرا على المشاهدة');
  advance(10000);
  assert.deepEqual(sent, [], 'لم تردّ على هلوسة صمت');
  assert.equal(states[states.length - 1], 'listening');
});

test('تفريغ نوبة أخرى لا يقرّر مكان النوبة المنتظَرة', () => {
  const { api, sent, advance } = load();
  api.awaiting = true;
  api.itemId = 'item_2';                 // النوبة المنتظَرة الآن
  advance(10);
  api.mahaTurnOnTranscript('كم الساعة؟', 'item_1'); // تفريغ الجزء الأوّل وصل متأخّرًا
  assert.equal(api.awaiting, true, 'النافذة ما زالت مفتوحة لنوبتها');
  assert.deepEqual(sent, [], 'ولم يُطلق ردًّا بنصّ غيرها');
  api.mahaTurnOnTranscript('كم الساعة؟', 'item_2');
  advance(100);
  assert.deepEqual(sent, [{ type: 'response.create' }], 'تفريغ نوبتها هو من يقرّر');
});

test('تفريغ متأخّر لنوبة انتهت لا يُطلق ردًّا ثانيًا', () => {
  const { api, sent, advance } = load();
  api.awaiting = true;
  api.mahaArmRtResponseWatchdog(400);
  advance(500);                                   // الحارس أطلق الردّ (لم يصل تفريغ)
  assert.deepEqual(sent, [{ type: 'response.create' }]);
  api.mahaTurnOnTranscript('أبي أسوّي لي تطبيق و'); // وصل بعد إطلاق الحارس
  advance(5000);
  assert.deepEqual(sent, [{ type: 'response.create' }], 'ردّ واحد فقط');
});

// ——— الربط في الملفّ نفسه ———
test('الربط: انتهاء الكلام ينتظر التفريغ، والتفريغ هو من يقرّر', () => {
  const stop = SRC.slice(
    SRC.indexOf("else if(ev.type === 'input_audio_buffer.speech_stopped'){"),
    SRC.indexOf("else if(ev.type === 'output_audio_buffer.started'")
  );
  assert.ok(stop.includes('mahaTurnAwaiting = true;'), 'speech_stopped يفتح نافذة القرار');
  assert.ok(stop.includes('mahaTurnItemId = (ev && ev.item_id) || null;'), 'ويسجّل عنصر النوبة');
  assert.ok(stop.includes('mahaTurnOnTranscript(ev && ev.transcript, ev && ev.item_id);'), 'والتفريغ يصل بعنصره');
  assert.ok(stop.includes('mahaArmRtResponseWatchdog(MAHA_TURN_TX_WAIT_MS);'), 'ينتظر التفريغ لا ٣٥٠ ثابتة');
  assert.ok(!/mahaArmRtResponseWatchdog\(350\)/.test(SRC), 'لم تبقَ ٣٥٠ العمياء في أيّ مكان');
  assert.ok(stop.includes("ev.type === 'conversation.item.input_audio_transcription.completed'"), 'حدث التفريغ مربوط');
  assert.ok(stop.includes("else if(ev.type === 'response.created'){ mahaTurnAwaiting = false;"), 'بدء الردّ يغلق النافذة');

  const started = SRC.slice(
    SRC.indexOf("if(ev.type === 'input_audio_buffer.speech_started'){"),
    SRC.indexOf("else if(ev.type === 'input_audio_buffer.speech_stopped'){")
  );
  assert.ok(started.includes('mahaTurnAwaiting = false;'), 'عودته للكلام تغلق النافذة');
  assert.ok(started.includes('mahaClearRtResponseWatchdog();'), 'وتُسقط الردّ المعلّق');
  assert.ok(started.includes('mahaArmRtResponseWatchdog(20000);'), 'حارس المجرى العالق ٢٠ث كما هو (v-maha-listen)');
});

test('الخادم: إعداد الإنصات كما ثبّته v-maha-listen، والمقاطعة مثبَّتة صراحةً', () => {
  const start = RT.indexOf("turn_detection: mode === 'builder'");
  const block = RT.slice(RT.indexOf(': {', start), RT.indexOf('},', start));
  assert.match(block, /threshold: 0\.5,/);
  assert.match(block, /prefix_padding_ms: 1000,/);
  assert.match(block, /silence_duration_ms: 1100,/, 'لم تُلمس مسطرة الصمت — القرار انتقل للنصّ لا لرقم جديد');
  assert.match(block, /create_response: false,/);
  assert.match(block, /interrupt_response: true,/, 'كلمة منه وهي تتكلّم تقطع كلامها');
  // التفريغ مفعَّل، وإلّا لا يصل نصّ يُقرَّر به
  assert.match(RT, /transcription: \{ model: 'gpt-4o-mini-transcribe' \}/);
});

test('الحزمة تحمل المنطق نفسه', () => {
  const bundle = fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('function mahaTurnPlan('), 'المنطق داخل الحزمة');
  assert.ok(bundle.includes('MAHA_TURN_HOLD_MS = 1400'), 'قيمه داخل الحزمة');
});

console.log('✓ maha-turn: مها تنتظر حتّى تخلّص فكرتك، وتتجاهل الضجيج، وتردّ فور اكتمال السؤال');
