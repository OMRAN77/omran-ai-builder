// tests/video-photo-identity.test.cjs — v-video-photo-identity (المالك: «الفيديوات عامّة تغيّر الأشكال… مش
// ترندات، في الفيديوات العاديّة — المستخدم غير مستفيد»). فحص شامل مُتحقَّق منه (قراءة كلّ مسار + مدقّق يحاول
// الدحض) وجد أسبابًا في الكود قبل أيّ حدّ للمحرّك: صورة الجوّال الطوليّة تُقصّ من وسطها إلى فيديو عرضيّ
// فيضيع الرأس؛ وضع الدمج لا يرسل الصورة أصلًا؛ تبديل الوضع يمسحها؛ ٧٦٨ بكسل؛ أمر Runway يطلب إعادة تأطير
// ويقصّ لاحقته؛ الاقتصاديّ بلا قفل؛ السينمائيّ لا يسمّي دور الصورة؛ قفل ترندات الأشخاص يُقصّ دائمًا؛
// والمحادثة ترمي كلام المستخدم. هنا تُنفَّذ الدوالّ والمعالجات الحقيقيّة ويُفحص الطلب المُرسَل فعلًا.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const VIDEO = read('js/app-11-video.js');
const ATTACH = read('js/app-09-attach.js');
const AGENT = read('js/app-17-agent-tools.js');

function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a >= 0, 'بداية الكتلة: ' + startNeedle);
  const braceStart = source.indexOf('{', a);
  let depth = 0, i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.equal(depth, 0, 'قوس المطابقة لم يُغلق: ' + startNeedle);
  return source.slice(a, i + 1);
}

/* يركّب بدائل في require.cache لوحدات الاعتماد، يشغّل المعالج الحقيقيّ، ويعيد كلّ شيء كما كان. */
async function runHandler(modRel, stubs, body, fetchImpl) {
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) {
    const p = require.resolve(path.join(root, rel));
    saved[p] = require.cache[p];
    require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
  }
  const hp = require.resolve(path.join(root, modRel));
  delete require.cache[hp];
  const handler = require(hp);
  const realFetch = global.fetch;
  global.fetch = fetchImpl;
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
  }
  return res;
}
const PHOTO = Buffer.from('fake-jpeg-bytes-'.repeat(8)).toString('base64');
const ownerUsage = { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => ({ allowed: true, username: 'omran' }), consumeVideo: async () => 3 };
const noJob = { rememberVideoJob: async () => true, settleVideoJob: async () => null };

test('١. Runway مع صورة: مرساة هويّة أوّلًا وقفل أخيرًا ولاحقة الأسلوب كاملة داخل ١٠٠٠ — بلا أمر إعادة تأطير', () => {
  const V = require('../api/_lib/video-create.js');
  const long = 'يمشي في دبي بين الأبراج '.repeat(120);
  const p = V.buildRunwayPrompt(long, 'realistic', true);
  assert.ok(p.length <= 1000, 'تجاوز حدّ Runway: ' + p.length);
  assert.match(p, /^The opening frame is a real photo of a real person\. Keep this exact person/);
  assert.match(p, /no CGI characters\. IDENTITY \(mandatory\): it is this same person from the photo throughout, never a different or generic face\.$/, 'اللاحقة كاملة ثمّ القفل آخر ما يُقرأ');
  assert.doesNotMatch(p, /medium shot|CENTER of the frame|same framing/i, 'أمر إعادة تأطير يعاكس الإطار الأوّل');
  // الأنمي مع صورة: هويّة قابلة للتعرّف مع الأسلوب — لا «EXACT… UNCHANGED» مع «NOT photographic»
  const a = V.buildRunwayPrompt('يرقص في حفلة', 'anime', true);
  assert.match(a, /Keep them clearly recognizable/);
  assert.doesNotMatch(a, /EXACT|UNCHANGED/);
  assert.match(a, /NOT photographic\. IDENTITY \(mandatory\)/);
  // بلا صورة: السلوك القديم حرفيًّا (الوصف ثمّ اللاحقة، ١٠٠٠)
  const t = V.buildRunwayPrompt(long, 'realistic', false);
  assert.ok(t.length <= 1000);
  assert.doesNotMatch(t, /IDENTITY|opening frame/);
  assert.match(t, /^يمشي في دبي/);
  assert.match(t, /no CGI characters$/);
});

test('٢. Runway: المعالج الحقيقيّ يرسل الصورة إطارًا أوّل بأمر الباني نفسه', async () => {
  let sent = null, url = '';
  const res = await runHandler('api/_lib/video-create.js', {
    'api/_lib/_videoUsage.js': ownerUsage,
    'api/_lib/runway-keys.js': { pickKey: () => ({ key: 'k', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' },
    'api/_lib/points.js': { isOwnerUsername: () => true, COSTS: { runway_video: 55 } },
    'api/_lib/video-job.js': noJob,
  }, { promptText: 'يلوّح للكاميرا', ratio: '720:1280', style: 'realistic', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' },
  async (u, o) => { url = String(u); sent = JSON.parse(o.body); return { ok: true, json: async () => ({ id: 'task1' }) }; });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.match(url, /\/v1\/image_to_video$/);
  assert.equal(sent.ratio, '720:1280');
  assert.equal(sent.promptImage, 'data:image/jpeg;base64,' + PHOTO);
  assert.equal(sent.promptText, require('../api/_lib/video-create.js').buildRunwayPrompt('يلوّح للكاميرا', 'realistic', true));
});

test('٣. الاقتصاديّ مع صورة: قفل الهويّة يصل في الطلب الفعليّ (كان الوصف الخام وحده)', async () => {
  process.env.MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || 'test-key';
  let sent = null;
  const res = await runHandler('api/_lib/minimax-create.js', {
    'api/_lib/_videoUsage.js': ownerUsage, 'api/_lib/video-job.js': noJob,
  }, { promptText: 'يركض على الشاطئ', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' },
  async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ task_id: 'm1', base_resp: { status_code: 0 } }) }; });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(sent.first_frame_image, 'data:image/jpeg;base64,' + PHOTO);
  assert.match(sent.prompt, /^MAIN CHARACTER: the real person in the attached reference photo/);
  assert.match(sent.prompt, /يركض على الشاطئ/);
  assert.match(sent.prompt, /IDENTITY \(mandatory\)[^]*recognize them instantly\.$/);
  // بلا صورة: الوصف كما هو
  let plain = null;
  await runHandler('api/_lib/minimax-create.js', { 'api/_lib/_videoUsage.js': ownerUsage, 'api/_lib/video-job.js': noJob },
    { promptText: 'غروب فوق البحر', token: 't' },
    async (u, o) => { plain = JSON.parse(o.body); return { ok: true, json: async () => ({ task_id: 'm2', base_resp: { status_code: 0 } }) }; });
  assert.equal(plain.prompt, 'غروب فوق البحر');
});

test('٤. السينمائيّ مع صورة: الصورة مسمّاة بوسمها <IMAGE_REF_0> داخل النصّ (بلا وسم يقرّر المحرّك دورها)', async () => {
  const saved = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test-key';
  let sent = null;
  await runHandler('api/_lib/omni-create.js', { 'api/_lib/_videoUsage.js': ownerUsage, 'api/_lib/video-job.js': noJob },
    { promptText: 'على سفينة حربيّة ثمّ في غرفة القيادة', token: 't', imageBase64: PHOTO, imageMime: 'image/jpeg' },
    async (u, o) => { sent = JSON.parse(o.body); throw new Error('stop-after-capture'); });
  if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved;
  assert.ok(sent && Array.isArray(sent.input), 'لم يُلتقط الطلب');
  assert.equal(sent.input[0].type, 'image', 'الصورة أوّل عنصر = IMAGE_REF_0');
  const txt = sent.input.find((x) => x.type === 'text').text;
  assert.match(txt, /^MAIN CHARACTER: the real person in the reference image <IMAGE_REF_0> — keep their exact face/);
  assert.match(txt, /IDENTITY \(mandatory\)/);
  // الافتراضيّ للآخرين بلا تغيير
  const { withIdentityLock } = require('../api/_lib/video-trends.js');
  assert.match(withIdentityLock('x', 1500), /^MAIN CHARACTER: the real person in the attached reference photo/);
});

test('٥. ترندات الأشخاص: قفل «الإطار الأوّل يُظهر كلّ شخص… لا تحوّل مرّة ثانية» لا يُقصّ بعد الآن', () => {
  const T = require('../api/_lib/video-trends.js');
  const { VEO_PROMPT_MAX } = require('../api/_lib/veo-create.js');
  const src = read('api/_lib/veo-create.js');
  const m = src.match(/promptText \+= ' The attached first frame ALREADY[^;]*;/);
  assert.ok(m, 'جملة القفل في veo-create');
  const suffix = eval(m[0].replace(/^promptText \+= /, '').replace(/;$/, ''));
  let max = 0, n = 0;
  const long = 'ا'.repeat(240);
  for (const k of Object.keys(T.TRENDS)) for (const people of [2, 3]) for (const txt of ['', 'Ali', long]) {
    const b = T.buildTrendPrompt(k, { hasImage: true, people, name: txt, text: txt });
    if (!b) continue; n++;
    max = Math.max(max, (b.prompt + suffix).length);
  }
  assert.ok(n > 300, 'عدد المتغيّرات');
  assert.ok(max <= VEO_PROMPT_MAX, 'أطول أمر ' + max + ' يتجاوز الحدّ ' + VEO_PROMPT_MAX);
  assert.ok(VEO_PROMPT_MAX <= 3000, 'يبقى تحت حدّ المحرّك (١٠٢٤ رمزًا)');
  assert.match(src, /String\(promptText\)\.trim\(\)\.slice\(0, VEO_PROMPT_MAX\)/);
});

/* ── الواجهة: تُنفَّذ الدوالّ الحقيقيّة من app-11-video.js ── */
function heroSandbox() {
  const events = [];
  const ctx = {
    ratioEl: { value: '1280:720', dispatchEvent(e) { events.push(e.type); } },
    Event: function (type) { this.type = type; },
    Image: function () {},
  };
  vm.runInNewContext([
    extractBlock(VIDEO, 'function heroRatioFor(w, h){'),
    extractBlock(VIDEO, 'function applyHeroRatio(w, h){'),
    'this.heroRatioFor = heroRatioFor; this.applyHeroRatio = applyHeroRatio;',
  ].join('\n'), ctx);
  return { ctx, events };
}

test('٦. نسبة الفيديو تتبع اتّجاه الصورة: الطوليّة والمربّعة ⇒ ٩:١٦، والعرضيّة ⇒ ١٦:٩ (لا قصّ للرأس)', () => {
  const { ctx, events } = heroSandbox();
  assert.equal(ctx.heroRatioFor(1050, 1400), '720:1280', 'صورة جوّال ٣:٤');
  assert.equal(ctx.heroRatioFor(1000, 1000), '720:1280', 'مربّعة — القصّ من الجانبين لا من الرأس');
  assert.equal(ctx.heroRatioFor(1400, 788), '1280:720', 'عرضيّة');
  ctx.applyHeroRatio(1050, 1400);
  assert.equal(ctx.ratioEl.value, '720:1280');
  assert.deepEqual(events, ['change'], 'حبّات العرض تتزامن');
  ctx.applyHeroRatio(900, 1600);
  assert.deepEqual(events, ['change'], 'لا حدث بلا تغيير');
  ctx.applyHeroRatio(0, 0);
  assert.equal(ctx.ratioEl.value, '720:1280', 'بلا أبعاد لا شيء');
  // التوصيل: عند الاختيار، والاستعادة من التخزين، والفتح من المحادثة
  assert.match(VIDEO, /const max = 1400;\n\s+let w = img\.width, h = img\.height;\n\s+applyHeroRatio\(w, h\);/);
  assert.match(VIDEO, /applyHeroRatioFromDataUrl\('data:' \+ savedMime \+ ';base64,' \+ savedB64\);/);
  assert.match(VIDEO, /applyHeroRatioFromDataUrl\(heroDataUrl\);/);
});

test('٧. تبديل الوضع لا يمسح الصورة المحفوظة، والخانة تُخفى في كانفا وحده', () => {
  const rows = { videoMakerHeroRow: { style: {} }, videoMakerHeroVeoNote: { style: {} } };
  let cleared = 0;
  const ctx = { document: { getElementById: (id) => rows[id] || null }, modeEl: { value: 'runway' }, window: { __clearFilmHero: () => { cleared++; } } };
  vm.runInNewContext(extractBlock(VIDEO, 'function syncFilmHeroRow(){') + '\nthis.sync = syncFilmHeroRow;', ctx);
  for (const [mode, shown] of [['canvas', 'none'], ['veo', 'block'], ['actor', 'block'], ['runway', 'block'], ['hybrid', 'block'], ['minimax', 'block'], ['omni', 'block']]) {
    ctx.modeEl.value = mode; ctx.sync();
    assert.equal(rows.videoMakerHeroRow.style.display, shown, mode);
    assert.equal(rows.videoMakerHeroVeoNote.style.display, 'none', mode + ': ملاحظة «لا يقبل صورًا» خاطئة');
  }
  assert.equal(cleared, 0, 'تبديل الوضع مسح صورة البطل');
});

test('٨. الصورة تصل كلّ محرّك في صانع الفيديو: الدمج والمحترف والممثّل والفيلم — وبلا أمر إعادة تأطير', () => {
  const hybrid = extractBlock(VIDEO, 'async function runHybrid(');
  assert.match(hybrid, /const mainUrl = await createSceneWithRetry\(text, style, seconds, ratio, token, false, \(attempt, max\) => \{[^]*?\}, filmHeroBase64, filmHeroMime\);/, 'وضع الدمج لا يرسل الصورة');
  assert.match(VIDEO, /async function createVeoScene\(prompt, sceneRatio, sceneToken, hq, heroB64, heroMime\)\{/);
  assert.match(VIDEO, /if\(heroB64\)\{ payload\.imageBase64 = heroB64;/);
  assert.match(VIDEO, /createVeoScene\(scenePromptWithHero, ratio, token, wantQuality, filmHeroBase64, filmHeroMime\)/, 'فيلم المحترف بلا صورة');
  assert.match(VIDEO, /if\(filmHeroBase64\)\{ veoPayload\.imageBase64 = filmHeroBase64;/, 'وضع المحترف/الممثّل بلا صورة');
  assert.match(VIDEO, /\(text \|\| \(filmHeroBase64 \? 'The real person in the reference photo' :/, 'الممثّل يخترع رجلًا رغم الصورة');
  assert.doesNotMatch(VIDEO, /Hero centered in frame/, 'أمر إعادة التأطير باقٍ');
  assert.doesNotMatch(VIDEO, /مدعومة مع Runway فقط/);
  // فشل حفظ صورة جديدة يمحو القديمة (وإلّا عاد شخص سابق بعد إعادة التحميل)
  assert.match(VIDEO, /v-video-photo-identity: ويُمحى المحفوظ القديم[^]*?localStorage\.removeItem\('omran_hero_b64'\)/);
});

test('٩. المحادثة: كلام المستخدم يبقى أمر الفيديو، والوصف الآليّ لـ«سوّ فيديو من الصورة» وحده', () => {
  const re = eval(ATTACH.match(/const __VID_FILLER = (\/.*\/i);/)[1]);
  const own = (t) => String(t).split(/[\s،,.!؟?()"'«»:؛\-]+/).filter((w) => w && !re.test(w)).join(' ');
  for (const t of ['سوي فيديو', 'سوي فيديو من هذي الصورة', 'ابغى فيديو من صورتي لو سمحت', 'make a video from this photo']) {
    assert.ok(own(t).length < 4, 'طلب بلا مضمون يجب أن يأخذ الوصف الآليّ: ' + t);
  }
  for (const t of ['سوي فيديو لي وأنا أمشي في دبي', 'سوي فيديو وهو يرقص', 'فيديو لي في الفضاء', 'make a video of me surfing']) {
    assert.ok(own(t).length >= 4, 'كلام المستخدم ضاع: ' + t);
  }
  assert.match(ATTACH, /if\(__heroAtt && __heroAtt\.dataUrl && __vidOwnWords\.length >= 4\)\{\n\s+window\.omranOpenVideoMaker\(text, __heroAtt\.dataUrl/);
  // المسار المباشر «حرّكها»: النسبة من اتّجاه الصورة لا عرضيّة ثابتة
  assert.match(ATTACH, /__vp\.ratio = \(__im\.height >= __im\.width\) \? '720:1280' : '1280:720';/);
  // أداة الوكيل: بلا نسبة صريحة ⇒ من الصورة المرجعيّة
  assert.match(AGENT, /if \(!trendMeta && !vr && ref && ref\.dataUrl\) \{/);
  assert.match(AGENT, /ratio = dims\.h >= dims\.w \? '720:1280' : '1280:720';/);
});

test('١٠. الحزمة مبنيّة من الأجزاء', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes('function heroRatioFor(w, h){'), 'app-11-video');
  assert.ok(b.includes('const __VID_FILLER = '), 'app-09-attach');
  assert.ok(b.includes('if (!trendMeta && !vr && ref && ref.dataUrl) {'), 'app-17-agent-tools');
});

console.log('✓ video-photo-identity: الصورة تصل كلّ محرّك دون قصّ للرأس، وأقفال الهويّة تصل الطلب الفعليّ كاملة');
