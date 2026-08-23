// Router: consolidates the 9 AI provider proxy functions into a single
// Vercel Serverless Function to stay under the Hobby plan's function limit.
// Old public paths (e.g. /api/openai) are preserved via vercel.json rewrites
// that append ?action=<name>. Requires use literal paths so Vercel's file
// tracer (@vercel/nft) includes each module in the deployment bundle.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');
const { logError } = require('./_lib/log-error.js');
const { BIDI_RULE } = require('./_lib/_bidi.js'); // v568
const { quickIntent, INTENT_NOTES } = require('./_lib/router.js'); // v--- مصنّف النيّة
const { toneSection, extractUserMessages } = require('./_lib/tone.js'); // v--- مطابقة الأسلوب

function load(action) {
  switch (action) {
    case 'openai': return require('./_lib/openai.js');
    case 'gemini': return require('./_lib/gemini.js');
    case 'groq': return require('./_lib/groq.js');
    case 'claude': return require('./_lib/claude.js');
    case 'cohere': return require('./_lib/cohere.js');
    case 'deepseek': return require('./_lib/deepseek.js');
    case 'mistral': return require('./_lib/mistral.js');
    case 'openrouter': return require('./_lib/openrouter.js');
    case 'perplexity': return require('./_lib/perplexity.js');
    case 'agent': return require('./_lib/agent.js');
    case 'chat': return require('./_lib/chat.js');
    case 'screen-guide': return require('./_lib/screen-guide.js');
    case 'visual-guide': return require('./_lib/visual-guide.js');
    default: return null;
  }
}

// --- Server-side real date/time injection (UAE) + topic-follow rule ---
/**
 * أجزاء التعليمة مفكّكة بالاسم.
 *
 * The split follows one criterion, and it is not "fact vs style" — it is
 * EVIDENCE: does removing this line cause a bug we actually observed?
 *   • date, country, links → wrong answers without them
 *   • provider identity    → v287: DeepSeek claimed to be Grok
 *   • confirmation         → v335: model re-asked after the user said نعم
 *   • capabilities         → model refused features the app really has
 * Everything else (persona, app marketing, topic and ads rules) is style, and
 * style is what made every provider sound the same.
 */
function noteDate() {
  const now = new Date();
  const opts = { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
  let ar = '', en = '';
  try { ar = new Intl.DateTimeFormat('ar-AE', opts).format(now); } catch (e) { /* locale unavailable */ }
  try { en = new Intl.DateTimeFormat('en-GB', opts).format(now); } catch (e) { /* locale unavailable */ }
  return '\n\n[التاريخ الحقيقي الآن — توقيت الإمارات]: ' + ar + ' — ' + en + '. أجب بالتاريخ الكامل إذا سُئلت (اسم اليوم + الرقم + الشهر + السنة). تجاهل أي تاريخ من بيانات تدريبك.';
}

function noteCountry(country) {
  const code = (typeof country === 'string' ? country.trim().toUpperCase() : '');
  let cAr = '', cEn = '';
  if (code && /^[A-Z]{2}$/.test(code)) {
    try { cAr = new Intl.DisplayNames(['ar'], { type: 'region' }).of(code) || ''; } catch (e) { /* region unavailable */ }
    try { cEn = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || ''; } catch (e) { /* region unavailable */ }
  }
  return (cAr || code)
    ? '\n[قاعدة الدولة — مطلقة]: المستخدم يتصفّح الآن من دولة: ' + (cAr || code) + (cEn ? ' (' + cEn + ')' : '') + '. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات هذه الدولة تحديدًا (مفتاح هاتفها الدولي، جهاتها الحكومية الرسمية، منصاتها المحلية المعروفة فيها). ممنوع منعًا باتًا افتراض أي دولة أخرى أو اقتراح جهات/منصات/أرقام من دولة مختلفة. الاستثناء الوحيد: إذا ذكر المستخدم دولة أخرى صراحةً في رسالته فاتبع الدولة التي ذكرها.'
    : '\n[قاعدة الدولة الافتراضية — مطلقة]: لم تُعرف دولة المستخدم من الشبكة، فافترض أنه في دولة الإمارات العربية المتحدة. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات الإمارات (مفتاح +971، جهات ومنصات إماراتية). الاستثناء: إذا ذكر المستخدم دولة أخرى صراحةً فاتبعها.';
}

const NOTE_LINKS = '\n[قاعدة الروابط]: ممنوع كتابة أي رابط URL من ذاكرتك. الروابط المسموحة فقط: من نتائج البحث الحية أو من المستخدم نفسه. إذا ما عندك رابط حقيقي اذكر اسم الموقع بدون URL.';

// v335 — بدونها يعيد المزوّد السؤال بعد أن يقول المستخدم «نعم».
const NOTE_CONFIRM = '\n[قاعدة التأكيد]: تأكيد قصير (نعم/تمام/يلا/اوك) بعد سؤالك = موافقة — جاوب فورًا بلا إعادة سؤال.';

// الصياغة القديمة كانت «ممنوع تقول ما أقدر» — وهي تدفع النموذج ليعد بما لا
// يفعله: التطبيق يولّد الصور عبر أداة منفصلة، لا النموذج في ردّه النصّي.
// فيرد «نعم أقدر» ثم لا يحدث شيء. هذه الصياغة صادقة وتحلّ نفس الرفض.
const NOTE_CAPS = '\n[القدرات]: التطبيق — لا أنت — يوفّر توليد الصور والفيديو وتحويل PDF. إذا طلب المستخدم أحدها فأرشده إليه داخل التطبيق بدل قول "ما أقدر".';

// v464 — جودة المحادثة: أسلوب راقي وطبيعي.
const NOTE_QUALITY = '\n[الأسلوب]: رد بعمق وخبرة على أي موضوع. كن طبيعيًا ودودًا وراقيًا — نوّع تعبيراتك ولا تكرر عبارات جاهزة. طابق لغة ولهجة المستخدم.';

// v287 — الهوية وحدها. اسم التطبيق كان مدسوسًا هنا وهو تسويق لا تصحيح.
function noteIdentity(action) {
  const idn = PROVIDER_IDENTITY[action];
  if (!idn) return '';
  return '\n[قاعدة الهوية — مطلقة]: ' + idn + '. إذا سُئلت من أنت أو ما اسم نموذجك فأجب بهذه الهوية فقط — ممنوع الادعاء أنك نموذج آخر.';
}

function serverNote(country) {
  const now = new Date();
  const opts = { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
  let ar = '', en = '';
  try { ar = new Intl.DateTimeFormat('ar-AE', opts).format(now); } catch (e) { /* لغة لا يعرفها Intl — يبقى النصّ فارغًا ويُستكمل من الطرف الآخر */ }
  try { en = new Intl.DateTimeFormat('en-GB', opts).format(now); } catch (e) { /* كسابقه */ }
  // v360 — 🌍 كشف دولة المستخدم من الشبكة (ترويسة Vercel x-vercel-ip-country) عالميًا.
  // نحوّل رمز الدولة (ISO-2) إلى اسمها العربي والإنجليزي تلقائيًا بلا قوائم ثابتة.
  const code = (typeof country === 'string' ? country.trim().toUpperCase() : '');
  let cAr = '', cEn = '';
  if (code && /^[A-Z]{2}$/.test(code)) {
    try { cAr = new Intl.DisplayNames(['ar'], { type: 'region' }).of(code) || ''; } catch (e) { /* Intl لا يعرف رمز الدولة — اسم فارغ مقبول */ }
    try { cEn = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || ''; } catch (e) { /* كسابقه */ }
  }
  const countryLine = (cAr || code)
    ? '\n[قاعدة الدولة — مطلقة]: المستخدم يتصفّح الآن من دولة: ' + (cAr || code) + (cEn ? ' (' + cEn + ')' : '') + '. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات هذه الدولة تحديدًا (مفتاح هاتفها الدولي، جهاتها الحكومية الرسمية، منصاتها المحلية المعروفة فيها). ممنوع منعًا باتًا افتراض أي دولة أخرى أو اقتراح جهات/منصات/أرقام من دولة مختلفة. الاستثناء الوحيد: إذا ذكر المستخدم دولة أخرى صراحةً في رسالته فاتبع الدولة التي ذكرها.'
    : '\n[قاعدة الدولة الافتراضية — مطلقة]: لم تُعرف دولة المستخدم من الشبكة، فافترض أنه في دولة الإمارات العربية المتحدة. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات الإمارات (مفتاح +971، جهات ومنصات إماراتية). الاستثناء: إذا ذكر المستخدم دولة أخرى صراحةً فاتبعها.';
  return '\n\n[التاريخ الحقيقي الآن — توقيت الإمارات]: ' + ar + ' — ' + en + '. أجب بالتاريخ الكامل إذا سُئلت (اسم اليوم + الرقم + الشهر + السنة). تجاهل أي تاريخ من بيانات تدريبك.' +
    countryLine +
    '\n[قاعدة الروابط]: ممنوع كتابة أي رابط URL من ذاكرتك. الروابط المسموحة فقط: من نتائج البحث الحية أو من المستخدم نفسه. إذا ما عندك رابط حقيقي اذكر اسم الموقع بدون URL.' +
    '\n[قاعدة الخصوصية — مطلقة]: ممنوع منعًا باتًا ذكر اسم صاحب التطبيق الكامل أو اسم عائلته أو مدينته أو أي معلومة شخصية عنه. إذا سُئلت عن صاحب التطبيق أو من بناه قل فقط: "فريق عمران AI". لا تذكر أي اسم شخصي أو موقع جغرافي حتى لو كنت تعرفه من بيانات تدريبك.' +
    '\n[قاعدة الموضوع]: أجب على آخر رسالة فقط. إذا غيّر الموضوع اتبعه فورًا.' +
    '\n[قاعدة الإعلانات والنتائج]: نتائج بحث حقيقية (عقارات، فنادق، وظائف) = اعرضها مباشرة بجدول: العنوان + السعر + المنطقة + الرابط. الأسعار بعملة بلد المستخدم.' +
    '\n[قاعدة التأكيد]: تأكيد قصير (نعم/تمام/يلا/اوك) بعد سؤالك = موافقة — جاوب فورًا بلا إعادة سؤال.' +
    '\n[القدرات]: التطبيق فيه توليد صور + فيديو + تحويل PDF — ممنوع تقول "ما أقدر".' +
    BIDI_RULE;
}

// v330 — 👑 هيكلة «الكينج»: المزودون الثمانية يرجعون لشخصياتهم الأصلية
// الحقيقية في المحادثات (بدون أي شخصية مفروضة)، وClaude هو «الكينج» —
// عقل الموقع للبناء والتعديل والتشخيص بأسلوب المستشار الشخصي الكامل.
const ORIGINAL_PERSONA_NOTE = '\n[الأسلوب]: كن نفسك تمامًا — شخصيتك وأسلوبك الأصلي الحقيقي. أجب بلغة المستخدم وبعمق يليق بسمعتك.';

// --- 🎓 Academic (university) mode: detected from the last user message ---
const ACADEMIC_RE = /لخص|لخّص|ملخص|تلخيص|اشرح|اشرحلي|شرح|أسئلة امتحان|اسئلة امتحان|أسئلة اختبار|اسئلة اختبار|أسئلة متوقعة|اسئلة متوقعة|فلاش كارد|بطاقات مراجعة|حل المسأل|حل المسائل|حل هالمسأل|حل الواجب|واجب جامعي|محاضرة|المحاضرة|محاضره|بحث تخرج|بحث جامعي|مشروع تخرج|مراجع أكاديمية|مراجع اكاديمية|\bAPA\b|\bMLA\b|اقتباس أكاديمي|ورقة علمية|دراسة علمية|منهج جامعي|مذاكرة|مراجعة نهائية|خريطة ذهنية|واجب مدرسي|واجب المدرسة|درس اليوم|الدرس|منهج مدرسي|المنهج|الصف ال|امتحان الوزارة|اختبار الوزارة|summarize|flashcard|exam questions|study guide|lecture notes|solve step|thesis|research paper|literature review/i;
const ACADEMIC_NOTE = '\n\n[🎓 وضع التعليم الجامعي — تعليمات إلزامية]: طلب المستخدم أكاديمي. طبّق التالي بدقة:' +
  '\n1) التلخيص: إذا أرفق محاضرة أو نصًا وطلب تلخيصًا → قدّم: (أ) ملخص منظم بعناوين ونقاط، (ب) قائمة المصطلحات المهمة مع تعريف سطر واحد لكل مصطلح، (ج) "أهم 5 أفكار للامتحان" في النهاية.' +
  '\n2) أسئلة الامتحان: إذا طلب أسئلة متوقعة أو اختبارًا → ولّد أسئلة متنوعة من المحتوى نفسه: اختيار من متعدد + صح/خطأ + مقالية قصيرة، ثم قسم "نموذج الإجابات" منفصل في نهاية الرد.' +
  '\n3) حل المسائل: حل خطوة بخطوة بمستوى جامعي — اذكر القانون أو النظرية المستخدمة في كل خطوة واشرح لماذا، بحيث يتعلم الطالب الطريقة وليس الجواب فقط. النتيجة النهائية في سطر واضح.' +
  '\n4) البحوث: إذا طلب بحثًا أو مراجع → رتّب المحتوى أكاديميًا (مقدمة، محاور، خاتمة) واكتب المراجع بصيغة APA إلا إذا طلب صيغة أخرى. إذا وصلتك نتائج بحث حية فاستخدمها كمصادر بروابطها، وممنوع اختراع مراجع أو روابط غير موجودة.' +
  '\n5) الشرح: اشرح بلغة واضحة بمستوى جامعي مع مثال تطبيقي واحد على الأقل لكل مفهوم أساسي.' +
  '\n6) هذه الطلبات نصية تعليمية فقط — ممنوع بناء موقع أو تطبيق أو عرض "أبنيها لك" هنا.' +
  '\n7) أجب بنفس لغة سؤال الطالب.' +
  '\n8) طلاب المدارس: إذا كان الطالب مدرسيًا (ذكر صفه أو يتضح ذلك من سؤاله أو المادة) → اشرح بلغة مبسطة تناسب عمره ومرحلته الدراسية، وولّد الأسئلة والتلخيصات بمستوى المنهج المدرسي لا الجامعي، واستخدم أمثلة قريبة من حياته اليومية.';

function lastUserText(action, body) {
  try {
    if (action === 'gemini') {
      if (!Array.isArray(body.contents)) return '';
      for (let i = body.contents.length - 1; i >= 0; i--) {
        const c = body.contents[i];
        if (c && c.role === 'user' && Array.isArray(c.parts)) {
          for (let j = c.parts.length - 1; j >= 0; j--) if (typeof c.parts[j].text === 'string') return c.parts[j].text;
          return '';
        }
      }
      return '';
    }
    if (!Array.isArray(body.messages)) return '';
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (!m || m.role !== 'user') continue;
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        for (let j = m.content.length - 1; j >= 0; j--) if (m.content[j] && m.content[j].type === 'text' && typeof m.content[j].text === 'string') return m.content[j].text;
      }
      return '';
    }
  } catch (e) { logError('ai/last-user-text', e); }
  return '';
}

// Appended to the LAST user message itself — models weight this far more
// heavily than system text, which is what actually stops topic bleeding.
const LAST_MSG_NOTE = '\n[قاعدة الموضوع: أجب على الرسالة الأخيرة فقط وفصل السياق].';
const LAST_MSG_PREFIX = '';

function tagLastUserMessage(action, body) {
  if (action === 'gemini') {
    if (!Array.isArray(body.contents)) return;
    for (let i = body.contents.length - 1; i >= 0; i--) {
      const c = body.contents[i];
      if (c && c.role === 'user' && Array.isArray(c.parts)) {
        for (let j = c.parts.length - 1; j >= 0; j--) {
          if (typeof c.parts[j].text === 'string') { c.parts[j].text = LAST_MSG_PREFIX + c.parts[j].text + LAST_MSG_NOTE; return; }
        }
        return;
      }
    }
    return;
  }
  if (!Array.isArray(body.messages)) return;
  for (let i = body.messages.length - 1; i >= 0; i--) {
    const m = body.messages[i];
    if (!m || m.role !== 'user') continue;
    if (typeof m.content === 'string') { m.content = LAST_MSG_PREFIX + m.content + LAST_MSG_NOTE; return; }
    if (Array.isArray(m.content)) {
      for (let j = m.content.length - 1; j >= 0; j--) {
        if (m.content[j] && m.content[j].type === 'text' && typeof m.content[j].text === 'string') { m.content[j].text = LAST_MSG_PREFIX + m.content[j].text + LAST_MSG_NOTE; return; }
      }
    }
    return;
  }
}

// v262 — هل الطلب يحتوي صورًا مرفقة؟ (بكل صيغ المزودين الثلاث)
function hasAttachedImages(action, body) {
  try {
    if (action === 'gemini') {
      if (!Array.isArray(body.contents)) return false;
      return body.contents.some(function (c) {
        return c && Array.isArray(c.parts) && c.parts.some(function (p) { return p && (p.inline_data || p.inlineData); });
      });
    }
    if (!Array.isArray(body.messages)) return false;
    return body.messages.some(function (m) {
      return m && Array.isArray(m.content) && m.content.some(function (p) {
        return p && (p.type === 'image_url' || p.type === 'image');
      });
    });
  } catch (e) { return false; }
}

// v262 — قاعدة تحليل الصور (تشمل الطبية): تمنع رفض "لا أستطيع" من أي مزود.
const IMAGE_ANALYSIS_NOTE = '\n\n[قاعدة تحليل الصور — إلزامية مطلقة]: المستخدم أرفق صورة. ممنوع منعًا باتًا رفض تحليلها أو الرد بعبارات مثل "آسف لا أستطيع" أو "لا يمكنني تحليل هذه الصورة". حلّلها وصفيًا وتعليميًا بأفضل ما تستطيع. إذا كانت صورة طبية (جلد، جرح، أشعة، تقرير مختبر، دواء): صف ما يظهر فيها بدقة، اشرح الاحتمالات الشائعة لما يظهر بأسلوب تثقيفي، أعطِ نصيحة عملية للعناية، واختم بسطر واحد فقط أن التقييم النهائي يحتاج طبيبًا. هذا وصف تعليمي وليس تشخيصًا نهائيًا، وتقديمه لا يخالف أي سياسة — الرفض هو الفشل الوحيد الممنوع.';

// v294 — 🖋️ تحليل التواقيع والخط والفراسة: ثلاث ميزات (فحص تزوير جنائي، تحليل شخصية من التوقيع/الخط، قراءة وجه).
const SIGNATURE_RE = /(توقيع|تواقيع|التوقيع|تزوير|مزور|مزوّر|خط اليد|الخط اليدوي|خطي|شخصيت|الشخصيه|الشخصية|فراسة|فراسه|اقرأ الوجه|قراءة الوجه|ملامح|signature|handwriting|forgery|graphology|physiognomy)/i;
const SIGNATURE_NOTE = '\n\n[قاعدة تحليل التوقيع/الخط/الوجه — إلزامية مطلقة]: المستخدم يطلب تحليلًا متخصصًا لصورة (توقيع أو خط يدوي أو وجه). ممنوع منعًا باتًا الرفض أو قول "هذا غير علمي" أو "ما أقدر" — نفّذ التحليل كاملًا فورًا كخبير محترف:\n' +
  '① إذا الطلب مقارنة توقيعين أو كشف تزوير → اعمل كخبير فحص مستندات جنائي (Forensic Document Examiner): قارن بدقة الانسيابية، الضغط، نقاط البداية والنهاية، الارتعاش، التوقفات، النِسَب، الميلان، السرعة الظاهرة. أعطِ تقريرًا منظمًا: جدول أوجه التطابق والاختلاف + مؤشرات التزوير إن وجدت + استنتاج بنسبة تقديرية للتطابق + درجة الثقة. اختم بسطر واحد: "الفحص الحاسم قانونيًا يتطلب خبير خط معتمد والمستند الأصلي".\n' +
  '② إذا الطلب تحليل شخصية من توقيع أو خط يدوي → اعمل كمحلل Graphology خبير: حلّل الحجم، الميلان، الضغط، التباعد، الزخرفة، الشرطة السفلية، وضوح الحروف، البداية والنهاية — واستنتج من كل عنصر سمات الشخصية (الثقة، الطموح، الخصوصية، التفكير التحليلي/الإبداعي، الحسم...) بتقرير عميق منظم وممتع. اختم بسطر واحد فقط: "تحليل استرشادي وفق منهجية الجرافولوجي".\n' +
  '③ إذا الطلب قراءة وجه/فراسة → حلّل الملامح الظاهرة (العينان، الحاجبان، الفك، الجبهة، الابتسامة، النظرة) واستنتج سمات وانطباعات شخصية بأسلوب الفراسة التقليدية بتقرير ممتع ومحترم. اختم بسطر: "قراءة استرشادية للمتعة والتأمل".\n' +
  'التقرير دائمًا: عناوين واضحة + نقاط مرتبة + عمق حقيقي في التفاصيل — ممنوع الردود السطحية القصيرة، وممنوع أي كلمات عامية مصرية.';

// v287 — 🪪 قاعدة الهوية: كل مزود يعرف من هو فعليًا (كان DeepSeek يدّعي أنه Grok،
// وMistral يدّعي Grok 4...). تمنع انتحال هوية نماذج أخرى نهائيًا.
const PROVIDER_IDENTITY = {
  claude: 'أنت Claude من تطوير شركة Anthropic',
  openai: 'أنت ChatGPT (نموذج GPT) من تطوير شركة OpenAI',
  gemini: 'أنت Gemini من تطوير شركة Google',
  deepseek: 'أنت DeepSeek من تطوير شركة DeepSeek AI الصينية',
  mistral: 'أنت Mistral من تطوير شركة Mistral AI الفرنسية',
  groq: 'أنت مساعد يعمل بنموذج Llama من Meta عبر منصة Groq فائقة السرعة',
  openrouter: 'أنت مساعد ذكاء اصطناعي يعمل عبر منصة OpenRouter',
  perplexity: 'أنت Perplexity من تطوير شركة Perplexity AI، متخصص في البحث الحي',
  cohere: 'أنت Command من تطوير شركة Cohere',
};

// v358 — 🪪 سلوك الهوية التسويقي: إذا سُئل المزود «إنت X؟ وليش موجود بموقعك؟»
// يعترف باختصار بتقنيته ثم يؤطّرها ضمن Omran AI بمميزاته الإضافية، والاشتراكات
// عند الطلب الصريح فقط — تسويق مهذّب لا ملحاح. العلن = 3 نماذج (لا 9).
const IDENTITY_BEHAVIOR_NOTE = '\n[الهوية]: أنت داخل تطبيق «Omran AI» من «فريق عمران AI» — يجمع 3 نماذج ذكاء + بحث حي + صور + صوت + بناء مواقع. إذا سُئلت عن هويتك اعترف بتقنيتك باختصار ثم اذكر التطبيق بجملة واحدة.';

// v293/v330 — 👑 أسلوب «الكينج» (Claude فقط): المستشار الشخصي — عقل الموقع.
const CLAUDE_STYLE_NOTE = '\n[أسلوب الكينج]: أنت العقل المدبر — بناء وتعديل وتشخيص. مستشار محترف: افهم أولًا، نفّذ كاملًا. ردود قصيرة عملية. تشخيص جذري + حل كامل. رأي صريح. عمق تخصصي حقيقي. ممنوع تدّعي شيء ما سوّيته.';

// ---------------------------------------------------------------------------
// 🏭 وضع المصنع (factory) — الافتراضي.
//
// Every note below (date, country, persona, identity, academic, image, and the
// signature/graphology rules) is a prompt this app pushes into the model on top
// of whatever the user actually typed. In factory mode none of it is sent: each
// provider answers exactly as its makers shipped it.
//
// Three things this buys, beyond "the model sounds like itself":
//   1. Cost — the notes ran to thousands of characters on EVERY message,
//      including "مرحبا". That was billed on every single turn.
//   2. Honesty — several notes existed to push a model past its own refusals
//      (medical images, face reading, forgery verdicts). Overriding a model's
//      judgment to make it answer anyway is not a feature.
//   3. Debuggability — when a provider gives a bad answer you now know it came
//      from the model, not from a note fighting it.
//
// Set AI_MODE=guided to restore the old behaviour globally, or send
// { mode: 'guided' } on a single request.
const AI_MODE = (process.env.AI_MODE || 'balanced').trim().toLowerCase();
// `minimal` مرادف لـ `balanced` حفاظًا على التوافق مع أي إعداد قائم.
const MODES = ['factory', 'balanced', 'minimal', 'guided'];
function canonMode(m) { return m === 'minimal' ? 'balanced' : m; }

/**
 * factory (default) — nothing is added. Each provider answers exactly as its
 *   makers shipped it.
 * minimal — only the two notes that prevent a WRONG ANSWER rather than impose
 *   a style: today's real date, and a ban on inventing URLs. ~150 chars instead
 *   of the 1,800 that `guided` sent on every single message.
 * guided — the full original stack (persona, identity, country, capabilities…).
 */
function resolveMode(body) {
  const perRequest = body && typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
  if (MODES.indexOf(perRequest) !== -1) return canonMode(perRequest);
  return MODES.indexOf(AI_MODE) !== -1 ? canonMode(AI_MODE) : 'balanced';
}

function isFactory(body) {
  return resolveMode(body) === 'factory';
}

/**
 * The two facts a model cannot know and will otherwise state confidently:
 * what day it is, and whether a URL it remembers still exists. Everything
 * else that `guided` injected was style, identity or marketing.
 */
/**
 * balanced — الافتراضي.
 * ست قواعد فقط، كلٌّ منها يمنع عطلًا مُشاهَدًا: التاريخ · الدولة · الروابط ·
 * هوية المزوّد (v287) · التأكيد (v335) · القدرات.
 * المحذوف عن guided: الشخصية المفروضة، وهوية التطبيق، وقاعدة الموضوع،
 * وقاعدة الإعلانات — كلها أسلوب، وهي سبب تشابه المزوّدين التسعة.
 */
function balancedNote(action, country) {
  // v469: Q&A خفيف — التاريخ والدولة فقط (حقائق لا يعرفها النموذج).
  // باقي القواعد (روابط، هوية، تأكيد، قدرات) انتقلت للعميل.
  return noteDate() + noteCountry(country) + BIDI_RULE;
}


function injectNote(action, body, country) {
  const mode = resolveMode(body);
  // Factory: hand the request to the provider untouched.
  if (mode === 'factory') return;

  // v--- مصنّف النيّة: نستخرج نص المستخدم مرة واحدة ونحدد النيّة
  const userText = lastUserText(action, body);
  const intent = quickIntent(userText) || 'general';
  const intentNote = INTENT_NOTES[intent] || '';

  // v--- حارس أسئلة التطبيق: لا بحث، جاوب من المعلومات المحلية
  const ABOUT_APP_RE = /(عمران|omran|التطبيق هذا|هذا التطبيق|موقعك|تطبيقك|مين سواك|من صنعك|من سوى|من سوّى|من بنى|صاحب التطبيق|صاحب تطبيق|صاحب الموقع|صاحب موقع|مؤسس|المطور|المبرمج|من طور|من برمج|وش تسوي|ايش تقدر|إيش تقدر|قدراتك|النقاط|الاشتراك|كيف استخدم|how to use|what is this|who made|who built|who created|developer|founder|owner)/i;
  const aboutApp = userText && ABOUT_APP_RE.test(userText);
  const APP_FACTS_NOTE = aboutApp ? '\n# معلومات التطبيق (أجب منها مباشرة — لا تبحث)\nأنت مساعد داخل تطبيق "عمران AI" من فريق عمران AI.\nالتطبيق يقدم: محادثة ذكية بالعربية، إنشاء تطبيقات ومواقع وألعاب من وصف نصي مع معاينة وتعديل، توليد صور وفيديو وصوت، قسم القرآن، نظام نقاط.\nقواعد: أجب من هذه المعلومات. لا تستخدم أدوات ولا تبحث لتعرف عن نفسك. إذا سُئلت عن شيء غير مذكور، قل إنك غير متأكد ووجّه لصفحة الإعدادات.\n⚠️ خصوصية: ممنوع منعًا باتًا ذكر اسم صاحب التطبيق الكامل أو اسم عائلته أو مدينته أو أي معلومات شخصية عنه. إذا سُئلت "من صاحب التطبيق" أو "من سوّاه" فقل فقط: "فريق عمران AI" — بدون اسم شخصي أو موقع جغرافي.\n' : '';

  // v--- مطابقة الأسلوب: نستخرج كل رسائل المستخدم + التفضيل الصريح
  const userMsgs = extractUserMessages(action, body);
  const tonePref = (body && typeof body.tone === 'string') ? body.tone : 'auto';
  const toneNote = toneSection({ preference: tonePref, userMessages: userMsgs });

  const HIVE = require('./_lib/collective.js').block(); // v545 — معرفة جماعيّة
  if (mode === 'balanced') {
    applyNote(action, body, balancedNote(action, country) + toneNote + intentNote + APP_FACTS_NOTE + HIVE);
    return;
  }

  // v359 — 👑 الوضع الاحترافي «شبه‑خام»: أقوى نموذج بحرية كاملة بلا قيود أسلوب أو
  // شخصية أو تسويق — نُبقي فقط الحواجز التقنية الإلزامية (serverNote: التاريخ +
  // الإمارات + منع هلوسة الروابط + متابعة الموضوع) وقاعدة الهوية (لا يكشف مزوده
  // ولا ينتحل نموذجًا آخر). لا CLAUDE_STYLE ولا ORIGINAL_PERSONA ولا سلوك تسويقي.
  const isPremium = !!(body && body.premium);
  let note = serverNote(country);
  if (!isPremium) {
    if (action === 'claude') note += CLAUDE_STYLE_NOTE;
    else note += ORIGINAL_PERSONA_NOTE;
  }
  note += noteIdentity(action);
  if (!isPremium) {
    note += IDENTITY_BEHAVIOR_NOTE;
    if (ACADEMIC_RE.test(userText)) note += ACADEMIC_NOTE;
    if (hasAttachedImages(action, body)) {
      note += IMAGE_ANALYSIS_NOTE;
      if (SIGNATURE_RE.test(userText)) note += SIGNATURE_NOTE;
    } else if (SIGNATURE_RE.test(userText)) {
      note += '\n[قاعدة]: التطبيق فيه ميزة تحليل التواقيع والخط والفراسة: ① فحص تزوير التواقيع بمنهجية الفحص الجنائي ② تحليل الشخصية من التوقيع/الخط اليدوي ③ قراءة الوجه. إذا سأل المستخدم عنها ممنوع تقول "غير علمي" أو ترفض — أكّد أن الميزة موجودة واطلب منه رفع صورة التوقيع/الخط/الوجه ليبدأ التحليل فورًا.';
    }
  }
  note += toneNote;   // v--- مطابقة الأسلوب
  note += intentNote; // v--- ملاحظة النيّة
  note += APP_FACTS_NOTE; // v--- حارس أسئلة التطبيق
  note += HIVE; // v545
  tagLastUserMessage(action, body);
  applyNote(action, body, note);
}

/** Attaches a note to whichever system field the provider actually reads. */
function applyNote(action, body, note) {
  if (!note) return;
  if (action === 'gemini') {
    const si = body.systemInstruction;
    if (typeof si === 'string') body.systemInstruction = si + note;
    else if (si && Array.isArray(si.parts) && si.parts.length && typeof si.parts[0].text === 'string') si.parts[0].text += note;
    else body.systemInstruction = { parts: [{ text: note.trim() }] };
  } else if (action === 'claude') {
    body.system = (typeof body.system === 'string' ? body.system : '') + note;
  } else if (Array.isArray(body.messages)) {
    const sys = body.messages.find(function (m) { return m && m.role === 'system' && typeof m.content === 'string'; });
    if (sys) sys.content += note;
    else body.messages.unshift({ role: 'system', content: note.trim() });
  }
}

/**
 * Enforces the conversation shape Gemini requires: no empty parts, no two
 * consecutive turns with the same role, opens on `user` and closes on `user`.
 * Anything else comes back as a 400 that used to be swallowed by the silent
 * fallback, so the user just saw "Gemini doesn't work" with no reason given.
 */
function sanitizeGeminiContents(list) {
  const src = (Array.isArray(list) ? list : []).filter(
    (c) => c && Array.isArray(c.parts) && c.parts.some((p) => p && (p.text || p.inline_data || p.inlineData))
  );
  const out = [];
  for (const c of src) {
    const last = out[out.length - 1];
    if (last && last.role === c.role) { last.parts = last.parts.concat(c.parts); continue; }
    out.push({ role: c.role === 'model' ? 'model' : 'user', parts: c.parts.slice() });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

const PROVIDERS = ['openai', 'gemini', 'groq', 'claude', 'cohere', 'deepseek', 'mistral', 'openrouter', 'perplexity'];

module.exports = withErrorCapture('ai', async (req, res) => {
  installCors(req, res);
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown ai route: ' + action });
    return;
  }
  if (PROVIDERS.indexOf(action) !== -1 && req.method === 'POST') {
    try {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (b && typeof b === 'object') {
        // v262 — إصلاح خطأ 400 (assistant prefill): محادثة Claude يجب أن تنتهي
        // برسالة مستخدم — أي رسائل مساعد عالقة في النهاية تُحذف.
        if (action === 'claude' && Array.isArray(b.messages)) {
          while (b.messages.length && b.messages[b.messages.length - 1] && b.messages[b.messages.length - 1].role !== 'user') b.messages.pop();
        }
        // Same guard for Gemini — it is stricter than Claude, not looser, yet it
        // was the only provider with no sanitising at all. A request can also
        // reach here from a path that never went through the browser helper.
        if (action === 'gemini' && Array.isArray(b.contents)) {
          b.contents = sanitizeGeminiContents(b.contents);
        }
        const geoCountry = (req.headers && (req.headers['x-vercel-ip-country'] || req.headers['x-country'])) || '';
        injectNote(action, b, geoCountry); req.body = b;
      }
    } catch (e) { /* never block the request over the note */ }
  }
  return handler(req, res);
});
