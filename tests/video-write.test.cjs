// tests/video-write.test.cjs — v-video-write: مساعد الكتابة داخل صانع الفيديو (مضبوط على مدّة الفيديو)
// (المالك: «مساعد يقوله اكتب لي قصة عن كذا… بلا ما يسير للمحادثة ويرجع» + «كيف تبني المحتوى حسب المدّة»)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const vw = require('../api/_lib/video-write.js');

test('ميزانيّة الكلمات والمشاهد تتبع المدّة', () => {
  assert.equal(vw.secondsOf('long20'), 20);
  assert.equal(vw.secondsOf('adspot'), 5);
  assert.equal(vw.secondsOf('zzz'), 8);
  assert.ok(vw.speechBudget(5) < vw.speechBudget(8) && vw.speechBudget(8) < vw.speechBudget(20));
  assert.equal(vw.sceneCount(5), 1);
  assert.equal(vw.sceneCount(10), 2);
  assert.equal(vw.sceneCount(20), 3);
  const p = vw.buildPrompt({ request: 'قصة', kind: 'ad', seconds: 5, characters: ['خالد'] });
  assert.match(p, /EXACTLY 5 seconds/);
  assert.match(p, new RegExp('at most ' + vw.speechBudget(5) + ' words'));
  assert.match(p, /call to action/);
});

test('المحلّل يقصّ الكلام على الميزانيّة، يقدّم الحوار، ويردّ اسمًا غريبًا إلى شخصيّات الفيديو', () => {
  const raw = JSON.stringify({ scene: 'محل قهوة', narration: 'كلمة '.repeat(60), lines: [{ who: 'خالد', text: 'هلا والله' }, { who: 'غريب', text: 'عندنا عروض' }], onScreen: 'افتتاح' });
  const r = vw.parseReply(raw, 5, ['خالد', 'مريم']);
  const spoken = r.lines.map((l) => l.text).join(' ') + ' ' + r.narration;
  assert.ok(spoken.split(/\s+/).filter(Boolean).length <= vw.speechBudget(5));
  assert.deepEqual(r.lines.map((l) => l.who), ['خالد', 'مريم']);
  assert.equal(vw.parseReply('ليس JSON', 8, []), null);
  assert.equal(vw.parseReply('{"scene":"","narration":"","lines":[]}', 8, []), null);
});

test('write يستدعي السلسلة المجّانيّة ويقصّ الناتج؛ والفشل = null', async () => {
  let seen = null;
  const ok = await vw.write({ request: 'اكتب لي قصة', kind: 'story', seconds: 8, characters: [], chain: async (o) => { seen = o; return { ok: true, text: '{"scene":"مشهد","narration":"كلمة كلمة"}' }; } });
  assert.equal(ok.scene, 'مشهد');
  assert.match(seen.messages[0].content, /EXACTLY 8 seconds/);
  assert.equal(await vw.write({ request: 'x', seconds: 8, chain: async () => ({ ok: false }) }), null);
});

test('المعالج: يتطلّب حسابًا، ويرفض الطلب الفارغ، ولا يخصم نقاطًا', async () => {
  const mk = () => { const o = { code: 0, body: null, headers: {} }; return { o, res: { setHeader() {}, status(c) { o.code = c; return this; }, json(b) { o.body = b; return this; }, end() { return this; } } }; };
  let m = mk(); await vw({ method: 'POST', body: { request: '' }, headers: {} }, m.res); assert.equal(m.o.code, 400);
  m = mk(); await vw({ method: 'GET', headers: {} }, m.res); assert.equal(m.o.code, 405);
  assert.ok(!/points|deduct|spend/i.test(read('api/_lib/video-write.js')));
});

test('الربط: التوجيه، السلسلة، الواجهة، النصوص بالـ١٤ لغة، والوسوم', () => {
  assert.match(read('api/tools.js'), /case 'video-write': return require\('\.\/_lib\/video-write\.js'\);/);
  assert.match(read('api/_lib/video-write.js'), /completeFreeChain/);
  const js = read('js/video.js');
  assert.ok(js.includes("/api/tools?action=video-write") && js.includes("id='vmkWrite'") && js.includes('vwToScene'));
  const KEYS = ['vwTitle', 'vwSub', 'vwPh', 'vwSend', 'vwSug1', 'vwSug2', 'vwToScene', 'vwToNarr', 'vwToActor', 'vwBusy', 'vwErr', 'vwLimit', 'vwLogin', 'vwFit'];
  const base = read('js/app-03-i18n-data.js');
  KEYS.forEach((k) => assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k));
  ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].forEach((lg) => {
    const s = read('i18n/' + lg + '.js');
    KEYS.forEach((k) => assert.ok(new RegExp('^\\s*' + k + ': "[^"]+",', 'm').test(s), lg + ' ← ' + k));
    assert.ok(/\{n\}/.test(s.match(/vwFit: "([^"]+)"/)[1]) && /\{w\}/.test(s.match(/vwFit: "([^"]+)"/)[1]), lg + ' vwFit');
  });
  const h = read('index.html');
  assert.ok(h.includes('src="/js/video.js?v=458"') && h.includes('modules.css?v=693'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=771'"));
});

test('v-write-fix: سقف ١٦٠٠، وجواب مقطوع يُرفض فتنتقل السلسلة للمزوّد التالي بدل «تعذّرت الكتابة»', async () => {
  let seen = null;
  await vw.write({ request: 'x', seconds: 10, chain: async (o) => { seen = o; return { ok: false, errors: [] }; } });
  assert.equal(seen.max_tokens, 1600);
  assert.equal(seen.accept('{"scene":"مشهد البحر","narr'), false);
  assert.equal(seen.accept('{"scene":"مشهد","narration":"هلا"}'), true);
  const fc = require('../api/_lib/free-chain.js');
  const calls = [];
  const completion = (t, fr) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: t }, finish_reason: fr || 'stop' }] }), text: async () => '' });
  const fetchImpl = async (url) => { calls.push(url); return /groq/.test(url) ? completion('{"scene":"مشهد مقطو', 'length') : completion('{"scene":"مشهد كامل","narration":"هلا والله"}'); };
  const env = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k', FREE_CHAIN: 'groq,gemini' };
  const diag = [];
  const r = await vw.write({ request: 'x', seconds: 8, env, diag, chain: (o) => fc.completeFreeChain(Object.assign({}, o, { fetchImpl, now: 1 })) });
  assert.equal(r && r.scene, 'مشهد كامل');
  assert.match(diag.join(' '), /groq: rejected \(length/);
  assert.ok(calls.some((u) => /groq/.test(u)) && calls.some((u) => /generativelanguage/.test(u)));
});

test('v-write-fix: سبب الفشل يرجع للمالك وحده', () => {
  const src = read('api/_lib/video-write.js');
  assert.match(src, /isOwnerName\(gate\.username\)/);
  assert.match(src, /owner \? \{ diag \} : \{\}/);
});

test('v-emirati: بالعربيّ قواعد إماراتيّة صريحة، والكلام الدخيل (مصريّ/شاميّ) يُرفض فتنتقل السلسلة، وإن لم يسلم أحد يرجع أوّل جواب', async () => {
  const p = vw.buildPrompt({ request: 'اكتب لي إعلان', kind: 'ad', seconds: 10 });
  assert.ok(p.includes('MEANING FIRST') && p.includes('Never stuff dialect words') && p.includes('وايد') && p.includes('NEVER use') && p.includes('second person') && p.includes('never copy or reuse their words'));
  assert.ok(!vw.buildPrompt({ request: 'write an ad', kind: 'ad', seconds: 10 }).includes('MEANING FIRST'), 'غير العربيّ بلا قواعد اللهجة');
  // جمل الراوي في فيديوَي الموقع (١٧ أكتوبر)
  assert.equal(vw.nonEmirati({ narration: 'تفصيل الصقر وهو بيطير واضح زي النهار!' }), true);
  assert.equal(vw.nonEmirati({ narration: 'هلا', lines: [{ who: 'أ', text: 'عايز فيديو كده' }] }), true);
  assert.equal(vw.nonEmirati({ narration: 'تبا فيديو بسرعة؟ تكتب الوصف، وتضغط إنشاء… والحين جاهز، مب مشكلة!' }), false);
  assert.equal(vw.nonEmirati({ narration: 'مشمش ومشكلة وزيت' }), false, 'الكلمة كاملة لا جزء منها');
  assert.equal(vw.nonEmirati({ scene: 'زي تقليدي', narration: 'الصقر يطير' }), false, 'المشهد وصف للمولّد فلا يُفحص');
  const EG = '{"scene":"صحراء","narration":"الصقر بيطير زي النهار"}', AE = '{"scene":"صحراء","narration":"الصقر يطير فوق الرمل، شي وايد حلو"}';
  let acc = null;
  const two = await vw.write({ request: 'اكتب عن صقر', seconds: 8, chain: async (o) => { acc = o.accept; return o.accept(EG) ? { ok: true, text: EG } : o.accept(AE) ? { ok: true, text: AE } : { ok: false }; } });
  assert.equal(two.narration, 'الصقر يطير فوق الرمل، شي وايد حلو', 'المزوّد التالي الإماراتيّ');
  assert.equal(acc('{"scene":"x","narration":"hello like that"}'), true);
  const only = await vw.write({ request: 'اكتب عن صقر', seconds: 8, chain: async (o) => { o.accept(EG); return { ok: false, errors: [] }; } });
  assert.equal(only.narration, 'الصقر بيطير زي النهار', 'لا أحد سلم ← أوّل جواب مقروء بدل «تعذّرت الكتابة»');
  const en = await vw.write({ request: 'falcon video', seconds: 8, chain: async (o) => (o.accept(EG) ? { ok: true, text: EG } : { ok: false }) });
  assert.equal(en.narration, 'الصقر بيطير زي النهار', 'طلب غير عربيّ لا يُفحص');
});

test('v-emirati-oa: بالعربيّ OpenAI الخفيف أوّلًا، وكلامه الدخيل أو فشله = السلسلة المجّانيّة؛ وبلا مفتاح أو بغير العربيّ لا نداء له', async () => {
  assert.equal(vw.nonEmirati({ narration: 'الخوف ما يمنعش من التعلم' }), true, 'نفي بالشين');
  assert.equal(vw.nonEmirati({ narration: 'الصقر ما يعيش إلا هني' }), false, '«ما يعيش» إماراتيّ');
  const calls = [];
  const oa = (content, status) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ model: 'gpt-6-luna', choices: [{ message: { content } }] }), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); };
  const AE = '{"scene":"صحراء","narration":"الصقر يحوم فوق الرمل، شي وايد حلو"}';
  const fc = require('../api/_lib/free-chain.js');
  const env = { OPENAI_API_KEY: 'sk-test' };
  const info = {};
  const r1 = await vw.write({ request: 'اكتب عن صقر', seconds: 8, env, info, fetchImpl: oa(AE) });
  assert.equal(r1.narration, 'الصقر يحوم فوق الرمل، شي وايد حلو');
  assert.equal(info.provider, 'openai:gpt-6-luna');
  assert.ok(calls[0].url.includes('api.openai.com') && calls[0].body.messages[0].content.includes('MEANING FIRST'));
  // دخيل من OpenAI ← السلسلة (بلا مفاتيح هنا فلا شيء) ← أوّل جواب مقروء
  calls.length = 0; const diag = [];
  const r2 = await vw.write({ request: 'اكتب عن صقر', seconds: 8, env, diag, fetchImpl: oa('{"scene":"x","narration":"الصقر بيطير زي النهار"}') });
  assert.equal(r2.narration, 'الصقر بيطير زي النهار');
  assert.ok(diag[0] === 'openai: rejected', diag.join('|'));
  // غير العربيّ: لا نداء لـOpenAI
  calls.length = 0;
  await vw.write({ request: 'falcon video', seconds: 8, env, fetchImpl: oa(AE) });
  assert.ok(!calls.some((c) => c.url.includes('api.openai.com')));
  assert.ok(fc && typeof fc.completeFreeChain === 'function');
});
