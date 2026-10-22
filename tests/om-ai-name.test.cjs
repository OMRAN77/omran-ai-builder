// tests/om-ai-name.test.cjs — v-om-ai-name (أمر المالك ٢٢ أكتوبر: «اسم التطبيق om ai في كل مكان يشوفه المستخدم»):
// manifest وشاشة آيفون وكلّ نصّ ظاهر وكلام المساعد عن نفسه = «om ai»؛ عنوان الصفحة وog:site_name وWebSite وalternateName كما هي؛
// الصفحتان القانونيّتان «om ai (سابقاً Omran AI Builder)» والمطوّر الشخص باقٍ؛ لا دومين ولا package id ولا متغيّر بيئة يتغيّر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const OLD = /Omran AI|عمران AI|Omran Ai/;
// سطر تعليق JS (اقتباسات المالك في التاريخ) لا يُحسب
const isComment = (l) => { const t = l.trim(); if (/^\/\//.test(t) || /^\*/.test(t)) return true; if (/^\/\*/.test(t)) { const e = t.indexOf('*/'); return e === -1 || e >= t.length - 2; } return false; };

test('١. manifest.json: الاسمان «om ai»، والمعرّف والدومين كما هما', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.name, 'om ai'); assert.equal(m.short_name, 'om ai');
  assert.ok(!OLD.test(read('manifest.json')));
});

test('٢. index.html: اسم الشاشة الرئيسيّة «om ai»، والعنوان وog:site_name وWebSite وalternateName والكلمات المفتاحيّة كما هي', () => {
  const h = read('index.html');
  assert.ok(h.includes('<meta name="apple-mobile-web-app-title" content="om ai">'));
  assert.ok(h.includes('<meta name="application-name" content="om ai">'));
  assert.ok(h.includes('<title id="pageTitle">om ai — عمران AI — منصّة الذكاء</title>'), 'العنوان كما هو');
  assert.ok(h.includes('<meta property="og:site_name" content="om ai">'));
  assert.ok(h.includes('"alternateName": ["Omran AI Builder", "Omran AI", "عمران AI", "om ai builder"]'), 'الأسماء القديمة للبحث');
  assert.match(h, /<meta name="keywords" content="om ai, om ai builder, Omran AI Builder, عمران AI/);
});

test('٣. لا اسم قديم في نصّ ظاهر أو كلام المساعد — عدا عنوان الصفحة ومفتاح القاموس وكاشف المشاريع المحفوظة', () => {
  const FILES = ['api/_lib/agent.js', 'api/_lib/chat.js', 'api/ai.js', 'api/telegram.js', 'api/_lib/maha-app.js', 'api/_lib/call-agent.js',
    'api/_lib/phone-link.js', 'api/_lib/auth.js', 'api/_lib/signup-notify.js', 'api/_lib/img-share.js', 'api/_lib/app-catalog.js', 'api/_lib/email-calendar.js',
    'js/app-05-ui.js', 'js/app-05-img-save.js', 'js/app-05-share-text.js', 'js/app-06-checkout.js', 'js/app-08-maha.js', 'js/app-09-attach.js', 'js/app-10-features.js',
    'js/app-11-video.js', 'js/app-13-stocks-init.js', 'js/partials-core.js', 'js/partials-settings.js', 'login-done.html', 'download.html', 'p.html', 'ad-studio.html',
    'templates-data.js', 'i18n/ad-studio.js', 'js/app-03-i18n-data.js'].concat(fs.readdirSync(path.join(root, 'i18n')).filter((f) => /^[a-z]+\.js$/.test(f) && f !== 'ad-studio.js').map((f) => 'i18n/' + f));
  const bad = [];
  for (const f of FILES) read(f).split('\n').forEach((l, i) => {
    if (isComment(l)) return;
    const x = l.replace(/("pageTitle"\s*:\s*"[^"]*"|pageTitle:\s*'[^']*')/g, '').split('"Made with Omran AI Video":').join('').split("<title>لوحة القيادة الذكية | عمران AI</title>").join('');
    if (OLD.test(x)) bad.push(f + ':' + (i + 1));
  });
  assert.deepEqual(bad, []);
  assert.ok(read('js/app-03-i18n-data.js').includes("pageTitle: 'عمران AI — منصّة الذكاء'"), 'عنوان الصفحة العربيّ كما هو');
  assert.ok(read('js/app-09-attach.js').includes("'أنت مساعد ذكي في تطبيق om ai من فريق om ai.'"));
  assert.ok(read('js/app-11-video.js').includes("bT('صُنع بواسطة om ai','Made with om ai Video')"));
});

test('٤. الخصوصية والشروط: «om ai (سابقاً Omran AI Builder)»، المطوّر الشخص باقٍ، وبريد التواصل ommntr2712 كما كان', () => {
  for (const f of ['privacy.html', 'terms.html']) {
    const s = read(f);
    assert.ok(s.includes('om ai (سابقاً Omran AI Builder)') && s.includes('om ai (formerly Omran AI Builder)'), f);
    assert.ok(!/فريق عمران AI|Omran AI Team/.test(s), f + ' المطوّر om ai');
    assert.ok(!s.includes('ommntr77@gmail.com') && s.includes('mailto:ommntr2712@gmail.com'), f + ' البريد كما كان (أمر المالك)');
  }
  assert.equal((read('privacy.html').match(/Omran Abdulla Eisa Rashid Alrukn Alshamsi/g) || []).length, 2, 'اسم المطوّر الشخص باقٍ');
});

test('٥. الإيميل: اسم المرسل «om ai» والعناوين بالاسم الجديد، والردّ إلى OWNER_NOTIFY_EMAIL بلا عنوان في الكود، وMAIL_FROM من البيئة يغلب', () => {
  const a = read('api/_lib/auth.js');
  assert.ok(a.includes("const MAIL_FROM = process.env.MAIL_FROM || 'om ai <onboarding@resend.dev>';"));
  assert.ok(a.includes("reply_to: String(process.env.OWNER_NOTIFY_EMAIL || '').trim() || undefined,"));
  assert.ok(!/Omran AI Builder/.test(a));
  assert.doesNotMatch(a, /@gmail\.com['"]/);
});

test('٦. بيان هواوي على الويب «om ai» كالعامّ؛ وما لا يُلمس: اسم APK وأسماء الحزم والدومينات ومتغيّرات البيئة', () => {
  const hw = JSON.parse(read('manifest-huawei.json')); assert.equal(hw.name, 'om ai'); assert.equal(hw.short_name, 'om ai'); // بيان الويب داخل تطبيق هواوي يطابق العامّ (store-huawei)
  const g = read('store/huawei/twa/app/build.gradle');
  assert.match(g, /applicationId/); assert.ok(/Omran AI Builder/.test(read('store/huawei/twa/twa-manifest.json')), 'اسم APK يتغيّر مع إصدار متجر');
  assert.ok(read('vercel.json').indexOf('om ai') === -1);
  assert.ok(read('api/_lib/env.js').includes('MAIL_FROM:') && read('api/_lib/env.js').includes('OWNER_NOTIFY_EMAIL:'));
});
