// tests/clean-ui.test.cjs — v-clean-ui: واجهة رسميّة بلا إيموجي (أمر المالك «كلّ شيء نظيف… شغل رسميّ»)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-36-clean-ui.js'), 'utf8');

const m = src.match(/new RegExp\('((?:[^'\\]|\\.)*)', 'gu'\)/);
assert.ok(m, 'تعبير الإيموجي موجود');
const EMO = new RegExp(m[1].replace(/\\\\/g, '\\'), 'gu');
const clean = (s) => String(s).replace(EMO, '').replace(/[ \t]{2,}/g, ' ').trim();

test('يزيل الإيموجي ويبقي النصّ والأرقام', () => {
  assert.equal(clean('🎬 قصة بيكسار'), 'قصة بيكسار');
  assert.equal(clean('⚡ 400 نقطة'), '400 نقطة');
  assert.equal(clean('⚙️ خيارات متقدمة'), 'خيارات متقدمة');
  assert.equal(clean('✅ مفعّل'), 'مفعّل');
  assert.equal(clean('👨‍👩‍👧 العائلة'), 'العائلة');
  assert.equal(clean('👍🏽 تمّ'), 'تمّ');
});

test('لا يمسّ الأعلام ولا حقّ النشر ولا ZWJ اللازم لتشكيل الهنديّة والمالايالمية والعربيّة', () => {
  assert.equal(clean('🇦🇪 الإمارات'), '🇦🇪 الإمارات');
  assert.equal(clean('© 2026 عمران'), '© 2026 عمران');
  const ml = 'ക്‍ഷ'; // ZWJ بين حرفين مالايالميّين
  assert.equal(clean(ml), ml);
  assert.equal(clean('कर्‍म'), 'कर्‍म');
  assert.equal(clean('→ التالي'), '→ التالي');
  assert.equal(clean('4.5 ★'), '4.5 ★');
});

test('الحماية: كلّ الصفحة عدا المحادثة والكود والحقول مستثناة، والأيقونة الوحيدة في الزرّ تبقى', () => {
  assert.match(src, /var SKIP = '\.msg,pre,code,textarea,\[contenteditable\],\[data-keep-emoji\],script,style'/);
  assert.ok(!src.includes('p.closest(CHROME)'), 'لا قائمة بيضاء: بطاقات الواجهة divs عاديّة');
  assert.ok(src.includes('HAS_WORD.test(c) && c !== v'), 'عقدة كلّها إيموجي تبقى');
  assert.ok(src.includes("attributeFilter: ['placeholder', 'title', 'aria-label']"));
  assert.ok(src.includes('window.__noEmoji = clean'));
});

test('الحزمة تحوي الجزء، ونسخ التنظيف المحليّة في الفيديو والترندات بنفس التعبير الآمن (لا يحذف ZWJ عامًّا)', () => {
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.bundle.js'), 'utf8').includes('v-clean-ui'));
  ['js/video.js', 'js/app-11-video-trends.js'].forEach((f) => {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(s.includes('\\p{Extended_Pictographic}'), f);
    assert.ok(!/\\u\{200D\}\]/.test(s), f + ' لا يحذف ZWJ عامًّا');
  });
});
