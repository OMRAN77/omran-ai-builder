// tests/trend-extra-backdrops.test.cjs — v-trend-extra + v-trend-backdrops (٣٠ سبتمبر ٢٠٢٦):
// المالك: «في فيديوات الترند ليش ما أقدر أكتب اللي أريده، ودمج الكلمات» و«شخصيّة تغنّي في التراث فقط
// شكل واحد… كلّ مرّة أسوّي فيديو تكون الخلفيّة ثانية، على الأقلّ بين ١٠٠ خلفيّة».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { buildTrendPrompt, TRENDS } = require(path.join(root, 'api/_lib/video-trends.js'));
const B = require(path.join(root, 'api/_lib/video-backdrops.js'));

test('مكتبتا خلفيّات ١٠٠ لكلّ منهما، والمتتاليات لا تتكرّر قبل استنفاد المئة', () => {
  assert.ok(B.POOLS.heritage.length >= 100 && B.POOLS.general.length >= 100);
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(B.backdropFor('heritagesing', i));
  assert.equal(seen.size, 100, 'تكرّرت خلفيّة قبل المئة');
  assert.notEqual(B.backdropFor('heritagesing', 1), B.backdropFor('heritagesing', 2));
  for (const k of Object.keys(B.TREND_POOL)) assert.ok(TRENDS[k], 'ترند غير موجود: ' + k);
});

test('الخلفيّة تدخل أمر الترندات المرنة فقط، وما يكتبه المستخدم يُدمج ويغلب', () => {
  const a = buildTrendPrompt('heritagesing', { text: 'يا هلا', bg: 5, hasImage: true }).prompt;
  assert.match(a, /SETTING \(replaces the default location/, 'لا خلفيّة متغيّرة لترند التراث');
  const b = buildTrendPrompt('heritagesing', { text: 'يا هلا', bg: 6, hasImage: true }).prompt;
  assert.notEqual(a, b, 'رقمان مختلفان أعطيا الخلفيّة نفسها');
  const prod = buildTrendPrompt('productad', { text: 'عطر', bg: 5 }).prompt;
  assert.ok(!/SETTING/.test(prod), 'الإعلان عن منتج مكانه جوهره — لا يُستبدل');
  const x = buildTrendPrompt('dance', { extra: 'يلبس بشت ذهبي ومعه صقر', bg: 1 }).prompt;
  assert.match(x, /USER DIRECTION \(follow it/, 'ما كتبه المستخدم لا يصل الأمر');
  assert.match(x, /يلبس بشت ذهبي ومعه صقر/);
  assert.ok(x.indexOf('USER DIRECTION') > x.indexOf('SETTING'), 'توجيه المستخدم يجب أن يأتي بعد الخلفيّة ليغلبها');
  assert.ok(x.indexOf('USER DIRECTION') < x.indexOf('No on-screen text'), 'منع الكتابة على الإطار يبقى بعد توجيه المستخدم');
  const long = 'كلمة '.repeat(70);
  assert.ok(buildTrendPrompt('dance', { extra: long }).prompt.includes(long.trim().slice(0, 300)), 'الحدّ يجب أن يتّسع لأكثر من ٢٤٠ حرفًا');
});

test('الواجهة: خانة «اكتب اللي تبيه» لكلّ ترند، وعدّاد خلفيّة لكلّ ترند، والنصّ بالـ١٤ لغة', () => {
  const cli = fs.readFileSync(path.join(root, 'js/app-11-video-trends.js'), 'utf8');
  assert.match(cli, /xinp\.id = 'vtExtra'/, 'لا خانة كتابة حرّة');
  const iExtra = cli.indexOf("xinp.id = 'vtExtra'");
  const iKind = cli.indexOf("if(t.kind !== 'none'){");
  assert.ok(iExtra > iKind && cli.slice(iKind, iExtra).split('}').length > 1, 'الخانة يجب ألّا تكون مشروطة بنوع الترند');
  assert.match(cli, /aiapp_trend_bg_/, 'لا عدّاد خلفيّة');
  assert.match(cli, /params\.extra = extra/);
  const w = {}; new Function('window', fs.readFileSync(path.join(root, 'js/app-11-video-trends-data.js'), 'utf8'))(w);
  for (const k of ['extra', 'extraPh']) {
    for (const lg of ['ar', 'en', 'fr', 'es', 'tr', 'ru', 'hi', 'ur', 'bn', 'ne', 'fil', 'id', 'zh', 'ml']) assert.ok(w.__VIDEO_TRENDS.ui[k][lg], k + ': ناقص ' + lg);
  }
});

test('الإضافات لا تدفع قفل الهويّة ولا شرط الأشخاص خارج حدّ المحرّك (١٥٠٠)', () => {
  const long = 'تفصيلة طويلة جدًّا '.repeat(40);
  const one = buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true, bg: 7, extra: long }).prompt;
  assert.ok(one.length <= 1500, 'الأمر تجاوز حدّ المحرّك: ' + one.length);
  assert.match(one.slice(0, 1500), /IDENTITY \(mandatory\)/, 'قفل الهويّة قُصّ');
  const two = buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true, people: 2, bg: 7, extra: long }).prompt;
  // بلا متّسع (الأمر لشخصين أطول من الميزانيّة أصلًا) لا يُضاف شيء — لا يُزاح الذيل
  const bare = buildTrendPrompt('heritagesing', { text: 'يا هلا', hasImage: true, people: 2 }).prompt;
  assert.ok(two.length <= Math.max(bare.length, 1170), 'الإضافات زادت أمرًا بلا متّسع');
  assert.match(two, /all 2 of them must appear together/, 'شرط الأشخاص قُصّ');
});
