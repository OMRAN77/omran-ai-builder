'use strict';
/* v-psheet-nogold (المالك ١٧ أكتوبر، «ابدأ في أنماط الصور فقط»): «بدون خطوط… فقط حدّ رفيع هادئ عند التمرير على الاسم،
   ما أريد الذهبي — الذهبي فقط عند التمرير على الصور، واحذف الخيط الذهبي». الوضع الأسود وحده. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/app-12-studios.js'), 'utf8');
const css = src.slice(src.indexOf('function ensurePsheetCss'), src.indexOf('function bindPsheetHeaderCollapse'));

test('١. القواعد للوضع الأسود وحده (لا الفاتح ولا الثيمات) — عبر البادئة B', () => {
  assert.ok(css.includes("const B = 'html:not([data-mode=\"light\"]):not(.skin) '"));
  assert.ok((css.match(/\+ B \+ '/g) || []).length >= 18, 'كلّ قواعد اللاذهبيّ مسبوقة بـB');
});

test('٢. الرقائق: بلا حدّ ولا تعبئة أبدًا، والإنارة بالنصّ الأبيض عند التمرير وللمختارة («سوّ الكتابة فقط»)', () => {
  assert.ok(css.includes("'.pstyleChip{border:1px solid transparent !important; background:transparent !important;"));
  assert.ok(/\.pstyleChip:hover,' \+ B \+ '\.pstyleChip\.on\{color:#fff !important; text-shadow:/.test(css));
  assert.ok(!/pstyleChip[^}]*border-color:rgba\(255,255,255/.test(css), 'لا حدّ حتّى عند التمرير');
});

test('٣. البطاقات: بلا حدّ، المختارة بالصنف on ونصّها الأبيض وعلامة ✓ فقط، والذهبيّ عند التمرير على الصورة فقط', () => {
  assert.ok(css.includes("'.pstyleCard{border:1px solid transparent !important; box-shadow:none !important;}'"));
  assert.ok(!css.includes('.pstyleCard.on{border'), 'المختارة بلا حدّ');
  assert.ok(/B \+ '\.pstyleCard:hover,' \+ B \+ '\.pstyleCard:focus-visible\{border-color:#d4af37 !important/.test(css), 'التمرير على الصورة ذهبيّ');
  assert.ok(src.includes("c.classList.toggle('on', on)") && src.includes("card.className = 'pstyleCard' + (active ? ' on' : '')"));
  assert.ok(css.includes("[data-pstyle-name]{color:#fff !important;}") && css.includes("[data-pstyle-tick]{background:#fff !important; color:#000 !important;}"));
});

test('٤. الخيط الذهبيّ محذوف: لا أشعّة في الحلقة ولا حدّ ذهبيّ على الوجوه، وخطّ الذيل محذوف، والأزرار كـ«صمم الغرفة»', () => {
  assert.ok(css.includes("'.pstyleHero{background:none !important;}'"), 'أشعّة conic-gradient الذهبيّة');
  assert.ok(css.includes("'.pstyleHero .pstyleHeroC{border-color:transparent !important; box-shadow:none !important;}'"));
  assert.ok(css.includes("'.pstyleHero .pstyleHeroT{border-color:transparent !important;}'"));
  assert.ok(css.includes("'.pstyleFoot{border-top:0 !important;}'"));
  assert.ok(/\.pstyleCta, ' \+ B \+ '\.pstyleFoot #portraitFootPhoto\{background:#000 !important; color:#fff !important; border:1px solid transparent !important/.test(css));
  assert.ok(css.includes('box-shadow:0 4px 18px rgba(255,255,255,.35) !important;}') && /#portraitFootPhoto:hover\{box-shadow:0 6px 24px rgba\(255,255,255,\.5\) !important;\}/.test(css), 'إنارة الزرّ بدرجة «صمم الغرفة» (.35 → .5) لا حدّ');
  assert.ok(/\[data-pstyle-before-tag\], ' \+ B \+ '\.pstyleHero \.pstyleHeroC span\{background:#000 !important; color:#fff !important; border:1px solid rgba\(255,255,255,\.45\) !important;\}/.test(css), 'شارة «قبل» بلا ذهبيّ ولا يعيد المصنّف تذهيبها');
});
