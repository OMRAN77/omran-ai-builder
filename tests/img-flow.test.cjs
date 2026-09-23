'use strict';
/* v-img-box + v-img-first + v-img-bare (فحص المالك للصور من الصفر ٢٣ سبتمبر): «كلّ ما أريد بناء صورة يطلع مربّع، ونجومه
   ذهبيّة لا بيضاء؛ احذف "يرسم الصورة" مع أيقونة الرسم؛ الردود آخر الصورة لا أوّلها». مسبار حيّ على ٣٠ طلبًا (لقطات
   في DECISIONS) أثبت: المربّع كان يظهر في نصف المسارات فقط، ومسار الأدوات يكتب «🎨 يرسم صورة…»، والترتيب يتقلّب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('١. مربّع الإنشاء: نجوم ذهبيّة (والفاتح أغمق)، ويعود للصفحة إن أُعيد رسم القائمة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("const __dotCol = __light ? 'rgba(184,134,11,.75)' : 'rgba(212,175,55,.85)';"), f);
    assert.ok(!s.includes("const __dotCol = __light ? 'rgba(0,0,0,.30)' : 'rgba(255,255,255,.35)';"), 'لا أبيض');
    assert.ok(s.includes("if(!el.isConnected && typeof messagesEl !== 'undefined' && messagesEl) messagesEl.appendChild(el);"), 'بعد هبوط بحث الصور');
  }
});

test('٢. كلّ مسار بناء يُظهر المربّع: التصميم المعماريّ، ومسار الأدوات بدل سطر «🎨 يرسم صورة…»', () => {
  const a = read('js/app-09-attach.js');
  assert.ok(a.includes("__showImgLoading(thinkingDiv, label, label); // v-img-box"), 'المعماريّ');
  assert.ok(!a.includes("chatPhase('⚙️', label, thinkingDiv);"));
  assert.ok(a.includes('window.__omranImgBox = function(){'), 'خطّاف مسار الأدوات');
  assert.ok(a.includes('thinkingDiv.parentNode.insertBefore(b, thinkingDiv)'), 'المربّع فوق الردّ كما تُعرض الصورة');
  const t = read('js/app-18-chat-tools.js');
  assert.ok(t.includes("if (ev.status && ev.k === 'stGenImage' && typeof window.__omranImgBox === 'function' && window.__omranImgBox())"));
  assert.ok(t.indexOf("ev.k === 'stGenImage'") < t.indexOf("else if (ev.status) note("), 'المربّع قبل السطر النصّيّ');
});

test('٣. الصورة أوّلًا ثمّ الردّ: مرفقات المساعد (تعديل/بحث/بانيات) تُدرج فوق النصّ كالمرسومة داخل الردّ', () => {
  const s = read('js/app-04-i18n-state.js');
  assert.ok(s.includes("if(m.role !== 'user' && textDiv.parentNode === div && m.attachments.some(a => a && (a.isImage || a.isVideo))) div.insertBefore(wrap, textDiv);"));
  assert.ok(s.indexOf('div.appendChild(genStrip);') < s.indexOf('div.appendChild(textDiv);'), 'المرسومة فوق النصّ كما كانت');
});

test('٤. «ارسم» وحدها تُسأل عن الموضوع بدل رسم عشوائيّ، و«ارسم قطة» تمرّ', () => {
  const a = read('js/app-09-attach.js');
  const m = a.match(/const __bareDraw = (\/.+\/i)\.test\(text\);/);
  assert.ok(m, 'الكاشف موجود');
  const re = eval(m[1]);
  for (const x of ['ارسم', 'ارسم لي', 'رسمة', 'draw', 'صمم؟']) assert.ok(re.test(x), x);
  for (const x of ['ارسم قطة', 'رسمة وردة', 'draw a cat']) assert.ok(!re.test(x), x);
  assert.ok(a.includes('if(__bareDraw || (!__txtOnlyImgRe.test(text) && __isVagueMediaRequest(text))){'));
});
