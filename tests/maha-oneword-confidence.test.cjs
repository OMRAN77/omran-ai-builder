// v-maha-oneword (بلاغ المالك «مها ما تنطق كأنك تكلم شخص»): كل ردّ من كلمة
// واحدة («نعم»، «لا»، «وقف»...) كان يُرفَض دومًا (mahaAskRepeat) بصرف النظر
// عن ثقة Whisper الفعلية — محادثة حقيقية فيها ردود قصيرة كثيرة. الإصلاح:
// كلمة واحدة تُرفض فقط لو أشارت إشارتا الثقة (no_speech_prob/avg_logprob)
// فعليًا لضعف الثقة (بحدّ أشدّ من العتبة العامة)، لا رفضًا أعمى بعدد الكلمات.
'use strict';
const assert = require('node:assert/strict');

process.env.GROQ_API_KEY = 'test-groq-key';

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    end() {},
  };
}

const usagePath = require.resolve('../api/_lib/_usage.js');
require.cache[usagePath] = {
  id: usagePath, filename: usagePath, loaded: true,
  exports: { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 20, clientIp: () => '1.1.1.1' },
};

function groqResponse(text, segments) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ text, segments, language: 'ar' }),
  };
}

async function runStt() {
  delete require.cache[require.resolve('../api/_lib/stt.js')];
  return require('../api/_lib/stt.js');
}

async function call(text, segments) {
  global.fetch = async () => groqResponse(text, segments);
  const handler = await runStt();
  const res = makeRes();
  await handler({ method: 'POST', body: { audioBase64: 'YQ==' } }, res);
  return res.payload;
}

(async () => {
  // ١) كلمة واحدة بثقة عالية (Whisper واثق) — لا تُرفض.
  {
    const out = await call('نعم', [{ no_speech_prob: 0.02, avg_logprob: -0.15 }]);
    assert.equal(out.text, 'نعم', 'النصّ يمرّ كما هو');
    assert.equal(out.lowConfidence, false, 'كلمة واحدة واثقة لا تُعامَل كضعيفة الثقة');
  }
  // ٢) كلمة واحدة فعلاً ضعيفة الثقة (إشارات Whisper نفسها تقوله) — تُرفض كما كان.
  {
    const out = await call('اه', [{ no_speech_prob: 0.6, avg_logprob: -0.2 }]);
    assert.equal(out.lowConfidence, true, 'كلمة واحدة بثقة منخفضة فعليًا تبقى مرفوضة');
  }
  {
    const out = await call('اه', [{ no_speech_prob: 0.05, avg_logprob: -0.9 }]);
    assert.equal(out.lowConfidence, true, 'logprob سيّئ فعليًا لكلمة واحدة يبقى مرفوضًا');
  }
  // ٣) جملة متعددة الكلمات بثقة عالية — لم تتأثر بالتعديل (سلوك قديم كما هو).
  {
    const out = await call('كيف حالك اليوم', [{ no_speech_prob: 0.02, avg_logprob: -0.1 }]);
    assert.equal(out.lowConfidence, false);
  }
  // ٤) الحارس العام (منطق سابق غير مُمَسّ): ثقة منخفضة بجملة كاملة تبقى تُرفض.
  {
    const out = await call('جملة طويلة من عدة كلمات هنا', [{ no_speech_prob: 0.7, avg_logprob: -0.2 }]);
    assert.equal(out.lowConfidence, true, 'العتبة العامة (no_speech_prob>0.5) لم تتغيّر');
  }
  console.log('✓ maha-oneword-confidence: كلمة واحدة واثقة تمرّ، وضعيفة الثقة فعليًا تُرفض كما كان');
})();
