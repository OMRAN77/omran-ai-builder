// v-photo-honest (لقطة المالك ١٤ أكتوبر على Kimi K3: «شوف ادخل الديكور وفي الاثاث اريدك تحطلي صور تصليح التطبيق» ← «هذي صور
// حقيقية من البحث المباشر 👇» بلا صورة واحدة — «ياكذاب اشتغل عدل ولا قولي مااقدر اسوي»). سببان:
//  ١) طلب تعديل في تطبيقه خطفه جلب صور النت (الجمع «صور» + «اريد») فلم يصل المزوّد أصلًا — بوّابة المالك (__ownerAppPlace) كانت للشعار وحده.
//  ٢) روابط صور البحث تُعرض كما وصلت، والكثير منها يرفض العرض خارج موقعه فيختفي والنصّ يدّعيه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-09-attach.js');
const line = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); return SRC.slice(i, SRC.indexOf('\n', i)); };
const stmt = (head) => { const i = SRC.indexOf(head); assert.ok(i >= 0, 'مفقود: ' + head); return SRC.slice(i, SRC.indexOf(';\n', i) + 1); };

function router(user) {
  const sb = { authGet: () => user };
  vm.runInNewContext([
    'this.route = function(text){',
    '  const __freshChat = true, cur = { code: "", messages: [] };',
    (() => { const i = SRC.indexOf('const __ownerAppPlace = '); return '  ' + SRC.slice(i, SRC.indexOf('\n', SRC.indexOf('.test(text);', i))); })(),
    line('const __logoFetchRe = '), line('const __logoDesignRe = '), line('const __logoNewRe = '), line('const __logoRefRe = '),
    line('const __isLogoFetch = '),
    line('const __photoFetchRe = '), line('const __genDrawRe = '), line('const __designCtxRe = '), line('const __photoMakeRe = '),
    line('const __realPhotoCue = '), line('const __isPhotoFetch = '),
    '  return __isPhotoFetch;',
    '};',
  ].join('\n'), sb);
  return sb.route;
}

test('١. طلب المالك على تطبيقه يصل المزوّد لا جلب صور النت — ونصّ اللقطة نفسه', () => {
  const owner = router('omran');
  for (const t of ['شوف ادخل الديكور  وفي الاثاث اريدك تحطلي صور تصليح التطبيق', 'ادخل قسم الأزياء وحط صور جديدة', 'اريد صور في الصفحة الرئيسية']) assert.equal(owner(t), false, t);
  assert.equal(owner('عطني صور حقيقية لقطط'), true, 'طلب صور من النت للمالك كما كان');
  const user = router('sara');
  assert.equal(user('عطني صور حقيقية لقطط'), true, 'وللمستخدم كما كان');
});

test('٢. لا يُعرض ولا يُدّعى من صور البحث إلّا ما يفتح فعلًا في المتصفّح؛ ولا شيء يفتح = يمرّ للمزوّد', async () => {
  const fn = SRC.slice(SRC.indexOf('function __omranImgsThatLoad(urls, ms){'), SRC.indexOf('async function __sendPromptCore(){'));
  class Img { set src(u) { setTimeout(() => { if (/ok/.test(u)) { this.naturalWidth = 400; this.onload(); } else if (/err/.test(u)) this.onerror(); /* hang: لا حدث */ }, 1); } }
  const sb = { Image: Img, Promise, setTimeout };
  vm.runInNewContext(fn + '\nthis.f = __omranImgsThatLoad;', sb);
  assert.deepEqual(await sb.f(['https://a/ok1.jpg', 'https://a/err.jpg', 'https://a/hang.jpg', 'http://a/ok-plain.jpg', { url: 'https://a/ok2.jpg' }], 30), ['https://a/ok1.jpg', 'https://a/ok2.jpg']);
  assert.deepEqual(await sb.f(['https://a/err.jpg'], 30), []);
  assert.ok(SRC.includes('const __imgs = (await __omranImgsThatLoad((Array.isArray(__ld.images) ? __ld.images : []).slice(0, 6), 6000)).slice(0, 4);'), 'المسار يستعملها');
  const after = SRC.slice(SRC.indexOf('const __imgs = (await __omranImgsThatLoad('), SRC.indexOf('const __imgs = (await __omranImgsThatLoad(') + 2600);
  assert.ok(after.includes('throw { __fallthrough: true };'), 'صفر صور = يمرّ للمزوّد لا رسالة تدّعي');
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) assert.ok(read(f).includes('const __isPhotoFetch = !__isLogoFetch && !__ownerAppPlace && __realPhotoCue'), f);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/photo-honest.test.cjs'));
});
