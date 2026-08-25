// api/_lib/env.js — فهرس واحد لكل متغيّر بيئة يطلبه هذا المستودع.
//
// لماذا لا يصرخ عند الإقلاع: كل ملف في api/ دالّة بلا خادم مستقلّة. رمْيُ
// خطأ وقت التحميل يعني ٥٠٠ صامتة على تلك الدالّة كلّها — وهو بالضبط نوع
// العطب الذي نحاول إنهاءه. فالصراخ هنا **عند نقطة الاستخدام**: رسالة
// صريحة تسمّي المتغيّر الغائب والميزة المتعطّلة، بدل انهيار غامض أعمق.
//
// لا يقرأ هذا الملفّ قيمة أيّ سرّ ولا يطبعها. الحضور فقط.

// kind: core = بدونه لا يعمل شيء · feature = ميزة واحدة تتعطّل
//       tunable = له بديل آمن في الكود · money = باب مقفل، حضورٌ فقط
const SPEC = {
  AUTH_SECRET:            ['core',    'الجلسات وبوّابة المالك'],
  AUTH_SECRET_PREVIOUS:   ['tunable', 'مناوبة السرّ: يُقرأ به السجلّ القديم ثمّ يُعاد تعميته بالجديد'],
  OWNER_USERNAME:         ['core',    'بوّابة المالك'],
  MONITOR_KEY:            ['core',    'المراقبة الخارجية'],
  UPSTASH_REDIS_REST_URL: ['core',    'قاعدة البيانات'],
  UPSTASH_REDIS_REST_TOKEN:['core',   'قاعدة البيانات'],
  GEMINI_API_KEY:         ['feature', 'المحرّك الأساسي'],
  OPENAI_API_KEY:         ['feature', 'محرّك بديل'],
  ANTHROPIC_API_KEY:      ['feature', 'محرّك بديل'],
  GROQ_API_KEY:           ['feature', 'محرّك بديل'],
  MISTRAL_API_KEY:        ['feature', 'محرّك بديل'],
  DEEPSEEK_API_KEY:       ['feature', 'محرّك بديل'],
  COHERE_API_KEY:         ['feature', 'ترتيب النتائج'],
  OPENROUTER_API_KEY:     ['feature', 'محرّك بديل'],
  PERPLEXITY_API_KEY:     ['feature', 'بحث'],
  TAVILY_API_KEY:         ['feature', 'بحث'],
  GOOGLE_SEARCH_API_KEY:  ['feature', 'بحث Google'],
  GOOGLE_SEARCH_CX:       ['feature', 'بحث Google'],
  GOOGLE_CLIENT_ID:       ['feature', 'دخول Google'],
  GOOGLE_CLIENT_SECRET:   ['feature', 'دخول Google'],
  RUNWAY_API_KEY:         ['feature', 'الفيديو'],
  RUNWAY_API_KEY_2:       ['tunable', 'الفيديو — مفتاح احتياطي'],
  RUNWAY_API_KEY_3:       ['tunable', 'الفيديو — مفتاح احتياطي'],
  AZURE_SPEECH_KEY:       ['feature', 'الصوت'],
  AZURE_SPEECH_REGION:    ['feature', 'الصوت'],
  FINNHUB_API_KEY:        ['feature', 'شريط الأسهم'],
  TWELVEDATA_API_KEY:     ['feature', 'شريط الأسهم — بديل'],
  RESEND_API_KEY:         ['feature', 'البريد'],
  TELEGRAM_BOT_TOKEN:     ['feature', 'تلغرام'],
  TG_WEBHOOK_SECRET:      ['feature', 'تلغرام'],
  VAPID_PUBLIC_KEY:       ['feature', 'الإشعارات'],
  VAPID_PRIVATE_KEY:      ['feature', 'الإشعارات'],
  BLOB_READ_WRITE_TOKEN:  ['feature', 'تخزين الملفّات (يقرأه Vercel ضمنًا)'],
  BLOB_STORE_ID:          ['feature', 'تخزين الملفّات'],
  ELEVENLABS_API_KEY:     ['tunable', 'صوت — غير مستخدم حاليًّا'],
  SENTRY_DSN:             ['tunable', 'تتبّع الأخطاء (مُعطَّل بلا ضرر)'],
  SITE_URL:               ['tunable', 'بديل: عنوان الإنتاج'],
  VERCEL_ENV:             ['tunable', 'يحقنه Vercel'],
  APP_RELEASE:            ['tunable', 'بديل: omran-ai-builder'],
  AI_MODE:                ['tunable', 'بديل: balanced'],
  AGENT_MAX_MS:           ['tunable', 'بديل: ٢٤٠٠٠٠'],
  AGENT_MAX_STEPS:        ['tunable', 'بديل: ٢٥'],
  FETCH_TIMEOUT_MS:       ['tunable', 'بديل: ٣٠٠٠٠'],
  COHERE_RERANK_MODEL:    ['tunable', 'بديل: rerank-v3.5'],
  EDU_USER_DAILY:         ['tunable', 'بديل: ٢٥'],
  EDU_GRADE_DAILY:        ['tunable', 'بديل: ١٢٠'],
  ALLOW_EMAIL_AUTOLINK:   ['tunable', 'بديل: مُعطَّل'],
  STRIPE_SECRET_KEY:      ['money',   'الدفع — باب مقفل'],
  PAYPAL_CLIENT_ID:       ['money',   'الدفع — باب مقفل'],
  PAYPAL_SECRET:          ['money',   'الدفع — باب مقفل'],
  PAYPAL_MODE:            ['money',   'الدفع — باب مقفل'],
};

const has = (n) => typeof process.env[n] === 'string' && process.env[n].trim() !== '';

/** الغائب من قائمة أسماء. */
function missing(names) { return names.filter((n) => !has(n)); }

/**
 * بوّابة ميزة: تُرجع true إن كان كلّ ما تحتاجه حاضرًا.
 * وإلّا تردّ ٥٠٣ برسالة تسمّي الغائب صراحةً — لا انهيار غامض.
 */
function requireEnv(res, names, feature) {
  const gone = missing(names);
  if (!gone.length) return true;
  try {
    res.status(503).json({
      error: 'env_missing',
      feature: feature || 'غير مسمّاة',
      missing: gone,
      hint: 'أضف المتغيّر في Vercel → Settings → Environment Variables ثمّ أعد النشر.',
    });
  } catch { /* الردّ أُرسل سابقًا — لا شيء يُفعل، والسبب مكتوب هنا. */ }
  return false;
}

/** تقرير حضور — أسماء وحالات فقط، ولا قيمة سرّ تخرج من هنا أبدًا. */
function envReport() {
  const out = { core: [], feature: [], tunable: [], money: [], setCount: 0, total: 0 };
  for (const [name, [kind, why]] of Object.entries(SPEC)) {
    out.total++;
    if (has(name)) { out.setCount++; continue; }
    out[kind].push({ name, why });
  }
  out.healthy = out.core.length === 0;
  return out;
}

module.exports = { SPEC, has, missing, requireEnv, envReport };
