'use strict';
/* v-director-story (المالك ٢٨ أكتوبر بفيديو «قصة سعيد وعمّي بلال»: «انا طالب قصة… سوالي كانفا يعني التصميم زفت»):
   نوع «قصة» في «مخرج التطبيق» — القصّة كاملة بكلام المالك (حتّى ٣٠٠٠ حرف بدل ٦٠٠ قصّت قصّته عند «ويوم تخرّجه»)، تقسيم حرفيّ في
   الكود، والنموذج يكتب الصورة وحدها (عنوان وشخصيّات ثابتة ولقطة لكلّ مقطع)؛ بلا شاشات تطبيق ولا دعوة تحميل ولا ملاحظات إخراج
   على الشاشة؛ صورة كلّ مشهد من لقطته 16:9 بلا كتابة، وسطر الراوي ترجمةً فوقها؛ والوقفة «..» تبقى وقفة بسرعة عاديّة. */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const D = require(path.join(root, 'api/_lib/app-director.js')).__test;

/* قصّة المالك نفسها (١٢٣٠ حرفًا تقريبًا) */
const STORY = `ل صبح، قبل لا يدق جرس المدرسة، كان سعيد يوقف عند كشك صغير على طرف الفريج. ريحة الهيل توصلك قبل لا توصل الكشك، وعمّي بلال واقف ورا الدلّة، يبتسم نفس الابتسامة كل يوم.

سعيد عمره عشر سنين، وأبوه متوفي من سنة. في مخباته درهم واحد بس، والكرك بدرهمين.

أول يوم مد الدرهم وهو مستحي، وقال: «عمّي.. ما عندي غير هذا.»
بلال صب له الفنيال لين فوق، وقال: «الباقي بعدين، يا ولدي.»

ومرت الأيام. سعيد كل يوم يعطيه درهم، وبلال كل يوم يرد بنفس الكلمة: «الباقي بعدين.»

كبر سعيد. خلص المدرسة، وسافر يدرس برّع. وكل ما رد في الإجازة، يمر على الكشك. بلال شاب راسه، والدلّة نفسها، والكلمة نفسها.

ويوم تخرّجه، لبس سعيد كندورته اليديدة، وحط في ظرف كل اللي عليه. حسبها زين: عشر سنين، كل يوم درهم. ومشى صوب الكشك وقلبه يدق.

مد الظرف وقال: «عمّي بلال، الحين وقت الباقي.»

بلال طالع الظرف وايد، وما مد إيده. فتح درج تحت الطاولة، وطلّع ورقة قديمة صفرا، مطوية أربع طيات.

«أبوك، الله يرحمه، ياني قبل لا يتوفى بشهر. دفع لي الدرهم الثاني عن كل فنيال لك، عشر سنين قدّام. وقال لي: خله يدفع اللي يقدر عليه.. ولا تخليه يحس إنه ناقصه شي.»

سعيد ما قدر يتكلم. فتح الورقة، ولقى خط أبوه:
«الدرهم الثاني عليّ.. كل صبح.»

بلال صب له فنيال، وحطه جدامه، وقال وهو يبتسم:
«الحين.. الباقي عليك انته.»

وثاني يوم، كان فيه ولد صغير واقف جدام الكشك، في إيده درهم واحد.. وسعيد واقف وراه.`;

test('١. التقسيم حرفيّ: المقاطع مربوطةً بمسافة = القصّة نفسها كاملةً حتّى نهايتها، و«..» لا تقطع، والتنصيص يبقى مع جملته', () => {
  assert.ok(STORY.length > 600, 'القصّة أطول من حدّ «عرض التطبيق» القديم');
  const chunks = D.splitStory(STORY);
  assert.equal(chunks.join(' '), D.storyText(STORY).replace(/\n/g, ' '), 'لا حرف ناقص ولا زائد');
  assert.ok(chunks.some((c) => c.includes('«الحين.. الباقي عليك انته.»')), 'النهاية وصلت (كانت تُقصّ عند ٦٠٠ حرف)');
  assert.ok(chunks[chunks.length - 1].endsWith('وسعيد واقف وراه.'));
  assert.ok(chunks.some((c) => c === 'أول يوم مد الدرهم وهو مستحي، وقال: «عمّي.. ما عندي غير هذا.»'), '«..» داخل الجملة وقفة لا نهاية');
  for (const c of chunks) {
    assert.ok(c.split(/\s+/).length <= 30, 'المقطع ≤ ٣٠ كلمة: ' + c);
    assert.ok(!/^[»"”]/.test(c), 'لا مقطع يبدأ بعلامة تنصيص ختاميّة: ' + c);
  }
  assert.ok(chunks.length >= 12 && chunks.length <= 40, 'عدد المشاهد معقول: ' + chunks.length);
});

test('٢. الحدّ ٣٠٠٠ حرف، والجملة الطويلة بلا نقاط تُقسم عند الفواصل ثمّ بالكلمات بلا فقد', () => {
  assert.equal(D.MAX_STORY, 3000);
  assert.equal(D.storyText('أ'.repeat(5000)).length, 3000);
  const long = Array.from({ length: 70 }, (_, i) => 'كلمة' + i).join(' ') + '، ' + Array.from({ length: 12 }, (_, i) => 'تتمة' + i).join(' ');
  const c = D.splitStory(long);
  assert.equal(c.join(' '), long);
  assert.ok(c.length >= 3 && c.every((x) => x.split(' ').length <= 30));
});

test('٣. موجّه القصّة: مخرج أفلام لا مسوّق — بلا كتالوج ولا شاشات ولا دعوة تحميل، والنصّ كلّه مرقّمًا، واللقطات بعدد المقاطع', () => {
  const chunks = D.splitStory(STORY);
  const p = D.buildStoryPrompt({ chunks, lang: 'ar' });
  chunks.forEach((c, i) => assert.ok(p.includes((i + 1) + ') ' + c), 'المقطع ' + (i + 1) + ' في الموجّه'));
  assert.ok(p.includes('"shots"') && p.includes('بالضبط (' + chunks.length + ')'));
  assert.doesNotMatch(p, /كتالوج|catalog|screen|style_sample|PORTRAIT/i);
  assert.match(D.STORY_SYSTEM, /حرفيًّا/);
  assert.match(D.STORY_SYSTEM, /لا إعلان ولا تطبيق ولا دعوة/);
  assert.doesNotMatch(D.STORY_SYSTEM, /تسويق|om ai|خطّاف/);
  assert.match(D.STORY_SYSTEM, /لا كتابة ولا حروف/, 'قاعدة المالك: لا نصّ داخل صورة مولّدة');
});

test('٤. التطبيع: سرد المقاطع لا ما أعاد النموذج صياغته، وبطاقة العنوان أوّلًا بلا عنوان فرعيّ، ونموذج أسقط أغلب اللقطات يُعاد', () => {
  const chunks = D.splitStory(STORY);
  const shots = chunks.map((c, i) => ({ i: i + 1, visual: 'Saeed at the kiosk shot ' + (i + 1), narration: 'نصّ مختلف أعاد النموذج كتابته' }));
  const plan = D.normalizeStory({ title: 'قصة سعيد وعمّي بلال', style: 'cinematic photorealistic, warm light', characters: [{ name: 'Saeed (10)', look: 'Emirati boy, white kandura' }], shots }, chunks);
  assert.ok(plan && plan.kind === 'story');
  assert.equal(plan.scenes[0].type, 'title');
  assert.equal(plan.scenes[0].highlight, '', 'لا ملاحظة إخراج تُطبع تحت العنوان');
  const st = plan.scenes.slice(1);
  assert.equal(st.length, chunks.length);
  assert.ok(st.every((s, i) => s.type === 'story' && s.narration === chunks[i] && s.visual === 'Saeed at the kiosk shot ' + (i + 1)));
  assert.ok(!plan.scenes.some((s) => s.type === 'screen' || s.type === 'style_sample'), 'لا شاشات تطبيق ولا أنماط في القصّة');
  assert.equal(plan.characters[0].name, 'Saeed (10)');
  assert.equal(D.normalizeStory({ title: 'x', shots: shots.slice(0, 3) }, chunks), null, 'أقلّ من ٦٠٪ من اللقطات = إعادة');
  assert.equal(D.normalizeStory({ title: 'x' }, chunks), null);
});

test('٥. الإجراء: kind=story يمرّ بموجّه القصّة وتعليماته، ويعيد خطّة حرفيّة بلا كتالوج؛ و«عرض التطبيق» كما كان بحدّ ٦٠٠', async () => {
  const ownerPath = require.resolve(path.join(root, 'api/_lib/_owner.js'));
  const dirPath = require.resolve(path.join(root, 'api/_lib/app-director.js'));
  const savedOwner = require.cache[ownerPath];
  const realOwner = require(ownerPath);
  require.cache[ownerPath] = { id: ownerPath, filename: ownerPath, loaded: true, exports: Object.assign({}, realOwner, { isOwnerSession: () => true }) };
  delete require.cache[dirPath]; /* الوحدة تأخذ isOwnerSession عند التحميل — تُحمَّل من جديد على البديل */
  const handler = require(dirPath);
  const savedKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'gk';
  const realFetch = global.fetch;
  const seen = [];
  global.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    seen.push({ system: b.systemInstruction.parts[0].text, prompt: b.contents[0].parts[0].text });
    const chunks = D.splitStory(STORY);
    const text = JSON.stringify({ title: 'قصة سعيد', style: 'cinematic', characters: [{ name: 'Saeed (10)', look: 'boy' }], shots: chunks.map((c, i) => ({ i: i + 1, visual: 'shot ' + (i + 1) })) });
    return Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', query: { action: 'app-director-plan' }, body: { kind: 'story', request: STORY, lang: 'ar', speaker: 'male', token: 't' } }, res);
  } finally {
    global.fetch = realFetch;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey;
    if (savedOwner) require.cache[ownerPath] = savedOwner; else delete require.cache[ownerPath];
    delete require.cache[dirPath];
  }
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.kind, 'story');
  assert.equal(res.body.catalog, undefined, 'لا كتالوج للقصّة');
  assert.equal(seen[0].system, D.STORY_SYSTEM);
  assert.ok(seen[0].prompt.includes('«الحين.. الباقي عليك انته.»'), 'القصّة كاملةً وصلت النموذج');
  const narr = res.body.plan.scenes.filter((s) => s.type === 'story').map((s) => s.narration).join(' ');
  assert.equal(narr, D.storyText(STORY).replace(/\n/g, ' '));
});

test('٦. الواجهة: خيار «النوع» (عرض التطبيق/قصة) بحدّ ٣٠٠٠ للقصّة، وبلا مدّة ولا صورة مرجع، وخطوتا الرسم والتجهيز', () => {
  const js = read('js/video.js');
  assert.ok(js.includes('<label class="vmk-dir-kind"><span></span><select id="vdKind"><option value="app"></option><option value="story"></option></select></label>'));
  assert.ok(js.includes("rq.placeholder=story?L('vdPhStory'):L('vdPh');") && js.includes('<textarea id="vdReq" rows="3" maxlength="3000"></textarea>'), 'الحقل ٣٠٠٠ في النوعين — لصق قصّة قبل اختيار «قصة» لا يُقصّ');
  assert.ok(js.includes("if(!drStory()&&req.length>600){ drMsg(L('vdTooLong'),true); return; }"), '«عرض التطبيق» الطويل تنبيه لا قصّ صامت');
  assert.ok(js.includes("box.querySelector('#vdMin').disabled=story; box.querySelector('.vmk-dir-ref').hidden=story;"));
  assert.ok(js.includes("shots:story?'vdStepFrames':'vdStepShots',samples:story?'vdStepDraw':'vdStepSamples'"));
  assert.ok(js.includes("if(story) base.kind='story';"));
  const css = read('css/modules.css');
  assert.ok(css.includes('#videoMakerModal .vmk-dir-row .vmk-dir-kind{order:-1}'), '«النوع» أوّل الصفّ بصريًّا');
  assert.ok(css.includes('#videoMakerModal .vmk-dir-ref[hidden]{display:none}'), 'صورة المرجع تختفي فعلًا (display:flex كان يغلب hidden)');
  assert.ok(js.includes("textContent=drStory()?L('vdSubStory'):L('vdSub');"), 'وصف القصّة لا «يصوّر شاشات التطبيق»');
});

test('٧. مشاهد القصّة: صورة من لقطتها بمسار الصور (16:9، بلا كتابة، بالشخصيّات الثابتة) لا أنماط ولا صورة مرجع، وتُملأ الإطار بسطر الراوي، والفاشل بطاقة لا شاشة', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("if(story){ if(o.type==='title') o.sub=''; if(o.type==='story'){ o.prompt=drStoryPrompt(plan,sc.visual||sc.narration); o.cap=o.narration; } }"));
  assert.ok(js.includes("'Cinematic 16:9 film still. Shot: '") && js.includes('Clean frame with no writing, no signage and no watermark.'));
  assert.ok(js.includes("' Characters (same faces, ages and clothes in every shot): '"));
  assert.ok(js.includes("r=s.type==='story'?await drJson('/api/media?action=maha-image',{prompt:s.prompt,"), 'القصّة لا تمرّ بالأنماط ولا بصورة المرجع');
  assert.ok(js.includes("if(s.type==='story'){ var sf=await drStoryFrame(s.image,s.mime,s.cap,capDir);"));
  const frame = js.slice(js.indexOf('function drStoryFrame('), js.indexOf('function drStoryPrompt('));
  assert.ok(frame.includes('var k=Math.max(W/img.width,H/img.height)'), 'قصّ يملأ الإطار لا تمطيط');
  assert.ok(!frame.includes('slice(0,3)') && frame.includes("if(lines.length<=3||fs<=30) break; fs-=2;"), 'الخطّ يصغر ولا يسقط سطر');
  const wrapSrc = js.slice(js.indexOf('function drWrap('), js.indexOf('function drCaptionSample('));
  const drWrap = new Function(wrapSrc + '\nreturn drWrap;')();
  const ctx = { measureText: (t) => ({ width: Array.from(t).length * 10 }) };
  assert.ok(drWrap(ctx, '从前有一个小男孩他每天早上都去学校他在路上会经过一个小摊', 100).length >= 3, 'الصينيّة تلتفّ بالحروف');
  assert.equal(drWrap(ctx, 'كلمةطويلةجداجداجدا', 50).length, 1, 'الكلمة العربيّة الطويلة تبقى كاملة');
  assert.doesNotMatch(frame, /blur|arcTo|strokeStyle/, 'بلا خلفيّة مموّهة ولا كبسولة ذهبيّة');
  assert.ok(js.includes("} else if(s.type==='story'){ failed++; s.type='title'; s.text=plan.title; s.sub=s.narration; s.image=''; }"));
  assert.ok(js.includes("drT(story?'vdWarnDraw':'vdWarnSamples',{n:failed})"));
  assert.ok(js.includes("type:(s.type==='story'?'style_sample':s.type)"), 'الجسر يستلم المشهد صورةً جاهزة');
});

test('٨. صوت القصّة: سرعة عاديّة، و«..»/«…» فاصلة تُبقي وقفة الراوي بدل أن تُحذف', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("var vvSpeed=function(){ if(story) return 'normal';"));
  assert.ok(js.includes("var vvClean=function(t){ if(story) t=String(t).replace(/\\s*(?:\\.{2,}|…)\\s*/g,'، ');"));
  const re = /\s*(?:\.{2,}|…)\s*/g;
  assert.equal('عمّي.. ما عندي'.replace(re, '، '), 'عمّي، ما عندي');
});

test('٩. «عرض التطبيق»: highlight عنوان فرعيّ للمشاهد لا ملاحظة إخراج (كانت «عنوان القصة بتصميم جذاب» تُطبع على البطاقة)', () => {
  const D2 = require(path.join(root, 'api/_lib/app-director.js')).__test;
  const p = D2.buildPrompt({ request: 'فيديو عن التطبيق', lang: 'ar', speaker: 'female', minutes: 2, catalogText: '…' });
  assert.ok(p.includes('"highlight":"عنوان فرعيّ قصير يراه المشاهد تحت بطاقة العنوان — جملة للمشاهد لا ملاحظة إخراج"'));
  assert.doesNotMatch(p, /ما يُبرَز في هذا المشهد/);
});

test('١٠. النصوص التسعة بالـ١٤ لغة، والوسوم مرفوعة', () => {
  const KEYS = ['vdKind', 'vdKindApp', 'vdKindStory', 'vdSubStory', 'vdTooLong', 'vdPhStory', 'vdStepDraw', 'vdStepFrames', 'vdWarnDraw'];
  const base = read('js/app-03-i18n-data.js');
  for (const k of KEYS) assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k + ' بالعربيّة والإنجليزيّة');
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const src = read('i18n/' + lg + '.js');
    const line = src.split('\n').find((l) => l.includes('v-director-story'));
    assert.ok(line, lg + ': سطر القصّة');
    for (const k of KEYS) assert.ok(line.includes('"' + k + '":'), lg + ': ' + k);
    assert.ok(line.includes('{n}'), lg + ': العدد في تنبيه الرسم');
  }
  for (const k of KEYS) assert.doesNotMatch(base.match(new RegExp(k + ': "([^"]*)"'))[1], /claude|gemini|gpt|grok|flux/i, 'بلا اسم مزوّد');
  const tags = read('js/app-04-i18n-state.js');
  assert.match(tags, /v-director-story \(778\)/);
  const h = read('index.html');
  const vv = Number((h.match(/\/js\/video\.js\?v=(\d+)/) || [])[1]);
  assert.ok(vv >= 463, 'وسم video.js مرفوع');
});

test('١١. مراجعة: التنصيص لا يتكرّر، و3.5 وU.S. لا تُقطعان، والحوار القصير لا يُقصّ بعد ٨٩ مشهدًا، والصينيّة والهنديّة تُقسمان عند نهايات جملها', () => {
  for (const c of ['سألته: «وين رايح؟»، فما رد.', 'قال: «ليش؟». ثم سكت.', 'قال لها: «تعال بسرعة.»، ثمّ مشى', "the U.S.'s envoy", '(wow!), really', 'السعر 3.5 درهم. تمام.']) {
    assert.equal(D.splitStory(c).join(' '), D.storyText(c), c);
  }
  const dlg = Array.from({ length: 120 }, (_, i) => (i % 2 ? '«نعم.»' : 'قال: «هل أنت بخير؟»')).join('\n');
  const c2 = D.splitStory(dlg);
  assert.ok(c2.length <= 89);
  assert.equal(c2.join(' '), D.storyText(dlg).replace(/\n/g, ' '), 'لا يسقط سطر من الحوار');
  const lines = Array.from({ length: 200 }, (_, i) => 'سطر ' + i + '.').join('\n');
  const c3 = D.splitStory(lines);
  assert.ok(c3.length <= 89 && c3[c3.length - 1].endsWith('سطر 199.'));
  const zh = '从前有一个小男孩，他每天早上都去学校。他在路上会经过一个小摊。摊主是一位和蔼的老人！老人总是笑着给他一杯茶。'.repeat(8);
  const c4 = D.splitStory(zh);
  assert.ok(c4.length >= 6 && c4.every((x) => Array.from(x).length <= 70), 'الصينيّة مشاهد قصيرة لا مشهد واحد');
  assert.equal(c4.join('').replace(/\s/g, ''), zh);
  const hi = 'एक समय की बात है, एक छोटा लड़का रोज़ स्कूल जाता था। रास्ते में एक छोटी दुकान थी। '.repeat(10);
  const c5 = D.splitStory(hi);
  assert.ok(c5.every((x) => x.endsWith('।')), 'الهنديّة تُقطع عند ।');
  assert.ok(D.splitStory('وصل۔ پھر چلا گیا۔ '.repeat(20)).every((x) => x.endsWith('۔')), 'الأورديّة عند ۔');
});

test('١٢. مراجعة: لقطات مرقّمة من الصفر لا تُزاح مقطعًا، وأمر الصورة تحت ١٨٠٠ حرف واللقطة أوّله، وبلا كلمات تحوّله لمسار الكتابة، و16:9', () => {
  const chunks = D.splitStory(STORY);
  const plan = D.normalizeStory({ title: 't', shots: chunks.map((c, i) => ({ i, visual: 'v' + (i + 1) })) }, chunks);
  assert.ok(plan.scenes.slice(1).every((s, i) => s.visual === 'v' + (i + 1)));
  const js = read('js/video.js');
  const grab = (name) => { const i = js.indexOf('function ' + name + '('); let d = 0; for (let k = js.indexOf('{', i); k < js.length; k++) { if (js[k] === '{') d++; else if (js[k] === '}' && --d === 0) return js.slice(i, k + 1); } return ''; };
  const build = new Function(grab('drStoryNeutral') + '\n' + grab('drStoryPrompt') + '\nreturn drStoryPrompt;')();
  const cast = Array.from({ length: 8 }, (_, i) => ({ name: 'Person' + i + ' (30)', look: 'x'.repeat(300) }));
  const visual = 'Person7 hands one coin to the old man at the kiosk, phone screen glowing, menu board behind, early morning light, close-up.';
  const p = build({ style: 'cinematic photoreal, app-like clean text', characters: cast }, visual);
  assert.ok(p.length <= 1800, 'تحت حدّ مسار الصور');
  assert.ok(p.startsWith('Cinematic 16:9 film still. Shot: Person7 hands one coin'), 'اللقطة أوّل الأمر');
  assert.ok(p.includes('Person7 (30)'), 'الشخصيّة المذكورة في اللقطة قبل غيرها');
  const maha = read('api/_lib/maha-image.js');
  const cue = new RegExp(maha.match(/const __textCueRe = \/(.+)\/i;/)[1], 'i');
  assert.doesNotMatch(p, cue, 'لا يذهب لمسار الكتابة بمقاس آخر');
  assert.match(p, /16\s*[:x]\s*9/, 'مسار الصور يختار 16:9');
});

console.log('✓ app-director-story: القصّة حرفيّة كاملة، بلا إعلان ولا ملاحظات، صور مشاهدها من لقطاتها، ووقفات الراوي باقية');
