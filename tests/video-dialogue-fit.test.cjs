'use strict';
/* v-video-dialogue-fit (المالك ١٧ نوفمبر ٢٠٢٦ بعد #1341: «اسمع الاصوات يعني كاني في سوق السمك والحوار ليس بي الدقة المطلوبه والحوار
   سريع» — مقطعه «سريع» من النسخة الجديدة: ست جمل (~٢٦ كلمة) في ١٠ ثوانٍ بلا وقفة. ثمّ اختار «مقطع واحد مع تنبيه»).
   يثبت: (١) fitDialogue تُبقي من أدوار الحوار ما تتّسع له المدّة بالترتيب وتحذف الباقي، والمشهد والوصف كما هما؛ (٢) «سريع» و«سينمائي»
   يرسلان للمحرّك الحوار المقصوص؛ (٣) العميل ينبّه قبل أيّ نداء أو خصم بالدالّة نفسها حرفيًّا؛ (٤) نصّ التنبيه بالـ١٤ لغة. */
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

test('١. الحوار في السطور: ما تتّسع له المدّة بالترتيب (١٠ث ثلاث جمل، ٨ث اثنتان، ٥ث الأولى) والمشهد باقٍ والباقي محذوف', () => {
  for (const [sec, keep] of [[10, 3], [8, 2], [5, 1], [6, 1]]) {
    const f = VT.fitDialogue(DIALOGUE, sec);
    assert.equal(f.turns, 6); assert.equal(f.kept, keep, sec + 'ث'); assert.equal(f.dropped, 6 - keep);
    assert.equal(f.text, [SCENE].concat(LINES.slice(0, keep)).join('\n'), sec + 'ث');
    assert.ok(f.keptWords <= f.budget, 'داخل المتّسع');
    assert.equal(f.last, LINES[keep - 1].replace(/^[^:]+:\s*/, ''));
  }
  assert.equal(VT.fitDialogue(DIALOGUE, 10).budget, 15);
  /* يتّسع كلّه = النصّ كما هو حرفيًّا */
  const two = [SCENE].concat(LINES.slice(0, 2)).join('\n');
  assert.deepEqual([VT.fitDialogue(two, 10).text, VT.fitDialogue(two, 10).dropped], [two, 0]);
});

test('٢. الحوار داخل الجملة بالتنصيص، والإنجليزيّ، وما ليس حوارًا', () => {
  let f = VT.fitDialogue(INLINE, 10);
  assert.equal(f.turns, 3); assert.equal(f.kept, 2);
  assert.equal(f.text, 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» والأم ترد: «عشان اتحاد الإمارات السبع يا بنتي» وتضحك.');
  f = VT.fitDialogue(INLINE, 5);
  assert.equal(f.text, 'البنت تسأل أمها: «ليش نحتفل باليوم الوطني يا أمي؟» وتضحك.');
  const EN = 'Mom and daughter in a park.\nGirl: Mom, why do we celebrate National Day?\nMom: We celebrate the union of the seven emirates.\nGirl: Who founded it?';
  assert.equal(VT.fitDialogue(EN, 8).text, 'Mom and daughter in a park.\nGirl: Mom, why do we celebrate National Day?');
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
  assert.ok(omniText().startsWith(VT.fitDialogue(DIALOGUE, 8).text) && !omniText().includes('ومن أسّس الاتحاد'), 'جملتان في ٨ ثوانٍ');
  r = await run(mm, { promptText: DIALOGUE, durationSeconds: 10 });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(mmText(), VT.fitDialogue(DIALOGUE, 10).text + VT.speechPace(DIALOGUE, 10));
  await run(mm, { promptText: DIALOGUE }); // بلا مدّة = ٦
  assert.ok(mmText().startsWith(VT.fitDialogue(DIALOGUE, 6).text) && !mmText().includes('نحتفل باتحاد'));
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

test('٤. العميل يحمل fitDialogue نفسها حرفيًّا (عدّل الاثنين معًا)، ونتائجها مطابقة', () => {
  const srv = block(read('api/_lib/video-trends.js'), 'function fitDialogue(desc, seconds) {');
  const cli = block(CLIENT, 'function fitDialogue(desc, seconds) {');
  assert.equal(norm(cli), norm(srv));
  const ctx = {}; vm.runInNewContext(cli + '\nthis.f = fitDialogue;', ctx);
  for (const d of [DIALOGUE, INLINE, 'صقر', LINES.join('\n')]) for (const s of [5, 6, 8, 10, undefined]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.f(d, s))), JSON.parse(JSON.stringify(VT.fitDialogue(d, s))));
  }
});

function clientFit(confirmAnswer, lang) {
  const asked = [];
  const ctx = { window: { confirm: (m) => { asked.push(m); return confirmAnswer; } }, __swallow: () => {}, String };
  ctx.vmkT = (key, ar, en) => (lang === 'en' ? en : ar);
  vm.runInNewContext(block(CLIENT, 'function fitDialogue(desc, seconds) {') + '\n' + block(CLIENT, 'function dialogFitOk(text, mode, secs){') + '\nthis.ok = dialogFitOk;', ctx);
  return { ok: ctx.ok, asked };
}

test('٥. التنبيه: حوار أطول = سؤال قبل الإرسال بمدّة المقطع وآخر جملة تُقال، والجواب يقرّر؛ حوار يتّسع = بلا سؤال', () => {
  let c = clientFit(true);
  assert.equal(c.ok(DIALOGUE, 'minimax', 10), true);
  assert.equal(c.asked.length, 1);
  assert.match(c.asked[0], /^⚠️ الحوار أطول من مدّة الفيديو \(10 ثوانٍ\)/);
  assert.ok(c.asked[0].includes('سيُقال إلى: «ومن أسّس الاتحاد؟»'), c.asked[0]);
  c = clientFit(false);
  assert.equal(c.ok(DIALOGUE, 'veo', 8), false, 'الإلغاء يوقف الطلب');
  assert.ok(c.asked[0].includes('(8 ثوانٍ)') && c.asked[0].includes('«نحتفل باتحاد الإمارات يا بنتي»'));
  /* المدّة كما يحسبها الخادم: سريع بلا مدّة ٦، سينمائي بلا مدّة ٨ */
  c = clientFit(true); c.ok(DIALOGUE, 'minimax', 0); assert.ok(c.asked[0].includes('(6 ثوانٍ)'));
  c = clientFit(true); c.ok(DIALOGUE, 'veo', 0); assert.ok(c.asked[0].includes('(8 ثوانٍ)'));
  c = clientFit(true);
  assert.equal(c.ok([SCENE].concat(LINES.slice(0, 2)).join('\n'), 'veo', 10), true);
  assert.equal(c.ok('صقر يحلّق', 'minimax', 5), true);
  assert.equal(c.asked.length, 0, 'لا سؤال حين يتّسع');
  c = clientFit(true, 'en'); c.ok(DIALOGUE, 'veo', 10);
  assert.ok(c.asked[0].includes('It will be spoken up to: “ومن أسّس الاتحاد؟”'));
});

test('٦. السؤال قبل أيّ نداء أو خصم في «سريع» و«سينمائي» (لا في الممثّل)، والإلغاء يرجع بلا طلب', () => {
  const mmCall = CLIENT.indexOf("if(!dialogFitOk(text, 'minimax', durSecs)){ setStatus(''); return; }");
  assert.ok(mmCall > 0 && mmCall < CLIENT.indexOf("window.postWithConfirm('/api/video?action=minimax-create', payload)"));
  const veoCall = CLIENT.indexOf("if(creationMode === 'veo' && !dialogFitOk(veoPrompt, 'veo', durSecs)){ setStatus(''); return; }");
  assert.ok(veoCall > CLIENT.indexOf("const ac = await fetch('/api/video?action=actor-create'") && veoCall < CLIENT.indexOf("window.postWithConfirm('/api/video?action=veo-create', veoPayload)"));
  assert.ok(read('js/app.bundle.js').includes("dialogFitOk(veoPrompt, 'veo', durSecs)"), 'الحزمة مبنيّة');
});

test('٧. نصّ التنبيه بالـ١٤ لغة بعنصريه، بلا عربيّة في غير العربيّة والأرديّة، والعميل يسقط على النصّ نفسه، ووسم اللغات مرفوع', () => {
  const ctx = { console, localStorage: { getItem: () => null }, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, $: () => null };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  const add = src.slice(src.indexOf('/* v-video-dialogue-fit (799)')).split('\n').slice(1, 3).join('\n');
  assert.match(add, /^Object\.assign\(I18N\.ar, \{"vmkDialogLong":/);
  vm.runInContext(add, ctx);
  const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  for (const L of ['ar', 'en'].concat(LANGS)) {
    const v = ctx.I18N[L] && ctx.I18N[L].vmkDialogLong;
    assert.ok(v && v.includes('{s}') && v.includes('{last}') && v.split('\n').length === 3, L);
    if (L !== 'ar' && L !== 'ur') assert.ok(!/[؀-ۿ]/.test(v), L + ': عربيّة');
  }
  const c = clientFit(true); c.ok(DIALOGUE, 'veo', 10);
  assert.equal(c.asked[0], ctx.I18N.ar.vmkDialogLong.replace('{s}', '10').replace('{last}', 'ومن أسّس الاتحاد؟'), 'سقوط العميل = نصّ القاموس');
  const e = clientFit(true, 'en'); e.ok(DIALOGUE, 'veo', 10);
  assert.equal(e.asked[0], ctx.I18N.en.vmkDialogLong.replace('{s}', '10').replace('{last}', 'ومن أسّس الاتحاد؟'));
  const st = read('js/app-04-i18n-state.js');
  assert.ok(Number((/\.js\?v=(\d+)'/.exec(st) || [])[1]) >= 799 && st.includes('v-video-dialogue-fit (799)'), 'وسم اللغات مرفوع وسببه في التعليق');
});
