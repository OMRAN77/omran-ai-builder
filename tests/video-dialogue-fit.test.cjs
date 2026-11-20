'use strict';
/* v-video-dialogue-fit (المالك ١٧ نوفمبر ٢٠٢٦ بعد #1341: «اسمع الاصوات يعني كاني في سوق السمك والحوار ليس بي الدقة المطلوبه والحوار
   سريع» — مقطعه «سريع» من النسخة الجديدة: ست جمل (~٢٦ كلمة) في ١٠ ثوانٍ بلا وقفة. ثمّ اختار «مقطع واحد مع تنبيه»).
   يثبت: (١) fitDialogue تُبقي من أدوار الحوار ما تتّسع له المدّة بالترتيب وتحذف الباقي، والمشهد والوصف كما هما؛ (٢) «سريع» و«سينمائي»
   يرسلان للمحرّك الحوار المقصوص؛ (٣) العميل يحمل القارئ والقصّ نفسيهما حرفيًّا.
   v-video-dialogue-clips (المالك بعدها: «اريد فيديو يبني اقصى حده على نفس الكلمات»): القصّ صار شبكة أمان — العميل يوزّع الحوار كلّه على
   مقاطع متتالية (اختبار video-dialogue-clips)، والتنبيه ونصوصه هناك. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'dialogue-fit-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MINIMAX_API_KEY = 'mm-test';
delete process.env.TREND_ENGINE; delete process.env.CINEMA_ENGINE; delete process.env.VIDEO_FREE_FRAME;

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null, kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {},
  kvExpire: async () => {}, kvIncr: async () => 1, kvList: async () => [],
});
mock('api/_lib/_videoUsage.js', { checkOwnerBypass: async () => ({ allowed: true }) }); // المالك: لا نقاط ولا قفل
mock('api/_lib/video-job.js', { rememberVideoJob: async () => true, settleVideoJob: async () => ({ settled: true }) });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/fal-fallback.js', { VIDEO_OP_PREFIX: 'bk/', enabled: () => false, geminiOutRecently: async () => false, markGeminiOut: async () => {}, geminiCreditOut: () => false, startVideo: async () => ({}) });

const VT = require(rp('api/_lib/video-trends.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const mm = require(rp('api/_lib/minimax-create.js'));

let calls = [];
global.fetch = async (url, init) => {
  const u = String(url);
  calls.push({ url: u, body: init && init.body ? JSON.parse(init.body) : null });
  if (/\/interactions$/.test(u)) return new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/a:download?alt=media' }] }] }), { status: 200 });
  if (/minimax\.io\/v2\/video_generation$/.test(u)) return new Response(JSON.stringify({ task_id: 'mm-1' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
async function run(handler, body) { calls = []; const r = res(); await handler({ method: 'POST', query: {}, body: Object.assign({ token: 'owner', quality: 'fast', confirmed: true }, body) }, r); return r; }
const omniText = () => calls.find((x) => /\/interactions$/.test(x.url)).body.input.filter((x) => x.type === 'text').map((x) => x.text).join('');
const mmText = () => calls.find((x) => /minimax\.io/.test(x.url)).body.content[0].text;

/* حوار المالك كما سمعه Whisper من مقطعيه (أمّ وبنت عن اليوم الوطني)، وفوقه سطر المشهد */
const SCENE = 'أم وبنتها في حديقة، أعلام الإمارات.';
const LINES = ['البنت: أمي لماذا نحتفل باليوم الوطني؟', 'الأم: نحتفل باتحاد الإمارات يا بنتي', 'البنت: ومن أسّس الاتحاد؟',
  'الأم: الشيخ زايد وإخوانه حكّام الإمارات', 'البنت: أنا فخورة بوطني', 'الاثنتان: كل عام والإمارات بخير'];
const DIALOGUE = [SCENE].concat(LINES).join('\n');
const INLINE = 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» والأم ترد: «عشان اتحاد الإمارات السبع يا بنتي» ثمّ البنت تقول «أنا فخورة بوطني وبالشيخ زايد» وتضحك.';

test('١. الحوار في السطور: ما تتّسع له المدّة بالترتيب (١٢ث أربع جمل، ١٠ و٨ث ثلاث، ٦ث اثنتان، ٥ث الأولى) والمشهد باقٍ والباقي محذوف', () => {
  /* v-video-say-natural: المتّسع بنطق طبيعيّ ووقفة بين الأدوار — (المدّة − ثانية + ٠٫٤) × ٢٫٢ بوحدة «كلمات + ٠٫٨٨ لكلّ دور» */
  for (const [sec, keep] of [[12, 4], [10, 3], [8, 3], [6, 2], [5, 1], [4, 1]]) {
    const f = VT.fitDialogue(DIALOGUE, sec);
    assert.equal(f.turns, 6); assert.equal(f.kept, keep, sec + 'ث'); assert.equal(f.dropped, 6 - keep);
    assert.equal(f.text, [SCENE].concat(LINES.slice(0, keep)).join('\n'), sec + 'ث');
    assert.ok(f.keptWords + keep * 0.4 * 2.2 <= f.budget + 1e-9, 'داخل المتّسع');
    assert.equal(f.last, LINES[keep - 1].replace(/^[^:]+:\s*/, ''));
  }
  assert.ok(Math.abs(VT.fitDialogue(DIALOGUE, 10).budget - (10 - 1 + 0.4) * 2.2) < 1e-9 && Math.abs(VT.fitDialogue(DIALOGUE, 10).budget - VT.sayRoom(10)) < 1e-9);
  assert.equal(VT.fitDialogue(DIALOGUE, 15).dropped, 0, 'الحوار كلّه (٢٥ كلمة، ستّة أدوار) في ١٥ث');
  /* يتّسع كلّه = النصّ كما هو حرفيًّا */
  const two = [SCENE].concat(LINES.slice(0, 2)).join('\n');
  assert.deepEqual([VT.fitDialogue(two, 10).text, VT.fitDialogue(two, 10).dropped], [two, 0]);
});

test('٢. الحوار داخل الجملة بالتنصيص، والإنجليزيّ، وما ليس حوارًا', () => {
  let f = VT.fitDialogue(INLINE, 8);
  assert.equal(f.turns, 3); assert.equal(f.kept, 2);
  assert.equal(f.text, 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» والأم ترد: «عشان اتحاد الإمارات السبع يا بنتي» وتضحك.');
  assert.deepEqual([VT.fitDialogue(INLINE, 10).dropped, VT.fitDialogue(INLINE, 10).text], [0, INLINE], '١٠ث تتّسع للثلاثة');
  f = VT.fitDialogue(INLINE, 5);
  assert.equal(f.text, 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» وتضحك.');
  const EN = 'Mom and daughter in a park.\nGirl: Mom, why do we celebrate National Day?\nMom: We celebrate the union of the seven emirates.\nGirl: Who founded it?';
  assert.equal(VT.fitDialogue(EN, 8).text, 'Mom and daughter in a park.\nGirl: Mom, why do we celebrate National Day?');
  assert.equal(VT.fitDialogue(EN, 10).dropped, 0);
  /* ليس حوارًا: سطر وصف بنقطتين، وساعة، ومشهد صامت، ودور واحد طويل (يبقى كاملًا) */
  for (const d of ['المكان: حديقة واسعة فيها أعلام\nالكاميرا: لقطة واسعة بطيئة\nصقر يطير', 'الساعة 10:30 مساءً في السوق', 'صقر يحلّق فوق الكثبان',
    'رجل يقول: ' + 'هلا والله '.repeat(30)]) {
    const r = VT.fitDialogue(d, 5);
    assert.equal(r.dropped, 0, d.slice(0, 30)); assert.equal(r.text, d);
  }
  /* «ممثل يتكلم» (احتياطه عبر veo-create): كلامه بالحرف — لا يُقصّ */
  const actor = 'رجل. The person looks directly at the camera and speaks in Emirati Gulf Arabic dialect, saying exactly these Arabic words: "' + 'مرحبا '.repeat(40).trim() + '". "No subtitles" "at all".';
  assert.equal(VT.fitDialogue(actor, 8).text, actor);
});

test('٣. «سينمائي» و«سريع»: المحرّك يستلم الحوار المقصوص بمدّة المقطع المختارة (والقاعدة بعده)، والترند كما هو', async () => {
  let r = await run(veo, { promptText: DIALOGUE, ratio: '1280:720', durationSeconds: 10 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(omniText(), VT.fitDialogue(DIALOGUE, 10).text + VT.speechPace(DIALOGUE, 10));
  assert.ok(!omniText().includes('أنا فخورة بوطني'), 'الجمل الزائدة لا تصل المحرّك');
  await run(veo, { promptText: DIALOGUE, ratio: '1280:720' }); // بلا مدّة = ٨ كما يصل Omni
  assert.ok(omniText().startsWith(VT.fitDialogue(DIALOGUE, 8).text) && omniText().includes('ومن أسّس الاتحاد') && !omniText().includes('الشيخ زايد وإخوانه'), 'ثلاث جمل في ٨ ثوانٍ');
  r = await run(mm, { promptText: DIALOGUE, durationSeconds: 10 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(mmText(), VT.fitDialogue(DIALOGUE, 10).text + VT.speechPace(DIALOGUE, 10));
  await run(mm, { promptText: DIALOGUE }); // بلا مدّة = ٦
  assert.ok(mmText().startsWith(VT.fitDialogue(DIALOGUE, 6).text) && mmText().includes('نحتفل باتحاد') && !mmText().includes('ومن أسّس الاتحاد'), 'جملتان في ٦ ثوانٍ');
  /* مع صورة: الوصف المقصوص داخل القفل */
  await run(mm, { promptText: DIALOGUE, durationSeconds: 8, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  assert.equal(mmText(), VT.withPhotoLock(VT.fitDialogue(DIALOGUE, 8).text, 1500, undefined, VT.speechPace(DIALOGUE, 8)));
  /* الترند بقالبه ولو جاء معه نصّ */
  await run(mm, { trend: 'talkingpet', params: { text: 'هلا والله' }, promptText: DIALOGUE, imageBase64: 'PHOTO', imageMime: 'image/jpeg' });
  assert.ok(!mmText().includes('البنت:'), 'الترند لا يحمل وصف المستخدم');
  /* سطر في سجلّ الإنتاج حين يُقصّ (لقياس التجربة الحيّة) */
  for (const f of ['api/_lib/veo-create.js', 'api/_lib/minimax-create.js']) assert.match(read(f), /dialogue fitted to the clip: ' \+ fit\.kept \+ '\/' \+ fit\.turns/);
});

/* كتلة دالّة من ملفّ بعدّ الأقواس */
function block(src, needle) {
  const a = src.indexOf(needle); assert.ok(a >= 0, needle);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
}
const norm = (s) => s.split('\n').map((l) => l.trim()).join('\n');
const CLIENT = read('js/app-11-video.js');

test('٤. العميل يحمل قارئ الأدوار والقصّ نفسيهما حرفيًّا (عدّل الاثنين معًا)، ونتائجهما مطابقة', () => {
  const SRV = read('api/_lib/video-trends.js');
  const cli = {};
  for (const fn of ['function dialogueTurns(desc) {', 'function fitDialogue(desc, seconds, lead) {']) {
    cli[fn] = block(CLIENT, fn);
    assert.equal(norm(cli[fn]), norm(block(SRV, fn)), fn);
  }
  const ctx = {}; vm.runInNewContext(Object.values(cli).join('\n') + '\nthis.f = fitDialogue; this.t = dialogueTurns;', ctx);
  const plain = (x) => JSON.parse(JSON.stringify(x));
  /* v-video-full-dialogue: نصّ المالك في تشغيلة ١٩ نوفمبر — عنوانان («مشهد قصير: …»، «الشخصيات: …») ثمّ سبعة أدوار */
  const RUN19 = '🇦🇪 مشهد قصير: أحب وطني\nالشخصيات: طفلة وأمها.\nالطفلة: أمي، لماذا نحتفل باليوم الوطني؟\nالأم: لأننا نحتفل باتحاد الإمارات السبع ووطننا الغالي.\nالطفلة: ومن الذي أسس اتحاد الإمارات؟\n'
    + 'الأم: الشيخ زايد بن سلطان آل نهيان، رحمه الله، مع إخوانه الحكام.\nالطفلة: أنا فخورة بوطننا، وأحب علم الإمارات!\nالأم: حفظ الله الإمارات وأدام عزها.\nمعاً: كل عام والإمارات عز وفخر! 🇦🇪\n';
  for (const d of [DIALOGUE, INLINE, 'صقر', LINES.join('\n'), RUN19]) {
    assert.deepEqual(plain(ctx.t(d)), plain(VT.dialogueTurns(d)));
    for (const s of [5, 6, 8, 10, undefined]) for (const lead of [undefined, 0.5]) assert.deepEqual(plain(ctx.f(d, s, lead)), plain(VT.fitDialogue(d, s, lead)));
  }
  /* العناوين ليست كلامًا: لا تُعدّ أدوارًا (كانت تأكل ٤ كلمات من الميزانيّة وتطيل التوليدة)، وتبقى في الوصف حين يُقصّ ما بعدها */
  assert.deepEqual(plain(VT.dialogueTurns(RUN19).map((t) => [t.lead, t.w])), [['الطفلة: ', 5], ['الأم: ', 7], ['الطفلة: ', 5], ['الأم: ', 11], ['الطفلة: ', 6], ['الأم: ', 5], ['معاً: ', 5]]);
  const cut19 = VT.fitDialogue(RUN19, 10);
  assert.deepEqual([cut19.kept, cut19.keptWords, cut19.words], [3, 17, 44]);
  assert.ok(cut19.text.startsWith('🇦🇪 مشهد قصير: أحب وطني\nالشخصيات: طفلة وأمها.\nالطفلة: أمي'), cut19.text);
  for (const head of ['المشهد: حديقة', 'مشهد ليليّ هادئ: حديقة', 'الشخصيّات: أم وبنتها', 'العنوان: أحب وطني', '🎬 Scene one: a garden', 'Characters: a girl and her mother', 'Title: My homeland']) {
    assert.deepEqual(plain(VT.dialogueTurns(head + '\nالأم: حيّاك الله').map((t) => t.lead)), ['الأم: '], head);
  }
  for (const speaker of ['مشاهد: أين الكرة؟', 'المشهدانيّ: تفضّل', 'شخصيّة مرحة: أهلًا', 'Scenester: hello there']) {
    assert.equal(VT.dialogueTurns(speaker).length, 1, 'متكلّم لا عنوان: ' + speaker);
  }
  /* ميزانيّة التمديد (نصف ثانية صمت): كلمة زائدة في ١٠ث — والافتراضيّ ثانية كما كان */
  assert.deepEqual([VT.fitDialogue(RUN19, 10, 0.5).budget, VT.fitDialogue(RUN19, 10).budget, VT.fitDialogue(RUN19, 10, 0).budget, VT.fitDialogue(RUN19, 10, -3).budget].map((x) => x.toFixed(2)), ['21.78', '20.68', '20.68', '20.68']);
  /* الدور يحمل ما يلزم لإعادة كتابته في مقطعه: المتكلّم وعلامتا التنصيص */
  assert.deepEqual(plain(VT.dialogueTurns(LINES[1]).map((t) => [t.lead, t.said, t.open, t.close, t.line])), [['الأم: ', 'نحتفل باتحاد الإمارات يا بنتي', '', '', true]]);
  assert.deepEqual(plain(VT.dialogueTurns(INLINE).map((t) => [t.lead, t.open, t.close, t.line])), [['البنت تسأل أمها: ', '«', '»', false], ['والأم ترد: ', '«', '»', false], ['ثمّ البنت تقول ', '«', '»', false]]);
});

test('٥. القصّ شبكة أمان لا المسار: العميل يوزّع الحوار على مقاطع (video-dialogue-clips) فلا يصل الخادم ما يُقصّ — والتنبيه القديم «يُحذف الباقي عند مدّة المقطع» أُزيل', () => {
  assert.ok(!CLIENT.includes('dialogFitOk'), 'تنبيه القصّ عند مدّة المقطع الواحد أُزيل');
  assert.ok(CLIENT.includes('const dlg = planDialogue(text, 0, isOwnerAccount() ? [15] : [10]);') && CLIENT.includes("const dlg = creationMode === 'veo' ? planDialogueOne(veoPrompt) : { clips: [], need: 0 };"));
});
