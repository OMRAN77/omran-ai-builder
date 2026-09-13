// api/_lib/_env-keys.js — v-key-shape: المفتاح في المكان الخطأ لا يجوز أن يُعامَل كمفتاح.
//
// ما حدث: المالك وضع مفتاح OpenRouter (يبدأ بـsk-or-) في ANTHROPIC_API_KEY (في Vercel
// وفي أسرار GitHub). chat.js يفضّل الاتّصال المباشر بأنثروبيك متى وُجد ANTHROPIC_API_KEY،
// فكانت كلّ محادثة كلود تُرفض بـ401 وتسقط إلى سلسلة الاحتياط المجانيّة الضعيفة، بلا سبب
// ظاهر للمالك («مافيها دقّة»، «الصورة ما تُقرأ»). وشكل المفتاح معروف من بادئته العامّة:
//   sk-ant-api03-  مفتاح API من console.anthropic.com   (الصحيح هنا)
//   sk-ant-oat01-  رمز OAuth من اشتراك Claude           (لـClaude Code لا للـAPI)
//   sk-ant-admin   مفتاح Admin                          (لا يستدعي النماذج)
//   sk-or-         مفتاح OpenRouter                     (مكانه OPENROUTER_API_KEY)
//
// يُحمَّل مرّة واحدة في كلّ نقطة دخول (بجانب _fetch-timeout.js) فيُصلح البيئة قبل أيّ معالج:
// يقصّ الفراغات، وينقل مفتاح OpenRouter الموضوع خطأً إلى OPENROUTER_API_KEY إن كان فارغًا
// ويحذفه من ANTHROPIC_API_KEY حتّى يسلك chat.js طريق OpenRouter الذي يعمل بهذا المفتاح.
// لا يقرأ الأسرار في نطاق الوحدة إلّا هذين المتغيّرين، ولا يرمي أبدًا (الإقلاع البارد).
'use strict';

function shape(raw) {
  const k = String(raw || '').trim();
  if (!k) return { kind: 'empty', label: 'غير مضبوط' };
  const n = k.length;
  if (k.startsWith('sk-ant-api03-')) return { kind: 'api', label: 'مفتاح API صحيح الشكل (sk-ant-api03-…، ' + n + ' حرفًا؛ المتوقّع نحو 108)' };
  if (k.startsWith('sk-ant-oat01-')) return { kind: 'oauth', label: 'رمز OAuth من اشتراك Claude (sk-ant-oat01-…) — يصلح لـClaude Code لا لواجهة الـAPI' };
  if (k.startsWith('sk-ant-admin')) return { kind: 'admin', label: 'مفتاح Admin (sk-ant-admin…) — لا يصلح لاستدعاء النماذج؛ أنشئ مفتاح API عاديًّا' };
  if (k.startsWith('sk-or-')) return { kind: 'openrouter', label: 'مفتاح OpenRouter (sk-or-…) — مكانه OPENROUTER_API_KEY لا ANTHROPIC_API_KEY' };
  if (k.startsWith('sk-ant-')) return { kind: 'other', label: 'بادئة Anthropic غير معروفة (' + k.slice(0, 10) + '…، ' + n + ' حرفًا)' };
  if (k.startsWith('sk-')) return { kind: 'other', label: 'ليس مفتاح Anthropic (يبدأ بـ' + k.slice(0, 6) + '… لا بـsk-ant-)؛ ربّما مفتاح مزوّد آخر' };
  return { kind: 'other', label: 'لا يشبه مفتاح Anthropic (' + n + ' حرفًا، لا يبدأ بـsk-ant-)' };
}

function normalize(env) {
  const e = env || process.env;
  const raw = String(e.ANTHROPIC_API_KEY || '');
  const k = raw.trim();
  const s = shape(k);
  let misplaced = '';
  if (s.kind === 'openrouter') {
    if (!String(e.OPENROUTER_API_KEY || '').trim()) e.OPENROUTER_API_KEY = k;
    delete e.ANTHROPIC_API_KEY;
    misplaced = 'openrouter';
  } else if (k !== raw) {
    e.ANTHROPIC_API_KEY = k; // فراغ أو سطر زائد من اللصق
  }
  if (misplaced) e.ANTHROPIC_KEY_MISPLACED = misplaced; else delete e.ANTHROPIC_KEY_MISPLACED;
  return { shape: s, misplaced };
}

normalize(process.env);

module.exports = { shape, normalize };
