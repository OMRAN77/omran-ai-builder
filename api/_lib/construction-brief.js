'use strict';
/* api/_lib/construction-brief.js — v-cx-brief (طلب المالك: «في المقاولات كثر الاختيارات… الي يدخل
   يضيع فيه»): نموذج المقاولات فيه ٧٧ خيارًا في أربعة أقسام قبل أن يضغط المستخدم زرًّا واحدًا.
   هذه الطبقة الأولى: سطر واحد بلغة الناس («فيلا دورين ٤٠٠ متر مودرن بمسبح ومجلس في دبي») يُقرأ هنا
   ويُترجم إلى حقول النموذج نفسها، فيعبّئها العميل ويضغط «ولّد» بدل أن يملأها بيده.

   لا يولّد شيئًا ولا يخصم نقطة: قراءة نصّ فقط. نفس نمط media-intent.js — Gemini Flash بحرارة صفر
   وجواب JSON قصير ومهلة ثوانٍ وحدّ يوميّ على الحساب. التعذّر = { fields: null } فيكمل المستخدم
   بالنموذج كما كان (لا شيء ينكسر، والنموذج القديم باقٍ كما هو تحت «تفاصيل أكثر»).

   حارس الصحّة: لا نثق بما يرجعه الموديل — كلّ قيمة تُطابَق على قوائم المفاتيح المسموحة أدناه،
   وهي مطابقة حرفيًّا لخرائط construction-create.js (يثبّتها اختبار `cx-brief`)، والمجهول يُسقَط. */
const { extractJsonObject } = require('./image-edit-guard');
const { clientIp } = require('./_usage.js');
const { checkAndConsumePlanCustom } = require('./_planCap.js'); // v-plan-caps: المشترك بنسبة سقف باقته

const DAILY_LIMIT = 120;
const MAX_TEXT = 240;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

/* المفاتيح المسموحة — نسخة طبق الأصل من construction-create.js (اختبار التطابق يمنع الانحراف) */
const TYPES = ['villa', 'apartment', 'office', 'warehouse', 'mosque', 'shop', 'rest', 'farm', 'annexhome', 'mall', 'school', 'hall'];
const STYLES = ['modern', 'classic', 'gulf', 'luxury', 'industrial', 'andalusi', 'islamic', 'mediterranean', 'najdi', 'neoclassic'];
const ANNEXES = ['majlis', 'servant', 'pool', 'carport', 'garden', 'laundry', 'elevator', 'storage', 'tank', 'solar', 'playground', 'carport2'];
const BUDGETS = ['b1', 'b2', 'b3', 'b4'];
const EMIRATES = ['dubai', 'abudhabi', 'sharjah', 'ajman', 'ummalquwain', 'rasalkhaimah', 'fujairah'];

const MAX_FLOORS = 20;
const MAX_AREA = 100000;

function buildBriefPrompt(text) {
  return [
    'You turn ONE sentence describing a building project into form fields. Arabic Gulf dialect is the common case; English also appears.',
    'Reply with JSON only, no prose:',
    '{"buildingType":<key|null>,"floors":<int|null>,"area":<int m2|null>,"plotArea":<int m2|null>,"style":<key|null>,"budget":<key|null>,"emirate":<key|null>,"annexes":[<key>...],"notes":<string|null>}',
    'buildingType one of: ' + TYPES.join(', ') + '. (villa=فيلا, apartment=عمارة, rest=استراحة, farm=مزرعة, annexhome=ملحق, office=مكاتب, shop=محل, mall=مجمع تجاري, warehouse=مستودع, mosque=مسجد, school=مدرسة, hall=صالة أفراح)',
    'style one of: ' + STYLES.join(', ') + '. (modern=مودرن/عصري, classic=كلاسيك, gulf=خليجي/تراثي, luxury=فخم, industrial=صناعي, andalusi=أندلسي, islamic=إسلامي, mediterranean=متوسطي, najdi=نجدي, neoclassic=نيوكلاسيك)',
    'annexes any of: ' + ANNEXES.join(', ') + '. (majlis=مجلس, servant=غرفة خادمة/سائق, pool=مسبح, carport=مواقف مغطاة, garden=حديقة/برجولة, laundry=غسيل/تخزين, elevator=مصعد, storage=مخزن خارجي, tank=خزان مياه, solar=طاقة شمسية, playground=ملعب, carport2=مظلة إضافية)',
    'budget one of: b1 (حتى 300 ألف), b2 (300-600 ألف), b3 (600 ألف-1 مليون), b4 (أكثر من مليون). Map a stated amount in AED to its range; otherwise null.',
    'emirate one of: ' + EMIRATES.join(', ') + '. Only when a UAE emirate is named; otherwise null.',
    'floors: عدد الأدوار — "دورين"/"طابقين"=2, "أرضي"/"دور واحد"=1, "ثلاثة أدوار"=3. area: built-up m2. plotArea: land/plot m2 only when clearly the land ("الأرض", "plot").',
    'notes: anything the fields above cannot hold (materials, facade wishes, room counts), in the user\'s own language, max 120 chars. Otherwise null.',
    'Use null for anything not stated. NEVER invent a value. Return [] when no annex is mentioned.',
    'Sentence: "' + String(text || '').replace(/["\n]+/g, ' ').slice(0, MAX_TEXT) + '"',
  ].join('\n');
}

function intIn(v, max) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
}
function pick(v, list) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return list.includes(s) ? s : null;
}

/** يقرأ جواب الموديل بحزم: المجهول يُسقَط، ولا شيء يمرّ إلى النموذج بلا مطابقة. */
function parseBriefReply(raw) {
  const obj = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  const annexes = Array.isArray(obj.annexes)
    ? obj.annexes.map((a) => pick(a, ANNEXES)).filter(Boolean).filter((a, i, all) => all.indexOf(a) === i)
    : [];
  const out = {
    buildingType: pick(obj.buildingType, TYPES),
    floors: intIn(obj.floors, MAX_FLOORS),
    area: intIn(obj.area, MAX_AREA),
    plotArea: intIn(obj.plotArea, MAX_AREA),
    style: pick(obj.style, STYLES),
    budget: pick(obj.budget, BUDGETS),
    emirate: pick(obj.emirate, EMIRATES),
    annexes,
    notes: (typeof obj.notes === 'string' && obj.notes.trim()) ? obj.notes.trim().slice(0, 120) : null,
  };
  // جواب لم يُفهم منه شيء = لا فائدة: نتركه للنموذج بدل تعبئة عشوائيّة.
  const any = out.buildingType || out.floors || out.area || out.plotArea || out.style
    || out.budget || out.emirate || out.annexes.length || out.notes;
  return any ? out : null;
}

async function readBriefLLM(opts) {
  const o = opts || {};
  if (!o.apiKey || !String(o.text || '').trim()) return null;
  const fetchImpl = o.fetchImpl || fetch;
  try {
    const r = await fetchImpl(ENDPOINT + o.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(o.timeoutMs || 6000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildBriefPrompt(o.text) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const d = await r.json().catch(() => null);
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' '));
    return parseBriefReply(txt);
  } catch (e) {
    console.error('[cx-brief] read failed: ' + (e && e.message));
    return null;
  }
}

/* المعالج: POST { text, token } → { fields } أو { fields: null, reason }. لا خصم ولا توليد. */
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const text = String((body && body.text) || '').slice(0, MAX_TEXT);
  if (!text.trim()) { res.status(400).json({ error: 'text required' }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(200).json({ fields: null, reason: 'unavailable' }); return; }
  // حساب مطلوب: قارئ نصّ مجّانيّ مفتوح للضيوف بابُ إساءة، والتوليد نفسه يطلب حسابًا أصلًا.
  let gate = null;
  try {
    gate = await checkAndConsumePlanCustom(body.token, null, clientIp(req), 'cx-brief', DAILY_LIMIT);
  } catch (e) { gate = null; /* عطب العدّاد لا يفتح الباب ولا يغلقه: يُحسم أدناه */ }
  if (gate && !gate.allowed) { res.status(200).json({ fields: null, reason: gate.reason === 'limit' ? 'limit' : 'auth' }); return; }
  if (!gate || !gate.username) { res.status(200).json({ fields: null, reason: 'auth' }); return; }
  const fields = await readBriefLLM({ apiKey, text });
  if (!fields) { res.status(200).json({ fields: null, reason: 'unclear' }); return; }
  res.status(200).json({ fields });
}

module.exports = handler;
module.exports.TYPES = TYPES;
module.exports.STYLES = STYLES;
module.exports.ANNEXES = ANNEXES;
module.exports.BUDGETS = BUDGETS;
module.exports.EMIRATES = EMIRATES;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
module.exports.MAX_TEXT = MAX_TEXT;
module.exports.buildBriefPrompt = buildBriefPrompt;
module.exports.parseBriefReply = parseBriefReply;
module.exports.readBriefLLM = readBriefLLM;
