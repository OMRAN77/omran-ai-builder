// v-maha-realtime-vad (٢١ سبتمبر ٢٠٢٦): المالك جرَّب مها بعد نشر v-maha-vad-hold وأبلغ نفس الشكوى
// حرفيًّا («يردّ بعد الكلمة الثانية») — رغم أنّ ذاك الإصلاح رفع SILENCE_HOLD_MS في المسار
// الاحتياطيّ الكلاسيكيّ (js/app-08-maha.js) فقط. الفائق (Realtime عبر api/_lib/realtime-session.js)
// هو الوضع النشِط افتراضيًّا دائمًا (mahaStartCallInner يجرّبه أوّلًا)، وله إعداد صمت منفصل تمامًا
// (silence_duration_ms) لم يُلمس في ذاك الإصلاح — على الأرجح هو المسار الذي جرَّبه المالك فعليًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'api/_lib/realtime-session.js'), 'utf8');

test('assistant (مها): silence_duration_ms رُفعت إلى 1100 — خطوة ثانية بعد أن لم يكفِ 700', () => {
  const start = src.indexOf("turn_detection: mode === 'builder'");
  const assistantBlock = src.slice(src.indexOf(': {', start), src.indexOf('},', start));
  // v-maha-listen: العتبة كانت 0.08 وتُركت عمدًا هنا («ليست السبب») — لكنّها كانت أصل السلسلة: ضجيج = كلام، فلا
  // speech_stopped، فحارس ٣ث يطلق الردّ وسط الجملة. الآن الافتراضيّ الموثّق 0.5 والحارس شبكة أمان فقط (أدناه).
  assert.match(assistantBlock, /threshold: 0\.5,/, 'الحساسيّة على الافتراضيّ الموثّق — الضجيج والصدى لا يُحسبان كلامًا');
  assert.match(assistantBlock, /prefix_padding_ms: 1000,/, 'الكلمات الأولى الهادئة محفوظة بالحشو لا بالعتبة');
  assert.match(assistantBlock, /silence_duration_ms: 1100,/, 'القيمة الجديدة بعد تكرار البلاغ على 700');
  assert.match(assistantBlock, /create_response: false,/, 'الآلية كما هي — العميل يرسل response.create صراحة');
});

test('builder (تبويب البنّاء الصوتي): إعداده منفصل تمامًا وبقي 800 — لا علاقة له بشكوى مها', () => {
  const builderMatch = src.match(/\? \{ type: 'server_vad', threshold: 0\.88, prefix_padding_ms: 300, silence_duration_ms: 800 \}/);
  assert.ok(builderMatch, 'وضع البنّاء بلا تغيير');
});

test('v-maha-listen: حارس بدء الكلام شبكة أمان (٢٠ث) لا مقاطِع — لا يُطلق ردّ مها وسط جملة المستخدم', () => {
  const maha = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
  const i = maha.indexOf("if(ev.type === 'input_audio_buffer.speech_started'){");
  const block = maha.slice(i, maha.indexOf("else if(ev.type === 'input_audio_buffer.speech_stopped'){", i));
  assert.ok(block.includes('mahaArmRtResponseWatchdog(20000);'), 'عشرون ثانية');
  assert.ok(!/mahaArmRtResponseWatchdog\(3000\)/.test(maha), 'لا ٣ ثوانٍ في أيّ مكان');
  const stop = maha.slice(maha.indexOf("else if(ev.type === 'input_audio_buffer.speech_stopped'){"), maha.indexOf("else if(ev.type === 'response.created')"));
  assert.ok(stop.includes('mahaArmRtResponseWatchdog(350);'), 'بعد انتهاء الكلام الردّ سريع كما كان');
  const rt = src;
  assert.ok(rt.includes('"LISTENING: wait for the user to finish their thought. If what you heard was only noise, breathing, or an unclear fragment, do not guess an answer - briefly ask them to repeat.",'), 'تعليمة الإنصات');
});

console.log('✓ maha-realtime-vad: صمت أطول قبل الردّ في الوضع الفائق (الوضع الفعليّ الافتراضيّ)، بانتظار تجربة صوتية حيّة');
