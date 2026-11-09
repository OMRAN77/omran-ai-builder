'use strict';
/* v-trend-hair-lock — المالك: ترند «سامحوني» بصورة واحدة لرجل ملتحٍ بشعر قصير جدًّا خرج بوجه أنحف وشعر طويل تطيّره الريح، والتبديل
   مفعّل للمالك. الجذر في النصّ الذي نرسله: مهمّة الإطار تركت «القصّة من الوصف»، والقالب طلب «glow-up» و«wind in their hair».
   يثبت هذا الملفّ (بلا أيّ نداء):
   ١) شعر الرأس واللحية من الصورة في كلّ إطار بعمره (فرديّ، شخصان في صورة، مجموعة، فنّيّ) — والعمر الآخر كما كان حرفيًّا.
   ٢) لا قالب (خارج العمر الآخر) يطلب ريحًا في الشعر أو شعرًا ينساب، و«سامحوني» بلا glow-up ولا «نسخة بطوليّة».
   ٣) ترندات أخرى غيّرت كلماتُها الوجه (زاوية البطل المنخفضة، الابتسامة العريضة، «الأسلوب العامّ») — والحدود كما هي.
   ٤) توجيه المستخدم («اكتب اللي تبيه») يصل مهمّة الإطار كاملًا بعد SETTING، فرديًّا ولمجموعة (كان القصّ عند ٧٠٠/٩٠٠ يسقطه). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const TP = require(path.join(root, 'api/_lib/trend-people.js'));
const { TRENDS, buildTrendPrompt } = require(path.join(root, 'api/_lib/video-trends.js'));
const VEO_PROMPT_MAX = 2600; // veo-create.VEO_PROMPT_MAX — يُقارن أدناه

const HAIR = 'keeps the exact length, cut, hairline and volume shown in Photo 1';

test('١. الإطار الفرديّ: الشعر من الصورة ما لم يطلب الوصف قصّة جديدة — والعمر الآخر كما كان', () => {
  const scene = TP.trendScene(buildTrendPrompt('sorryreveal', { hasImage: true, people: 1 }).prompt);
  const t = TP.soloFrameTask(scene, { closeup: true, people: 1, detail: true, single: true });
  assert.ok(t.includes(HAIR), 'سطر الشعر');
  assert.ok(t.includes('any beard or moustache stays as shown'));
  assert.ok(t.includes('never lengthen, add or restyle it — unless the description explicitly asks for a new hairstyle'));
  assert.doesNotMatch(t, /clothing, hairstyle, pose/, 'القصّة لم تعد من الوصف');
  assert.ok(t.includes('their hair stays as in Photo 1 unless the description explicitly asks for a new hairstyle'));
  /* شخصان في صورة واحدة */
  const t2 = TP.soloFrameTask(scene, { closeup: true, people: 2 });
  assert.ok(t2.includes("Each person's hair keeps the exact length, cut, hairline and volume shown in Photo 1"));
  /* العمر الآخر: حرفيًّا كما كان (يُرسم بعمر القالب) */
  for (const start of [false, true]) {
    const age = TP.soloFrameTask('a toddler version of them', { ageShift: true, start, people: 1 });
    assert.ok(age.includes('The setting, clothing, hairstyle, pose and lighting follow the description'));
    assert.ok(!age.includes('hairline and volume'));
  }
  /* التحوّل أثناء الفيديو: كما كان (اللبس والقصّة من الصورة لأنّ التغيير لم يحدث) */
  assert.ok(TP.soloFrameTask('x', { start: true }).includes('their clothing, hairstyle and look stay exactly as in Photo 1'));
});

test('٢. إطار المجموعة والفنّيّ وسطر الأسلوب: سطر الشعر في كلّ صيغة', () => {
  const g = TP.frameTask(2, 'an old souq');
  assert.ok(g.includes("Each person's hair keeps the exact length, cut, hairline and volume shown in their own photo"));
  assert.ok(g.includes('unless the scene explicitly asks for a new hairstyle'));
  assert.ok(!TP.frameTask(2, 'an old souq', false, { ageShift: true }).includes('hairline and volume'), 'العمر الآخر بلا قفل الشكل');
  assert.ok(TP.frameTask(3, 'a park', false, { art: true }).includes('hairline and volume'));
  assert.ok(TP.soloFrameTask('a knight', { art: true }).includes(HAIR));
  assert.ok(TP.soloFrameTask('a knight', { styleText: TP.ANIME_FRAME_STYLE }).includes(HAIR));
  assert.ok(TP.frameLookLock(false).endsWith('unless the description explicitly asks for a new hairstyle.'));
});

test('٣. القوالب: «سامحوني» بلا glow-up وريح الشعر، ولا قالب يطلب ريحًا في الشعر', () => {
  const p = TRENDS.sorryreveal.prompt;
  assert.doesNotMatch(p, /glow-up|heroic version|wind in their hair|plain, ordinary/);
  assert.ok(p.includes('the person from the reference image'));
  assert.ok(p.includes('cuts to the reference photo itself'));
  assert.ok(p.includes('facial hair and hair stay exactly as in the photo'));
  const re = /wind (?:moves|in|whipping)[^.;]{0,25}hair|hair(?: and \w+)? (?:drifting|whip)/i;
  for (const [k, t] of Object.entries(TRENDS)) {
    if (TP.AGE_SHIFT_TRENDS.has(k)) continue;
    assert.doesNotMatch(String(t.prompt || ''), re, k);
  }
  assert.ok(TRENDS.superhero.prompt.includes('no mask, cowl or helmet'));
  assert.doesNotMatch(TRENDS.superhero.prompt, /look up heroically/);
  assert.ok(TRENDS.underwater.prompt.includes('any headscarf stays on'));
  assert.ok(TRENDS.saveyourself.prompt.includes('both with the hair exactly as in the photo'));
});

const EDITED = ['sorryreveal', 'underwater', 'superhero', 'ghibli', 'animeaction', 'saveyourself', 'actionhero', 'movieposter', 'graduation', 'outfitswap', 'lostfilm80s', 'tencountries', 'dayinlife'];

test('٤. ترندات أخرى كلماتها تغيّر الوجه', () => {
  assert.doesNotMatch(TRENDS.actionhero.prompt, /low hero angle/);
  assert.ok(TRENDS.actionhero.prompt.includes('at eye level throughout'));
  assert.doesNotMatch(TRENDS.lostfilm80s.prompt, /grinning|gleeful/);
  assert.doesNotMatch(TRENDS.dayinlife.prompt, /general style/);
  assert.ok(TRENDS.outfitswap.prompt.includes('Only the clothes change'));
  assert.ok(TRENDS.tencountries.prompt.includes('(same face, hair and outfit)'));
  assert.ok(TRENDS.graduation.prompt.includes('worn over their own ghutra or headscarf'));
  assert.ok(TRENDS.movieposter.prompt.includes('exactly as they look'));
});

test('٥. الحدود: كلّ قالب معدَّل ≤ ٧٠٠ حرف وفيه «the person/subject from the reference image» (bindTrendRef)، ويتّسع لقفل الإطار', () => {
  assert.match(require('node:fs').readFileSync(path.join(root, 'api/_lib/veo-create.js'), 'utf8'), /const VEO_PROMPT_MAX = 2600;/); // بلا تحميل veo-create (يطلب AUTH_SECRET)
  for (const k of EDITED) {
    const p = TRENDS[k].prompt;
    assert.ok(p.length <= 700, k + ': ' + p.length);
    if (k === 'ghibli') assert.ok(p.includes('the reference image'), k); // قالبه «Transform the reference image» من قبل
    else assert.match(p, /the (?:person|subject) from the reference image/i, k);
    const b = buildTrendPrompt(k, { hasImage: true, text: 'يا هلا', name: 'عمران', sceneIndex: 0 });
    assert.ok(b && b.prompt.length + TP.FRAME_LOCK.length <= VEO_PROMPT_MAX, k + ': ' + (b && b.prompt.length));
  }
});

test('٦. توجيه المستخدم كاملًا في مهمّة الإطار (فرديّ، شخصان، ثلاثة) مع SETTING — القوالب الأطول لا تدفعه خارجها', () => {
  const cap = VEO_PROMPT_MAX - TP.FRAME_LOCK.length; // TREND_OPTS في veo-create
  const dir = (n) => ('امش على الشاطئ وقت الغروب والبحر هادئ ' + 'والنخيل خلفي '.repeat(40)).slice(0, n).trim();
  const ex80 = dir(80), ex400 = dir(400);
  assert.equal(ex80.length, 80); assert.equal(ex400.length, 400);
  const sceneOf = (k, people, extra) => {
    const b = buildTrendPrompt(k, require(path.join(root, 'api/_lib/video-trends.js')).sceneParams(k, { hasImage: true, people, bg: 7, extra }), { cap });
    assert.ok(b, k);
    return TP.trendScene(b.prompt);
  };
  const line = (extra) => 'USER DIRECTION (follow it; it wins over the setting if it names a place): ' + extra + '.';
  for (const k of EDITED) {
    for (const people of [2, 3]) {
      const scene = sceneOf(k, people, ex80);
      assert.ok(scene.includes(line(ex80)), k + ' ×' + people + ': التوجيه في المشهد');
      assert.ok(TP.frameTask(people, scene).includes(line(ex80)), k + ' ×' + people + ': مقصوص من مهمّة المجموعة (' + scene.length + ')');
    }
    for (const extra of [ex80, ex400]) {
      const scene = sceneOf(k, 1, extra);
      assert.ok(scene.includes(line(extra)), k + ' ×1 (' + extra.length + '): التوجيه في المشهد');
      assert.ok(TP.soloFrameTask(scene, {}).includes(line(extra)), k + ' ×1 (' + extra.length + '): مقصوص من مهمّة الإطار (' + scene.length + ')');
      assert.ok(TP.soloFrameTask(scene, { closeup: true, people: 1, detail: true, single: true }).includes(line(extra)), k);
    }
  }
  /* الحالات المقيسة التي كانت تسقط كلّها: البطل الخارق وبطل الأكشن وفيلم الثمانينات بشخصين */
  for (const k of ['superhero', 'actionhero', 'lostfilm80s']) assert.ok(sceneOf(k, 2, ex80).length > 700, k + ': المشهد أطول من القصّ القديم');
});
