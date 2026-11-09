// tests/video-autosave.test.cjs — v-video-autosave (طلب المالك ٩ نوفمبر: «اريد خاصيه في الفيديوهات اول مايخلص يتحمل الي الاستوديو»):
// autoSaveVideo كان خطّافًا فارغًا منذ v526. الآن omranAutoSaveVideo (app-05-save-media) يحفظ الفيديو المكتمل في الجهاز:
//   ١) كروم أندرويد/TWA والكمبيوتر: <a download> برمجيّ بالاسم وامتداد النوع، مرّة واحدة لكلّ رابط.
//   ٢) غلاف هواوي: جسر OmranBlobSave يستلم الملفّ أجزاءً ويُعاد بايتًا ببايت — بلا <a download> يسقط صامتًا.
//   ٣) غلاف بجسر مشاركة (تطبيق الآيفون): ورقة النظام بالملفّ نفسه.
//   ٤) سفاري الآيفون: شريط بزرّ واحد يفتح ورقة النظام بالملفّ الجاهز (آبل لا تحفظ في الصور بلا لمسة).
//   ٥) رابط المزوّد يمرّ بالبروكسي بالجلسة في الترويسة؛ ردّ غير ناجح لا يُحفظ ولا يقفل محاولة لاحقة.
//   ٦) كلّ نقطة اكتمال في صانع الفيديو والترندات والمحادثة وأداة الوكيل ومخرج التطبيق تناديه.
//   ٧) نصوصه الأربعة بالـ١٤ لغة ووسم ملفّات اللغات مرفوع.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SAVE_SRC = read('js/app-05-save-media.js');

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/* بيئة متصفّح مصغّرة تكفي الحافظ الموحّد: عناصر بسيطة، روابط blob: في الذاكرة، وجلب مزيّف للبروكسي */
function env(opts) {
  opts = opts || {};
  const clicks = []; const toasts = []; const fetches = []; const swallowed = [];
  const blobs = new Map(); let n = 0;
  const body = {
    children: [],
    appendChild(e) { this.children.push(e); e.parentNode = this; return e; },
  };
  function el(tag) {
    const e = {
      tag, style: {}, dataset: {}, attrs: {}, children: [], textContent: '',
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      remove() { const i = body.children.indexOf(this); if (i >= 0) body.children.splice(i, 1); this.removed = true; },
      click() { clicks.push({ href: this.href, download: this.download, native: this.dataset.nativeDownload, blob: blobs.get(this.href) }); },
    };
    return e;
  }
  const document = {
    body, createElement: el, addEventListener() {},
    getElementById: (id) => body.children.find((c) => c.id === id) || null,
    documentElement: { lang: opts.lang || 'ar' },
  };
  class TURL extends URL {}
  TURL.createObjectURL = (b) => { const u = 'blob:https://omran.test/' + (++n); blobs.set(u, b); return u; };
  TURL.revokeObjectURL = () => {};
  class FR {
    readAsDataURL(b) {
      b.arrayBuffer().then((ab) => {
        this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,' + Buffer.from(ab).toString('base64');
        if (this.onload) this.onload();
      });
    }
  }
  const shared = [];
  const navigator = {
    userAgent: opts.ua || UA_ANDROID, platform: opts.platform || 'Linux armv8l', maxTouchPoints: opts.touch || 5,
    canShare: opts.canShare ? (d) => !!(d && d.files && d.files.length) : undefined,
    share: opts.canShare ? async (d) => { shared.push(d); } : undefined,
  };
  const window = { t: (k) => 'T:' + k };
  const sb = {
    window, document, navigator, URL: TURL, Blob, File, FileReader: FR, atob, Buffer, Promise, setTimeout: () => 0,
    location: { href: 'https://omran.test/', origin: 'https://omran.test' },
    __swallow: (e, w) => { swallowed.push(w + ': ' + (e && e.message)); },
    settingsToast: (m) => toasts.push(m),
    authGet: (k) => (k === 'aiapp_auth_token' ? (opts.token || 'tok-1') : ''),
    fetch: async (u, init) => {
      fetches.push({ u: String(u), auth: init && init.headers && init.headers.Authorization });
      if (String(u).startsWith('blob:')) { const b = blobs.get(String(u)); return { ok: !!b, status: b ? 200 : 404, blob: async () => b }; }
      const pr = opts.proxy || { status: 200, blob: new Blob([Buffer.from('MP4-FROM-PROXY')], { type: 'video/mp4' }) };
      return { ok: pr.status >= 200 && pr.status < 300, status: pr.status, blob: async () => pr.blob };
    },
  };
  window.authGet = sb.authGet;
  if (opts.hw) window.OmranBlobSave = opts.hw;
  if (opts.shareBridge) { sb.omranNativeBridge = (name) => (name === 'omranShare' ? { postMessage() {} } : null); sb.msgDownloadBlob = (b, name) => opts.shareBridge.push({ b, name }); }
  vm.createContext(sb);
  vm.runInContext(SAVE_SRC, sb);
  return { sb, window, clicks, toasts, fetches, swallowed, shared, body, blobs, URL: TURL };
}

test('١. كروم أندرويد والكمبيوتر: الفيديو المكتمل ينزل وحده بالاسم وامتداد نوعه، ومرّة واحدة لكلّ رابط', async () => {
  for (const ua of [UA_ANDROID, UA_DESKTOP]) {
    const E = env({ ua });
    assert.equal(typeof E.window.omranAutoSaveVideo, 'function');
    assert.equal(E.window.autoSaveVideo, E.window.omranAutoSaveVideo, 'الاسم القديم الذي تناديه المحادثة والمخرج');
    const webm = new Blob([Buffer.from('WEBM-BYTES')], { type: 'video/webm' });
    const u = E.URL.createObjectURL(webm);
    assert.equal(await E.window.omranAutoSaveVideo(u, 'omran-ai-video.mp4'), true, ua);
    assert.equal(E.clicks.length, 1, 'تنزيل واحد');
    assert.equal(E.clicks[0].download, 'omran-ai-video.webm', 'الامتداد من نوع الملفّ لا من الاسم (v-vmk-dl-ext)');
    assert.equal(E.clicks[0].native, '1', 'تنزيل أصيل لا تلتقطه مصيدة الصور/الحافظ');
    assert.equal(Buffer.from(await E.clicks[0].blob.arrayBuffer()).toString(), 'WEBM-BYTES', 'الملفّ نفسه');
    assert.deepEqual(E.toasts, ['T:vidAutoSaved'], 'يقول للمستخدم أين ذهب');
    // نداء ثانٍ للرابط نفسه (المشغّل والترقية…) لا ينزّل نسخة ثانية
    assert.equal(await E.window.omranAutoSaveVideo(u, 'x.mp4'), false);
    assert.equal(E.clicks.length, 1);
  }
});

test('٢. غلاف هواوي: الجسر يستلم الملفّ أجزاءً ويُعاد بايتًا ببايت — بلا <a download> يسقط صامتًا في WebView', async () => {
  const calls = []; let buf = [];
  const hw = {
    begin: (name, mime, size) => { calls.push(['begin', name, mime, size]); return 7; },
    chunk: (id, b64) => { calls.push(['chunk', id]); buf.push(Buffer.from(b64, 'base64')); },
    end: (id) => calls.push(['end', id]),
    fail: (id) => calls.push(['fail', id]),
  };
  const E = env({ hw });
  const bytes = Buffer.alloc(2 * 786432 + 1234); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255;
  const u = E.URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  assert.equal(await E.window.omranAutoSaveVideo(u, 'omran-film.mp4'), true);
  assert.deepEqual(calls[0], ['begin', 'omran-film.mp4', 'video/mp4', bytes.length]);
  assert.equal(calls.filter((c) => c[0] === 'chunk').length, 3, 'ثلاثة أجزاء ٧٦٨ ك.ب');
  assert.deepEqual(calls[calls.length - 1], ['end', 7]);
  assert.ok(Buffer.concat(buf).equals(bytes), 'الملفّ المحفوظ = الأصل بايتًا ببايت');
  assert.equal(E.clicks.length, 0, 'لا نقر برمجيّ داخل الغلاف');
  assert.deepEqual(E.toasts, ['T:vidAutoSaved']);
  // الجسر رفض (أكبر من حدّه): لا ادّعاء حفظ، ويمكن المحاولة لاحقًا
  const E2 = env({ hw: { begin: () => -1, chunk() {}, end() {}, fail() {} } });
  const u2 = E2.URL.createObjectURL(new Blob([Buffer.from('x')], { type: 'video/mp4' }));
  assert.equal(await E2.window.omranAutoSaveVideo(u2, 'a.mp4'), false);
  assert.deepEqual(E2.toasts, [], 'لا «نزل» وهو لم ينزل');
});

test('٣. تطبيق الآيفون (جسر المشاركة): ورقة النظام تنفتح بالملفّ نفسه وتلميح «حفظ الفيديو»', async () => {
  const sent = [];
  const E = env({ ua: UA_IPHONE, shareBridge: sent });
  const u = E.URL.createObjectURL(new Blob([Buffer.from('IOS')], { type: 'video/mp4' }));
  assert.equal(await E.window.omranAutoSaveVideo(u, 'chat-video.mp4'), true);
  assert.equal(sent.length, 1); assert.equal(sent[0].name, 'chat-video.mp4');
  assert.equal(Buffer.from(await sent[0].b.arrayBuffer()).toString(), 'IOS');
  assert.equal(E.clicks.length, 0);
  assert.deepEqual(E.toasts, ['T:vidAutoSaveHint']);
});

test('٤. سفاري الآيفون: شريط بزرّ واحد، ولمسته تفتح ورقة النظام بالملفّ الجاهز (لا انتظار يُسقط إذن اللمسة)', async () => {
  const E = env({ ua: UA_IPHONE, platform: 'iPhone', canShare: true });
  const u = E.URL.createObjectURL(new Blob([Buffer.from('SAFARI')], { type: 'video/mp4' }));
  assert.equal(await E.window.omranAutoSaveVideo(u, 'omran-trend-x.mp4'), true);
  assert.equal(E.clicks.length, 0, 'لا تنزيل إلى «الملفّات» بدل الصور');
  const bar = E.body.children.find((c) => c.id === 'omranVidSaveBar');
  assert.ok(bar, 'الشريط ظاهر');
  const [txt, go, x] = bar.children;
  assert.equal(txt.textContent, 'T:vidAutoSaveTap');
  assert.equal(go.textContent, 'T:vidAutoSaveBtn');
  assert.ok(x && typeof x.onclick === 'function', 'زرّ إغلاق');
  go.onclick();
  await new Promise((r) => setImmediate(r));
  assert.equal(E.shared.length, 1, 'ورقة النظام انفتحت');
  const f = E.shared[0].files[0];
  assert.equal(f.name, 'omran-trend-x.mp4');
  assert.equal(Buffer.from(await f.arrayBuffer()).toString(), 'SAFARI');
  assert.ok(bar.removed, 'الشريط يختفي بعد الحفظ');
  // الآيباد بهويّة ماك (iPadOS) يُعامَل آيفون
  const P = env({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', platform: 'MacIntel', touch: 5, canShare: true });
  await P.window.omranAutoSaveVideo(P.URL.createObjectURL(new Blob([Buffer.from('i')], { type: 'video/mp4' })), 'a.mp4');
  assert.ok(P.body.children.find((c) => c.id === 'omranVidSaveBar'));
  assert.equal(P.clicks.length, 0);
});

test('٥. رابط المزوّد: البروكسي بالجلسة في الترويسة لا الرابط؛ ردّ ٤٢٩ لا يُحفظ نصّ خطأ ولا يقفل محاولة لاحقة', async () => {
  const raw = 'https://cdn.provider.test/out/abc.mp4';
  const E = env({ ua: UA_ANDROID, token: 'sess-9' });
  assert.equal(await E.window.omranAutoSaveVideo(raw, ''), true);
  assert.equal(E.fetches[0].u, '/api/video-download?url=' + encodeURIComponent(raw));
  assert.equal(E.fetches[0].auth, 'Bearer sess-9');
  assert.ok(!E.fetches[0].u.includes('sess-9'), 'الرمز لا يدخل أيّ رابط (v-dl-ticket)');
  assert.match(E.clicks[0].download, /^omran-video-\d+\.mp4$/, 'بلا اسم: اسم بالامتداد الصحيح');
  // رابط بروكسي (زرّ التحميل) يُفكّ إلى الوسيط نفسه — لا تكرار للرابط نفسه بشكلين
  assert.equal(await E.window.omranAutoSaveVideo('/api/video-download?url=' + encodeURIComponent(raw), 'a.mp4'), false);
  const F = env({ ua: UA_ANDROID, proxy: { status: 429, blob: new Blob(['{"error":"daily"}'], { type: 'application/json' }) } });
  assert.equal(await F.window.omranAutoSaveVideo(raw, 'a.mp4'), false);
  assert.equal(F.clicks.length, 0, 'ردّ خطأ لا يُحفظ ملفًّا');
  assert.deepEqual(F.toasts, []);
  assert.ok(F.swallowed.some((s) => /autosave: proxy 429/.test(s)), 'العطل يُسجَّل لا يُكتم');
  assert.equal(await F.window.omranAutoSaveVideo(raw, 'a.mp4'), false, 'محاولة ثانية تُجرَّب (لم يُقفل الرابط)');
  assert.equal(F.fetches.length, 2);
  // data: (فيديو «جودة» بلا رفع) يُحفظ كما هو
  const D = env({ ua: UA_DESKTOP });
  assert.equal(await D.window.omranAutoSaveVideo('data:video/mp4;base64,' + Buffer.from('DATA').toString('base64'), 'd.mp4'), true);
  assert.equal(Buffer.from(await D.clicks[0].blob.arrayBuffer()).toString(), 'DATA');
});

test('٦. كلّ نقطة اكتمال تنادي الحفظ: صانع الفيديو (كلّ الأوضاع) والترندات والمحادثة وأداة الوكيل ومخرج التطبيق', () => {
  const vmk = read('js/app-11-video.js');
  const fn = vmk.slice(vmk.indexOf('  function autoSaveVideo(url, name){'), vmk.indexOf('  const narrationToggle'));
  assert.match(fn, /window\.omranAutoSaveVideo\(url, name \|\| \(downloadEl && downloadEl\.getAttribute\('download'\)\)/, 'ما عادت فارغة');
  assert.doesNotMatch(vmk, /window\.autoSaveVideo = autoSaveVideo/, 'الاسم العامّ من الحافظ الموحّد لا من النافذة (لا اسم ملفّ النافذة لفيديو المحادثة)');
  // كلّ إظهار لزرّ «تحميل الفيديو» = فيديو اكتمل → حفظ (أو ترقية تحفظ في نهايتها)
  const marks = [];
  let at = vmk.indexOf("downloadEl.style.display = 'block';");
  while (at > 0) { marks.push(at); at = vmk.indexOf("downloadEl.style.display = 'block';", at + 1); }
  assert.ok(marks.length >= 10, 'نقاط الاكتمال: ' + marks.length);
  for (const m of marks) {
    const next = vmk.slice(m, m + 700);
    assert.match(next.split("downloadEl.style.display = 'block';").slice(0, 2).join(''), /autoSaveVideo\(|upgradeInBackground\(sceneUrls\[0\][^)]*playerUrl\)/, 'نقطة بلا حفظ: ' + vmk.slice(m - 200, m).split('\n').pop());
  }
  // الترقية: ملفّ واحد في النهاية (الأعلى جودة أو الحاليّ) — السلوك نفسه في ai-video-speed ‏٧
  const up = vmk.slice(vmk.indexOf('  async function upgradeInBackground('), vmk.indexOf('  function throwIfDeclined('));
  assert.match(up, /\} finally \{\n\s+autoSaveVideo\(saveUrl\);/);
  assert.match(vmk, /if\(wantQuality && sceneUrls\.length === 1\) upgradeInBackground\(sceneUrls\[0\], token, narrationBlob, runSeq, playerUrl\);\n\s+else autoSaveVideo\(playerUrl\);/);
  // الترندات: الفيديو النهائيّ الواحد وحده (مشاهد لم تُدمج تبقى بأزرارها)
  const vt = read('js/app-11-video-trends.js');
  assert.match(vt, /var savedUrl = await show\(t, urls\);[\s\S]{0,400}if\(savedUrl && typeof window\.autoSaveVideo === 'function'\) window\.autoSaveVideo\(savedUrl, 'omran-trend-' \+ t\.key \+ '\.mp4'\);/);
  assert.match(vt, /return finalUrl; \/\* v-video-autosave/);
  // المحادثة (حرّك الصورة/فيديو من الوصف) وأداة الوكيل ومخرج التطبيق
  assert.equal((read('js/app-09-attach.js').match(/if\(window\.autoSaveVideo\) window\.autoSaveVideo\(__vurl\);/g) || []).length, 2);
  assert.match(read('js/app-17-agent-tools.js'), /window\.autoSaveVideo\(videoUrl, 'chat-video\.mp4'\)/);
  assert.match(read('js/video.js'), /window\.autoSaveVideo\(DR\.out,'omran-app-director-'\+lang\+'\.mp4'\)/);
  // الحزمة تحمل الحافظ (لا تعديل يدويّ عليها — verify يطابقها بأجزائها)
  assert.ok(read('js/app.bundle.js').includes('window.omranAutoSaveVideo = async function(url, name){'));
});

test('٧. النصوص الأربعة بالـ١٤ لغة، مترجمة لا منسوخة، وبلا اسم مزوّد؛ ووسم ملفّات اللغات مرفوع', () => {
  const KEYS = ['vidAutoSaved', 'vidAutoSaveTap', 'vidAutoSaveBtn', 'vidAutoSaveHint'];
  const d = read('js/app-03-i18n-data.js');
  const enAt = d.indexOf('\n  en: {');
  const pick = (s, k) => { const m = new RegExp('\\b' + k + ': "([^"]+)"').exec(s); return m && m[1]; };
  const langs = { ar: d.slice(0, enAt), en: d.slice(enAt) };
  for (const lg of ['fr', 'es', 'ru', 'tr', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) langs[lg] = read('i18n/' + lg + '.js');
  assert.equal(Object.keys(langs).length, 14);
  for (const [lg, s] of Object.entries(langs)) {
    for (const k of KEYS) {
      const v = pick(s, k);
      assert.ok(v && v.length > 3, lg + ' ' + k);
      assert.doesNotMatch(v, /claude|gemini|gpt|openai|runway|veo|minimax|kling|grok|groq/i, lg + ' ' + k + ' بلا اسم مزوّد');
      if (lg !== 'en') assert.notEqual(v, pick(langs.en, k), lg + ' ' + k + ' مترجم');
    }
  }
  assert.match(pick(langs.ar, 'vidAutoSaveBtn'), /الاستوديو/, 'كلمة المالك نفسها');
  // الواجهة تستعمل الأربعة كلّها
  for (const k of KEYS) assert.ok(SAVE_SRC.includes("autoT('" + k + "'"), k);
  const tag = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  // الوسم يُقرأ رقمًا لا يُثبَّت (سقّاطة البنية): مرفوع إلى رقم هذا الطلب أو بعده، وسببه في التعليق
  const tv = /\.js\?v=(\d+)'; /.exec(tag), why = /v-video-autosave \((\d+)\): /.exec(tag);
  assert.ok(tv && why && Number(tv[1]) >= Number(why[1]) && Number(why[1]) > 793, 'وسم اللغات مرفوع وسببه في التعليق');
});
