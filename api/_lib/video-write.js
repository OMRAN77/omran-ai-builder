'use strict';
/* api/_lib/video-write.js — v-video-write: «مساعد الكتابة» داخل صانع الفيديو (طلب المالك: يكتب القصّة والحوار
   والإعلان بلا مغادرة الصانع، ومضبوطًا على مدّة الفيديو). كتابة نصّ فقط: لا توليد ولا خصم نقطة.
   السلسلة الرخيصة نفسها (Gemini ← Groq ← Mistral ← OpenRouter) عبر completeFreeChain؛ وحدّ يوميّ على الحساب.
   حارس الصحّة: لا نثق بطول ما يرجعه الموديل — الكلام يُقصّ هنا على ميزانيّة الكلمات التي تتّسع لها المدّة. */
const { extractJsonObject } = require('./image-edit-guard');
const { clientIp } = require('./_usage.js');
const { checkAndConsumePlanCustom } = require('./_planCap.js');

const DAILY_LIMIT = 60;
const MAX_REQ = 400;
const MAX_CHARS = 4;
const WORDS_PER_SEC = 2.3; // سرعة كلام عربيّ مريحة

/* مدّة الواجهة ← ثواني. «long20» مشهدان، «film» فيلم، «adspot» ٥ث، «reels» ١٠ث. غير المعروف = ٨. */
const SECONDS = { '5': 5, '8': 8, '10': 10, long20: 20, film: 45, adspot: 5, reels: 10 };
function secondsOf(v) { const s = SECONDS[String(v == null ? '' : v)]; return s || 8; }
function speechBudget(sec) { return Math.max(4, Math.floor(sec * WORDS_PER_SEC)); }
function sceneCount(sec) { return sec <= 6 ? 1 : sec <= 12 ? 2 : sec <= 24 ? 3 : 5; }
const KINDS = ['story', 'ad', 'dialogue', 'scene'];

/* v-emirati (المالك ١٧ أكتوبر بعد فيديوَي الموقع: «الي اريده بي اللغه الامارتيه»): الراوي خرج خليطًا — «محتاج… أكتب
   (بدل تكتب)… وسهولة!» و«وهو بيطير… زي النهار» (مصريّ/شاميّ). بالعربيّ: قواعد إماراتيّة صريحة مع مثال، وفاحص كلمات
   دخيلة واضحة (لا تُقال في الإمارات) — الجواب الذي فيه منها يُرفض فتنتقل السلسلة للمزوّد التالي؛ وإن لم يسلم أحد
   يرجع أوّل جواب مقروء (أفضل من «تعذّرت الكتابة»). */
const EMIRATI_RULES = [
  'ARABIC: write like an Emirati content creator talking to a friend — natural UAE dialect (Dubai/Abu Dhabi), clear and simple.',
  'MEANING FIRST: every sentence must be something an Emirati would really say and must make sense on its own. Never stuff dialect words where they do not fit; never invent phrases. Simple and clear beats "more dialect".',
  'Natural Emirati choices, only where they fit: شو، وايد، الحين، تبا/تبي، مب، هني، زين، يالله، ترا، جي.',
  'NEVER use (not Emirati): عايز، عاوز، كده، كدا، دلوقتي، إزاي، ليه، مش، هيك، كتير، بدّي، شلون، زي، اوي. Present tense without the Egyptian/Levantine بـ (say «وهو يطير» not «وهو بيطير»); «مرة» never means "very" (say وايد).',
  'Talk TO the viewer in second person (تكتب، تختار، تضغط) — not «أكتب» when you mean "you write". "onScreen" must be a clear short phrase that makes sense alone.',
  'These examples show the TONE only — never copy or reuse their words; write fresh lines about the request. Examples — ad: «تبا فيديو بسرعة؟ تكتب الوصف، تختار المدة، وتضغط إنشاء… وفي دقايق فيديوك جاهز!» (onScreen «فيديوك جاهز في دقايق») · story: «وقت الغروب… الصقر يحوم فوق الرمل، والسما كلها ذهب.» · story: «بو راشد فتح فرعه الثاني اليوم… والقهوة نفس الطعم اللي تحبونه.»',
].join('\n');
const AR_RE = /[\u0600-\u06FF]/;
function isArabic(s) { return AR_RE.test(String(s || '')); }
const NON_EMIRATI = ['عايز', 'عايزة', 'عاوز', 'عاوزة', 'كده', 'كدا', 'دلوقتي', 'إزاي', 'ازاي', 'ليه', 'مش', 'هيك', 'كتير', 'كتيرة', 'بدّي', 'بدي', 'شلون', 'زي', 'اوي', 'أوي', 'خالص', 'بيطير', 'بيكتب', 'بيعمل', 'بنعمل', 'هنعمل', 'حنعمل', 'عشان كده'];
const NEG_SH_RE = /(?:^|[\s،,.!؟?])ما\s+\S*[^\sي]ش(?=$|[\s،,.!؟?…])/; /* «ما يمنعش/ما تقدرش» مصريّ/شاميّ — «ما يعيش» إماراتيّ */
const NON_EMIRATI_RE = new RegExp('(?:^|[\\s،,.!؟?:؛"\'«»()\\-…])و?(?:' + NON_EMIRATI.join('|') + ')(?=$|[\\s،,.!؟?:؛"\'«»()\\-…])');
/** كلمة دخيلة واضحة في الكلام المنطوق (الراوي والأسطر والعنوان) — المشهد وصف للمولّد فلا يُفحص */
function nonEmirati(r) {
  if (!r) return false;
  const spoken = [r.narration, r.onScreen].concat((r.lines || []).map((l) => l && l.text)).filter(Boolean).join(' ');
  return NON_EMIRATI_RE.test(spoken) || NEG_SH_RE.test(spoken);
}

/* v-trend-scenes: ترند المشاهد (قصّة بيكسار) يطلب `scenes` = عدد خاناته — وصف مستقلّ لكلّ مشهد يملأ خانته،
   لا وصفًا واحدًا يذهب لخانة الاسم. بلا scenes: الأمر كما كان حرفيًّا. */
const MAX_SCENES = 5;
function buildPrompt(o) {
  const sec = o.seconds, words = speechBudget(sec), many = Math.max(0, Math.min(MAX_SCENES, parseInt(o.scenes, 10) || 0)), scenes = many || sceneCount(sec);
  const names = (o.characters || []).slice(0, MAX_CHARS);
  return [
    'You are a video scriptwriter for short social videos in the UAE. Write in the user\'s language; Arabic means natural Emirati/Gulf dialect, never stiff formal Arabic.',
    isArabic(o.request) ? EMIRATI_RULES : '',
    'The video lasts EXACTLY ' + sec + ' seconds, so ALL spoken words together must be at most ' + words + ' words. Be tight: a hook in the first second, one idea, a clear ending' + (o.kind === 'ad' ? ' with a short call to action' : '') + '.',
    many
      ? 'Plan ' + many + ' consecutive scene(s) of ONE story with the same characters (if the request itself asks for a different number of scenes, use that number, at most ' + MAX_SCENES + '). "scenes" is an array with one visual description per scene for a video generator (setting, action, camera, light), each at most 35 words, no dialogue inside; "scene" is a one-sentence summary of the whole story.'
      : 'Plan ' + scenes + ' scene(s). "scene" is a visual description for a video generator (setting, action, camera, light) in at most ' + (scenes * 35) + ' words, no dialogue inside it.',
    names.length ? 'Characters (use these exact names for "who"): ' + names.join(', ') + '.' : 'No named characters: put any speech in "narration".',
    'Kind: ' + o.kind + (o.kind === 'dialogue' ? ' — a short exchange between the characters' : o.kind === 'story' ? ' — a tiny story with a beginning and an end' : o.kind === 'ad' ? ' — a persuasive ad' : ' — a visual scene') + '.',
    'Reply with JSON only, no prose: {"scene":"...",' + (many ? '"scenes":["...", ...],' : '') + '"narration":"..." or "","lines":[{"who":"name","text":"..."}],"onScreen":"short title/price/phrase, max 6 words" or ""}',
    'Request: "' + String(o.request || '').replace(/["\n]+/g, ' ').slice(0, MAX_REQ) + '"',
  ].filter(Boolean).join('\n');
}

function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function wordsOf(s) { return String(s || '').split(/\s+/).filter(Boolean); }

/** يقرأ الجواب بحزم ويقصّ الكلام على ميزانيّة الكلمات (الراوي والأسطر معًا). null إن لم يُفهم شيء. */
function parseReply(raw, sec, characters) {
  const obj = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!obj || typeof obj !== 'object') return null;
  let budget = speechBudget(sec || 8);
  const allowed = (characters || []).map(String);
  const trimTo = (t) => { const w = wordsOf(t); if (!budget) return ''; const take = w.slice(0, budget); budget -= take.length; return take.join(' '); };
  const lines = [];
  (Array.isArray(obj.lines) ? obj.lines : []).slice(0, 8).forEach((l) => {
    if (!l || typeof l !== 'object') return;
    const text = trimTo(clip(l.text, 300)); if (!text) return;
    let who = clip(l.who, 40);
    if (allowed.length && !allowed.includes(who)) who = allowed[lines.length % allowed.length];
    lines.push({ who, text });
  });
  /* الأسطر أوّلًا: الحوار بين الشخصيّات أثمن من الراوي حين تضيق المدّة */
  const narration = trimTo(clip(obj.narration, 600));
  const out = { scene: clip(obj.scene, 600), narration, lines, onScreen: clip(obj.onScreen, 60) };
  /* v-trend-scenes: وصف لكلّ مشهد (حدّ خانة المشهد ٤٠٠) — يُضاف فقط إن جاء */
  const scenes = (Array.isArray(obj.scenes) ? obj.scenes : [])
    .map((x) => (x && typeof x === 'object' ? (x.description || x.scene || x.text || x.visual) : x)) /* {"description":…} لا «[object Object]» */
    .map((x) => (typeof x === 'string' ? clip(x, 400) : '')).filter(Boolean).slice(0, MAX_SCENES);
  if (scenes.length) out.scenes = scenes;
  return (out.scene || out.narration || out.lines.length || scenes.length) ? out : null;
}

async function write(opts) {
  const o = opts || {};
  const sec = o.seconds || 8;
  const chain = o.chain || require('./free-chain.js').completeFreeChain;
  /* v-write-fix (المالك ١٧ أكتوبر، تجربة حيّة: «تعذّرت الكتابة» ثلاث مرّات متتالية): أوّل السلسلة Groq gpt-oss — موديل
     مفكّر يصرف من max_tokens على التفكير، فبسقف ٧٠٠ يرجع JSON مقطوعًا يرفضه parseReply فيضيع الطلب كلّه.
     الآن: سقف ١٦٠٠، والسلسلة لا تقبل إلّا جوابًا يُقرأ (accept) فتنتقل للمزوّد التالي بدل الفشل. */
  const ar = isArabic(o.request); let fallback = null;
  const accept = (t) => {
    const p = parseReply(t, sec, o.characters); if (!p) return false;
    if (ar && nonEmirati(p)) { if (!fallback) fallback = p; return false; } /* v-emirati: دخيل ← المزوّد التالي */
    if (o.scenes && !p.scenes) { if (!fallback) fallback = p; return false; } /* v-trend-scenes: بلا مصفوفة المشاهد ← التالي */
    return true;
  };
  const messages = [{ role: 'user', content: buildPrompt(Object.assign({}, o, { seconds: sec })) }];
  /* v-emirati-oa (تجربة حيّة بعد #1130: Groq/Mistral يكتبون «مش بس أكل» و«ما يمنعش» وجملًا بلا معنى، وGemini لا يردّ):
     بالعربيّ يُجرَّب أوّلًا موديل OpenAI الخفيف (أرخص من gpt-4o-mini، ونحو جزء من الفلس للطلب) — أمتن عربيّةً
     خليجيّة بفارق واضح؛ وفشله أو كلامه الدخيل = السلسلة المجّانيّة كما كانت. بلا مفتاح = السلسلة مباشرة. */
  const env = o.env || process.env, oaKey = String((env && env.OPENAI_API_KEY) || '').trim();
  if (ar && oaKey && !o.chain) {
    try {
      const { oaLightFetch } = require('./_oa-light.js');
      const res = await oaLightFetch(oaKey, { messages, max_tokens: 1600, temperature: 0.6 }, { fetchImpl: o.fetchImpl, signal: AbortSignal.timeout(20000) });
      const j = res && res.ok ? await res.json() : null;
      const text = j && j.choices && j.choices[0] && j.choices[0].message && String(j.choices[0].message.content || '').trim();
      if (text && accept(text)) { if (o.info) o.info.provider = 'openai:' + (j.model || '?'); return parseReply(text, sec, o.characters); }
      if (Array.isArray(o.diag)) o.diag.push('openai: ' + (text ? 'rejected' : 'http ' + (res && res.status)));
    } catch (e) { if (Array.isArray(o.diag)) o.diag.push('openai: ' + String((e && e.message) || e).slice(0, 80)); }
  }
  const r = await chain({ env: o.env, messages, max_tokens: 1600, temperature: 0.6, timeoutMs: 15000, fetchImpl: o.fetchImpl, accept });
  if (Array.isArray(o.diag) && r && Array.isArray(r.errors)) o.diag.push.apply(o.diag, r.errors.slice(0, 6));
  if (o.info && r) o.info.provider = r.ok ? r.provider : (fallback ? 'fallback' : ''); /* للمالك: أيّ مزوّد كتب */
  if (!r || !r.ok) return fallback;
  return parseReply(r.text, sec, o.characters);
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const request = clip(body && body.request, MAX_REQ);
  if (!request) { res.status(400).json({ error: 'request required' }); return; }
  const kind = KINDS.includes(body.kind) ? body.kind : 'story';
  /* v-trend-scenes: ترند المشاهد — ٨ ثوانٍ لكلّ مشهد، فميزانيّة الكلام بطول القصّة كلّها */
  const scenes = Math.max(0, Math.min(MAX_SCENES, parseInt(body.scenes, 10) || 0));
  const seconds = scenes ? 8 * scenes : secondsOf(body.duration);
  const characters = (Array.isArray(body.characters) ? body.characters : []).map((c) => clip(c, 40)).filter(Boolean).slice(0, MAX_CHARS);
  let gate = null;
  try { gate = await checkAndConsumePlanCustom(body.token, null, clientIp(req), 'video-write', DAILY_LIMIT); } catch (e) { gate = null; /* عطب العدّاد لا يفتح الباب */ }
  if (gate && !gate.allowed) { res.status(200).json({ result: null, reason: gate.reason === 'limit' ? 'limit' : 'auth' }); return; }
  if (!gate || !gate.username) { res.status(200).json({ result: null, reason: 'auth' }); return; }
  let result = null; const diag = [], info = {};
  try { result = await write({ request, kind, seconds, characters, scenes, env: process.env, diag, info }); } catch (e) { console.error('[video-write] ' + (e && e.message)); }
  let owner = false; try { owner = require('./_owner.js').isOwnerName(gate.username); } catch (e) { owner = false; }
  if (!result) {
    if (diag.length) console.warn('[video-write] unavailable: ' + diag.join(' | '));
    /* v-write-fix: سبب الفشل (مزوّد/حالة بلا مفاتيح) يظهر للمالك وحده — كان العطل صامتًا بلا أثر */
    res.status(200).json(Object.assign({ result: null, reason: 'unavailable' }, owner ? { diag } : {})); return;
  }
  res.status(200).json(Object.assign({ result, seconds, words: speechBudget(seconds) }, owner && info.provider ? { provider: info.provider } : {}));
}

module.exports = handler;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
module.exports.secondsOf = secondsOf;
module.exports.speechBudget = speechBudget;
module.exports.sceneCount = sceneCount;
module.exports.buildPrompt = buildPrompt;
module.exports.parseReply = parseReply;
module.exports.write = write;
module.exports.nonEmirati = nonEmirati;
module.exports.isArabic = isArabic;
