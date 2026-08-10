// 💬 المحادثة بأدوات — نفس حلقة وكيل عمران، بنظام محادثة لا بناء.
//
// قبل هذا الملفّ كان القرار «هل يحتاج هذا الطلب بحثًا؟» يُتَّخذ في المتصفّح
// بأنماط نصّيّة، والنموذج يردّ بخطوة واحدة بلا يد واحدة. فكان يعتذر عمّا
// يستطيعه، أو — أسوأ — يدّعي فعلًا لم يحدث. القياس: ١ من ١٦ طلبًا يحتاج أداة.
//
// هنا النموذج نفسه يقرّر: يجيب مباشرة، أو يستدعي أداة ثم يجيب. البروتوكول
// نفسه الذي يفهمه عميل الوكيل منذ v411 — لا اختراع صيغة جديدة.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { logError } = require('./log-error.js');
const { safeParse } = require('./safe-parse.js');
const { fetchPlaces } = require('./search.js');

const TOOLS = [
  {
    name: 'web_search',
    description: 'ابحث في الإنترنت الآن. إجباري لأي سعر أو خبر أو طقس أو نتيجة مباراة أو رسوم رسمية أو أي معلومة قد تكون تغيّرت بعد تدريبك. وإجباري أيضًا لأي سؤال عن أماكن أو جهات حقيقية (عيادة، مستشفى، طبيب، مطعم، متجر، دائرة حكومية) — ابحث باسم المدينة لتعطيه أسماء وروابط حقيقية لا أمثلة.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'عبارة البحث' } }, required: ['query'] },
  },
  {
    name: 'fetch_page',
    description: 'افتح رابطًا واقرأ محتواه الحقيقي. استخدمها لأي رابط ذكره المستخدم أو ظهر في نتائج البحث.',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'رابط كامل https://...' } }, required: ['url'] },
  },
  {
    name: 'run_js',
    description: 'شغّل كود JavaScript في بيئة معزولة في متصفّح المستخدم وأعد ناتجه. استخدمها لأي حساب رقمي أو تاريخ أو منطق تريد التأكّد منه — لا تعتمد على حسابك الذهني.',
    input_schema: { type: 'object', properties: { code: { type: 'string', description: 'كود JavaScript. ما تطبعه بـconsole.log هو الناتج.' } }, required: ['code'] },
  },
  {
    name: 'generate_image',
    description: 'ارسم صورة حقيقية من وصف نصّي. استخدمها لصور المواقع التي تبنيها (طبق، واجهة مطعم، منتج، بطل الصفحة) بدل روابط عشوائية. تُعيد لك رمزًا مثل __IMG_1__ تضعه حرفيًّا في src.',
    input_schema: { type: 'object', properties: { prompt: { type: 'string', description: 'وصف الصورة بالإنجليزية، دقيق ومحدّد (نمط، إضاءة، زاوية).' } }, required: ['prompt'] },
  },
  {
    name: 'test_html',
    description: 'شغّل صفحة HTML كاملة في بيئة معزولة وأعد أخطاء التشغيل. استدعها مرّة واحدة على الصفحة النهائية قبل تسليمها.',
    input_schema: { type: 'object', properties: { html: { type: 'string', description: 'مستند HTML كامل.' } }, required: ['html'] },
  },
];

const TOOLS_NOTE = '\n\n[أدواتك الحقيقية — خمس، وهي تعمل فعلًا الآن]:\n' +
  '• web_search — أي سعر أو خبر أو طقس أو نتيجة أو رسوم رسمية أو معلومة قد تكون تغيّرت: ابحث أولًا.\n' +
  '• fetch_page — أي رابط ذكره المستخدم أو ظهر في البحث وتحتاج محتواه: افتحه واقرأه.\n' +
  '• run_js — أي حساب رقمي أو فرق تواريخ أو منطق: شغّله وخذ الناتج منه.\n' +
  '• generate_image — ترسم صورة حقيقية وتعيد رمزًا مثل __IMG_1__ تضعه حرفيًّا في src.\n' +
  '• test_html — تشغّل صفحتك النهائية وتعيد أخطاء التشغيل.\n' +
  '\n[البناء — تبني بنفسك الآن، لا تصف ولا تستأذن]:\n' +
  '(ب١) إن طلب المستخدم موقعًا أو صفحة أو تطبيقًا أو أداة: ابنِه كاملًا في هذا الردّ داخل كتلة ```html واحدة، مستندًا كاملًا يبدأ بـ<!DOCTYPE html>. ممنوع منعًا باتًا أن تقول «خلّني أصمّم لك» أو «سأعمل لك» أو تصف ما ستفعله ثم تقف — الوصف بلا بناء كذب.\n' +
  '(ب٢) ممنوع أن تسأل «هل تريد أن أبدأ؟». ابنِ أوّلًا بأفضل اجتهادك، ثم اعرض في سطر واحد ما يمكن تغييره.\n' +
  '(ب٣) الصور: استدعِ generate_image لكل صورة تحتاجها — بحدّ أقصى أربع صور في الردّ الواحد — وضع الرمز العائد حرفيًّا في src. ممنوع picsum أو placeholder أو روابط صور مخترعة؛ إن لم ترسم فاستعمل خلفية CSS أو رمزًا نصّيًّا.\n' +
  '(ب٤) عربيّ؟ dir="rtl" وخطّ عربيّ. وتصميم يعمل على الجوال والكمبيوتر معًا.\n' +
  '(ب٥) بعد اكتمال الصفحة استدعِ test_html مرّة واحدة، وأصلح أي خطأ قبل التسليم.\n' +
  '(ب٦) أي نموذج (حجز/تواصل) يجب أن يكون صادقًا: إمّا يرسل فعلًا عبر mailto أو واتساب، أو يقول للزائر بوضوح أنّ الحجز غير مفعّل بعد. ممنوع «تمّ الحجز» وهميّة.\n' +
  '\nقواعد ملزمة:\n' +
  '(١) ممنوع منعًا باتًا أن تقول «لا أستطيع الوصول للإنترنت» أو «راجع الموقع الرسمي» أو «الأسعار تتغيّر فتحقّق بنفسك» قبل أن تستدعي الأداة. أنت تصل، فاستخدمها.\n' +
  '(٢) ممنوع أن تدّعي أنك بحثتَ أو فتحتَ صفحة أو شغّلتَ كودًا إن لم تستدعِ الأداة فعلًا في هذا الردّ.\n' +
  '(٣) السؤال الذي لا يحتاج أداة (تحية، رأي، شرح مفهوم ثابت، صياغة نصّ) أجب عنه مباشرة بلا أداة ولا مقدّمات.\n' +
  '(٤) بعد الأدوات: أجب بإيجاز، ولا تلصق نتائج البحث خامًا.\n' +
  '(٥) إن فشلت أداة أو لم تعطِ ما يكفي، قل ذلك صراحةً بدل تعبئة الفراغ من ذاكرتك.' +
  '\n\n[شكل الردّ بعد البحث — إلزاميّ]:\n' +
  '(ص١) كلّ اسم مكان أو جهة أو منتج أخذتَه من البحث يجب أن يخرج رابطًا قابلًا للنقر بصيغة [الاسم](الرابط). اسم عارٍ وأنت تملك رابطه = نقص. ممنوع منعًا باتًا اختراع رابط لم يظهر في ناتج الأداة. وممنوع تكرار رابط الموقع الواحد أكثر من مرّة في الردّ: اربطه عند أوّل ذكر فقط، ولا تكتب سطرًا منفصلًا مثل «رابط تصفّح الإعلانات» لموقع ربطتَه قبل قليل.\n' +
  '(ص٢) إن كان الجواب أماكن (عيادة · مستشفى · طبيب · مطعم · متجر · جهة حكوميّة): ضع تحت كلّ مكان سطرًا مستقلًّا بهذه الصيغة حرفيًّا: [📍 افتح في الخرائط](https://www.google.com/maps/search/?api=1&query=اسم+المكان+المدينة) — المسافات تُستبدل بعلامة + والاسم يُكتب كما هو. ولا تكتب هذا السطر للفنادق والمنتجعات — لها صيغتها في (ص٢-ج).\n' +
  '(ص٢-ج) إن كان الجواب فنادق أو منتجعات أو شاليهات: لا تكتب سطر الخرائط أبدًا، بل ضع تحت كلّ فندق سطرًا مستقلًّا بهذه الصيغة حرفيًّا: [بوكينج](https://www.booking.com/searchresults.html?ss=اسم+الفندق) · [أجودا](https://www.agoda.com/search?q=اسم+الفندق) · [تريفاجو](https://www.trivago.ae/ar/srl?query=اسم+الفندق) · [تاج](https://tajj.app/) — استبدل «اسم+الفندق» في الروابط الأربعة باسم الفندق نفسه والمسافات بعلامة +، واكتب الاسم بالإنجليزيّة إن عرفتَها وإلّا كما هو.\n' +
  '(ص٢-ب) إن ذكر المستخدم طيرانًا أو تذكرة أو رحلة أو حجز سفر أو مطارًا — سواء بحثتَ أم لا — أضف سطرًا مستقلًّا بهذه الصيغة حرفيًّا: [✈️ ابحث عن رحلات](https://www.google.com/travel/flights?hl=ar&gl=ae&curr=AED&q=flights+from+المغادرة+to+الوجهة+on+YYYY-MM-DD) مستبدلًا المدينتين والتاريخ بما قاله المستخدم فعلًا والمسافات بعلامة +. وإن لم يذكر مدينة أو تاريخًا فاحذف معامل q كاملًا واكتب الرابط المجرّد https://www.google.com/travel/flights?hl=ar&gl=ae&curr=AED — ممنوع اختراع مدينة أو تاريخ لم يقله.\n' +
  '(ص٣) ممنوع أن تختم بقائمة مصادر أو بسطر «المصادر:» — واجهة التطبيق تعرض المصادر تلقائيًّا أسفل ردّك كبطاقات قابلة للنقر، فكتابتها نصًّا تكرار وحشو.\n' +
  '(ص٤) بعد المعلومة أعطِ خطوة تنفيذيّة واحدة يقدر عليها اليوم. وإن كانت كلامًا يقوله لجهة أو لطبيب أو لموظّف، اكتب له الجملة جاهزة بين علامتَي اقتباس ليقولها كما هي.\n' +
  '(ص٥) رقم بلا مصدر ممنوع. وإن لم يجد البحث المعلومة، قل ذلك صراحةً ولا تملأ الفراغ.\n' +
  '(ص٦) اسأل سؤالًا واحدًا في المرّة لا قائمة أسئلة. وتابع ما قاله المستخدم قبل قليل — ممنوع أن تعيد سؤاله عن شيء ذكره في هذه المحادثة.';

// 🛠️ v528 — اليدان للجميع: نفس الحلقة ونفس الأدوات الخمس، ولا يتغيّر إلّا اسم
// النموذج. البروتوكول (أحداث البثّ · tool_use · stop_reason) مُتحقَّق حيًّا على كلّ
// نموذج أدناه في ٩ أغسطس ٢٠٢٦. cohere وperplexity غائبان عمدًا: لا يدعمان
// الأدوات على هذا الطريق، فيبقيان على مسارهما القديم بلا كذب.
const OR_MODELS = {
  claude: 'anthropic/claude-opus-5',
  openai: 'openai/gpt-5.6-terra',
  gemini: 'google/gemini-3.5-flash',
  deepseek: 'deepseek/deepseek-v3.2',
  mistral: 'mistralai/mistral-medium-3-5',
  groq: 'meta-llama/llama-4-maverick',
};

function nowNote() {
  const opts = { timeZone: 'Asia/Dubai', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
  let ar = '';
  try { ar = new Intl.DateTimeFormat('ar-AE', opts).format(new Date()); } catch (e) { /* Intl غائب — يبقى فارغًا */ }
  return ar ? ('\n[التاريخ الحقيقي الآن — توقيت الإمارات]: ' + ar + '. تجاهل أي تاريخ من بيانات تدريبك.') : '';
}

function countryNote(code) {
  const c = (typeof code === 'string' ? code.trim().toUpperCase() : '');
  if (!/^[A-Z]{2}$/.test(c)) return '\n[الدولة]: افترض أن المستخدم في الإمارات ما لم يذكر غير ذلك.';
  let ar = '';
  try { ar = new Intl.DisplayNames(['ar'], { type: 'region' }).of(c) || ''; } catch (e) { /* رمز لا يعرفه Intl */ }
  return '\n[الدولة]: المستخدم يتصفّح من ' + (ar || c) + ' — أجب بمعلومات هذه الدولة (عملتها، جهاتها الرسمية) ما لم يذكر غيرها.';
}

async function tavilySearch(query) {
  const places = await fetchPlaces(process.env.GOOGLE_PLACES_API_KEY, query, 'ar');
  if (places.length) {
    return places.map((p, i) => [
      `${i + 1}. ${p.name}`,
      p.rating != null ? `التقييم: ${p.rating}/5 من ${p.reviews} مراجعة` : '',
      p.address ? `العنوان: ${p.address}` : '',
      p.site ? `الموقع: ${p.site}` : '',
      p.url ? `الرابط: ${p.url}` : '',
      'المصدر: Google Maps',
    ].filter(Boolean).join('\n')).join('\n\n');
  }

  const key = process.env.TAVILY_API_KEY;
  if (!key) return 'أداة البحث غير متاحة حاليًا — قل للمستخدم إنك لم تتمكّن من البحث.';
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: 6, search_depth: 'basic', include_answer: true }),
    });
    const d = await r.json();
    const items = (d.results || []).map((x, i) => `${i + 1}. ${x.title}\n${x.url}\n${(x.content || '').slice(0, 300)}`);
    return items.length ? items.join('\n\n') : 'لا توجد نتائج.';
  } catch (e) { return 'فشل البحث: ' + e.message; }
}

async function fetchPage(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return 'رابط غير صالح.';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmranChat/1.0)' } });
    clearTimeout(t);
    if (!r.ok) return 'فشل فتح الصفحة: HTTP ' + r.status;
    const text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 6000) : 'الصفحة فارغة أو محتواها غير قابل للقراءة.';
  } catch (e) { return 'فشل فتح الصفحة: ' + e.message; }
}

// الأثر المرئي — سطر واحد صادق لكل أداة، مشتقّ من المُدخل والناتج الحقيقيّين.
function trailLine(name, input, result) {
  const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const r = String(result == null ? '' : result);
  if (name === 'web_search') {
    const n = (r.match(/(?:^|\n)\s*\d+\.\s/g) || []).length;
    return 'بحثتُ عن «' + (s(input.query, 50) || '؟') + '» — ' + (n ? ('حصلتُ ' + n + ' نتيجة') : ('حصلتُ ' + r.length + ' حرفًا'));
  }
  if (name === 'fetch_page') {
    let h = s(input.url, 60);
    try { h = new URL(String(input.url)).hostname || h; } catch (e) { /* رابط مشوّه → نعرض ما أُرسل */ }
    return 'قرأتُ ' + h + ' — ' + (/^فشل/.test(r) ? r.slice(0, 60) : ('حصلتُ ' + r.length + ' حرفًا'));
  }
  if (name === 'run_js') {
    const bad = r.match(/أخطاء:\n([\s\S]*)$/) || r.split('\n').filter((l) => /^\s*✗/.test(l))[0];
    return 'شغّلتُ كودًا — ' + (bad ? 'ظهر خطأ' : ('عاد ناتج ' + r.length + ' حرفًا'));
  }
  if (name === 'generate_image') return /__IMG_/.test(r) ? 'رسمتُ صورة ✅' : ('تعذّرت الصورة — ' + s(r, 60));
  if (name === 'test_html') return /^✅/.test(r) ? 'جرّبتُ الصفحة — بلا أخطاء ✅' : 'جرّبتُ الصفحة — ظهرت أخطاء';
  return 'استخدمتُ ' + name;
}

// التنفيذ في متصفّح المستخدم لا هنا: نفس ملتقى Redis الذي يستعمله الوكيل،
// لأنّ دوال Vercel بلا حالة وردّ المتصفّح قد يصل نسخة أخرى من الدالّة.
async function runInClient(send, name, input, waitMs) {
  const { kvGetJSON, kvDel, kvPutJSON, kvExpire } = require('./kv.js');
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const key = 'agent/tool/' + id;
  try {
    await kvPutJSON('agent/wait/' + id, { at: Date.now() });
    await kvExpire('agent/wait/' + id, 120);
  } catch (e) { console.warn('[chat] claim failed', e && e.message); }
  send({ clientTool: { id, name, input } });
  const deadline = Date.now() + (Number(waitMs) || 20000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    let rec = null;
    try { rec = await kvGetJSON(key); } catch (e) { /* شبكة متعثّرة — نعيد المحاولة */ }
    if (rec && typeof rec.output === 'string') {
      try { await kvDel(key); } catch (e) { /* TTL يتكفّل */ }
      return rec.output.slice(0, 4000);
    }
  }
  return 'لم يستجب متصفح المستخدم — لم يُنفَّذ الكود. قل إنك لم تتحقّق بدل أن تدّعي نتيجة.';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // كلود عبر OpenRouter: البروتوكول مطابق حرفيًّا (تحقّق حيّ ٩ أغسطس ٢٠٢٦) — نفس
  // أحداث البثّ ونفس ترويسة x-api-key، فلا يتغيّر شيء تحت هذه السطور.
  const viaOR = !!process.env.OPENROUTER_API_KEY;
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY' }); return; }
  const CHAT_URL = viaOR ? 'https://openrouter.ai/api/v1/messages' : 'https://api.anthropic.com/v1/messages';
  // النموذج يُحسم بعد قراءة الجسم — المزوّد يأتي منه.

  let body = req.body;
  if (!body || typeof body === 'string') body = safeParse(body, {}, 'chat:body');
  const { messages, token, guestId } = body;
  if (!Array.isArray(messages) || !messages.length) { res.status(400).json({ error: 'Missing messages' }); return; }

  const reqProv = String((body && body.provider) || '').toLowerCase();
  const prov = Object.prototype.hasOwnProperty.call(OR_MODELS, reqProv) ? reqProv : 'claude';
  const CHAT_MODEL = viaOR ? OR_MODELS[prov] : 'claude-sonnet-5';

  const usage = await checkAndConsume(token, guestId, prov, clientIp(req));
  if (!usage.allowed) {
    if (usage.reason === 'auth') res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
    else res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' رسالة). انتظر الغد أو اشترك.' });
    return;
  }

  // رسائل النظام تأتي من العميل داخل messages — تُفصَل كما يفعل مسار Claude.
  const sysParts = messages.filter((m) => m && m.role === 'system' && typeof m.content === 'string').map((m) => m.content);
  if (typeof body.system === 'string' && body.system.trim()) sysParts.push(body.system);
  const country = (req.headers && (req.headers['x-vercel-ip-country'] || req.headers['x-country'])) || '';
  const system = sysParts.join('\n\n') + nowNote() + countryNote(country) + TOOLS_NOTE
    + require('./_knowledge.js').ownerKnowledge(req, token); // معرفة عمران — للمالك وحده

  const convo = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 30000) : m.content }));
  while (convo.length && convo[convo.length - 1].role !== 'user') convo.pop();
  if (!convo.length) { res.status(400).json({ error: 'Missing user message' }); return; }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { /* العميل أغلق المجرى */ } };

  try {
    // ثمان خطوات لا خمس وعشرين: المحادثة ليست بناءً طويلًا، وكلّ خطوة استدعاء
    // كامل بسياق متراكم. السقفان معًا — خطوات ووقت — يمنعان فاتورة مفتوحة.
    const MAX_STEPS = Math.max(1, Math.min(16, Number(process.env.CHAT_MAX_STEPS) || 12));
    const MAX_MS = Math.max(20000, Number(process.env.CHAT_MAX_MS) || 240000);
    const t0 = Date.now();
    let steps = 0;
    let anyText = false;

    while (steps < MAX_STEPS) {
      if (Date.now() - t0 > MAX_MS) { send({ status: '⏱️ انتهت مهلة الردّ.' }); break; }
      steps++;

      const upstream = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: CHAT_MODEL, max_tokens: 16000, system, messages: convo, tools: TOOLS, stream: true }),
      });

      if (!upstream.ok) {
        const errText = (await upstream.text()).slice(0, 300);
        // لم يُكتب حرف بعد → أَبلِغ العميل ليهبط إلى مساره القديم بلا تكرار.
        send({ error: 'chat upstream ' + upstream.status + ': ' + errText, fallback: !anyText });
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let stopReason = null;
      const blocks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev;
          try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
          if (ev.type === 'content_block_start') {
            const cb = ev.content_block || {};
            blocks[ev.index] = { type: cb.type, text: '', name: cb.name, id: cb.id, inputJson: '' };
            if (cb.type === 'tool_use' && cb.name === 'web_search') send({ status: '🔍 يبحث في الإنترنت…' });
            else if (cb.type === 'tool_use' && cb.name === 'fetch_page') send({ status: '🌐 يقرأ صفحة…' });
            else if (cb.type === 'tool_use' && cb.name === 'run_js') send({ status: '⚙️ يشغّل كودًا للتحقّق…' });
            else if (cb.type === 'tool_use' && cb.name === 'generate_image') send({ status: '🎨 يرسم صورة…' });
            else if (cb.type === 'tool_use' && cb.name === 'test_html') send({ status: '🧪 يجرّب الصفحة…' });
          } else if (ev.type === 'content_block_delta') {
            const cb = blocks[ev.index];
            if (!cb) continue;
            if (ev.delta && ev.delta.type === 'text_delta') { cb.text += ev.delta.text; anyText = true; send({ delta: ev.delta.text }); }
            else if (ev.delta && ev.delta.type === 'input_json_delta') cb.inputJson += ev.delta.partial_json;
          } else if (ev.type === 'message_delta') {
            if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
          }
        }
      }

      if (stopReason !== 'tool_use') { send({ done: true }); res.end(); return; }

      const assistantContent = blocks.filter(Boolean).map((cb) => {
        if (cb.type === 'tool_use') {
          let input = {};
          try { input = JSON.parse(cb.inputJson || '{}'); } catch (e) { logError('chat/tool-input-parse', e); }
          return { type: 'tool_use', id: cb.id, name: cb.name, input };
        }
        return { type: 'text', text: cb.text || ' ' };
      }).filter((c) => c.type === 'tool_use' || (c.text && c.text.trim()));
      convo.push({ role: 'assistant', content: assistantContent });

      const toolResults = [];
      for (const cb of blocks.filter(Boolean)) {
        if (cb.type !== 'tool_use') continue;
        let input = {};
        try { input = JSON.parse(cb.inputJson || '{}'); } catch (e) { logError('chat/tool-input-parse', e); }
        let result = 'أداة غير معروفة';
        if (cb.name === 'web_search') result = await tavilySearch(input.query || '');
        else if (cb.name === 'fetch_page') result = await fetchPage(input.url || '');
        else if (cb.name === 'run_js') result = await runInClient(send, 'run_js', input);
        else if (cb.name === 'generate_image') result = await runInClient(send, 'generate_image', input, 75000);
        else if (cb.name === 'test_html') result = await runInClient(send, 'test_html', input, 30000);
        toolResults.push({ type: 'tool_result', tool_use_id: cb.id, content: String(result).slice(0, 8000) });
        send({ status: '↳ ' + trailLine(cb.name, input, result) });
      }
      convo.push({ role: 'user', content: toolResults });
    }

    send({ done: true });
    res.end();
  } catch (e) {
    send({ error: 'chat error: ' + String((e && e.message) || e).slice(0, 200) });
    try { res.end(); } catch (e2) { /* المجرى مُغلق أصلًا */ }
  }
};
