// tests/chat-trend-scenes.test.cjs — v-chat-trend-scenes (١٨ أكتوبر ٢٠٢٦).
// بعد v-trend-scenes (لوحة الترند) بقيت المحادثة: أداة generate_video بترند «قصة بيكسار» ترسل الاسم والنصّ فقط، فتُرمى
// قصّة المستخدم ويخرج المشهد الافتراضيّ الأوّل («يصحى ويفطر»). قرار المالك (الخيار «أ»): مقطع واحد ٨ ثوانٍ يجمع مشاهد
// المستخدم بالترتيب، بنفس الخصم الحالي. الاختبار: طلب محادثة بقصّة بحر — من الأداة إلى معالج veo-create الحقيقيّ إلى
// الأمر الواصل للمحرّك — بلا school ولا classroom ولا مشاهد الصباح والمساء، ومقطع واحد.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
/* v-trend-omni: هذا الاختبار يفحص بناء أمر الترند وإطاره الأوّل وخصمه — المشترك بين المحرّكين — على طلب Veo المصطنع؛
   مسار Omni نفسه (الأمر والصور ذاتهما حرفيًّا، والتذكرة والاسترجاع) في trend-omni.test.cjs */
process.env.TREND_ENGINE = 'veo';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const VT = require(rp('api/_lib/video-trends.js'));
const { buildTrendPrompt } = VT;
const SCHOOL = /school|classroom/i;
const DEFAULTS = /wakes up smiling|returns home in the evening|alarm clock|breakfast/i;
const SEA1 = 'سالم يركض على شاطئ البحر ويجمع الصدف وقت الغروب';
const SEA2 = 'سالم يركب قارب صيد صغير مع أبوه ويشوفون الدلافين تقفز حولهم';
const SEA_TEXT = 'المشهد الأول: ' + SEA1 + '.\nالمشهد الثاني: ' + SEA2;

const TD = { window: {} };
vm.runInNewContext(read('js/app-11-video-trends-data.js'), TD);
const TRENDS_DATA = TD.window.__VIDEO_TRENDS;

/* أداة المحادثة الحقيقيّة (app-17) في vm: ما ترسله إلى الخادم، بلا انتظار الاستطلاع */
async function chatTool(args, ref) {
  const bodies = [];
  const sb = { authGet: () => 'tok', localStorage: { getItem: () => null }, console, lang: 'ar', setTimeout: (fn) => fn() };
  sb.window = sb; sb.__VIDEO_TRENDS = TRENDS_DATA;
  sb.postWithConfirm = async (url, body) => { bodies.push({ url, body: JSON.parse(JSON.stringify(body)) }); return { ok: true, status: 200, json: async () => ({ op: 'op/1' }) }; };
  sb.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'SUCCEEDED', output: ['https://v.example/clip.mp4'] }) });
  vm.runInNewContext(read('js/app-17-agent-tools.js'), sb);
  const out = await sb.omranAgentTools.run('generate_video', args, { imgs: {}, chat: null, ref: ref || null, userText: '' });
  return { out, bodies };
}

/* معالج veo-create الحقيقيّ: الأمر الذي يصل المحرّك لجسم الطلب نفسه */
async function veoPrompts(bodies) {
  const stubs = {
    'api/_lib/_videoUsage.js': { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 },
    'api/_lib/video-job.js': { rememberVideoJob: async () => true, settleVideoJob: async () => null },
    'api/_lib/points.js': { isOwnerUsername: () => true, COSTS: { veo_video: 400 } },
  };
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); saved[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp('api/_lib/veo-create.js'); delete require.cache[hp];
  const savedKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'gk';
  const realFetch = global.fetch; const sent = [];
  global.fetch = async (url, init) => {
    if (String(url).includes(':predictLongRunning')) { sent.push(JSON.parse(init.body).instances[0].prompt); return Response.json({ name: 'op/' + sent.length }); }
    throw new Error('unexpected fetch: ' + url);
  };
  try {
    const handler = require(hp);
    for (const b of bodies) {
      assert.equal(b.url, '/api/video?action=veo-create');
      const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
      await handler({ method: 'POST', query: { action: 'veo-create' }, body: b.body }, res);
      assert.equal(res.code, 200, JSON.stringify(res.body));
    }
  } finally {
    global.fetch = realFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
  }
  return sent;
}

const PHOTO_REF = { dataUrl: 'data:image/jpeg;base64,' + Buffer.from('not-a-real-jpeg-'.repeat(8)).toString('base64'), mime: 'image/jpeg' };
const seaStory = (pr) => {
  assert.doesNotMatch(pr, SCHOOL, 'المدرسة وصلت المحرّك');
  assert.doesNotMatch(pr, DEFAULTS, 'مشهد افتراضيّ وصل المحرّك');
  assert.ok(pr.includes(SEA1) && pr.includes(SEA2), 'مشهد البحر ناقص: ' + pr.slice(0, 500));
  assert.ok(pr.indexOf(SEA1) < pr.indexOf(SEA2), 'المشاهد بغير ترتيبها');
  assert.match(pr, /one short story told in 2 consecutive shots within this single clip, in this exact order — shot 1: سالم يركض[^;]*; shot 2: سالم يركب/);
  assert.doesNotMatch(pr, /scene \d of \d/, 'مقطع واحد لا «scene 1 of n»');
  assert.match(pr, /a cheerful child named سالم[, ]/);
};

test('١. (طلب المالك) المحادثة بقصّة بحر في trend_scenes: طلب واحد، مقطع ٨ ثوانٍ، ولا school ولا classroom في الأمر الواصل للمحرّك', async () => {
  const { out, bodies } = await chatTool({ prompt: 'قصة بيكسار لسالم في البحر', trend: 'pixarstory', trend_name: 'سالم', trend_scenes: [SEA1, SEA2] });
  assert.match(out, /^✅/);
  assert.equal(bodies.length, 1, 'الخيار «أ»: مقطع واحد بخصم واحد');
  const b = bodies[0].body;
  assert.equal(b.trend, 'pixarstory');
  assert.equal(b.durationSeconds, 8);
  assert.deepEqual(b.params, { name: 'سالم', text: 'سالم', oneClip: true, scenes: [SEA1, SEA2] });
  const sent = await veoPrompts(bodies);
  assert.equal(sent.length, 1);
  seaStory(sent[0]);
  // والبناء على الخادم وحده: مقطع واحد
  assert.equal(buildTrendPrompt('pixarstory', b.params).sceneCount, 1);
});

test('٢. القصّة في trend_text: «المشهد الأول: … المشهد الثاني: …» يقسمها الخادم، والقصّة بلا علامات هي المشهد نفسه (لا توجيه على مشهد الصباح)', async () => {
  const marked = await chatTool({ prompt: 'قصة بيكسار', trend: 'pixarstory', trend_name: 'سالم', trend_text: SEA_TEXT });
  assert.deepEqual(marked.bodies[0].body.params, { name: 'سالم', text: 'سالم', oneClip: true, extra: SEA_TEXT });
  seaStory((await veoPrompts(marked.bodies))[0]);

  const plain = 'سالم يسبح مع الدلافين في بحر أزرق صافي ويضحك';
  const one = await chatTool({ prompt: 'قصة بيكسار', trend: 'pixarstory', trend_name: 'سالم', trend_text: plain });
  const pr = (await veoPrompts(one.bodies))[0];
  assert.doesNotMatch(pr, SCHOOL); assert.doesNotMatch(pr, DEFAULTS);
  assert.match(pr, /^Pixar-style 3D animated scene: سالم يسبح مع الدلافين في بحر أزرق صافي ويضحك\. Main character: a cheerful child named سالم,/);
  assert.ok(!/USER DIRECTION/.test(pr), 'القصّة صارت المشهد لا ذيلًا بعد مشهد افتراضيّ');
});

test('٣. القصّة لا تصير اسم الطفل، وكلمة واحدة بلا اسم = الاسم؛ وبلا قصّة: المشهد الأوّل الافتراضيّ كما كان حرفيًّا', async () => {
  // بلا trend_name والقصّة في trend_text: كانت `name = clean(name) || clean(text)` تجعل القصّة كلّها اسم الطفل
  const noName = await chatTool({ prompt: 'قصة بيكسار', trend: 'pixarstory', trend_text: SEA_TEXT });
  const pr = (await veoPrompts(noName.bodies))[0];
  assert.doesNotMatch(pr, / named /, 'القصّة صارت اسمًا');
  assert.match(pr, /Main character: a cheerful child, the SAME/);
  assert.doesNotMatch(pr, SCHOOL);

  const word = await chatTool({ prompt: 'قصة بيكسار', trend: 'pixarstory', trend_text: 'ريم' });
  assert.deepEqual(word.bodies[0].body.params, { name: 'ريم', text: 'ريم', oneClip: true });

  // بلا قصّة: الأمر القديم حرفيًّا (المشهد الأوّل من ثلاثة)
  for (const args of [{ trend_name: 'سالم' }, { trend_name: 'سالم', trend_text: 'سالم' }, { trend_text: 'سالم' }]) {
    const r = await chatTool(Object.assign({ prompt: 'قصة بيكسار لسالم', trend: 'pixarstory' }, args));
    const old = buildTrendPrompt('pixarstory', { name: 'سالم', text: 'سالم' }).prompt;
    assert.equal(buildTrendPrompt('pixarstory', r.bodies[0].body.params).prompt, old, JSON.stringify(args));
    assert.match(old, /^Pixar-style 3D animated scene 1 of 3: سالم wakes up smiling/);
  }
  // عناصر غير نصّيّة أو فاضية في trend_scenes تسقط
  const junk = await chatTool({ prompt: 'x', trend: 'pixarstory', trend_name: 'سالم', trend_scenes: ['', '  ', 7, null, SEA1] });
  assert.deepEqual(junk.bodies[0].body.params.scenes, [SEA1]);
});

test('٤. مع صورة: قفل الهويّة يبقى، والأمر داخل حدّ Veo حتّى بخمسة مشاهد طويلة، وكلّ اللقطات تصل', async () => {
  const { bodies } = await chatTool({ prompt: 'قصة بيكسار', trend: 'pixarstory', trend_name: 'سالم', trend_scenes: [SEA1, SEA2] }, PHOTO_REF);
  assert.ok(bodies[0].body.imageBase64, 'الصورة وصلت');
  const pr = (await veoPrompts(bodies))[0];
  seaStory(pr);
  assert.match(pr, /whose look is based on the reference image/);
  assert.match(pr, /IDENTITY \(mandatory\)/, 'قفل الهويّة في الذيل');

  const { FRAME_LOCK } = require(rp('api/_lib/trend-people.js'));
  const opts = { cap: 2600 - FRAME_LOCK.length };
  const long = [1, 2, 3, 4, 5].map((k) => 'المشهد رقم ' + k + ' في البحر ' + 'موج وصدف ودلافين '.repeat(30));
  for (const hasImage of [false, true]) {
    const b = buildTrendPrompt('pixarstory', { name: 'سالم', scenes: long, oneClip: true, hasImage }, opts);
    assert.equal(b.sceneCount, 1);
    assert.ok(b.prompt.length <= 2600, 'فوق حدّ Veo: ' + b.prompt.length);
    for (let k = 1; k <= 5; k++) assert.ok(b.prompt.includes('shot ' + k + ': المشهد رقم ' + k), 'اللقطة ' + k + ' سقطت');
    if (hasImage) assert.match(b.prompt, /IDENTITY \(mandatory\)/);
  }
});

test('٥. لوحة الترند كما هي: بلا oneClip لا يتغيّر شيء (مقطع لكلّ مشهد، و«اكتب اللي تبيه» بلا علامات توجيه)', () => {
  const panel = buildTrendPrompt('pixarstory', { name: 'سالم', scenes: [SEA1, SEA2], sceneIndex: 1 });
  assert.equal(panel.sceneCount, 2);
  assert.match(panel.prompt, /scene 2 of 2: سالم يركب قارب صيد/);
  const dir = buildTrendPrompt('pixarstory', { name: 'سالم', extra: 'الجوّ ليل' });
  assert.equal(dir.sceneCount, 3);
  assert.match(dir.prompt, /USER DIRECTION \(follow it; it wins over the setting if it names a place\): الجوّ ليل\./);
  assert.deepEqual(VT.sceneParams('pixarstory', { extra: 'الجوّ ليل' }), { extra: 'الجوّ ليل' });
  assert.deepEqual(VT.sceneParams('dance', { extra: 'سالم في البحر', oneClip: true }), { extra: 'سالم في البحر', oneClip: true }, 'ترند بلا مشاهد: كما هو');
});

test('٦. المخطّط: trend_scenes مصفوفة نصوص في generate_video، والوصف يمنع إضافة مدرسة وصباح؛ والعميل في الحزمة', () => {
  const { TOOLS } = require(rp('api/_lib/chat.js')).__imgAsk;
  const gv = TOOLS.find((t) => t.name === 'generate_video');
  const pr = gv.input_schema.properties;
  assert.deepEqual({ type: pr.trend_scenes.type, items: pr.trend_scenes.items }, { type: 'array', items: { type: 'string' } });
  assert.match(pr.trend_scenes.description, /pixarstory/);
  assert.match(pr.trend_scenes.description, /مقطع واحد/);
  assert.match(pr.trend_scenes.description, /لا تضف مدرسة/);
  assert.match(pr.trend_text.description, /لا اسم الطفل/);
  assert.ok(pr.trend.enum.includes('pixarstory'));
  assert.deepEqual(gv.input_schema.required, ['prompt']);
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("payload.params = { name: tName, text: tName, oneClip: true };"), 'الحزمة لم تُبنَ بعد التعديل');
});
