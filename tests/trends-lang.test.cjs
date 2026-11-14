// v-trends-lang (المالك ١٤ نوفمبر بلقطتين: الواجهة إنجليزيّة وأسماء بطاقات الترندات عربيّة، وصورة الانتظار فيها «انتاج_الرسوم_المكتمل»؛
// «١٤ اللغات… إذا أسوّي أيّ فيديو فقط بالعربي… أريده بكلّ اللغات الموجودة، والترندات غيّر اللغة»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

/* DOM صغير يكفي boot() وrenderGrid() في app-11-video-trends.js — العناصر بمعرّفاتها، والمراقب يُلتقط لنستدعيه عند تبديل اللغة */
function fakeEl(tag) {
  const e = { tagName: tag, style: { cssText: '' }, children: [], attrs: {}, textContent: '' };
  let html = '';
  Object.defineProperty(e, 'innerHTML', { get: () => html, set: (v) => { html = v; if (v === '') e.children = []; } });
  e.appendChild = (c) => { e.children.push(c); return c; };
  e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
  e.getAttribute = (k) => e.attrs[k];
  e.remove = () => {};
  e.insertAdjacentElement = () => {};
  e.addEventListener = () => {};
  e.querySelector = () => null;
  return e;
}
function loadTrends(startLang) {
  const byId = {};
  const get = (id) => byId[id] || (byId[id] = fakeEl('div'));
  const desc = fakeEl('div');
  const modal = get('videoMakerModal');
  modal.querySelector = (q) => (q === 'h3' ? { parentElement: desc } : null);
  get('vtPanel').style.display = 'none'; /* كما يبنيه innerHTML في boot */
  let observer = null;
  const ctx = {
    lang: startLang, console,
    document: {
      getElementById: (id) => (id === 'vtRoot' ? byId.__root || null : get(id)),
      createElement: (t) => fakeEl(t),
      documentElement: {},
    },
    localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: function (cb) { observer = cb; this.observe = () => {}; },
    RegExp,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-11-video-trends-data.js'), ctx);
  vm.runInContext(read('js/app-11-video-trends.js'), ctx);
  ctx.__videoTrendsBoot();
  const names = () => get('vtGrid').children.map((c) => c.children[c.children.length - 1].textContent);
  return { ctx, get, names, fire: () => observer && observer() };
}

test('١. تبديل اللغة وترند مفتوح: البطاقات تُبنى بالجديدة (كانت تبقى عربيّة بعد «كل الترندات»)', () => {
  const D = (() => { const c = { window: {} }; c.window = c; vm.createContext(c); vm.runInContext(read('js/app-11-video-trends-data.js'), c); return c.__VIDEO_TRENDS; })();
  const t = loadTrends('ar');
  assert.equal(t.names()[0], D.trends[0].title.ar);
  t.get('vtPanel').style.display = 'block'; t.get('vtGrid').style.display = 'none'; /* openTrend: اللوحة ظاهرة والشبكة مخفيّة */
  for (const L of ['en', 'fr', 'zh', 'ur']) {
    t.ctx.lang = L; t.fire();
    assert.equal(t.names()[0], D.trends[0].title[L], L + ': اسم البطاقة الأولى');
    assert.equal(t.names().length, D.trends.length, L + ': كلّ البطاقات');
  }
  assert.equal(t.get('vtPanel').style.display, 'block', 'اللوحة المفتوحة لا تُغلق');
  assert.equal(t.get('vtGrid').style.display, 'none', 'والشبكة تبقى مخفيّة حتّى «كل الترندات»');
  t.ctx.lang = 'en'; t.fire();
  assert.ok(t.names().every((n) => !/[؀-ۿ]/.test(n)), 'بالإنجليزيّة: لا اسم بطاقة عربيّ');
  assert.ok(!/[؀-ۿ]/.test(t.get('vtTitle').textContent + t.get('vtSub').textContent), 'والعنوانان إنجليزيّان');
});

test('٢. العميل يرسل لغة الواجهة مع الترند', () => {
  assert.match(read('js/app-11-video-trends.js'), /var params = \{ name: txt, text: txt, lang: lg\(\) \}/);
});

test('٣. الخادم: كلام الفيديو بلغة الواجهة في اللغات الثلاث عشرة، والعربيّة وبلا لغة كما كانت حرفيًّا', () => {
  const v = require(rp('api/_lib/video-trends.js'));
  const p = (k, lang) => v.buildTrendPrompt(k, { text: 'hello', name: 'Sara', lang }).prompt;
  assert.equal(Object.keys(v.SPEECH_LANGS).length, 13);
  for (const [code, name] of Object.entries(v.SPEECH_LANGS)) {
    assert.ok(p('talkingpet', code).includes("saying in " + name + ": 'hello'"), code);
    assert.ok(p('pixarstory', code).includes(name + ' narration voice-over'), code);
    assert.ok(p('pixarsketch', code).includes('lip-synced dialogue in ' + name), code);
    assert.ok(p('eidgreeting', code).includes("in " + name + " 'Eid Mubarak, Sara'"), code);
    assert.ok(p('ramadan', code).includes("'Ramadan Mubarak, Sara'"), code);
  }
  for (const k of Object.keys(v.TRENDS)) {
    assert.equal(p(k, 'ar'), p(k, undefined), k + ': العربيّة = القالب القديم');
    if (k === 'calligraphy') { assert.equal(p(k, 'en'), p(k, 'ar'), 'الخطّ العربيّ موضوعه الحروف العربيّة'); continue; }
    const en = p(k, 'en');
    assert.ok(!/\bin Arabic\b|Gulf Arabic dialect|Arabic narration|[؀-ۿ]/.test(en), k + ': لا كلام عربيّ بالإنجليزيّة');
  }
  assert.ok(p('talkingpet', 'ar').includes("saying in Arabic: 'hello'"));
  assert.ok(p('talkingpet', 'xx').includes("saying in Arabic: 'hello'"), 'رمز غير معروف = كما كان');
});

test('٤. صانع الفيديو: الراوي والسيناريو بلغة الواجهة الأربع عشرة لا عربيّ/إنجليزيّ فقط', () => {
  const s = read('js/app-11-video.js');
  assert.ok(!/lang: \(?bT\('ar','en'\)/.test(s), 'لا lang من bT');
  assert.equal((s.match(/voice: 'maha', lang: narrLang\(/g) || []).length, 5, 'كلّ نداءات الراوي');
  assert.equal((s.match(/style, lang: uiLangCode\(\)/g) || []).length, 2, 'الفيلم والفيديو الطويل');
  const ctx = { lang: 'fr', localStorage: { getItem: () => null } };
  vm.createContext(ctx);
  const a = s.indexOf('  function uiLangCode()'), b = s.indexOf('  function isOwnerAccount()');
  vm.runInContext(s.slice(a, b), ctx);
  assert.equal(ctx.narrLang('Bonjour à tous'), 'fr');
  assert.equal(ctx.narrLang('هلا والله'), 'ar', 'نصّ عربيّ بواجهة فرنسيّة = الصوت العربيّ');
  ctx.lang = 'ur'; assert.equal(ctx.narrLang('سب کو سلام'), 'ur');
  ctx.lang = 'zh-CN'; assert.equal(ctx.uiLangCode(), 'zh');
});

test('٥. سيناريو الفيلم بلغة الواجهة: العنوان والراوي بها والوصف البصريّ بالإنجليزيّة', async () => {
  const saved = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'k';
  const sent = [];
  const stub = (f, exp) => { const id = rp(f); require.cache[id] = { id, filename: id, loaded: true, exports: exp }; };
  stub('api/_lib/_videoUsage.js', { checkVideoQuota: async () => ({ allowed: true, username: 'u' }), checkOwnerBypass: async () => ({ allowed: true }), isOwner: () => false });
  stub('api/_lib/_oa-light.js', { oaLightFetch: async (key, body) => { sent.push(body.messages[1].content); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"title":"t","scenes":[{"visual":"v","narration":"n"}]}' } }] }) }; } });
  delete require.cache[rp('api/_lib/video-script.js')];
  const handler = require(rp('api/_lib/video-script.js'));
  const call = async (lang) => { const r = { code: 0, setHeader() {}, status(c) { r.code = c; return r; }, json() { return r; }, end() {} }; await handler({ method: 'POST', body: { topic: 'a coffee shop', mode: 'film', lang } }, r); return r.code; };
  try {
    assert.equal(await call('fr'), 200);
    assert.ok(sent[0].includes('LANGUAGE: write "title" and every "narration" in French; keep every "visual" in English.'), sent[0]);
    await call('en'); assert.ok(!sent[1].includes('LANGUAGE:'), 'الإنجليزيّة كما كانت');
    await call('ar'); assert.ok(!sent[2].includes('LANGUAGE:') && sent[2].includes('الموضوع'), 'العربيّة كما كانت');
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved;
    for (const f of ['api/_lib/_videoUsage.js', 'api/_lib/_oa-light.js', 'api/_lib/video-script.js']) delete require.cache[rp(f)];
  }
});

test('٦. مخرج التطبيق: لغة الفيديو تتبع الواجهة ما لم يخترها المالك', () => {
  const s = read('js/video.js');
  assert.match(s, /ls\.addEventListener\('change',function\(\)\{ ls\.dataset\.picked='1'; \}\);/);
  assert.match(s, /if\(!DR\.busy&&!dl\.dataset\.picked&&dl\.value!==dul&&DR_LANGS\.some\(/);
  /* والصانع المفتوح يعيد نصوصه (الأقسام، «شاهد: كيف تسوي فيديو»، المخرج) عند تبديل اللغة — كانت تبقى بالقديمة حتّى يُغلق */
  assert.match(s, /new MutationObserver\(function\(\)\{ if\(M\.style\.display&&M\.style\.display!=='none'\) enhance\(\); \}\)\.observe\(document\.documentElement,\{attributes:true,attributeFilter:\['lang'\]\}\)/);
  const v = Number((read('index.html').match(/\/js\/video\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v >= 470, 'وسم video.js رُفع: ' + v);
});

test('٧. صور انتظار الفيديو بلا نصّ محروق: النسخ النظيفة بمقاس أصولها، والأصول باقية', () => {
  const s = read('js/app-34-gen-wait.js');
  const srcs = [...s.matchAll(/src: '\/assets\/videos\/scenes\/([a-z0-9-]+)\.webp\?v=\d+'/g)].map((m) => m[1]).filter((n) => !/-r1$/.test(n)); /* أقواس الحلقات قصّات بلا نصّ */
  assert.equal(srcs.length, 18);
  const dims = (f) => { const b = fs.readFileSync(path.join(root, 'assets/videos/scenes', f + '.webp')); const k = b.slice(12, 16).toString('latin1');
    if (k === 'VP8 ') { const i = b.indexOf(Buffer.from([0x9d, 0x01, 0x2a])); return [b.readUInt16LE(i + 3) & 0x3fff, b.readUInt16LE(i + 5) & 0x3fff]; }
    if (k === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    throw new Error(f + ': ' + k); };
  for (const n of srcs) {
    assert.match(n, /-clean$/, n);
    const orig = n.replace(/-clean$/, '');
    assert.ok(fs.existsSync(path.join(root, 'assets/videos/scenes', orig + '.webp')), orig + ': الأصل باقٍ');
    assert.deepEqual(dims(n), dims(orig), n + ': نفس المقاس فالإحداثيّات صحيحة');
  }
  assert.ok(read('package.json').includes('node tests/trends-lang.test.cjs'), 'الاختبار مسجَّل');
  assert.ok(read('knowledge/DECISIONS.md').includes('v-trends-lang'), 'مدخل القرار');
});
