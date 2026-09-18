'use strict';
/* v-maha-firstword — أول جملة في مكالمة مها الصوتية كانت تضيع: المايك الحيّ
   يُقفل عمدًا ٢-٥ ثوانٍ حتى تجهز جلسة الوضع اللحظي (Realtime)، وأي كلام
   في تلك النافذة لا يُبثّ ولا يُخزّن — يعيد المستخدم كلامه فتردّ مها من
   المرة الثانية لا الأولى. كما أن نص "أفكر..." كان يظهر أثناء التجهيز
   قبل فتح المايك فعليًا، فيظن المستخدم أنها سمعته.
   الحل: نسخة (clone) من مسار الصوت تسجّل محليًا طوال نافذة الانتظار (حالة
   enabled مستقلة بعد clone)، تُبثّ لاحقًا لو فيها كلام فعلي عبر
   input_audio_buffer.append/commit قبل فتح المايك الحيّ — لا بعده، حتى لا
   يتكرر بث نفس الصوت. ونص تجهيز صريح بدل "أفكر" قبل الجاهزية، مع نغمة
   استعداد قصيرة عند "🟢 أستمع". */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-08-maha.js'), 'utf8');

// المسجّل المؤقت يبدأ قبل قفل المسار الحيّ، على نسخة مستقلة (clone) لا
// تتأثر بـ inputTrack.enabled=false اللاحق.
const preBufStart = src.indexOf('function mahaStartPreBuffer(');
const trackClone = src.indexOf('mahaPreBufTrack = track.clone();');
assert.ok(preBufStart > 0 && trackClone > preBufStart, 'mahaStartPreBuffer ينسخ المسار (clone) لا يعتمد على enabled الأصلي');

const callStart = src.indexOf('async function mahaStartRealtimeCall(){');
const startCallSite = src.indexOf('mahaStartPreBuffer(mahaRtStream);', callStart);
const disableSite = src.indexOf('if(inputTrack) inputTrack.enabled = false;', callStart);
assert.ok(callStart > 0 && startCallSite > callStart, 'التسجيل المؤقت يبدأ داخل mahaStartRealtimeCall');
assert.ok(startCallSite < disableSite, 'يبدأ التسجيل المؤقت قبل قفل المسار الحيّ (inputTrack.enabled = false)');

// عند الجاهزية: يُفرَّغ المخزَّن (append/commit) قبل فتح المسار الحيّ، وقبل
// mahaRtReady=true — لا إرسال مزدوج ولا سباق مع المسار الحيّ.
const flushSite = src.indexOf('mahaFlushPreBuffer(dc);', callStart);
const enableSite = src.indexOf('if(inputTrack) inputTrack.enabled = true;', callStart);
const readySite = src.indexOf('mahaRtReady = true;', callStart);
const beepSite = src.indexOf('mahaPlayReadyBeep();', callStart);
assert.ok(flushSite > 0 && flushSite < enableSite, 'الإفراغ قبل فتح المسار الحيّ');
assert.ok(enableSite < readySite, 'فتح المسار الحيّ قبل الإعلان عن الجاهزية');
assert.ok(readySite < beepSite, 'النغمة بعد الجاهزية لا قبلها');

// الإفراغ نفسه: صمت = لا إرسال ولا commit؛ كلام فعلي = append مجزَّأ ثم commit واحد
const flushFn = src.slice(src.indexOf('function mahaFlushPreBuffer('), src.indexOf('function mahaPlayReadyBeep('));
assert.match(flushFn, /hasSpeech\s*=\s*mahaPreBufChunks\.some/, 'يتحقق من وجود كلام فعلي قبل أي إرسال');
assert.match(flushFn, /input_audio_buffer\.append/, 'يبث المخزَّن بـ append');
assert.match(flushFn, /input_audio_buffer\.commit/, 'ثم commit واحد');
assert.match(flushFn, /finally\{\s*mahaStopPreBuffer\(\);\s*\}/, 'يوقف المسجل المؤقت ويفرغه دائمًا بعد المحاولة');

// فشل صامت آمن: لا throw، تحذير واحد فقط عبر console.warn
const startBody = src.slice(preBufStart, src.indexOf('function mahaStopPreBuffer('));
assert.match(startBody, /catch\(e\)\{\s*\n\s*console\.warn\('\[maha\] pre-buffer capture unavailable/, 'فشل التقاط المخزن المؤقت صامت وآمن مع تحذير واحد');

// تنظيف عند إنهاء المكالمة (استدعاء أو إلغاء قبل الجاهزية) — لا يبقى المسجل شغّالًا
const endFn = src.slice(src.indexOf('function mahaEndRealtimeCall('), src.indexOf('function mahaEndRealtimeCall(') + 700);
assert.match(endFn, /mahaStopPreBuffer\(\);/, 'إنهاء المكالمة يوقف المسجل المؤقت أيضًا');

// حالة "أفكر" لا تظهر قبل جاهزية المايك: نص تجهيز صريح بدلها عند بدء الاتصال
const rtAttemptSite = src.indexOf('const rtAttempt = mahaStartRealtimeCall();');
const preAttempt = src.slice(Math.max(0, rtAttemptSite - 400), rtAttemptSite);
assert.ok(
  preAttempt.includes("mahaSetState('thinking', __ar ? '⏳ لحظة، أجهّز الجلسة…' : '⏳ One moment, preparing the session…');"),
  'نص تجهيز صريح بدل "أفكر" قبل بدء محاولة الاتصال اللحظي'
);
assert.ok(!/mahaSetState\('thinking'\);\s*\n/.test(preAttempt), 'لا "أفكر" عارية قبل محاولة الاتصال اللحظي مباشرة');

// النغمة تعيد استخدام سياق مؤشر المايك القائم، لا تنشئ AudioContext جديدًا
const beepFn = src.slice(src.indexOf('function mahaPlayReadyBeep('), src.indexOf('function mahaPlayReadyBeep(') + 500);
assert.match(beepFn, /const ctx = mahaMicMeterCtx;/, 'النغمة تعيد استعمال AudioContext القائم بدل إنشاء واحد جديد');
assert.ok(!/new AudioContext/.test(beepFn), 'لا AudioContext جديد داخل نغمة الاستعداد');

// الحزمة أُعيد بناؤها بنفس المحتوى (لا تعديل يدوي على app.bundle.js)
const bundle = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.bundle.js'), 'utf8');
assert.ok(bundle.includes('function mahaFlushPreBuffer('), 'الحزمة مُعاد بناؤها وتحمل التعديل الجديد');

console.log('✓ maha-firstword: لا تضيع أول جملة، ولا "أفكر" قبل جاهزية المايك');
