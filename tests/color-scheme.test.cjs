'use strict';
/* v-color-scheme + v-no-force-dark + v-sys-recolor (المالك ٢٤ سبتمبر، الجولة الخامسة).

   الدليل الذي قاد إليها: فيديو المالك مكبَّرًا ٢٫٤× يُظهر أيقونات #omranBottomNav **ممتلئة
   رماديّة** (فقاعة المحادثات ممتلئة، مجلّد الملفات ممتلئ، الإعدادات مربّع مصمت) و**النصّ
   بجانبها سليم تمامًا**. وهي SVG سطريّ في index.html بـfill="none" — موجود من أوّل بايت فلا
   يتأخّر، ولا قاعدة CSS في المشروع تضبط fill. أي أنّ شيئًا **خارج كودنا** يغيّر رسمها،
   وأرجحه التغميق الخوارزميّ في WebView الذي يطال صفحة لا تعلن color-scheme. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

test('١. الصفحة تعلن color-scheme للوضعين — لا الفاتح وحده كما كان', () => {
  assert.match(html, /<meta name="color-scheme" content="dark light">/);
  assert.match(html, /:root\{color-scheme:dark\}html\[data-mode="light"\]\{color-scheme:light\}/);
  // قبل الإصلاح كان الإعلان الوحيد في tokens.css تحت الوضع الفاتح
  const tok = fs.readFileSync('css/tokens.css', 'utf8');
  assert.match(tok, /color-scheme:light/, 'إعلان الوضع الفاتح القديم باقٍ — لا تعارض');
  // والإعلان قبل أيّ ورقة أنماط فلا يسبقه رسم
  assert.ok(html.indexOf('<meta name="color-scheme"') < html.indexOf('<link rel="stylesheet"'));
});

test('٢. أيقونات الشريط السفليّ ما زالت مخطَّطة لا ممتلئة، ولا قاعدة CSS تضبط fill عليها', () => {
  const nav = html.slice(html.indexOf('<nav id="omranBottomNav"'), html.indexOf('</nav>', html.indexOf('<nav id="omranBottomNav"')));
  const svgs = nav.match(/<svg[^>]*>/g) || [];
  assert.equal(svgs.length, 4, 'أربع أيقونات');
  for (const s of svgs) {
    assert.match(s, /fill="none"/, 'fill=none — ممتلئة = النظام أعاد تلوينها');
    assert.match(s, /stroke="currentColor"/);
  }
  /* لا قاعدة fill **غير مقيَّدة** تطال أيقونات الشريط. المسموح الوحيد مقيَّد بزرّ الإيقاف
     (#btnStop) — فلو ظهرت قاعدة جديدة على svg مجرّدًا أو على `*`، سقط هذا الاختبار. */
  const ALLOWED = /#btnStop svg\{fill:/;
  for (const f of ['css/tokens.css', 'css/redesign.css', 'css/modules.css']) {
    const css = fs.readFileSync(f, 'utf8');
    const rules = (css.match(/[^{}]*\{[^}]*\bfill\s*:[^}]*\}/g) || [])
      .filter((r) => !ALLOWED.test(r));
    assert.deepEqual(rules, [], 'قاعدة fill غير مقيَّدة في ' + f);
    assert.deepEqual(css.match(/(^|[\s,])\*\s*\{[^}]*\bfill\s*:/g) || [], [], 'لا fill على * في ' + f);
  }
  // والقاعدة المسموحة فعلًا موجودة ومقيَّدة — لا تطال #omranBottomNav
  const rd = fs.readFileSync('css/redesign.css', 'utf8');
  assert.match(rd, /#composerBox > #btnStop svg\{fill:/);
  assert.doesNotMatch(rd, /#omranBottomNav[^{]*svg\s*\{[^}]*fill/);
});

test('٣. الغلاف الأصليّ يوقف التغميق صراحةً في مسارَي إنشاء WebView', () => {
  const java = fs.readFileSync('store/huawei/twa/app/src/main/java/com/omran/aibuilder/twa/MahaWebViewFallbackActivity.java', 'utf8');
  assert.match(java, /webSettings\.setForceDark\(WebSettings\.FORCE_DARK_OFF\)/);
  assert.match(java, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.Q/, 'محروس بمستوى API');
  assert.match(java, /catch \(Throwable t\)/, 'لا يسقط التطبيق على غلاف لا يدعمها');
  // setupWebSettings تُستدعى في المسارين (الإقلاع والتعافي من انهيار)
  assert.equal((java.match(/setupWebSettings\(webSettings\)/g) || []).length, 2);
});

test('٤. المسبار يبلّغ ما يفعله النظام بألواننا — فلا تُخمَّن جولة سادسة', () => {
  const sd = fs.readFileSync('js/selfdiag.js', 'utf8');
  assert.match(sd, /scheme=' \+ \(getComputedStyle\(document\.documentElement\)\.colorScheme/);
  for (const q of ['\\(prefers-color-scheme: dark\\)', '\\(forced-colors: active\\)',
    '\\(inverted-colors: inverted\\)', '\\(prefers-contrast: more\\)']) {
    assert.match(sd, new RegExp(q), 'استعلام: ' + q);
  }
  assert.match(html, /\/js\/selfdiag\.js\?v=hw-twa-7/, 'الوسم رُفع — الملفّ يُحمَّل منفصلًا');
});
