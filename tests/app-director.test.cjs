// tests/app-director.test.cjs — v-app-director: «مخرج التطبيق» (المرحلة ١) للمالك وحده.
// المالك: «سوّ لي أو عطني فكرة فيديو عن أنماط الصور ويعطيني فيديو عنه كامل… فيديو عن التطبيق ١٠ دقائق مع مها أو عبدالله وبأيّ لغة»،
// «نفس مكان الفيديوهات، مخرج التطبيق، بدون أيقونات، فقط للمالك»، «ليس كلاود».
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-app-director-0000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const CAT = require('../api/_lib/app-catalog.js');
const handler = require('../api/_lib/app-director.js');
const D = handler.__test;
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
const KEYS = ['vdTab', 'vdSub', 'vdPh', 'vdLang', 'vdSpeaker', 'vdMinutes', 'vdRef', 'vdGo', 'vdStepPlan', 'vdStepShots', 'vdStepSamples', 'vdStepVoice', 'vdStepJoin', 'vdScene', 'vdQueued', 'vdDone', 'vdDownload', 'vdFail', 'vdFailPlan', 'vdFailBridge', 'vdFailRender', 'vdSaved', 'vdWarnSamples', 'vdEmpty', 'vdMaha', 'vdAbdullah'];
const BANNED = /Veo|Runway|Gemini|ChatGPT|gpt-image|Google|جوجل|جيمناي|Claude|كلود|Groq|DeepSeek|Azure|OpenAI/i;

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
function ownerToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + 3600000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}

test('١. الموجّهان مسجّلان في api/ai.js (لا ملفّ جديد في api/ — حدّ الاثنتي عشرة دالّة)', () => {
  const ai = read('api/ai.js');
  assert.ok(ai.includes("case 'app-director-plan':") && ai.includes("case 'app-director-token': return require('./_lib/app-director.js');"));
  assert.ok(!fs.existsSync(path.join(root, 'api/app-director.js')));
});

test('٢. غير المالك ٤٠٣ قبل أيّ نداء، والطريقة POST وحدها', async () => {
  for (const action of ['app-director-plan', 'app-director-token']) {
    let r = res();
    await handler({ method: 'POST', query: { action }, body: { token: ownerToken('sara'), request: 'x' } }, r);
    assert.equal(r.code, 403, action + ' غير المالك');
    assert.equal(r.body.error, 'owner_only');
    r = res();
    await handler({ method: 'POST', query: { action }, body: { request: 'x' } }, r);
    assert.equal(r.code, 403, action + ' بلا رمز');
    r = res();
    await handler({ method: 'GET', query: { action }, body: {} }, r);
    assert.equal(r.code, 405);
  }
});

test('٣. كتالوج التطبيق مشتقّ من مكتبات الأنماط ويحوي الميزات الأساسيّة والشاشات بخطوات فتحها', () => {
  const c = CAT.buildCatalog({ lang: 'ar' });
  const P = require('../api/_lib/portrait-style.js');
  assert.equal(c.portraitStyles.length, Object.keys(P.STYLE_PROMPTS).length, 'كلّ أنماط الصور من portrait-style.js');
  assert.ok(c.portraitStyles.some((s) => s.key === 'ghibli') && c.portraitStyles.some((s) => s.key === 'sheikh'));
  assert.deepEqual(c.portraitTools, Object.keys(P.EDIT_PROMPTS));
  const T = require('../api/_lib/video-trends.js').TRENDS;
  assert.equal(c.trends.length, Object.keys(T).length, 'كلّ الترندات من video-trends.js');
  assert.ok(c.trends.every((t) => t.key && t.engine && t.desc && !/\{/.test(t.desc)), 'وصف الترند بلا متغيّرات القالب');
  const S = require('../api/_lib/studio-styles.js');
  assert.deepEqual(c.studio.map((f) => f.key), Object.keys(S.STYLE_TEXT), 'ميزات الستوديو من studio-styles.js');
  assert.ok(c.studio.find((f) => f.key === 'hair').count >= 100, 'عدّ الخيارات من الكتالوج (١٠٠+)');
  const F = require('../api/_lib/fashion-variety.js');
  assert.deepEqual(c.fashion.categories.map((g) => g.key), Object.keys(F.CATALOG));
  assert.deepEqual(c.fashion.categories[0].styles, Object.keys(F.CATALOG.women));
  for (const id of ['home', 'video', 'portrait', 'studio', 'fashion', 'design', 'construction', 'maha', 'themes']) assert.ok(c.screens.some((s) => s.id === id), id);
  for (const s of c.screens) for (const st of s.steps) assert.ok(st.click || st.wait || st.vtab || st.settings || st.focus, s.id + ' خطوة معروفة');
  assert.ok(c.screens.every((s) => !s.steps.some((st) => st.click && CAT.PAUSED.includes(st.click.slice(1)))), 'الأدوات الموقوفة لا تُصوَّر');
  assert.equal(c.screens.find((s) => s.id === 'video').name, 'صانع الفيديو');
  assert.equal(CAT.buildCatalog({ lang: 'fr', labels: { videoMakerTitle: 'Créateur vidéo' } }).screens.find((s) => s.id === 'video').name, 'Créateur vidéo', 'الاسم من قاموس الواجهة باللغة المطلوبة');
  const txt = CAT.catalogText(c);
  assert.ok(txt.includes('PORTRAIT STYLES') && txt.includes('VIDEO TRENDS') && txt.includes('- ghibli → ') && txt.length > 8000 && txt.length < 60000);
  assert.ok(/لا كلود ولا جيمناي ولا GPT ولا جوجل/.test(D.SYSTEM) && /خطّاف/.test(D.SYSTEM) && /دعوة واضحة/.test(D.SYSTEM) && /جملة واحدة لكلّ فكرة/.test(D.SYSTEM));
});

/* مزوّد مزيّف مشترك: script(n, model) يعيد ردًّا، أو 'TIMEOUT' ليرمي مهلة؛ calls يسجّل النموذج ومستوى التفكير */
function fakeProvider(script) {
  const calls = [], bodies = [];
  const fetchImpl = async (url, init) => {
    const model = (String(url).match(/models\/([^:?]+)/) || [])[1] || 'LIST';
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push(model + (body && body.generationConfig.thinkingConfig ? '/' + body.generationConfig.thinkingConfig.thinkingLevel : ''));
    bodies.push(body);
    const r = script(calls.length, model);
    if (r === 'TIMEOUT') { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }
    return r;
  };
  return { calls, bodies, fetchImpl };
}
const reply = (status, text, msg) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => (status >= 400 ? { error: { message: msg || 'boom' } } : { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }) });
const planText = (n, extra) => JSON.stringify(Object.assign({ title: 'Tour', idea: 'Idea', scenes: Array.from({ length: n }, (_, i) => ({ type: i ? 'screen' : 'title', target: 'video', text: 't' + i, narration: 'n' + i, seconds: 8 })) }, extra || {}));
const ask = (p, opts) => D.requestPlan(Object.assign({ request: 'tour', lang: 'en', speaker: 'male', minutes: 1, catalog: CAT.buildCatalog({ lang: 'en' }), apiKey: 'k', env: {}, fetchImpl: p.fetchImpl, sleep: async () => {} }, opts || {}));

test('٤. طلب الخطّة بمزوّد مزيّف: JSON صالح يُطبَّع على الكتالوج، والفاسد يُعاد مرّة بتنبيه ثمّ ينتقل للنموذج التالي', async () => {
  const good = { title: 'Tour', idea: 'Idea', scenes: [
    { type: 'title', text: 'Welcome', narration: 'Hook', seconds: 4 },
    { type: 'screen', target: 'video', narration: 'Video maker', seconds: 9 },
    { type: 'style_sample', target: 'ghibli', narration: 'Ghibli', seconds: 8 },
    { type: 'style_sample', target: 'does-not-exist', narration: 'Unknown style → portrait screen' },
    { type: 'screen', target: 'nope', narration: 'Unknown screen → home', seconds: 99 },
    { type: 'weird', narration: '' },
  ] };
  let p = fakeProvider((n) => (n === 1 ? reply(200, 'sorry, here is prose and no json') : reply(200, '```json\n' + JSON.stringify(good) + '\n```')));
  let r = await ask(p);
  assert.equal(r.ok, true);
  assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview'], 'النموذج الأحدث أوّلًا، والإعادة عليه');
  assert.equal(p.bodies[0].contents[0].parts.length, 1); assert.equal(p.bodies[1].contents[0].parts.length, 2, 'الإعادة بتنبيه JSON');
  assert.equal(p.bodies[0].generationConfig.responseMimeType, 'application/json');
  assert.equal(p.bodies[0].systemInstruction.parts[0].text, D.SYSTEM);
  assert.ok(p.bodies[0].contents[0].parts[0].text.includes('PORTRAIT STYLES') && p.bodies[0].contents[0].parts[0].text.includes('عبدالله (صوت رجل)'));
  const sc = r.plan.scenes;
  assert.deepEqual(sc.map((s) => s.type), ['title', 'screen', 'style_sample', 'screen', 'screen']);
  assert.equal(sc[3].target, 'portrait'); assert.equal(sc[4].target, 'home'); assert.equal(sc[4].seconds, 25, 'المدّة محصورة');
  assert.equal(r.fallback, false);
  // فاسد مرّتين على النموذج الأوّل = النموذج التالي، لا فشل
  p = fakeProvider((n) => (n <= 2 ? reply(200, '{"nope":1}') : reply(200, planText(5))));
  r = await ask(p);
  assert.equal(r.ok, true); assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview', 'gemini-pro-latest']);
  assert.equal(r.fallback, false, 'بديل Pro ليس احتياطًا أضعف');
  // DIRECTOR_MODEL يُجرَّب أوّلًا، والنموذج المغلق خرج من القائمة
  assert.equal(D.directorModels({ DIRECTOR_MODEL: 'gemini-x' })[0], 'gemini-x');
  assert.deepEqual(D.directorModels({}), D.DEFAULT_MODELS);
  assert.ok(!D.DEFAULT_MODELS.includes('gemini-3-pro-preview') && D.DEFAULT_MODELS[0] === 'gemini-3.1-pro-preview');
  assert.equal(D.sceneTarget(10), 75); assert.equal(D.sceneTarget(1), 8);
});

test('٤ب. لقطة المالك «plan 502 plan_failed»: الزحام العابر يُعاد، والمهلة تُعاد بتفكير أخفّ، وكلّ نموذج ساقط ينتقل لتاليه حتّى الاستكشاف والنموذج السريع', async () => {
  // 503 مرّة ثمّ نجاح: النموذج نفسه (كان يفشل فورًا)
  let p = fakeProvider((n) => (n === 1 ? reply(503, '', 'The model is overloaded') : reply(200, planText(5))));
  let r = await ask(p);
  assert.equal(r.ok, true); assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview']); assert.equal(r.attempts.length, 2);
  // 503 مرّتين: النموذج التالي
  p = fakeProvider((n) => (n <= 2 ? reply(503, '', 'overloaded') : reply(200, planText(5))));
  r = await ask(p);
  assert.equal(r.ok, true); assert.equal(r.model, 'gemini-pro-latest');
  // مهلة: المحاولة الثانية على النموذج نفسه بتفكير أخفّ
  p = fakeProvider((n) => (n === 1 ? 'TIMEOUT' : reply(200, planText(5))));
  r = await ask(p);
  assert.equal(r.ok, true); assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview/low']);
  assert.deepEqual(p.bodies[1].generationConfig.thinkingConfig, { thinkingLevel: 'low' }); assert.equal(p.bodies[0].generationConfig.thinkingConfig, undefined);
  // نموذج لا يقبل مستوى التفكير (400): يُعاد بلا الحقل
  p = fakeProvider((n) => (n === 1 ? 'TIMEOUT' : n === 2 ? reply(400, '', 'Unknown name "thinkingLevel": thinking is not supported') : reply(200, planText(5))));
  r = await ask(p);
  assert.equal(r.ok, true); assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview/low', 'gemini-3.1-pro-preview']);
  // كلّ Pro المعروفة 404: يُستكشف من القائمة (الأحدث أوّلًا، ونماذج الصور تُستثنى)، ثمّ النموذج السريع موسومًا احتياطًا
  p = fakeProvider((n, m) => (m === 'LIST'
    ? { ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.9-pro-preview', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-4-pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3-pro-image' }, { name: 'models/gemini-4-pro-tts', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-5-pro', supportedGenerationMethods: ['embedContent'] }] }) }
    : (/flash/.test(m) ? reply(200, planText(5)) : reply(404, '', 'not found'))));
  r = await ask(p);
  assert.equal(r.ok, true);
  assert.deepEqual(p.calls, ['gemini-3.1-pro-preview', 'gemini-pro-latest', 'gemini-2.5-pro', 'LIST', 'gemini-4-pro', 'gemini-3.9-pro-preview', 'gemini-3.8-flash']);
  assert.equal(r.fallback, true, 'النموذج السريع يُعلَن للمالك');
  // كلّ شيء ساقط: السبب الحقيقيّ في diag (النموذج والحالة ونصّ المزوّد)، بلا مفتاح، وبلا إعادة لا نهائيّة
  p = fakeProvider((n, m) => (m === 'LIST' ? { ok: false, status: 500 } : reply(429, '', 'Quota exceeded for metric x?key=SECRET-KEY-123')));
  r = await ask(p);
  assert.equal(r.ok, false); assert.equal(r.why, 'http_429');
  assert.equal(p.calls.filter((c) => c !== 'LIST').length, (D.DEFAULT_MODELS.length + D.LAST_RESORT.length) * 2, 'محاولتان لكلّ نموذج لا أكثر');
  const diag = D.diagOf(r.attempts);
  assert.ok(diag.startsWith('gemini-3.1-pro-preview:http_429 ×2 ') && diag.includes('Quota exceeded') && diag.includes(' → gemini-pro-latest:http_429'));
  assert.ok(!diag.includes('SECRET-KEY-123') && diag.includes('key=…') && diag.length <= 480);
  // الميزانيّة: لا نداء جديد حين يضيق الوقت عن سقف الدالّة
  p = fakeProvider(() => 'TIMEOUT');
  r = await ask(p, { budgetMs: 10000 });
  assert.equal(r.ok, false); assert.equal(p.calls.length, 0);
});

test('٤ج. الفيديو الطويل يُكتب أجزاءً: حتّى ٣ دقائق نداء واحد، وما فوقها جزء لكلّ دقيقتين ونصف، والمخطّط يوزّع الشاشات', async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8, 10].map(D.partsFor), [1, 1, 1, 2, 2, 3, 4, 4]);
  const catalog = CAT.buildCatalog({ lang: 'ar' });
  let p = fakeProvider(() => reply(200, planText(19, { outline: [{ focus: 'الصور', targets: ['portrait'] }, { focus: 'الفيديو', targets: ['video', 'video-modes'] }] })));
  let r = await ask(p, { minutes: 10, parts: 4, part: 1, catalog });
  assert.equal(r.ok, true); assert.equal(p.calls.length, 1);
  const t1 = p.bodies[0].contents[0].parts[0].text;
  assert.ok(t1.includes('على 4 أجزاء') && t1.includes('"outline"') && t1.includes('مشاهد الجزء ١ فقط: 19 مشهدًا') && t1.includes('≈ 75 مشهدًا'));
  assert.equal(r.plan.outline.length, 4, 'المخطّط الناقص يُكمَل بتوزيع الشاشات');
  assert.deepEqual(r.plan.outline[0], { focus: 'الصور', targets: ['portrait'] });
  assert.ok(r.plan.outline[2].targets.length > 0 && r.plan.outline[3].targets.length > 0);
  p = fakeProvider(() => reply(200, planText(18)));
  r = await ask(p, { minutes: 10, parts: 4, part: 4, outline: r.plan.outline, title: 'جولة', idea: 'فكرة', catalog });
  const t4 = p.bodies[0].contents[0].parts[0].text;
  assert.ok(t4.includes('اكتب الآن مشاهد الجزء 4 فقط') && t4.includes('هذا الجزء الأخير: اختم بدعوة واضحة') && t4.includes('العنوان: «جولة»') && t4.includes('المخطّط: 1) الصور [portrait]'));
  assert.ok(!t4.includes('"outline"'));
  const t2 = D.buildPrompt({ request: 'x', lang: 'ar', speaker: 'female', minutes: 10, parts: 4, part: 2, outline: r.plan.outline, title: 't', idea: 'i', catalog, catalogText: 'CAT' });
  assert.ok(t2.includes('لا تختم الفيديو؛ بعده جزء آخر') && !t2.includes('هذا الجزء الأخير'));
  // نداء واحد للقصير: الصيغة القديمة نفسها
  const t0 = D.buildPrompt({ request: 'x', lang: 'ar', speaker: 'female', minutes: 2, catalog, catalogText: 'CAT' });
  assert.ok(t0.includes('أعد بالضبط 15 مشهدًا') && !t0.includes('أجزاء'));
});

test('٤د. المعالج يعيد سبب الفشل للمالك (diag) ويسجّله، والأجزاء من الطلب، والكتالوج مع الجزء الأوّل وحده', async () => {
  const saved = { g: process.env.GEMINI_API_KEY, f: global.fetch };
  process.env.GEMINI_API_KEY = 'k';
  try {
    global.fetch = async (url) => (String(url).includes('?pageSize=') ? { ok: false, status: 500 } : reply(503, '', 'The model is overloaded. Please try again later.'));
    const real = setTimeout; global.setTimeout = (fn) => real(fn, 0); /* لا انتظار حقيقيّ بين الإعادات */
    let r = res();
    try { await handler({ method: 'POST', query: { action: 'app-director-plan' }, body: { token: ownerToken('omran'), request: 'فيديو' } }, r); } finally { global.setTimeout = real; }
    assert.equal(r.code, 502); assert.equal(r.body.error, 'plan_failed'); assert.equal(r.body.why, 'http_503');
    assert.ok(r.body.diag.includes('gemini-3.1-pro-preview:http_503 ×2') && r.body.diag.includes('overloaded'), 'السبب الحقيقيّ يصل الواجهة');
    global.fetch = async () => reply(200, planText(6, { outline: [] }));
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-plan' }, body: { token: ownerToken('omran'), request: 'فيديو', minutes: 10 } }, r);
    assert.equal(r.code, 200); assert.equal(r.body.parts, 4); assert.equal(r.body.part, 1); assert.equal(r.body.plan.outline.length, 4);
    assert.ok(r.body.catalog && r.body.catalog.screens.length > 10 && r.body.catalog.styles.ghibli.prompt, 'الكتالوج مع الجزء الأوّل');
    assert.equal(r.body.model, 'gemini-3.1-pro-preview'); assert.equal(r.body.fallback, false);
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-plan' }, body: { token: ownerToken('omran'), request: 'فيديو', minutes: 10, part: 3, outline: [{ focus: 'a', targets: ['home'] }], title: 'T', idea: 'I' } }, r);
    assert.equal(r.code, 200); assert.equal(r.body.part, 3); assert.equal(r.body.catalog, undefined, 'الأجزاء اللاحقة بلا كتالوج');
  } finally { global.fetch = saved.f; if (saved.g == null) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.g; }
});

test('٥. رمز المهمّة: HMAC بسرّ الجسر، يحمل المالك ومعرّف المهمّة، ساعتان، ويُرفض بسرّ آخر أو بعد انتهائه', () => {
  const secret = 'bridge-secret-' + 'x'.repeat(20);
  const t = D.signJobToken({ user: 'omran', jobId: 'd123' }, secret);
  const v = D.verifyJobToken(t, secret);
  assert.equal(v.ok, true); assert.equal(v.user, 'omran'); assert.equal(v.jobId, 'd123');
  assert.ok(v.exp - Date.now() > 1.9 * 3600 * 1000 && v.exp - Date.now() <= D.TOKEN_TTL_MS);
  assert.equal(D.verifyJobToken(t, 'other-secret-' + 'y'.repeat(20)).why, 'signature');
  assert.equal(D.verifyJobToken(t, secret, Date.now() + 3 * 3600 * 1000).why, 'expired');
  assert.equal(D.verifyJobToken(t.slice(0, -2) + 'zz', secret).ok, false);
  assert.equal(D.verifyJobToken('garbage', secret).why, 'malformed');
  // الجسر يتحقّق بالصيغة نفسها
  const bridgeSrc = read('cc-bridge/render.mjs');
  assert.ok(bridgeSrc.includes("createHmac('sha256', String(secret)).update(p).digest('base64url')") && bridgeSrc.includes('timingSafeEqual'));
});

test('٦. المعالج: الرمز للمالك مع عنوان الجسر من البيئة (لا من العميل)، و٥٠٣ بلا إعداد، والخطّة ٥٠٣ بلا مفتاح', async () => {
  const saved = { s: process.env.CC_BRIDGE_SECRET, u: process.env.CC_BRIDGE_URL, g: process.env.GEMINI_API_KEY, f: global.fetch };
  try {
    delete process.env.CC_BRIDGE_SECRET; delete process.env.CC_BRIDGE_URL; delete process.env.GEMINI_API_KEY;
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, busy: false, renderJobs: 0 }) }); /* v-app-director-bridge-check: الجسر سليم */
    let r = res();
    await handler({ method: 'POST', query: { action: 'app-director-token' }, body: { token: ownerToken('omran') } }, r);
    assert.equal(r.code, 503); assert.equal(r.body.error, 'bridge_unconfigured');
    process.env.CC_BRIDGE_SECRET = 'bridge-secret-' + 'x'.repeat(20); process.env.CC_BRIDGE_URL = 'https://cc.example.app/';
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-token' }, body: { token: ownerToken('omran'), bridge: 'https://evil.example' } }, r);
    assert.equal(r.code, 200);
    assert.equal(r.body.bridge, 'https://cc.example.app');
    const v = D.verifyJobToken(r.body.token, process.env.CC_BRIDGE_SECRET);
    assert.equal(v.ok, true); assert.equal(v.user, 'omran'); assert.equal(v.jobId, r.body.jobId);
    assert.ok(!JSON.stringify(r.body).includes(process.env.CC_BRIDGE_SECRET), 'السرّ لا يبلغ المتصفّح');
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-plan' }, body: { token: ownerToken('omran'), request: 'فيديو عن أنماط الصور' } }, r);
    assert.equal(r.code, 503); assert.equal(r.body.error, 'director_unconfigured');
    assert.doesNotMatch(JSON.stringify(r.body), BANNED);
  } finally {
    global.fetch = saved.f;
    for (const [k, v] of [['CC_BRIDGE_SECRET', saved.s], ['CC_BRIDGE_URL', saved.u], ['GEMINI_API_KEY', saved.g]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});

test('٧. القسم في شريط صانع الفيديو للمالك وحده وبلا إيموجي، ويقود المسار كاملًا من المتصفّح بلا سرّ ولا عنوان جسر', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("tabsFor().concat(drOwner()?['director']:[])"), 'الزرّ يُبنى للمالك فقط');
  assert.ok(js.includes("if(!card||!drOwner()||id('vmkDirector')) return;"), 'اللوحة لا تُنشأ لغير المالك — لا أثر في DOM');
  assert.ok(js.includes("if(tabsFor().indexOf(v)<0&&!(v==='director'&&drOwner())) return;"));
  assert.ok(js.includes("if(v==='director') return L('vdTab')||'مخرج التطبيق';"));
  for (const k of ['action=app-director-plan', 'action=app-director-token', 'action=app-director-voice', "'/api/media?action=tts'", "'/api/media?action=maha-image'", "'/api/portrait-style'", "bridge+'/render'", "bridge+'/render/'+encodeURIComponent(jobId)", 'setTimeout(x,3000)', 'window.autoSaveVideo(DR.out']) assert.ok(js.includes(k), k);
  assert.ok(js.includes("voice:'maha',lang:lang,gender:speaker"), 'التعليق بصوت مها/عبدالله باللغة المختارة');
  assert.ok(!/CC_BRIDGE_SECRET|CC_BRIDGE_URL|railway\.app|vercel\.app/.test(js), 'لا سرّ ولا عنوان جسر في العميل');
  const block = js.slice(js.indexOf('v-app-director (المالك:'), js.indexOf('v-vmk-clean-video: قسم'));
  assert.ok(block.length > 5000 && block.includes('async function drRun()'), 'كتلة القسم كاملة');
  const EMO = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;
  assert.doesNotMatch(block, EMO, 'بلا إيموجي');
  assert.doesNotMatch(block, BANNED, 'بلا اسم مزوّد');
  // v-app-director-reliable: السبب الحقيقيّ يُعرض، والأجزاء، والجسر المنقطع يُعلَن، ولا إعلان حفظ لم يحدث
  assert.ok(js.includes("(pr.json&&pr.json.diag?' · '+pr.json.diag:'')") && js.includes("drMsg(key==='vdFail'?L('vdFail'):L('vdFail')+' — '+L(key),true,code.slice(0,520));") && js.includes("d.className='vmk-dir-diag'; d.dir='ltr';"), 'تشخيص الخادم يظهر للمالك');
  assert.ok(js.includes("drPlanCall(Object.assign({},base,{part:k,outline:plan.outline,title:plan.title,idea:plan.idea}))") && js.includes("drStep('plan','on',doneP+'/'+parts,doneP/parts)"), 'الفيديو الطويل أجزاء');
  assert.ok(js.includes("if(sr&&(sr.status===404||sr.status===401))") && js.includes("if(++lost>=20)"), 'جسر أُعيد تشغيله أو انقطع لا يُنتظر للأبد');
  assert.ok(js.includes("DR.run++; DR.busy=false; syncDirector();"), 'الفشل يوقف نداءات الخلفيّة الباقية');
  assert.ok(!block.includes("L('vdSaved')"), 'لا «حُفظ في فيديوهاتي»: لا مكتبة فيديوهات في التطبيق');
  assert.ok(js.includes("for(var att=1;att<=6&&!s.audio&&!dead&&my===DR.run;att++)") && js.includes("cool=Math.max(cool,Date.now()+Math.min(4000*att,20000))") && js.includes("throw drFail('voice '+(voiced.length-vres.miss)+'/'+voiced.length+' '+"), 'حدّ الطلبات عند مزوّد الصوت: انتظار وإعادة، وفشل معلَن إن صمت خُمس المشاهد');
  // v-app-director-voice-first (لقطة المالك «voice 15/15 401» بعد توليد النماذج): التعليق قبل النماذج، والرفض النهائيّ يوقف الكلّ فورًا بنصّ ردّ الخادم
  assert.ok(js.indexOf('/* ٢) التعليق أوّلًا') > 0 && js.indexOf('/* ٢) التعليق أوّلًا') < js.indexOf('/* ٣) نماذج الأنماط') && js.indexOf("'/api/media?action=tts'") < js.indexOf("'/api/portrait-style'"), 'الصوت يُسجَّل قبل الصرف على الصور');
  assert.ok(js.includes("if(r.status===401||r.status===403||/insufficient_quota|no credits|invalid subscription/i.test(et)) dead=true;") && js.includes("vLimit=Math.max(1,Math.floor(voiced.length*0.2));") && js.includes("if(s.audio) got++; else { miss++; if(miss>vLimit||(!got&&miss>=2)) dead=true; }") && js.includes("if(vres.dead||vres.miss>vLimit){ drStep('voice','err');"), 'مفتاح مرفوض أو رصيد منتهٍ = توقّف فوريّ');
  assert.ok(js.includes("last=r.status+(et?' '+et:'');") && js.includes("if(err){ try{ m.scrollIntoView({block:'end'}); }"), 'سبب الخادم في السطر، والسطر في مجال النظر');
  assert.ok(js.includes("var DR_SPAN={plan:[0,14],voice:[14,30],samples:[30,58],shots:[58,84],join:[84,98]};"));
  // v-app-director-motion: الشاشة الحيّة أثناء التوليد، والخطوات بترتيب تنفيذها، وتبويب بلا صورة مكسورة
  assert.ok(js.includes('id="vdStage" hidden') && js.includes('function drStageStart()') && js.includes('ST.iv=setInterval(drStageTick,1000)') && js.includes('function drStageStop(hide){ clearInterval(ST.iv);'), 'الشاشة الحيّة تعمل أثناء التوليد فقط');
  assert.ok(js.includes("s.board.img='data:'+s.mime+';base64,'+s.image; ST.bi=ST.board.indexOf(s.board); drStageNext();"), 'نموذج النمط يظهر فور توليده');
  assert.ok(js.includes("['plan','voice','samples','shots','join'].map(") && !js.includes("['plan','shots','samples','voice','join']") && !js.includes("['plan','samples','voice','shots','join']"), 'الخطوات بترتيب التنفيذ');
  assert.ok(js.includes("if(v==='director'){ var dlb=document.createElement('span');") && js.includes("b.classList.add('vmk-tab-noimg')"), 'تبويب المخرج بلا <img>');
  const css2 = read('css/modules.css');
  for (const k of ['.vmk-tab.vmk-tab-noimg{', '.vmk-dir-stage{', '@keyframes vdSweep', '@keyframes vdReel', '@keyframes vdKen', '.vmk-dir-diag{', '@media (prefers-reduced-motion:reduce){#videoMakerModal .vmk-dir-stage-bg']) assert.ok(css2.includes(k), k);
  // الدالّة الحقيقيّة في vm: غير المالك لا يرى الزرّ ولا اللوحة
  const run = (user) => {
    const els = {};
    const mk = (tag) => ({ tagName: tag, children: [], dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, getAttribute() { return null; }, appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, removeAttribute() {}, closest() { return null; } });
    const M = mk('div'); M.style.display = 'none'; M.firstElementChild = mk('div');
    const ctx = { window: {}, localStorage: { getItem: (k) => (k === 'aiapp_username' ? user : null), setItem() {} }, sessionStorage: { getItem: () => null },
      document: { getElementById: (x) => (x === 'videoMakerModal' ? M : els[x] || null), createElement: (t) => { const e = mk(t); return e; }, createTreeWalker: () => ({ nextNode: () => null }), documentElement: { lang: 'ar', dir: 'rtl' }, addEventListener() {}, removeEventListener() {}, body: mk('body') },
      MutationObserver: function () { this.observe = () => {}; }, NodeFilter: { SHOW_TEXT: 4 }, Event: function () {}, authGet: (k) => (k === 'aiapp_username' ? user : ''), matchMedia: () => ({ matches: false }) };
    ctx.window = ctx;
    vm.runInNewContext(js, ctx);
    return ctx;
  };
  assert.doesNotThrow(() => run('sara')); assert.doesNotThrow(() => run('omran'));
});

test('٨. النصوص الستّة والعشرون بالـ١٤ لغة بلا اسم مزوّد، ووسما video.js واللغات مرفوعان', () => {
  const core = read('js/app-03-i18n-data.js');
  for (const k of KEYS) assert.equal((core.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k + ' ar+en');
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(core, base);
  for (const k of KEYS) { assert.ok(base.I18N.ar[k] && base.I18N.en[k], k + ' داخل ar وen فعلًا (لا على I18N نفسه)'); assert.doesNotMatch(base.I18N.ar[k] + base.I18N.en[k], BANNED, k); }
  assert.equal(base.I18N.ar.vdTab, 'مخرج التطبيق');
  const seen = {};
  for (const lg of LANGS) {
    const s = read('i18n/' + lg + '.js');
    const m = s.match(/v-app-director[^\n]*Object\.assign\(I18N\['\w+'\], (\{.*\})\);/);
    assert.ok(m, lg + ' كتلة الترجمة');
    const obj = JSON.parse(m[1]);
    for (const k of KEYS) { assert.ok(obj[k] && obj[k].trim().length > 1, lg + ' ← ' + k); assert.doesNotMatch(obj[k], BANNED, lg + ' ← ' + k); }
    seen[lg] = obj.vdTab;
  }
  assert.ok(new Set(Object.values(seen)).size >= 10, 'ترجمات لا نسخ');
  assert.ok(read('index.html').includes('/js/video.js?v=450'));
  assert.ok(read('js/app-04-i18n-state.js').includes("sc.src = 'i18n/' + lg + '.js?v=755';"));
  assert.ok(read('css/modules.css').includes('.vmk-studio.vmk-tab-director>.vmk-side') && read('css/modules.css').includes('#vmkDirector'));
});

test('٩. أصوات التعليق بالـ١٤ لغة: كلّ لغة واجهة لها محلّيّة في خريطة أصوات مها (لا سقوط على العربيّة)', () => {
  const tts = read('api/_lib/tts.js');
  for (const [lg, loc] of [['es', 'es-ES'], ['tr', 'tr-TR'], ['ru', 'ru-RU'], ['zh', 'zh-CN'], ['id', 'id-ID'], ['fil', 'fil-PH'], ['ml', 'ml-IN'], ['fr', 'fr-FR'], ['hi', 'hi-IN'], ['ur', 'ur-PK'], ['bn', 'bn-BD'], ['ne', 'ne-NP'], ['en', 'en-US'], ['ar', 'ar-AE']]) {
    assert.ok(tts.includes("        " + lg + ": ['" + loc + "', "), lg + ' → ' + loc);
  }
  assert.ok(tts.includes("MAHA_VOICE_MAP[rawLang] ? rawLang : rawLang.slice(0, 2)"), 'fil لا تُقصّ إلى fi');
  assert.ok(tts.includes("ar: ['ar-AE', 'ar-AE-FatimaNeural', 'ar-AE-HamdanNeural']"), 'الصوت العربيّ كما كان');
});

/* ───── v-app-director-voice (المالك بعد «voice 15/15 401»: «تمام ابدا فيه لكن حط ميزه مع صوت ولا بدون») ───── */
const VOICE_KEYS = ['vdVoiceLabel', 'vdVoiceOn', 'vdVoiceOff', 'vdVoiceBackup', 'vdFailVoice'];
const wavB64 = (ms) => D.toWav(Buffer.alloc(Math.round(24000 * 2 * ms / 1000), 1).toString('base64')).toString('base64');
const voiceReply = (status, data, msg) => ({ ok: status < 400, status, json: async () => (status >= 400 ? { error: { message: msg || 'denied' } } : data) });
const stepsAudio = (b64) => ({ steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'audio', data: b64 }] }] });
function fakeVoice(script) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { const b = JSON.parse(init.body); calls.push({ url: String(url), model: b.model, body: b, headers: init.headers }); return script(calls.length, b.model); } };
}

test('١٠. الصوت الاحتياطيّ: طلب بالشكل الموثّق والمفتاح في الترويسة، النموذج المرفوض يُتخطّى، والعابر يعود بحالته، والـPCM الخام يُغلَّف WAV', async () => {
  // الشكل: واجهة interactions، المفتاح في الترويسة لا في العنوان، الصوت حسب المتحدّث، ولا حفظ عند المزوّد
  let p = fakeVoice(() => voiceReply(200, stepsAudio(wavB64(800))));
  let r = await D.requestVoice({ text: 'مرحبًا', speaker: 'male', lang: 'ar', apiKey: 'KEY-1', env: {}, fetchImpl: p.fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.model, D.VOICE_MODELS[0]);
  assert.equal(r.wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(r.wav.toString('ascii', 8, 12), 'WAVE');
  const c = p.calls[0];
  assert.ok(c.url.endsWith('/v1beta/interactions') && !c.url.includes('KEY-1'), 'المفتاح ليس في العنوان');
  assert.equal(c.headers['x-goog-api-key'], 'KEY-1');
  assert.equal(c.body.input[0].content[0].text, 'مرحبًا');
  assert.deepEqual(c.body.response_format, { type: 'audio' }); assert.equal(c.body.store, false);
  assert.deepEqual(c.body.generation_config.speech_config, [{ voice: 'Charon' }]);
  assert.equal(D.voiceName('female', {}), 'Kore'); assert.equal(D.voiceName('female', { DIRECTOR_VOICE_FEMALE: 'Aoede' }), 'Aoede');
  assert.equal(D.voiceName('male', { DIRECTOR_VOICE_MALE: 'bad name!' }), 'Charon', 'اسم صوت غير صالح من البيئة يُهمل');
  assert.deepEqual(D.voiceModels({ DIRECTOR_TTS_MODEL: 'x-tts' }).slice(0, 2), ['x-tts', D.VOICE_MODELS[0]]);
  assert.equal(D.voiceModels({ DIRECTOR_TTS_MODEL: D.VOICE_MODELS[1] }).length, D.VOICE_MODELS.length, 'بلا تكرار');
  // نموذج غير متاح (404) ثمّ ردّ بلا صوت ← الثالث ينجح
  p = fakeVoice((n) => (n === 1 ? voiceReply(404, null, 'model not found') : n === 2 ? voiceReply(200, { steps: [] }) : voiceReply(200, stepsAudio(wavB64(600)))));
  r = await D.requestVoice({ text: 'hi', speaker: 'female', lang: 'en', apiKey: 'k', env: {}, fetchImpl: p.fetchImpl });
  assert.equal(r.ok, true); assert.equal(r.model, D.VOICE_MODELS[2]); assert.deepEqual(r.attempts.map((a) => a.why), ['http_404', 'no_audio']);
  // النموذج الذي نجح قبلُ يُجرَّب أوّلًا (لا طلب ضائع لكلّ جملة)، واسم من خارج القائمة يُهمل
  p = fakeVoice(() => voiceReply(200, stepsAudio(wavB64(600))));
  r = await D.requestVoice({ text: 'hi', speaker: 'female', lang: 'en', apiKey: 'k', env: {}, fetchImpl: p.fetchImpl, prefer: D.VOICE_MODELS[2] });
  assert.equal(r.model, D.VOICE_MODELS[2]); assert.equal(p.calls.length, 1);
  p = fakeVoice(() => voiceReply(200, stepsAudio(wavB64(600))));
  r = await D.requestVoice({ text: 'hi', speaker: 'female', lang: 'en', apiKey: 'k', env: {}, fetchImpl: p.fetchImpl, prefer: 'evil-model' });
  assert.equal(r.model, D.VOICE_MODELS[0], 'نموذج من خارج القائمة لا يُنادى');
  // حدّ الطلبات: يتوقّف فورًا ويعود 429 (العميل هو من ينتظر ويعيد) — لا حرق لبقيّة النماذج
  p = fakeVoice(() => voiceReply(429, null, 'Resource exhausted'));
  r = await D.requestVoice({ text: 'hi', speaker: 'female', lang: 'en', apiKey: 'k', env: {}, fetchImpl: p.fetchImpl });
  assert.equal(r.ok, false); assert.equal(r.status, 429); assert.equal(p.calls.length, 1);
  // الكلّ مرفوض: فشل نهائيّ بسبب كلّ نموذج
  p = fakeVoice(() => voiceReply(403, null, 'API key not valid'));
  r = await D.requestVoice({ text: 'hi', speaker: 'female', lang: 'en', apiKey: 'k', env: {}, fetchImpl: p.fetchImpl });
  assert.equal(r.ok, false); assert.equal(r.status, 403); assert.equal(p.calls.length, D.VOICE_MODELS.length);
  assert.ok(D.diagOf(r.attempts).includes('http_403') && D.diagOf(r.attempts).includes('API key not valid'));
  // PCM خام بلا ترويسة يُغلَّف: ٢٤ك هرتز أحاديّ ١٦ بت، والطول صحيح؛ وWAV جاهز لا يُمسّ
  const pcm = Buffer.alloc(48000, 3);
  const w = D.toWav(pcm.toString('base64'));
  assert.equal(w.length, 44 + 48000); assert.equal(w.readUInt32LE(24), 24000); assert.equal(w.readUInt16LE(22), 1); assert.equal(w.readUInt16LE(34), 16); assert.equal(w.readUInt32LE(40), 48000);
  assert.equal(D.toWav(w.toString('base64')).length, w.length, 'WAV جاهز لا يُغلَّف مرّتين');
  // أشكال الردّ الأقدم تُقرأ احتياطًا
  const b = 'A'.repeat(200);
  assert.equal(D.pickAudio(stepsAudio(b)), b); assert.equal(D.pickAudio({ output_audio: { data: b } }), b);
  assert.equal(D.pickAudio({ candidates: [{ content: { parts: [{ inlineData: { data: b } }] } }] }), b);
  assert.equal(D.pickAudio({ steps: [{ type: 'thought', content: [{ type: 'audio', data: b }] }] }), '', 'صوت خارج model_output لا يُؤخذ');
  assert.equal(D.pickAudio(null), '');
});

test('١١. إجراء app-director-voice: للمالك وحده، ٥٠٣ بلا مفتاح، ٢٠٠ بـWAV، والعابر بحالته وغيره ٥٠٢ مع السبب؛ والخطّة بلا صوت تطلب جملة تُقرأ', async () => {
  const saved = { g: process.env.GEMINI_API_KEY, f: global.fetch };
  try {
    delete process.env.GEMINI_API_KEY;
    let r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('sara'), text: 'x' } }, r);
    assert.equal(r.code, 403, 'غير المالك');
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('omran'), text: 'x' } }, r);
    assert.equal(r.code, 503); assert.equal(r.body.error, 'voice_unconfigured'); assert.doesNotMatch(JSON.stringify(r.body), BANNED);
    process.env.GEMINI_API_KEY = 'k';
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('omran'), text: '  ' } }, r);
    assert.equal(r.code, 400); assert.equal(r.body.error, 'text_required');
    let seen = null;
    global.fetch = async (url, init) => { seen = JSON.parse(init.body); return voiceReply(200, stepsAudio(wavB64(700))); };
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('omran'), text: 'جملة التعليق', lang: 'xx', speaker: 'male' } }, r);
    assert.equal(r.code, 200); assert.equal(r.body.mime, 'audio/wav'); assert.equal(Buffer.from(r.body.audio, 'base64').toString('ascii', 0, 4), 'RIFF');
    assert.equal(seen.generation_config.speech_config[0].voice, 'Charon'); assert.equal(seen.input[0].content[0].text, 'جملة التعليق');
    global.fetch = async () => voiceReply(429, null, 'quota');
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('omran'), text: 'x' } }, r);
    assert.equal(r.code, 429, 'العابر بحالته: العميل ينتظر ويعيد'); assert.equal(r.body.error, 'voice_failed');
    global.fetch = async () => voiceReply(404, null, 'model is not found');
    r = res();
    await handler({ method: 'POST', query: { action: 'app-director-voice' }, body: { token: ownerToken('omran'), text: 'x' } }, r);
    assert.equal(r.code, 502); assert.equal(r.body.why, 'http_404'); assert.ok(r.body.diag.includes('not found'), 'السبب يصل المالك');
  } finally { global.fetch = saved.f; if (saved.g == null) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.g; }
  // الخطّة: بلا صوت ← تعليمة الجملة المقروءة في الطلب، ومع الصوت لا
  const cat = CAT.buildCatalog({ lang: 'ar' });
  const mk = (silent) => D.buildPrompt({ request: 'جولة', lang: 'ar', speaker: 'female', minutes: 1, silent, part: 1, parts: 1, catalog: cat, catalogText: CAT.catalogText(cat) });
  assert.ok(mk(true).includes('بلا تعليق صوتيّ') && !mk(false).includes('بلا تعليق صوتيّ'));
  const p = fakeProvider(() => reply(200, planText(6)));
  await ask(p, { silent: true });
  assert.ok(JSON.stringify(p.bodies[0]).includes('بلا تعليق صوتيّ'), 'requestPlan يمرّر الخيار إلى الطلب');
  assert.ok(read('api/_lib/app-director.js').includes('silent: body.voice === false,'), 'المعالج يقرأ الخيار من الطلب');
});

test('١٢. الواجهة: خيار «مع صوت / بدون صوت»، والصوت المرفوض يُستبدل بالاحتياطيّ للفيديو كلّه، والنصّ يُرسم على النماذج — بالـ١٤ لغة', () => {
  const js = read('js/video.js');
  assert.ok(js.includes('<select id="vdVoice"><option value="on"></option><option value="off"></option></select>'), 'الخيار في صفّ الخيارات، والافتراضيّ مع صوت');
  assert.ok(js.includes("labs[3].textContent=L('vdVoiceLabel');") && js.includes("vo.options[0].textContent=L('vdVoiceOn'); vo.options[1].textContent=L('vdVoiceOff');") && js.includes("box.querySelector('#vdSpeaker').disabled=(vo.value==='off');"), 'بلا صوت يعطّل اختيار المتحدّث');
  assert.ok(js.includes("var voiceOn=((id('vdVoice')||{}).value!=='off')") && js.includes('minutes:minutes,voice:voiceOn,token:tk'), 'الخيار يبلغ كاتب الخطّة');
  assert.ok(js.includes('var voiced=voiceOn?scenes.filter(function(s){ return !!s.narration; }):[],') && js.includes("if(!voiceOn) drStep('voice','ok',L('vdVoiceOff'));"), 'بلا صوت: لا نداء صوت واحد');
  assert.ok(js.includes('o.cap=voiceOn?o.text:(o.narration||o.text);') && js.includes("text:(s.type==='screen'?s.cap:s.text)") && js.includes("o.sub=voiceOn?(sc.highlight||''):(o.narration||sc.highlight||'');"), 'بلا صوت: جملة المشهد هي النصّ المعروض');
  assert.ok(js.includes("drJson('/api/ai?action=app-director-voice',{text:s.narration,lang:lang,speaker:speaker,model:vModel||undefined,token:tk})") && js.includes('if(br.ok&&br.json&&br.json.audio){ s.audio=br.json.audio; vModel=br.json.model||vModel; }'), 'الصوت الاحتياطيّ من الخادم');
  assert.ok(js.includes('if(vres.dead||vres.miss>vLimit){\n          scenes.forEach(') && js.includes("scenes.forEach(function(s){ s.audio=''; }); backupVoice=true;") && js.includes('vres=await voiceRun(true);'), 'الرفض النهائيّ ← الاحتياطيّ للفيديو كلّه (لا خلط صوتين)');
  assert.ok(js.includes("drStep('voice','ok',backupVoice?L('vdVoiceBackup'):(vres.miss?("), 'الصوت الاحتياطيّ يُعلَن في الخطوة');
  assert.ok(js.includes("(backupVoice?('main: '+mainWhy+' | backup: '+vres.last):vres.last)"), 'فشل الاثنين: سبب كلٍّ منهما في السطر');
  assert.ok(js.includes("/^voice/.test(code)?'vdFailVoice':"), 'فشل الصوتين يدلّ المالك على «بدون صوت»');
  assert.ok(js.includes('function drCaptionSample(b64,mime,text,dir){') && js.includes('if(s.cap){ var cc=await drCaptionSample(s.image,s.mime,s.cap,capDir);'), 'نصّ المشهد مرسوم على نموذج النمط');
  assert.ok(js.indexOf('var cc=await drCaptionSample') < js.indexOf("s.board.img='data:'+s.mime+';base64,'+s.image;"), 'الشاشة الحيّة تعرض النموذج بنصّه');
  // دالّة لفّ السطور الحقيقيّة: لا سطر أعرض من الحدّ، والكلمات كلّها محفوظة بترتيبها
  const src = js.slice(js.indexOf('function drWrap(ctx,text,maxW){'), js.indexOf('function drCaptionSample('));
  const drWrap = vm.runInNewContext('(' + src.trim() + ')');
  const ctx = { measureText: (t) => ({ width: t.length * 10 }) };
  const words = 'واحد اثنان ثلاثة أربعة خمسة ستة سبعة';
  const lines = drWrap(ctx, words, 150);
  assert.ok(lines.length >= 3 && lines.every((l) => l.length * 10 <= 150)); assert.equal(lines.join(' '), words);
  assert.equal(drWrap(ctx, '', 150).length, 0);
  assert.equal(drWrap(ctx, 'كلمةطويلةجداجداجدا', 50).join('|'), 'كلمةطويلةجداجداجدا', 'كلمة أطول من السطر تبقى كاملة');
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-dir-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}') && css.includes('#videoMakerModal .vmk-dir-row{grid-template-columns:1fr 1fr}'), 'أربعة خيارات في صفّ، وعلى الجوّال صفّان');
  assert.ok(read('index.html').includes('css/modules.css?v=687'));
  // النصوص الأربعة بالـ١٤ لغة، بلا اسم مزوّد
  const core = read('js/app-03-i18n-data.js');
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(core, base);
  for (const k of VOICE_KEYS) { assert.ok(base.I18N.ar[k] && base.I18N.en[k], k + ' داخل ar وen'); assert.doesNotMatch(base.I18N.ar[k] + base.I18N.en[k], BANNED, k); }
  assert.ok(base.I18N.ar.vdFailVoice.includes(base.I18N.ar.vdVoiceOff) && base.I18N.en.vdFailVoice.includes(base.I18N.en.vdVoiceOff));
  assert.equal(base.I18N.ar.vdVoiceOff, 'بدون صوت'); assert.equal(base.I18N.ar.vdVoiceOn, 'مع صوت');
  const off = {};
  for (const lg of LANGS) {
    const m = read('i18n/' + lg + '.js').match(/v-app-director-voice[^\n]*Object\.assign\(I18N\['(\w+)'\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const obj = JSON.parse(m[2]);
    for (const k of VOICE_KEYS) { assert.ok(obj[k] && obj[k].trim().length > 1, lg + ' ← ' + k); assert.doesNotMatch(obj[k], BANNED, lg + ' ← ' + k); }
    assert.ok(obj.vdFailVoice.includes(obj.vdVoiceOff), lg + ' ← رسالة الفشل تسمّي الخيار بنصّه');
    off[lg] = obj.vdVoiceOff;
  }
  assert.ok(new Set(Object.values(off)).size >= 11, 'ترجمات لا نسخ');
});
/* ───── v-app-director-bridge-check (لقطة المالك «bridge offline» بعد أن كُتب السيناريو ووُلّدت النماذج) ───── */
const healthReply = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

test('١٣. الجسر يُفحص قبل أيّ صرف: جسر بنسخة قديمة أو منقطع يُعلَن عند إصدار الرمز، والواجهة تطلب الرمز أوّل شيء', async () => {
  // الفحص نفسه: الحقل الذي يضيفه المصوِّر هو الدليل على أنّ الجسر يعرف مسار الفيديو
  let calls = [];
  let r = await D.probeBridge('https://b.example', { fetchImpl: async (u) => { calls.push(String(u)); return healthReply(200, { ok: true, busy: false, renderJobs: 0 }); } });
  assert.deepEqual(r, { ok: true, renderJobs: 0, busy: false }); assert.deepEqual(calls, ['https://b.example/health']);
  // ردّ الجسر المنشور فعلًا يوم اللقطة (نسخة ٢٠ سبتمبر): صحّة بلا renderJobs
  r = await D.probeBridge('https://b.example', { fetchImpl: async () => healthReply(200, { ok: true, busy: false }) });
  assert.equal(r.ok, false); assert.equal(r.error, 'bridge_outdated');
  // منقطع: محاولتان ثمّ سبب الأخيرة
  calls = [];
  r = await D.probeBridge('https://b.example', { fetchImpl: async (u) => { calls.push(u); throw new Error('ECONNREFUSED'); } });
  assert.equal(r.ok, false); assert.equal(r.error, 'bridge_offline'); assert.equal(r.why, 'network'); assert.equal(calls.length, 2);
  r = await D.probeBridge('https://b.example', { fetchImpl: async () => { const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; } });
  assert.equal(r.why, 'timeout');
  r = await D.probeBridge('https://b.example', { fetchImpl: async () => healthReply(502, null) });
  assert.equal(r.error, 'bridge_offline'); assert.equal(r.why, 'health_502');
  // زحام عابر ثمّ سليم: المحاولة الثانية تكفي
  let n = 0;
  r = await D.probeBridge('https://b.example', { fetchImpl: async () => (++n === 1 ? healthReply(503, null) : healthReply(200, { ok: true, busy: true, renderJobs: 2 })) });
  assert.deepEqual(r, { ok: true, renderJobs: 2, busy: true });

  // المعالج: لا رمز لجسر لا يصوّر — 502 بسببه، ولا عنوان ولا رمز في الردّ
  const saved = { s: process.env.CC_BRIDGE_SECRET, u: process.env.CC_BRIDGE_URL, d: process.env.DIRECTOR_BRIDGE_URL, f: global.fetch };
  try {
    process.env.CC_BRIDGE_SECRET = 'bridge-secret-' + 'y'.repeat(20); process.env.CC_BRIDGE_URL = 'https://cc.example.app'; delete process.env.DIRECTOR_BRIDGE_URL;
    const seen = [];
    global.fetch = async (u) => { seen.push(String(u)); return healthReply(200, { ok: true, busy: false }); };
    let rr = res();
    await handler({ method: 'POST', query: { action: 'app-director-token' }, body: { token: ownerToken('omran') } }, rr);
    assert.equal(rr.code, 502); assert.equal(rr.body.error, 'bridge_outdated'); assert.equal(rr.body.token, undefined); assert.equal(rr.body.bridge, undefined);
    assert.deepEqual(seen, ['https://cc.example.app/health'], 'نداء صحّة واحد، خادمًا لخادم');
    assert.doesNotMatch(JSON.stringify(rr.body), BANNED);
    global.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    rr = res();
    await handler({ method: 'POST', query: { action: 'app-director-token' }, body: { token: ownerToken('omran') } }, rr);
    assert.equal(rr.code, 502); assert.equal(rr.body.error, 'bridge_offline');
    // غير المالك لا يبلغ الفحص أصلًا
    let probed = 0; global.fetch = async () => { probed++; return healthReply(200, { ok: true, renderJobs: 0 }); };
    rr = res();
    await handler({ method: 'POST', query: { action: 'app-director-token' }, body: { token: ownerToken('sara') } }, rr);
    assert.equal(rr.code, 403); assert.equal(probed, 0);
  } finally {
    global.fetch = saved.f;
    for (const [k, v] of [['CC_BRIDGE_SECRET', saved.s], ['CC_BRIDGE_URL', saved.u], ['DIRECTOR_BRIDGE_URL', saved.d]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }

  // الواجهة: الرمز قبل الخطّة، والسبب الدقيق في الرسالة
  const js = read('js/video.js');
  const iTok = js.indexOf("drJson('/api/ai?action=app-director-token',{token:tk})");
  assert.ok(iTok > 0 && iTok < js.indexOf('var labels=await drLabels(lang)') && iTok < js.indexOf("'/api/media?action=tts'") && iTok < js.indexOf("'/api/portrait-style'"), 'رمز المهمّة (وفحص الجسر معه) قبل الخطّة والصوت والصور');
  assert.equal(js.split("action=app-director-token',{token:tk}").length - 1, 1, 'نداء رمز واحد لا اثنان');
  assert.ok(js.includes("throw drFail('token '+tr.status+(tr.json&&tr.json.error?' '+tr.json.error:'')+(tr.json&&tr.json.why?' '+tr.json.why:''));"), 'سبب الخادم في سطر التشخيص');
  assert.ok(js.includes("var key=/bridge_outdated/.test(code)?'vdFailBridgeOld':/^plan/.test(code)?'vdFailPlan':"), 'جسر قديم ← رسالته لا «تحقّق من العنوان والسرّ»');
  assert.ok(js.includes("throw drFail('bridge offline (browser)');"), 'فشل الإرسال بعد نجاح فحص الخادم = المتصفّح هو الممنوع');
  // النصّ بالـ١٤ لغة
  const core = read('js/app-03-i18n-data.js');
  const base = { $: () => null, document: { getElementById: () => null, querySelector: () => null }, window: {}, localStorage: { getItem: () => null } }; base.window = base;
  vm.runInNewContext(core, base);
  assert.ok(base.I18N.ar.vdFailBridgeOld && base.I18N.en.vdFailBridgeOld); assert.doesNotMatch(base.I18N.ar.vdFailBridgeOld + base.I18N.en.vdFailBridgeOld, BANNED);
  const seenT = new Set();
  for (const lg of LANGS) {
    const m = read('i18n/' + lg + '.js').match(/v-app-director-bridge-check[^\n]*Object\.assign\(I18N\['(\w+)'\], (\{.*\})\);/);
    assert.ok(m && m[1] === lg, lg + ' كتلة الترجمة');
    const t = JSON.parse(m[2]).vdFailBridgeOld;
    assert.ok(t && t.length > 20, lg); assert.doesNotMatch(t, BANNED, lg); seenT.add(t);
  }
  assert.equal(seenT.size, LANGS.length, 'ترجمات لا نسخ');
  assert.ok(read('index.html').includes('/js/video.js?v=450'));
});
