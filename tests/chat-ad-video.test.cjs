'use strict';
/* v-chat-ad-video (المالك ١٦ نوفمبر: «كيف أخلّي التطبيق في المحادثة يسوّي دعاية: أحطّ أيّ شي، يعني حذاء، ويطلع تصميم ٥ أو ١٠ ثواني» ثمّ
   «سوّها مع الصوت وضيف الكتابة والاسم»).
   ١ التوجيه: طلب إعلان فيديو (أو منتج مرفق بلا كلمة صورة) يذهب للمحادثة وأداتها؛ إعلان البيع/الإيجار والسؤال والكتابة كما كانت
   ٢ الواجهة: مسارات الوسائط كلّها تُتخطّى في دور إعلان الفيديو (المسار يصير none، والصورة التلقائيّة ممنوعة — وصورة الإعلان تحترمهما)
   ٣ الأداة: generate_video بـad_title/ad_text/ad_voice، والوصف يقول متى وكيف، والخطوط (routing-anchors) لم تتحرّك
   ٤ العميل: الأداة تبدأ إكمال الإعلان ولا تنتظره، والمرفق يُستبدل بالنسخة الكاملة أو يُقال بصدق إنّها تعذّرت، والعرض يرجع للأصليّ بعد إعادة التحميل
   ٥ الإكمال: كتابة على لوحة بمقاس الفيديو تُركَّب بـffmpeg، وصوت مها يُدمج؛ كلّ خطوة مستقلّة
   ٦ بوّابة رسم المالك المدفوع تعدّ «سوّ دعاية» طلب وسائط، ونصّ الفشل بالـ١٤ لغة */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const A9 = read('js/app-09-attach.js');

function adAsk() {
  const from = A9.indexOf('const __AD_WORD_RE'), to = A9.indexOf('\n}\n', A9.indexOf('function omranAdVideoAsk(')) + 3;
  assert.ok(from > 0 && to > from, 'المصدر');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(A9.slice(from, to) + '\nthis.f = omranAdVideoAsk;', ctx);
  return ctx.f;
}

test('١ التوجيه: إعلان الفيديو للمحادثة، والباقي كما كان', () => {
  const f = adAsk();
  for (const [t, img] of [['سوّ لي دعاية فيديو ١٠ ثواني لهذا الحذاء', true], ['سو دعاية لهذا الحذاء', true], ['ابي اعلان للعطر 5 ثواني', false],
    ['سوي إعلان ريلز لمطعمي', false], ['make an ad video for this shoe', true], ['دعاية لهذي الساعة', true]]) assert.equal(f(t, img), true, t);
  for (const [t, img] of [['سو اعلان سيارة للبيع لاندكروزر ٢٠٢٠', true], ['صمم بوستر إعلان للحذاء', true], ['اكتب لي نص إعلان للحذاء', true],
    ['كيف أسوي دعاية؟', true], ['سو دعاية لهذا الحذاء', false], ['سو لي فيديو للحذاء', true], ['اعلان شقة للإيجار', true], ['ارسم حذاء', true]]) assert.equal(f(t, img), false, t);
});

test('٢ الواجهة: مسارات الوسائط تُتخطّى في دور إعلان الفيديو', () => {
  assert.ok(A9.includes("if(__ownerUiShot) __mediaLane = 'none'; const __explodedTurn = ")); /* v-chat-exploded: صورة + «فكّكه» يسبق إعلان الفيديو */
  assert.ok(A9.includes("const __adVideoTurn = !__ownerUiShot && !__explodedTurn && omranAdVideoAsk(text, __gateAtts.some(a => a && a.isImage)); if(__adVideoTurn) __mediaLane = 'none';"));
  assert.ok(A9.includes('const __blockAutoImage = !!(__ownerProvTurn /* v-prov-self */ || __adVideoTurn /* v-chat-ad-video */ ||'));
  const adImg = A9.indexOf('&& __rtAdOk /* v-route-ad */');
  assert.ok(/!__blockAutoImage && __mediaLane !== 'none'/.test(A9.slice(A9.lastIndexOf('} else if(', adImg), adImg)), 'صورة الإعلان تحترم الحاجزين');
  const fv = A9.indexOf('const __wantsVideo = ');
  assert.ok(/__mediaLane !== 'none'/.test(A9.slice(fv, fv + 200)), 'مسار الفيديو الثابت يحترم المسار none');
});

test('٣ الأداة: حقول الإعلان والوصف، بلا أسطر جديدة في chat.js', () => {
  const chat = read('api/_lib/chat.js');
  for (const k of ['ad_title', 'ad_text', 'ad_voice']) assert.ok(chat.includes(k + ": { type: 'string'"), k);
  assert.match(chat, /وطلب «دعاية\/إعلان» لمنتج \(ولو بلا كلمة فيديو\) = فيديو إعلان/);
  assert.match(chat, /لا تخترع اسم ماركة/);
  assert.match(chat, /بلا أيّ كتابة أو شعار داخل المشهد/);
});

test('٤ العميل: يبدأ الإكمال ولا ينتظره، ويستبدل المرفق أو يعترف', () => {
  const a17 = read('js/app-17-agent-tools.js');
  assert.ok(a17.includes("if (adOn) vRes.adJob = window.__omranAdFinish(videoUrl, { title: adT, text: adL, voice: adV });"));
  assert.match(a17, /ولا تقل إنّها جاهزة الآن/);
  assert.ok(A9.includes('if(__cv.adJob) omranAdAttach(__chatVidAtt[0], __cv.adJob, cur);'));
  const from = A9.indexOf('function omranAdAttach('), body = A9.slice(from, A9.indexOf('\n}\n', from));
  // تشغيل omranAdAttach نفسها: نجاح يستبدل الرابط ويحفظ الأصليّ، وفشل يضيف سطرًا صادقًا للردّ نفسه
  const run = async (job) => {
    const att = { isVideo: true, url: 'https://cdn/x.mp4' }, chat = { messages: [{ role: 'assistant', content: 'تمام', attachments: [att] }] };
    let renders = 0, saves = 0;
    const ctx = { __swallow() {}, omranAttachT: (k, ar) => ar, getCurrent: () => chat, renderMessages: () => { renders++; }, saveState: () => { saves++; } };
    vm.createContext(ctx); vm.runInContext(body + '\n}\nthis.f = omranAdAttach;', ctx);
    ctx.f(att, job, chat); assert.equal(att.adPending, true);
    await new Promise((r) => setTimeout(r, 5));
    return { att, chat, renders, saves };
  };
  return (async () => {
    const ok = await run(Promise.resolve({ url: 'blob:x' }));
    assert.equal(ok.att.url, 'blob:x'); assert.equal(ok.att.rawUrl, 'https://cdn/x.mp4'); assert.equal(ok.att.adPending, undefined);
    assert.equal(ok.renders, 1); assert.equal(ok.saves, 1); assert.equal(ok.chat.messages[0].content, 'تمام');
    const bad = await run(Promise.resolve(null));
    assert.equal(bad.att.url, 'https://cdn/x.mp4'); assert.match(bad.chat.messages[0].content, /⚠️ ما قدرت أضيف الكتابة والصوت/);
    const thrown = await run(Promise.reject(new Error('x')));
    assert.match(thrown.chat.messages[0].content, /⚠️/);
  })();
});

test('٥ الإكمال في المتصفّح: كتابة مرسومة تُركَّب، وصوت مها يُدمج، والعرض يرجع للأصليّ', () => {
  const a11 = read('js/app-11-video.js');
  assert.ok(a11.includes('window.__omranAdFinish = async function(videoUrl, o){'));
  assert.ok(a11.includes("\"[0:v][1:v]overlay=0:0:enable='gte(t,0.4)'\""), 'تركيب من ٠٫٤ ث');
  assert.ok(a11.includes("voice: 'maha', lang: narrLang(voice), gender: getNarrationGender(), speed: getNarrationSpeed()"), 'صوت مها بإعداد التعليق');
  assert.ok(a11.includes('blob = await muxNarrationAny(blob, await r.blob(), false); voiced = true;'));
  assert.ok(a11.includes('if(!text && !voiced) return null;'), 'لا شيء منهما = الأصليّ');
  assert.ok(/makeAdOverlayPng\(title, line, d\.w, d\.h\)/.test(a11), 'اللوحة بمقاس الفيديو نفسه');
  const a4 = read('js/app-04-i18n-state.js');
  assert.ok(a4.includes("if(a.rawUrl && /^blob:/.test(a.url)) vid.onerror = () => { if(vid.src !== a.rawUrl){ vid.src = a.rawUrl; dl.href = a.rawUrl; } };"));
});

test('٦ بوّابة المالك، والنصّ بالـ١٤ لغة', () => {
  const om = require('../api/_lib/owner-media.js');
  assert.equal(om.askedMedia('سو دعاية لهذا الحذاء', true), true);
  assert.equal(om.askedMedia('سوّ لي إعلان للعطر ١٠ ثواني', true), true);
  assert.equal(om.askedMedia('سو اعلان في الكود', true), false);
  assert.equal(om.askedMedia('وش رايك في الاعلان؟', true), false);
  assert.equal((read('js/app-03-i18n-data.js').match(/axAdFinishFail: "/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(read('i18n/' + l + '.js'), /axAdFinishFail: "[^"]{10,}"/, l);
  const tag = Number((/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js')) || [])[1] || 0);
  assert.ok(tag >= 799, 'وسم ملفّات اللغات رُفع مع axAdFinishFail: ' + tag);
});
