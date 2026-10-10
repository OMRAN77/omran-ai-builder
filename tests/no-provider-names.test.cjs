// tests/no-provider-names.test.cjs — v-no-provider-names (تدقيق الواجهة ١٠ أكتوبر).
// العرض: مستخدمة عاديّة رأت «Veo 3 — جوجل» و«Runway» و«كانفا» في صانع الفيديو، و«Gemini/ChatGPT (gpt-image-1)» في محرّك
// الأزياء، و«Veo 3 يولّد الفيديو» في سطر الحالة — يخالف قاعدة المالك «الأسماء الوظيفيّة فقط». القرار: أسماء وظيفيّة بـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const BANNED = /Veo|Runway|Gemini|ChatGPT|gpt-image|Google|جوجل|گوگل|كانفا|Kling|Midjourney|Claude|كلود|Groq|DeepSeek/i;
// منتقي محرّك الأزياء (fashionEngineGemini/Openai) للمالك وحده (fx-simple ٤) — اسما المزوّدين فيه مقصودان، فخارج القائمة
const KEYS = ['videoModeRunwayOnly', 'videoModeVeo', 'videoModeCanvasOnly', 'videoMakerHeroVeoNote'];
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

function valuesOf(src, key) {
  const rx = new RegExp('["\']?' + key + '["\']?\\s*:\\s*(["\'])((?:\\\\.|(?!\\1).)*)\\1', 'g');
  const out = []; let m;
  while ((m = rx.exec(src))) out.push(vm.runInNewContext(m[1] + m[2] + m[1]));
  return out;
}

test('١. المفاتيح الأربعة بلا اسم مزوّد في العربيّة والإنجليزيّة والاثنتي عشرة لغة', () => {
  const core = read('js/app-03-i18n-data.js');
  for (const k of KEYS) {
    const v = valuesOf(core, k);
    assert.equal(v.length, 2, k + ': العربيّة والإنجليزيّة');
    for (const s of v) assert.doesNotMatch(s, BANNED, k + ': ' + s);
    for (const lg of LANGS) {
      const lv = valuesOf(read('i18n/' + lg + '.js'), k);
      assert.equal(lv.length, 1, lg + ' · ' + k);
      assert.doesNotMatch(lv[0], BANNED, lg + ' · ' + k + ': ' + lv[0]);
      assert.ok(lv[0].trim().length > 3, lg + ' · ' + k + ' ليس فارغًا');
    }
  }
});

test('٢. نصّ القالب الاحتياطيّ (قبل الترجمة) وأسطر حالة الفيديو بلا اسم مزوّد', () => {
  const p = read('js/partials-core.js');
  for (const k of KEYS) {
    const m = p.match(new RegExp('data-i18n="' + k + '">([^<]*)<'));
    assert.ok(m, k + ' في القالب');
    assert.doesNotMatch(m[1], BANNED, k + ': ' + m[1]);
  }
  const v = read('js/app-11-video.js');
  // كلّ نصّ bT('عربي','English') — ما يظهر في سطر الحالة — بلا اسم مزوّد (التعليقات ورسالة رصيد حساب المالك خارجه)
  const shown = v.match(/bT\(\s*'[^']*'\s*,\s*'[^']*'\s*\)/g) || [];
  assert.ok(shown.length > 20, 'نصوص الحالة مقروءة');
  for (const s of shown) assert.doesNotMatch(s, /Veo|Google|كانفا|Gemini|ChatGPT/, s);
  assert.ok(!v.includes("' (Veo 3)'"));
});

test('٣. وسما الملفّين المحمَّلين منفصلين مرفوعان (النسخة المخبّأة لا تبقى بالأسماء القديمة)', () => {
  assert.ok(read('index.html').includes('/js/partials-core.js?v=656'));
  assert.ok(read('js/app-04-i18n-state.js').includes("sc.src = 'i18n/' + lg + '.js?v=733';"));
});
