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
  assert.ok(h.includes('src="/js/video.js?v=427"') && h.includes('modules.css?v=665'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=730'"));
});
