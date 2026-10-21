// tests/rest-fixes.test.cjs — v-rest-fixes (المالك ٢١ أكتوبر: «صلح الي تقدر عليه والي يريد شحن اجله وسولي فيه جدول»):
// ما بقي من تقارير اليوم ولا يحتاج شحن رصيد:
//  ١) بدء الفيديو: نصّ عربيّ في الواجهة الإنجليزيّة وغيرها («❌ Error: تعذّر بدء الفيديو…») → رمز video_busy · video_rejected بالـ14 لغة (v-vid-codes).
//  ٢) سقف الصور في الساعة يصل رمزًا خامًّا «image_hourly_limit» → نصّ بالحدّ والدقائق (١٤ لغة).
//  ٣) الطوابع والإعلان واستوديو الديكور: نصّ المزوّد نفسه في الرسالة → رسالة عامّة والنصّ للسجلّ (أو detail للمالك).
//  ٤) الكرتون في الشخصيّة الناطقة: «جرّب صورة أوضح» لكلّ فشل → سبب الفشل الحقيقيّ.
//  ٥) صانع الفيديو في الجوّال: تنبيها «اكتب وصف الفيديو» و«سجّل الدخول» يُكتبان فوق الشاشة → يُمرَّران إلى العين (v-actor-notice).
//  ٦) فشل الفيديو عند الاستطلاع يلوم الصورة أو الوصف وحدهما → «أعد المحاولة، وإن تكرّر…».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, 'api/_lib', f));

function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('unclosed ' + name);
}
// قاموس العربيّة والإنجليزيّة من app-03 (القسم الأوّل ar والثاني en — كما في acct-delete ٧)
function dict(lang) {
  const a3 = read('js/app-03-i18n-data.js');
  const out = {};
  for (const k of ['imgHourlyLimit', 'vidBusy', 'vidRejected']) {
    const m = [...a3.matchAll(new RegExp('\\b' + k + ":\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))];
    assert.equal(m.length, 2, k);
    out[k] = m[lang === 'ar' ? 0 : 1][1].replace(/\\'/g, "'");
  }
  return out;
}

test('١. بدء الفيديو: رمز يترجمه العميل لا نصّ عربيّ في error، والعربيّ في message_ar، والإعادة كما كانت', () => {
  const { startFail, TEMP, BAD } = require(rp('_videoFail.js'));
  const busy = startFail(429, 'Resource has been exhausted (e.g. check quota).');
  assert.deepEqual(busy.body, { error: 'video_busy', message_ar: TEMP, retryable: true });
  const bad = startFail(400, 'Your prompt was flagged by our content moderation system.');
  assert.deepEqual(bad.body, { error: 'video_rejected', message_ar: BAD, retryable: false });
  assert.doesNotMatch(busy.body.error + bad.body.error, /[؀-ۿ]/, 'لا عربيّة في الرمز');
});

test('٢. العملاء يترجمون الرموز بلغة الواجهة: صانع الفيديو والترندات والمحادثة (والشخصيّة الناطقة والوكيل عبرها)', () => {
  for (const lang of ['ar', 'en']) {
    const D = dict(lang);
    const ctx = { t: (k) => D[k] || k, window: {}, lang };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(read('js/app-09-attach.js'), 'omranVideoCodeText') + ';this.f = omranVideoCodeText;', ctx);
    assert.equal(ctx.f('video_busy'), D.vidBusy, lang);
    assert.equal(ctx.f('video_rejected'), D.vidRejected, lang);
  }
  assert.match(read('js/app-11-video.js'), /if\(\(code === 'video_busy' \|\| code === 'video_rejected'\) && typeof window\.t === 'function'\) return '⚠️ ' \+ window\.t\(code === 'video_busy' \? 'vidBusy' : 'vidRejected'\);/);
  assert.match(read('js/app-11-video-trends.js'), /e\.code === 'video_busy' \|\| e\.code === 'video_rejected'/);
});

test('٣. سقف الصور في الساعة: نصّ بالحدّ والدقائق الباقية بدل الرمز الخامّ', () => {
  for (const lang of ['ar', 'en']) {
    const D = dict(lang);
    const ctx = { t: (k) => D[k] || k, window: {}, __swallow: () => {}, setTimeout };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(read('js/app-02-tts.js'), 'imgErrFriendly') + ';this.f = imgErrFriendly;', ctx);
    const s = ctx.f('image_hourly_limit', lang === 'ar', { error: 'image_hourly_limit', retryAfter: 600, max: 20 });
    assert.ok(s && !/image_hourly_limit|\{max\}|\{m\}/.test(s), lang + ': ' + s);
    assert.match(s, /20/); assert.match(s, /10/);
  }
});

test('٤. النصوص الثلاثة بالـ14 لغة، بلا اسم مزوّد، وبالمتغيّرين نفسيهما', () => {
  const K = ['imgHourlyLimit', 'vidBusy', 'vidRejected'];
  const BANNED = /gemini|google|openai|gpt|claude|anthropic|runway|veo|جيمناي|جيميني/i;
  const D = { ar: dict('ar'), en: dict('en') };
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [lg]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + lg + '.js'), ctx);
    D[lg] = ctx.I18N[lg];
  }
  assert.equal(Object.keys(D).length, 14);
  for (const [lg, d] of Object.entries(D)) for (const k of K) {
    assert.ok(d[k], lg + ' ' + k);
    assert.doesNotMatch(d[k], BANNED, lg + ' ' + k);
    if (k === 'imgHourlyLimit') { assert.match(d[k], /\{max\}/, lg); assert.match(d[k], /\{m\}/, lg); }
  }
  const tag = Number((/lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')) || [])[1]);
  assert.ok(tag >= 769, 'وسم اللغات رُفع: ' + tag); // يُقرأ من الملفّ لا يُثبَّت
});

test('٥. الطوابع والإعلان: نصّ المزوّد لا يصل المستخدم (للسجلّ وحده)', async () => {
  const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  stub('points.js', { verifyPointsToken: () => 'sara', isOwnerUsername: () => false });
  stub('_usage.js', { refundCustom: async () => {}, checkAndConsume: async () => ({ allowed: true }), clientIp: () => null, DAILY_LIMIT: 20 });
  stub('_planCap.js', { checkAndConsumePlanCustom: async () => ({ allowed: true, limit: 5 }) });
  stub('adtemplate.js', new Proxy({}, { get: () => () => '' }));
  process.env.OPENAI_API_KEY = 'test'; process.env.GEMINI_API_KEY = 'test';
  const LEAK = 'Invalid image file or mode for image 1, please check your image file. (org-12345 openai)';
  const B64 = Buffer.alloc(300, 1).toString('base64');
  for (const f of ['stamps.js', 'adimage.js']) {
    for (const fetchImpl of [async () => Response.json({ error: { message: LEAK } }, { status: 400 }), async () => { throw new Error(LEAK); }]) {
      const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end(s) { this.body = JSON.parse(s); return this; } };
      const save = global.fetch, e = console.error, w = console.warn; global.fetch = fetchImpl; console.error = () => {}; console.warn = () => {};
      try { delete require.cache[rp(f)]; await require(rp(f))({ method: 'POST', headers: {}, body: { token: 't', title: 'عرض', imageBase64: B64, mimeType: 'image/png' } }, res); }
      finally { global.fetch = save; console.error = e; console.warn = w; }
      assert.ok(res.code >= 400, f);
      assert.doesNotMatch(JSON.stringify(res.body), /Invalid image|org-12345|openai/i, f + ': ' + JSON.stringify(res.body));
      assert.match(res.body.message_ar, /حاول مرّة أخرى/, f);
    }
  }
  const dc = read('api/_lib/design-create.js');
  assert.doesNotMatch(dc, /\.json\(\{ error: gmsg/, 'استوديو الديكور: نصّ المزوّد في error');
  assert.match(dc, /error: 'تعذّر تصميم الصورة الآن — حاول مرّة أخرى\.', detail: gmsg/);
  // الإعلان في الواجهة غير العربيّة: نصّ مترجم لا message_ar
  assert.match(read('js/app-09-attach.js'), /\(lang === 'ar' \? \(__adData\.message_ar \|\| 'خطأ غير معروف'\) : t\('voiceImageFailed'\)\)/);
});

test('٦. الكرتون يقول سبب الفشل الحقيقيّ، وتنبيها صانع الفيديو يُمرَّران، وفشل الاستطلاع لا يلوم المستخدم وحده', () => {
  const at = read('js/app-09-attach.js');
  assert.match(at, /if\(!__cartoonB64\) throw new Error\(imgErrFriendly\(__cartoonErr && __cartoonErr\.error, lang==='ar', __cartoonErr\) \|\| /);
  assert.match(at, /else if\(\(__cartoonErr = __cd\) && __cd\.error === 'unavailable'\)/);
  const v = read('js/app-11-video.js');
  assert.match(v, /showNotice\(\(typeof window\.t === 'function' && window\.t\('videoNeedDesc'\)/);
  assert.match(v, /showNotice\(bT\('🔑 يجب تسجيل الدخول أولًا لاستخدام صانع الفيديو\./);
  assert.doesNotMatch(v, /setStatus\(\(typeof window\.t === 'function' && window\.t\('videoNeedDesc'\)/);
  assert.match(read('api/_lib/veo-status.js'), /const FAIL_OTHER = 'أعد المحاولة، وإن تكرّر فجرّب صورة أو وصفًا آخر\.';/);
});
