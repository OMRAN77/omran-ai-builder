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

test('٤. طلب الخطّة بـfetch مزيّف: JSON صالح يُطبَّع على الكتالوج، والفاسد يُعاد مرّة واحدة، والنموذج الغائب ينتقل للتالي', async () => {
  const catalog = CAT.buildCatalog({ lang: 'en' });
  const good = { title: 'Tour', idea: 'Idea', scenes: [
    { type: 'title', text: 'Welcome', narration: 'Hook', seconds: 4 },
    { type: 'screen', target: 'video', narration: 'Video maker', seconds: 9 },
    { type: 'style_sample', target: 'ghibli', narration: 'Ghibli', seconds: 8 },
    { type: 'style_sample', target: 'does-not-exist', narration: 'Unknown style → portrait screen' },
    { type: 'screen', target: 'nope', narration: 'Unknown screen → home', seconds: 99 },
    { type: 'weird', narration: '' },
  ] };
  const reply = (text, status) => ({ ok: !status || status < 400, status: status || 200, json: async () => (status >= 400 ? { error: { message: 'model not found' } } : { candidates: [{ content: { parts: [{ text }] } }] }) });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (calls.length === 1) return reply('', 404);                                   // gemini-3.1-pro-preview غائب
    if (calls.length === 2) return reply('sorry, here is prose and no json');          // فاسد → إعادة
    return reply('```json\n' + JSON.stringify(good) + '\n```');
  };
  const r = await D.requestPlan({ request: 'tour', lang: 'en', speaker: 'male', minutes: 1, catalog, apiKey: 'k', env: {}, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.includes('gemini-3.1-pro-preview') && calls[1].url.includes('gemini-3-pro-preview') && calls[2].url.includes('gemini-3-pro-preview'), 'DIRECTOR_MODEL الافتراضيّ ثمّ التالي بعد 404');
  assert.equal(calls[1].body.contents[0].parts.length, 1); assert.equal(calls[2].body.contents[0].parts.length, 2, 'الإعادة بتنبيه JSON');
  assert.equal(calls[1].body.generationConfig.responseMimeType, 'application/json');
  assert.ok(calls[1].body.systemInstruction.parts[0].text === D.SYSTEM);
  assert.ok(calls[1].body.contents[0].parts[0].text.includes('PORTRAIT STYLES') && calls[1].body.contents[0].parts[0].text.includes('عبدالله (صوت رجل)'));
  const sc = r.plan.scenes;
  assert.equal(sc.length, 5);
  assert.deepEqual(sc.map((s) => s.type), ['title', 'screen', 'style_sample', 'screen', 'screen']);
  assert.equal(sc[3].target, 'portrait'); assert.equal(sc[4].target, 'home'); assert.equal(sc[4].seconds, 25, 'المدّة محصورة');
  assert.equal(r.model, 'gemini-3-pro-preview');
  // DIRECTOR_MODEL يُجرَّب أوّلًا
  assert.deepEqual(D.directorModels({ DIRECTOR_MODEL: 'gemini-x' })[0], 'gemini-x');
  assert.deepEqual(D.directorModels({}), D.DEFAULT_MODELS);
  // فاسد مرّتين = فشل بسبب واضح، بلا نداء ثالث
  let n = 0;
  const bad = await D.requestPlan({ request: 'x', lang: 'ar', speaker: 'female', minutes: 2, catalog, apiKey: 'k', env: {}, fetchImpl: async () => { n++; return reply('{"nope":1}'); } });
  assert.equal(bad.ok, false); assert.equal(bad.why, 'bad_json'); assert.equal(n, 2);
  // عدد المشاهد المستهدف من المدّة
  assert.equal(D.sceneTarget(10), 75); assert.equal(D.sceneTarget(1), 8);
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
  const saved = { s: process.env.CC_BRIDGE_SECRET, u: process.env.CC_BRIDGE_URL, g: process.env.GEMINI_API_KEY };
  try {
    delete process.env.CC_BRIDGE_SECRET; delete process.env.CC_BRIDGE_URL; delete process.env.GEMINI_API_KEY;
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
    for (const [k, v] of [['CC_BRIDGE_SECRET', saved.s], ['CC_BRIDGE_URL', saved.u], ['GEMINI_API_KEY', saved.g]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});

test('٧. القسم في شريط صانع الفيديو للمالك وحده وبلا إيموجي، ويقود المسار كاملًا من المتصفّح بلا سرّ ولا عنوان جسر', () => {
  const js = read('js/video.js');
  assert.ok(js.includes("TABS.concat(drOwner()?['director']:[])"), 'الزرّ يُبنى للمالك فقط');
  assert.ok(js.includes("if(!card||!drOwner()||id('vmkDirector')) return;"), 'اللوحة لا تُنشأ لغير المالك — لا أثر في DOM');
  assert.ok(js.includes("if(TABS.indexOf(v)<0&&!(v==='director'&&drOwner())) return;"));
  assert.ok(js.includes("if(v==='director') return L('vdTab')||'مخرج التطبيق';"));
  for (const k of ['action=app-director-plan', 'action=app-director-token', "'/api/media?action=tts'", "'/api/media?action=maha-image'", "'/api/portrait-style'", "bridge+'/render'", "bridge+'/render/'+encodeURIComponent(jobId)", 'setTimeout(x,3000)', 'window.autoSaveVideo(DR.out']) assert.ok(js.includes(k), k);
  assert.ok(js.includes("voice:'maha',lang:lang,gender:speaker"), 'التعليق بصوت مها/عبدالله باللغة المختارة');
  assert.ok(!/CC_BRIDGE_SECRET|CC_BRIDGE_URL|railway\.app|vercel\.app/.test(js), 'لا سرّ ولا عنوان جسر في العميل');
  const block = js.slice(js.indexOf('v-app-director (المالك:'), js.indexOf('v-vmk-clean-video: قسم'));
  assert.ok(block.length > 5000 && block.includes('async function drRun()'), 'كتلة القسم كاملة');
  const EMO = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u;
  assert.doesNotMatch(block, EMO, 'بلا إيموجي');
  assert.doesNotMatch(block, BANNED, 'بلا اسم مزوّد');
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
  assert.ok(read('index.html').includes('/js/video.js?v=442'));
  assert.ok(read('js/app-04-i18n-state.js').includes("sc.src = 'i18n/' + lg + '.js?v=737';"));
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
