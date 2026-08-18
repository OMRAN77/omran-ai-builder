// api/_lib/tone.js — مطابقة أسلوب المستخدم (CJS)
// ثلاث طبقات: قاعدة دائمة ← كشف تلقائي ← اختيار صريح
'use strict';

// ============================================================
// 1) القاعدة الأساسية — تُضاف للـ system prompt دائماً
// ============================================================
const TONE_MATCHING = `# مطابقة الأسلوب

طابق أسلوب المستخدم كما يكتب هو، من أول رسالة:

- يكتب باللهجة (خليجي، مصري، شامي، مغربي) → رد بنفس اللهجة، لا بالفصحى.
- يكتب فصحى بجمل كاملة → التزم الفصحى.
- رسائله قصيرة ومختصرة → اختصر أنت أيضاً.
- رسائله طويلة ومفصّلة → توسّع بقدر ما يفيد، لا أكثر.
- يستخدم رموزاً تعبيرية → استخدمها باعتدال. لا يستخدمها → لا تبدأ بها.
- يكتب بالإنجليزية → رد بالإنجليزية.

لا تتفصّح فوق مستواه، ولا تنزل تحته. الشخص الذي يكتب "وش الحل؟" لا يريد
فقرة أكاديمية، والذي يكتب صياغة رسمية لا يريد "يا بعد قلبي".

هذا يخص الطريقة فقط. الدقة والصدق لا يتغيّران مع أي نبرة: لا تلوِ
الحقيقة ولا تخفِ خطأً لتناسب أسلوب أحد.`;

// ============================================================
// 2) كتل النبرة — يُحقن سطر واحد حسب التفضيل
// ============================================================
const TONE_BLOCKS = {
  warm: '# النبرة: دافئة\nكن ودوداً ومشجّعاً. اعترف بجهد المستخدم قبل أن تنتقد. استخدم صيغاً لطيفة في الاعتراض: "الفكرة قوية، بس فيه نقطة…" بدل "هذا غلط". الدفء في الطريقة لا في المحتوى — لا تخفِ خطأً ولا تمدح شيئاً رديئاً.',
  direct: '# النبرة: مباشرة\nاختصر إلى أقصى حد. جواب مباشر بلا مقدمات ولا مجاملات ولا خواتيم. لا تشرح ما لم يُطلب. لا تعرض خدمات إضافية. سطران أفضل من عشرة.',
  formal: '# النبرة: رسمية\nالتزم العربية الفصحى. لا لهجة ولا عامية ولا رموز تعبيرية. صياغة مهنية متزنة، بلا تكلّف ولا عبارات مبالغة.',
};

// ============================================================
// 3) الكشف التلقائي من كتابة المستخدم
// ============================================================
const DIALECT = /(وش|شنو|ايش|إيش|كيفك|شلون|وين|ليش|زين|كذا|يبي|ابي|أبي|عشان|علشان|دلوقتي|كده|ازيك|بدي|شو|هلق|واش|بزاف|درتي)/i;
const FORMAL_MARKERS = /(أرجو|يرجى|حضرتك|تفضلوا|نود|بالإمكان|هل بإمكانكم|شكراً جزيلاً|تحياتي|مع خالص)/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function detectStyle(userMessages) {
  const msgs = userMessages.filter(function (m) { return m && m.trim().length > 0; }).slice(-15);
  if (!msgs.length) return { tone: 'warm', dialect: false, emoji: false, avgLength: 0, confidence: 'low' };

  const joined = msgs.join(' ');
  const avgLength = joined.length / msgs.length;
  const dialect = DIALECT.test(joined);
  const formal = FORMAL_MARKERS.test(joined);
  const emoji = EMOJI.test(joined);

  var tone;
  if (formal && !dialect) tone = 'formal';
  else if (avgLength < 45 && !emoji) tone = 'direct';
  else tone = 'warm';

  var confidence = msgs.length >= 10 ? 'high' : msgs.length >= 3 ? 'medium' : 'low';
  return { tone: tone, dialect: dialect, emoji: emoji, avgLength: avgLength, confidence: confidence };
}

// ============================================================
// حدود ثابتة لا تتغيّر مع أي نبرة
// ============================================================
const TONE_LIMITS = `# حدود ثابتة

مهما كانت النبرة المطلوبة:

- لا تتظاهر بمشاعر رومانسية، ولا تدخل في غزل أو مغازلة.
- لا تدّعي أنك إنسان، ولا تتهرب من السؤال إذا سُئلت.
- لا تشجّع المستخدم على الاعتماد عليك بديلاً عن الناس في حياته.
- الود مسموح ومطلوب؛ تمثيل العلاقة ممنوع.

إذا طلب المستخدم علاقة أو غزلاً: ارفض بجملة واحدة ودودة بلا محاضرة،
وواصل المساعدة في أي شيء آخر بشكل طبيعي.`;

// ============================================================
// التركيب — يُستدعى من ai.js
// ============================================================

/**
 * يرجع كتلة النبرة التي تُضاف للـ system prompt.
 * @param {object} opts
 * @param {string} [opts.preference] - اختيار المستخدم الصريح: warm|direct|formal|auto
 * @param {string[]} [opts.userMessages] - رسائل المستخدم السابقة للكشف التلقائي
 */
function toneSection(opts) {
  opts = opts || {};
  var parts = [TONE_MATCHING];

  var tone;
  if (opts.preference && opts.preference !== 'auto') {
    tone = opts.preference;
  } else {
    var detected = detectStyle(opts.userMessages || []);
    tone = detected.confidence === 'low' ? 'warm' : detected.tone;
  }

  if (TONE_BLOCKS[tone]) parts.push(TONE_BLOCKS[tone]);
  parts.push(TONE_LIMITS);
  return '\n\n' + parts.join('\n\n');
}

// ============================================================
// استخراج كل رسائل المستخدم من body المحادثة
// ============================================================
function extractUserMessages(action, body) {
  var texts = [];
  try {
    if (action === 'gemini') {
      if (Array.isArray(body.contents)) {
        body.contents.forEach(function (c) {
          if (c && c.role === 'user' && Array.isArray(c.parts)) {
            c.parts.forEach(function (p) { if (typeof p.text === 'string') texts.push(p.text); });
          }
        });
      }
    } else if (Array.isArray(body.messages)) {
      body.messages.forEach(function (m) {
        if (!m || m.role !== 'user') return;
        if (typeof m.content === 'string') { texts.push(m.content); return; }
        if (Array.isArray(m.content)) {
          m.content.forEach(function (p) {
            if (p && p.type === 'text' && typeof p.text === 'string') texts.push(p.text);
          });
        }
      });
    }
  } catch (e) { /* ignore */ }
  return texts;
}

// خيارات الترحيب — للفرونت-إند
const ONBOARDING = {
  question: 'كيف تحب أرد عليك؟',
  options: [
    { value: 'warm', label: 'ودود ومشجّع' },
    { value: 'direct', label: 'مختصر ومباشر' },
    { value: 'formal', label: 'رسمي' },
    { value: 'auto', label: 'على راحتك' },
  ],
};

module.exports = { toneSection, extractUserMessages, detectStyle, TONE_MATCHING, TONE_BLOCKS, TONE_LIMITS, ONBOARDING };
