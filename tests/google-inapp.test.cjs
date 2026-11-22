// tests/google-inapp.test.cjs — v-google-inapp (٢٢ نوفمبر ٢٠٢٦، مسبار رحلة الزائر من تطبيقات التواصل): متابع تيك توك/إنستغرام/فيسبوك/سناب
// يضغط «المتابعة عبر Google» داخل متصفّح التطبيق ← جوجل ترفض (403 disallowed_useragent) فيعلق. الزرّ يفتح المتصفّح الخارجيّ
// بـ&app=1 ويبقى التبويب مكانه ليستلم جسر oauth-claim الجلسة عند العودة. الدالّة تُشغَّل هنا بنصّها من الجزء نفسه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const part = fs.readFileSync(path.join(root, 'js', 'app-01-boot-auth.js'), 'utf8');
const from = part.indexOf('function googleInAppBrowser(ua, absUrl){');
const to = part.indexOf("const googleBtnEl = $('#authGoogleBtn');");
assert.ok(from > 0 && to > from, 'الدالّة قبل معالج الزرّ');
const googleInAppBrowser = new Function(part.slice(from, to) + '\nreturn googleInAppBrowser;')();

const URL_ABS = 'https://omran-ai-builder.vercel.app/api/system?action=google-start&state=0123456789abcdef0123456789abcdef&app=1';
const REST = 'omran-ai-builder.vercel.app/api/system?action=google-start&state=0123456789abcdef0123456789abcdef&app=1';
const INTENT = 'intent://' + REST + '#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';
const SAFARI = 'x-safari-https://' + REST;
const AND = 'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const UA = {
  tiktokAndroid: AND + ' trill_2023109040 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/trill app_version/31.9.4 ByteLocale/ar Region/AE BytedanceWebview/d8a21c6',
  tiktokIos: IOS + ' musical_ly_33.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/ar Region/AE',
  instaAndroid: AND + ' Instagram 320.0.0.42.101 Android (33/13; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; ar_AE; 569737063)',
  instaIos: IOS + ' Instagram 320.0.2.29.98 (iPhone15,2; iOS 17_4; ar_AE; ar; scale=3.00; 1179x2556; 569737063)',
  fbAndroid: AND + ' [FB_IAB/FB4A;FBAV/450.0.0.38.108;]',
  fbIos: IOS + ' [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/565465421;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/ar_AR;FBOP/5;FBRV/0]',
  snapIos: IOS + ' Snapchat/12.70.0.33 (like Safari/8617.1.17.10.9, panda)',
  snapAndroid: AND + ' Snapchat/12.70.0.33',
  xIos: IOS + ' Twitter for iPhone/10.30',
  linkedinAndroid: AND + ' [LinkedInApp]/4.1.900',
};

test('١) متصفّحات تطبيقات التواصل: أندرويد ← intent للمتصفّح الافتراضيّ، آيفون ← x-safari-https، والرابط نفسه كاملًا بـ&app=1', () => {
  for (const k of ['tiktokAndroid', 'instaAndroid', 'fbAndroid', 'snapAndroid', 'linkedinAndroid']) assert.equal(googleInAppBrowser(UA[k], URL_ABS), INTENT, k);
  for (const k of ['tiktokIos', 'instaIos', 'fbIos', 'snapIos', 'xIos']) assert.equal(googleInAppBrowser(UA[k], URL_ABS), SAFARI, k);
  assert.ok(INTENT.includes('state=0123456789abcdef0123456789abcdef&app=1#Intent;'), 'state وapp=1 قبل #Intent');
  assert.doesNotMatch(INTENT, /browser_fallback_url|package=/, 'بلا احتياط يعيد تحميل جوجل داخل الويب-فيو، وبلا حصر في متصفّح واحد');
});

test('٢) غيرها كما كان: المتصفّحات العاديّة وغلاف أندرويد الخام («; wv)» بلا علامة تطبيق تواصل) وسطح المكتب ← ""', () => {
  const plain = [
    AND, // غلاف التطبيق الخام: مساره الخاصّ (&app=1 داخل الويب-فيو) يبقى
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    IOS + ' Version/17.4 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    '', undefined, null,
  ];
  for (const u of plain) assert.equal(googleInAppBrowser(u, URL_ABS), '', String(u).slice(0, 60));
  assert.equal(googleInAppBrowser(UA.tiktokAndroid, ''), '', 'بلا رابط = لا شيء');
  // علامة تطبيق تواصل على سطح المكتب (لا أندرويد ولا آيفون): لا مخطّط خارجيّ معروف ← المسار العاديّ
  assert.equal(googleInAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Instagram 320.0', URL_ABS), '');
});

test('٣) معالج الزرّ: الفحص بعد غلاف الآيفون وقبل فحص «; wv)»، يعرض رسالة «أكمل في المتصفّح» المترجمة ولا يحمّل جوجل في التبويب نفسه', () => {
  const h = part.slice(to, part.indexOf('(function oauthClaimBridge(){'));
  const iIos = h.indexOf('if (iosWrap) {');
  const iIn = h.indexOf("inAppOut = googleInAppBrowser(navigator.userAgent || '', location.origin + gStartUrl + '&app=1');");
  const iAnd = h.indexOf('let androidWrap = false;');
  assert.ok(iIos > 0 && iIn > iIos && iAnd > iIn, 'الترتيب: آيفون ← تواصل ← أندرويد الخام');
  const blk = h.slice(h.indexOf('if (inAppOut) {'), iAnd);
  assert.ok(blk.includes("authMsg('axBootGoogleInBrowser'"), 'الرسالة القائمة بلغات الواجهة');
  assert.ok(blk.includes('window.location.href = inAppOut;') && /return;\s*\}\s*\/\*/.test(blk), 'يفتح الخارجيّ ويتوقّف');
  assert.doesNotMatch(blk, /location\.href = gStartUrl/, 'لا جوجل داخل الويب-فيو');
  // الجلسة تُستلم هنا: الانتظار يُسجَّل والنبضة تُشغَّل قبل أيّ فرع
  const pre = h.slice(0, iIos);
  assert.ok(pre.includes("localStorage.setItem('aiapp_oauth_pending', oauthState + ':' + Date.now())") && pre.includes('window.__armOauthClaim()'));
  // المسارات السابقة كما هي
  assert.ok(h.includes("window.open(location.origin + gStartUrl + '&app=1', '_blank');") && h.includes("window.location.href = gStartUrl + '&app=1';") && h.includes('window.location.href = gStartUrl;'));
});

test('٤) الرسالة موجودة في اللغات الأربع عشرة، والحزمة تحمل الإصلاح', () => {
  const langs = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  for (const l of langs) assert.ok(fs.readFileSync(path.join(root, 'i18n', l + '.js'), 'utf8').includes('axBootGoogleInBrowser:'), l);
  const data = fs.readFileSync(path.join(root, 'js', 'app-03-i18n-data.js'), 'utf8');
  assert.ok((data.match(/axBootGoogleInBrowser/g) || []).length >= 2, 'العربيّة والإنجليزيّة');
  const bundle = fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8');
  assert.ok(bundle.includes('function googleInAppBrowser(ua, absUrl){') && bundle.includes('window.location.href = inAppOut;'));
});
