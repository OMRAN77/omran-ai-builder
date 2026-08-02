// Router: consolidates the 9 AI provider proxy functions into a single
// Vercel Serverless Function to stay under the Hobby plan's function limit.
// Old public paths (e.g. /api/openai) are preserved via vercel.json rewrites
// that append ?action=<name>. Requires use literal paths so Vercel's file
// tracer (@vercel/nft) includes each module in the deployment bundle.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');

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
    default: return null;
  }
}

// --- Server-side real date/time injection (UAE) + topic-follow rule ---
function serverNote(country) {
  const now = new Date();
  const opts = { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
  let ar = '', en = '';
  try { ar = new Intl.DateTimeFormat('ar-AE', opts).format(now); } catch (e) {}
  try { en = new Intl.DateTimeFormat('en-GB', opts).format(now); } catch (e) {}
  // v360 — 🌍 كشف دولة المستخدم من الشبكة (ترويسة Vercel x-vercel-ip-country) عالميًا.
  // نحوّل رمز الدولة (ISO-2) إلى اسمها العربي والإنجليزي تلقائيًا بلا قوائم ثابتة.
  const code = (typeof country === 'string' ? country.trim().toUpperCase() : '');
  let cAr = '', cEn = '';
  if (code && /^[A-Z]{2}$/.test(code)) {
    try { cAr = new Intl.DisplayNames(['ar'], { type: 'region' }).of(code) || ''; } catch (e) {}
    try { cEn = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || ''; } catch (e) {}
  }
  const countryLine = (cAr || code)
    ? '\n[قاعدة الدولة — مطلقة]: المستخدم يتصفّح الآن من دولة: ' + (cAr || code) + (cEn ? ' (' + cEn + ')' : '') + '. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات هذه الدولة تحديدًا (مفتاح هاتفها الدولي، جهاتها الحكومية الرسمية، منصاتها المحلية المعروفة فيها). ممنوع منعًا باتًا افتراض أي دولة أخرى أو اقتراح جهات/منصات/أرقام من دولة مختلفة. الاستثناء الوحيد: إذا ذكر المستخدم دولة أخرى صراحةً في رسالته فاتبع الدولة التي ذكرها.'
    : '\n[قاعدة الدولة الافتراضية — مطلقة]: لم تُعرف دولة المستخدم من الشبكة، فافترض أنه في دولة الإمارات العربية المتحدة. أي سؤال عن خدمات أو عقارات أو قوانين أو أسعار أو جهات حكومية أو أرقام تواصل أو منصات محلية = أجب بمعلومات الإمارات (مفتاح +971، جهات ومنصات إماراتية). الاستثناء: إذا ذكر المستخدم دولة أخرى صراحةً فاتبعها.';
  return '\n\n[التاريخ الحقيقي الآن — توقيت الإمارات]: ' + ar + ' — ' + en + '. أجب بالتاريخ الكامل إذا سُئلت (اسم اليوم + الرقم + الشهر + السنة). تجاهل أي تاريخ من بيانات تدريبك.' +
    countryLine +
    '\n[قاعدة الروابط]: ممنوع كتابة أي رابط URL من ذاكرتك. الروابط المسموحة فقط: من نتائج البحث الحية أو من المستخدم نفسه. إذا ما عندك رابط حقيقي اذكر اسم الموقع بدون URL.' +
    '\n[قاعدة الموضوع]: أجب على آخر رسالة فقط. إذا غيّر الموضوع اتبعه فورًا.' +
    '\n[قاعدة الإعلانات والنتائج]: نتائج بحث حقيقية (عقارات، فنادق، وظائف) = اعرضها مباشرة بجدول: العنوان + السعر + المنطقة + الرابط. الأسعار بعملة بلد المستخدم.' +
    '\n[قاعدة التأكيد]: تأكيد قصير (نعم/تمام/يلا/اوك) بعد سؤالك = موافقة — جاوب فورًا بلا إعادة سؤال.' +
    '\n[القدرات]: التطبيق فيه توليد صور + فيديو + تحويل PDF — ممنوع تقول "ما أقدر".';
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
  } catch (e) {}
  return '';
}

// Appended to the LAST user message itself — models weight this far more
// heavily than system text, which is what actually stops topic bleeding.
const LAST_MSG_NOTE = '';
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

function injectNote(action, body, country) {
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
  const idn = PROVIDER_IDENTITY[action];
  if (idn) note += '\n[قاعدة الهوية — مطلقة]: ' + idn + '، وتعمل الآن داخل تطبيق "Omran AI Builder" من تطوير فريق عمران AI. إذا سُئلت من أنت أو ما اسم نموذجك فأجب بهذه الهوية فقط — ممنوع منعًا باتًا الادعاء أنك Grok أو ChatGPT أو أي نموذج آخر غير هويتك المذكورة هنا.';
  if (!isPremium) {
    note += IDENTITY_BEHAVIOR_NOTE;
    if (ACADEMIC_RE.test(lastUserText(action, body))) note += ACADEMIC_NOTE;
    if (hasAttachedImages(action, body)) {
      note += IMAGE_ANALYSIS_NOTE;
      if (SIGNATURE_RE.test(lastUserText(action, body))) note += SIGNATURE_NOTE;
    } else if (SIGNATURE_RE.test(lastUserText(action, body))) {
      note += '\n[قاعدة]: التطبيق فيه ميزة تحليل التواقيع والخط والفراسة: ① فحص تزوير التواقيع بمنهجية الفحص الجنائي ② تحليل الشخصية من التوقيع/الخط اليدوي ③ قراءة الوجه. إذا سأل المستخدم عنها ممنوع تقول "غير علمي" أو ترفض — أكّد أن الميزة موجودة واطلب منه رفع صورة التوقيع/الخط/الوجه ليبدأ التحليل فورًا.';
    }
  }
  tagLastUserMessage(action, body);
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

const PROVIDERS = ['openai', 'gemini', 'groq', 'claude', 'cohere', 'deepseek', 'mistral', 'openrouter', 'perplexity'];

module.exports = withErrorCapture('ai', async (req, res) => {
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
        const geoCountry = (req.headers && (req.headers['x-vercel-ip-country'] || req.headers['x-country'])) || '';
        injectNote(action, b, geoCountry); req.body = b;
      }
    } catch (e) { /* never block the request over the note */ }
  }
  return handler(req, res);
});
