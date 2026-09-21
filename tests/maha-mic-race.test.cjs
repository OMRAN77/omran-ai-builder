// v-maha-mic-race (بلاغ المالك بفيديو حيّ: زر مها لا يفتح من البداية إطلاقًا — نفس رسالة
// «المايك مشغول ببرنامج ثاني» تظهر في كل محاولة، دقيقة بدقيقة). التحليلان السابقان
// (v-maha-vad-hold وv-maha-realtime-vad) استهدفا توقيت الاستماع أثناء المكالمة، بينما هذا
// العطل يمنع المكالمة من الفتح أصلًا — مرحلة أسبق كليًّا، لم يُكتشف إلا بفيديو حيّ يثبت
// اللحظة بالضبط: mahaMicPreflight يفتح المايك (getUserMedia بسيط) ثم يقفله فورًا، وبعد كسور
// ثانية mahaStartRealtimeCall/mahaRecordUntilSilence يفتحانه ثانية بقيود مختلفة — فتح-إغلاق-
// فتح سريع كهذا معروف بإطلاق NotReadableError/TrackStartError على أندرويد لأنّ النظام لا
// يُحرِّر عتاد المايك فورًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');

test('mahaMicPreflight: إذن ممنوح مسبقًا = تخطّي فتح المايك التجريبيّ كليًّا', () => {
  const start = src.indexOf('async function mahaMicPreflight(){');
  const end = src.indexOf('\n}\n', start) + 3;
  const fn = src.slice(start, end);
  assert.match(fn, /if\(perm === "granted"\) return null;/, 'يعود فورًا بلا getUserMedia عند الإذن الممنوح');
  // الترتيب: فحص denied ثم granted قبل نداء getUserMedia الفعليّ (لا مجرّد ذكره في تعليق)
  const deniedIdx = fn.indexOf('perm === "denied"');
  const grantedIdx = fn.indexOf('perm === "granted"');
  const gumIdx = fn.indexOf('navigator.mediaDevices.getUserMedia(');
  assert.ok(deniedIdx > 0 && grantedIdx > deniedIdx && gumIdx > grantedIdx, 'الترتيب: denied ثم granted ثم getUserMedia فقط لو احتجناه');
});

test('mahaMicPreflight: بعد الفتح التجريبيّ (denied/prompt/غير مدعوم) إمهال قصير قبل العودة', () => {
  const start = src.indexOf('async function mahaMicPreflight(){');
  const end = src.indexOf('\n}\n', start) + 3;
  const fn = src.slice(start, end);
  assert.match(fn, /await new Promise\(function\(r\)\{ setTimeout\(r, 250\); \}\);/, 'مهلة 250م.ث قبل العودة لإعطاء النظام وقتًا لتحرير المايك');
});

test('mahaGetUserMediaRetry: يعيد المحاولة مرّة واحدة فقط لأخطاء "مشغول" المؤقّتة، لا لغيرها', () => {
  const start = src.indexOf('async function mahaGetUserMediaRetry(');
  const end = src.indexOf('\n}\n', start) + 3;
  const chunk = src.slice(start, end);
  assert.ok(start > 0 && end > start, 'الدالّة موجودة');
  let calls = 0;
  const attempts = [];
  const ctx = {
    navigator: { mediaDevices: { getUserMedia: async (c) => {
      calls++;
      attempts.push(c);
      if (calls === 1) { const e = new Error('busy'); e.name = ctx.__errName; throw e; }
      return { ok: true, call: calls };
    } } },
    setTimeout: (fn) => fn(), // ننفّذ فورًا — لا حاجة لانتظار حقيقي في الاختبار
    __errName: 'NotReadableError',
  };
  vm.runInNewContext(chunk + '\nthis.retry = mahaGetUserMediaRetry;', ctx);
  return (async () => {
    // خطأ مؤقّت: يعيد المحاولة وينجح
    const r = await ctx.retry({ audio: true });
    assert.deepEqual(r, { ok: true, call: 2 });
    assert.equal(calls, 2, 'محاولتان بالضبط لخطأ NotReadableError');

    // خطأ غير مؤقّت (مثلًا NotAllowedError): لا إعادة محاولة — يرمي فورًا
    calls = 0; ctx.__errName = 'NotAllowedError';
    await assert.rejects(() => ctx.retry({ audio: true }), /busy/);
    assert.equal(calls, 1, 'محاولة واحدة فقط لخطأ دائم كرفض الإذن');
  })();
});

test('الاستدعاء: كلا مساري مها (الفائق والاحتياطيّ) يستعملان mahaGetUserMediaRetry بدل النداء المباشر', () => {
  const rtStart = src.indexOf('async function mahaStartRealtimeCall(');
  const rtBody = src.slice(rtStart, rtStart + 1300);
  assert.match(rtBody, /mahaRtStream = await mahaGetUserMediaRetry\(/, 'الفائق');
  const classicStart = src.indexOf('async function mahaRecordUntilSilence(');
  const classicBody = src.slice(classicStart, classicStart + 260);
  assert.match(classicBody, /mahaStream = await mahaGetUserMediaRetry\(/, 'الاحتياطيّ');
});

console.log('✓ maha-mic-race: تخطّي الفتح المزدوج للمايك عند إذن ممنوح مسبقًا + محاولة ثانية لأخطاء "مشغول" المؤقّتة');
