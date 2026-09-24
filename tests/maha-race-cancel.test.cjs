// v-maha-race-cancel (بلاغ المالك: «أول كلمة (هلا) ساكتة، والمرة الثانية أوقات
// ترد وأوقات تخربط»): mahaStartCallInner يسابق mahaStartRealtimeCall() بمهلة
// ١٢ث (Promise.race). لو خسر الفائق السباق، mahaEndRealtimeCall() يقفل
// pc/dc/stream ويضبط mahaRtCancelled=true ويهبط فورًا للمسار الأساسيّ —
// لكن mahaStartRealtimeCall() (غير المُلغاة فعليًا، فقط .catch(()=>{}) عليها)
// كانت تكمل بلا توقّف حتى بعد ذلك وتُعيد إحياء حالة عامّة ميتة
// (mahaRtActive/mahaRtReady=true، تفتح مايكها) بينما المسار الأساسيّ يسجّل
// بمايك آخر في نفس اللحظة — تصادم صامت أو ردّان متداخلان. الإصلاح: فحص
// mahaRtCancelled فورًا بعد اكتمال مصافحة WebRTC (قبل "التفعيل")، وتنظيف
// موارد هذه الدالّة نفسها (لا الموارد العامّة التي نظّفها الإلغاء أصلًا) ثمّ
// توقّف بلا إحياء أي حالة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');

function extractFn(name) {
  const start = src.indexOf(name);
  assert.ok(start > 0, name + ' موجودة');
  // كان النطاق رقمًا ثابتًا (٩٠٠٠ حرف) فكسره نموّ الدالّة بتعليقات v-maha-alive: قطع
  // النافذة قبل فحص الإلغاء فبدا الترتيب مكسورًا والسلوك سليم. الآن ينتهي النطاق عند
  // الدالّة التالية — يتبع الملفّ مهما طال. التثبيتات نفسها لم تتغيّر.
  const end = src.indexOf('function mahaEndRealtimeCall(', start);
  assert.ok(end > start, 'نهاية النطاق (mahaEndRealtimeCall) موجودة بعد ' + name);
  return src.slice(start, end);
}

test('v-maha-race-cancel: فحص الإلغاء يقع بعد المصافحة مباشرة وقبل mahaRtActive=true', () => {
  const fn = extractFn('async function mahaStartRealtimeCall(');
  const handshakeIdx = fn.indexOf('await Promise.all([connectionReady, channelReady, sessionHandshake]);');
  const cancelCheckIdx = fn.indexOf('if(mahaRtCancelled){', handshakeIdx);
  const activateIdx = fn.indexOf('mahaRtActive = true;', handshakeIdx);
  assert.ok(handshakeIdx > 0, 'سطر انتظار المصافحة موجود');
  assert.ok(cancelCheckIdx > handshakeIdx, 'فحص الإلغاء يقع بعد انتظار المصافحة');
  assert.ok(activateIdx > cancelCheckIdx, 'التفعيل (mahaRtActive=true) يقع بعد فحص الإلغاء لا قبله');
});

test('v-maha-race-cancel: عند الإلغاء تُقفَل موارد هذه المحاولة نفسها ثم تتوقّف بلا إحياء حالة', () => {
  const fn = extractFn('async function mahaStartRealtimeCall(');
  const handshakeIdx = fn.indexOf('await Promise.all([connectionReady, channelReady, sessionHandshake]);');
  const cancelStart = fn.indexOf('if(mahaRtCancelled){', handshakeIdx);
  const cancelBlockEnd = fn.indexOf('\n      }', cancelStart);
  const block = fn.slice(cancelStart, cancelBlockEnd);
  assert.match(block, /pc\.close\(\)/, 'يقفل اتصال WebRTC الخاصّ بهذه المحاولة');
  assert.match(block, /dc\.close\(\)/, 'يقفل قناة الأحداث');
  assert.match(block, /mahaRtStream\.getTracks\(\)\.forEach\(tr => tr\.stop\(\)\)/, 'يوقف مسار المايك');
  assert.match(block, /throw new Error\('cancelled'\)/, 'يتوقّف بلا إتمام التفعيل');
});

console.log('✓ maha-race-cancel: مصافحة WebRTC المتأخّرة بعد سقوط المهلة لا تُحيي حالة فائقة ميتة');
