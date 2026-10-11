'use strict';
/* api/_lib/app-director.js — v-app-director: عقل «مخرج التطبيق» (المرحلة ١) — للمالك وحده.
   المالك: «مثال أقوله سوّ لي أو عطني فكرة فيديو عن أنماط الصور ويعطيني فيديو عنه كامل… سوّ لي فيديو عن التطبيق
   ١٠ دقائق، يسوّيه مع الأفكار مع المتحدّثة مها أو عبدالله، وبأيّ لغة أريدها» — «ما أريد واحد غبي» — «ليس كلاود».
   إجراءان في api/ai.js:
     app-director-plan  : الطلب + اللغة + المتحدّث + المدّة + كتالوج التطبيق (app-catalog.js) → عنوان وفكرة ومشاهد
                          {type: screen|style_sample|title, target, text, highlight, narration, seconds} بجواب JSON من نموذج
                          المخرج (DIRECTOR_MODEL أو أحدث Pro)، مع تحقّق من JSON وإعادة محاولة واحدة عند الفساد.
     app-director-token : رمز مهمّة قصير العمر (HMAC بسرّ الجسر CC_BRIDGE_SECRET، ساعتان، يحمل اسم المالك ومعرّف المهمّة)
                          يستعمله المتصفّح مع جسر Railway مباشرة لمسار /render؛ السرّ نفسه لا يبلغ المتصفّح، وعنوان الجسر
                          يعود مع الرمز من البيئة (CC_BRIDGE_URL) لا من العميل.
   لا نقاط ولا خصم: المالك بلا نقاط. لا اسم مزوّد في أيّ نصّ يصل العميل. */
const crypto = require('crypto');
const { isOwner } = require('./_owner.js');
const { safeParse } = require('./safe-parse.js');
const CAT = require('./app-catalog.js');

const DEFAULT_MODELS = ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro'];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const TOKEN_TTL_MS = 2 * 3600 * 1000;
const MAX_REQUEST = 600;
const MIN_MINUTES = 1, MAX_MINUTES = 10;
const SCENE_SECONDS = 8;      // متوسّط المشهد — الفعليّ على الجسر = مدّة الصوت + نصف ثانية
const WORDS_PER_SEC = 2.3;    // كلام مريح (كما في video-write)
const MAX_SCENES = 90;

const LANG_NAMES = {
  ar: 'Arabic (natural Gulf/Emirati dialect, warm and confident — never stiff formal Arabic)', en: 'English', fr: 'French', es: 'Spanish', tr: 'Turkish', ru: 'Russian',
  zh: 'Simplified Chinese', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali', ml: 'Malayalam', id: 'Indonesian', fil: 'Filipino',
};

/** النماذج بالترتيب: DIRECTOR_MODEL أوّلًا إن وُجد، ثمّ أحدث Pro فالأقدم */
function directorModels(env) {
  const m = String((env || process.env).DIRECTOR_MODEL || '').trim();
  return m ? [m].concat(DEFAULT_MODELS.filter((x) => x !== m)) : DEFAULT_MODELS.slice();
}

const SYSTEM = [
  'أنت مخرج عروض منتجات محترف تكتب سيناريو فيديو تسويقيّ عن تطبيق «عمران AI».',
  'إيقاعك سريع: جملة واحدة لكلّ فكرة، لا حشو ولا تكرار. تبدأ بخطّاف قويّ في أوّل جملة، وتختم بدعوة واضحة للتجربة.',
  'تكتب التعليق الصوتيّ باللغة المطلوبة وحدها، وبصيغة من يخاطب المشاهد مباشرة، وبأسماء الميزات والشاشات كما وردت في الكتالوج حرفيًّا.',
  'ممنوع ذكر اسم أيّ مزوّد أو نموذج ذكاء اصطناعيّ أو شركة تقنيّة (لا كلود ولا جيمناي ولا GPT ولا جوجل ولا غيرها) — الأسماء الوظيفيّة فقط.',
  'لا تَعِد بشيء ليس في الكتالوج. المساعد الصوتيّ اسمه مها، وصوت الرجل اسمه عبدالله.',
  'تعيد JSON واحدًا صالحًا فقط بلا أيّ نصّ خارجه ولا أسوار كود.',
].join('\n');

function sceneTarget(minutes) { return Math.max(4, Math.round((minutes * 60) / SCENE_SECONDS)); }
function wordsPerScene() { return Math.round(SCENE_SECONDS * WORDS_PER_SEC); }

function buildPrompt(o) {
  const scenes = sceneTarget(o.minutes);
  const words = wordsPerScene();
  const spk = o.speaker === 'male' ? 'عبدالله (صوت رجل)' : 'مها (صوت امرأة)';
  return [
    'الطلب من مالك التطبيق: «' + o.request + '»',
    'اللغة المطلوبة للتعليق الصوتيّ وبطاقات العناوين: ' + (LANG_NAMES[o.lang] || o.lang) + '.',
    'المتحدّث: ' + spk + '. المدّة الكلّيّة: ' + o.minutes + ' دقيقة ≈ ' + scenes + ' مشهدًا، كلّ مشهد نحو ' + SCENE_SECONDS + ' ثوانٍ = ' + words + ' كلمة تعليق تقريبًا (الحدّ ' + Math.round(words * 1.6) + ').',
    'أعد بالضبط ' + scenes + ' مشهدًا (±٢) تغطّي المدّة المطلوبة، تلتزم بالطلب (إن طلب موضوعًا واحدًا كأنماط الصور فركّز عليه وأرِ أمثلته، وإن طلب التطبيق كلّه فغطِّ الشاشات الأهمّ بالترتيب المنطقيّ).',
    'أنواع المشاهد: "title" بطاقة عنوان (text ≤ ٦ كلمات، للافتتاح والفواصل والختام)، "screen" لقطة شاشة حقيقيّة (target = معرّف شاشة من الكتالوج)، "style_sample" صورة حقيقيّة تُولَّد بنمط صور (target = مفتاح نمط من PORTRAIT STYLES). نوّع بينها: افتح ببطاقة عنوان، ولا تضع أكثر من ثلاث لقطات متتالية للشاشة نفسها.',
    'الصيغة المطلوبة: {"title":"عنوان الفيديو","idea":"سطران عن الفكرة","scenes":[{"type":"title|screen|style_sample","target":"screen id or style key","text":"نصّ قصير على الشاشة (اختياريّ لغير title)","highlight":"ما يُبرَز في هذا المشهد (كلمات قليلة)","narration":"التعليق الصوتيّ لهذا المشهد","seconds":8}]}',
    'كتالوج التطبيق:',
    o.catalogText,
  ].join('\n');
}

function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

/** يقرأ خطّة المخرج بحزم: الأنواع والأهداف تُطابَق على الكتالوج، والمجهول يسقط أو يُحوَّل، والمدد تُحصر. null إن لم يبقَ مشهد. */
function normalizePlan(obj, catalog) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.scenes)) return null;
  const screenIds = new Set(catalog.screens.map((s) => s.id));
  const styleKeys = new Set(catalog.portraitStyles.map((s) => s.key));
  const scenes = [];
  for (const raw of obj.scenes.slice(0, MAX_SCENES)) {
    if (!raw || typeof raw !== 'object') continue;
    let type = String(raw.type || '').trim();
    let target = clip(raw.target, 60);
    const narration = clip(raw.narration, 700);
    const text = clip(raw.text, 80);
    if (!narration && !text) continue;
    if (type === 'style_sample') {
      if (!styleKeys.has(target)) { type = 'screen'; target = 'portrait'; }
    } else if (type === 'screen') {
      if (!screenIds.has(target)) target = screenIds.has(target.toLowerCase()) ? target.toLowerCase() : 'home';
    } else {
      type = 'title'; target = '';
    }
    const secs = Number(raw.seconds);
    scenes.push({
      type, target, text, highlight: clip(raw.highlight, 80), narration,
      seconds: Number.isFinite(secs) ? Math.max(3, Math.min(25, Math.round(secs))) : SCENE_SECONDS,
    });
  }
  if (scenes.length < 2) return null;
  return { title: clip(obj.title, 120) || clip(scenes[0].text, 120), idea: clip(obj.idea, 400), scenes };
}

function geminiBody(prompt, nudge) {
  const parts = [{ text: prompt }];
  if (nudge) parts.push({ text: nudge });
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 32768, responseMimeType: 'application/json' },
  };
}
function partsText(d) { return String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('')); }

/**
 * يطلب الخطّة من نموذج المخرج. opts: {request, lang, speaker, minutes, catalog, apiKey, env, fetchImpl, timeoutMs}.
 * نموذج غير موجود (404) → التالي في القائمة؛ جواب ليس JSON صالحًا → محاولة ثانية واحدة بتنبيه؛ وإلّا {ok:false, why}.
 */
async function requestPlan(opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const catalog = o.catalog;
  const prompt = buildPrompt({ request: o.request, lang: o.lang, speaker: o.speaker, minutes: o.minutes, catalogText: CAT.catalogText(catalog) });
  const models = directorModels(o.env);
  let why = 'unavailable';
  for (const model of models) {
    let nudge = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      let r = null, d = null;
      try {
        r = await fetchImpl(ENDPOINT + model + ':generateContent?key=' + o.apiKey, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(o.timeoutMs || 130000), /* محاولتان على الأكثر تحت سقف دالّة Vercel (٣٠٠ ث) */
          body: JSON.stringify(geminiBody(prompt, nudge)),
        });
        d = await r.json().catch(() => null);
      } catch (e) { why = 'network'; break; }
      if (!r.ok) {
        const msg = String((d && d.error && d.error.message) || '');
        why = 'http_' + r.status;
        if (r.status === 404 || (r.status === 400 && /model|not found|not supported/i.test(msg))) break; /* النموذج التالي */
        return { ok: false, why, model };
      }
      const plan = normalizePlan(extractJson(partsText(d)), catalog);
      if (plan) return { ok: true, plan, model, attempts: attempt };
      why = 'bad_json';
      nudge = 'الجواب السابق لم يكن JSON صالحًا بالصيغة المطلوبة. أعد الآن JSON واحدًا صالحًا فقط بالحقول نفسها، بلا أيّ نصّ قبله أو بعده.';
    }
    if (why === 'bad_json' || why === 'network') return { ok: false, why, model };
  }
  return { ok: false, why };
}

/* ───── رمز المهمّة: base64url(JSON{u,j,exp}).base64url(HMAC-SHA256) بسرّ الجسر ───── */
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
function signJobToken(info, secret, ttlMs) {
  const payload = JSON.stringify({ u: String(info.user || ''), j: String(info.jobId || ''), exp: Number(info.exp) || (Date.now() + (ttlMs || TOKEN_TTL_MS)) });
  const p = b64u(payload);
  const sig = crypto.createHmac('sha256', String(secret)).update(p).digest('base64url');
  return p + '.' + sig;
}
function verifyJobToken(token, secret, now) {
  try {
    const [p, sig] = String(token || '').split('.');
    if (!p || !sig || !secret) return { ok: false, why: 'malformed' };
    const want = crypto.createHmac('sha256', String(secret)).update(p).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, why: 'signature' };
    const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!data || !data.j || !(data.exp > (now || Date.now()))) return { ok: false, why: 'expired' };
    return { ok: true, user: String(data.u || ''), jobId: String(data.j), exp: data.exp };
  } catch (e) { return { ok: false, why: 'malformed' }; }
}
function newJobId() { return 'd' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex'); }

function sessionUser(token) {
  try {
    const payload = String(token || '').split('.')[0];
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return String((data && data.u) || '').slice(0, 60);
  } catch (e) { return ''; }
}

function cleanLabels(labels) {
  const out = {};
  if (!labels || typeof labels !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(labels)) {
    if (n++ >= 400) break;
    if (/^[A-Za-z0-9_]{1,60}$/.test(k) && typeof labels[k] === 'string') out[k] = labels[k].slice(0, 120);
  }
  return out;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') body = safeParse(body, {}, 'app-director:body');
  const action = String((req.query && req.query.action) || '');
  if (!isOwner({ query: req.query || {}, body })) { res.status(403).json({ error: 'owner_only' }); return; }

  if (action === 'app-director-token') {
    const secret = String(process.env.CC_BRIDGE_SECRET || '').trim();
    const bridge = String(process.env.DIRECTOR_BRIDGE_URL || process.env.CC_BRIDGE_URL || '').trim().replace(/\/+$/, '');
    if (!secret || !/^https?:\/\//.test(bridge)) { res.status(503).json({ error: 'bridge_unconfigured' }); return; }
    const jobId = newJobId();
    const exp = Date.now() + TOKEN_TTL_MS;
    res.status(200).json({ token: signJobToken({ user: sessionUser(body.token), jobId, exp }, secret), jobId, bridge, exp });
    return;
  }

  if (action === 'app-director-plan') {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) { res.status(503).json({ error: 'director_unconfigured' }); return; }
    const request = clip(body.request, MAX_REQUEST);
    if (!request) { res.status(400).json({ error: 'request_required' }); return; }
    const lang = CAT.LANGS.includes(body.lang) ? body.lang : 'ar';
    const speaker = body.speaker === 'male' ? 'male' : 'female';
    const minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(Number(body.minutes) || 2)));
    const catalog = CAT.buildCatalog({ lang, labels: cleanLabels(body.labels) });
    let r;
    try { r = await requestPlan({ request, lang, speaker, minutes, catalog, apiKey, env: process.env }); }
    catch (e) { console.error('[app-director] ' + (e && e.message)); r = { ok: false, why: 'exception' }; }
    if (!r.ok) { console.error('[app-director] plan failed: ' + r.why + (r.model ? ' (' + r.model + ')' : '')); res.status(502).json({ error: 'plan_failed', why: r.why }); return; }
    const styles = {};
    catalog.portraitStyles.forEach((s, i) => { styles[s.key] = { desc: s.desc, prompt: CAT.samplePrompt(s.key, s.desc, i) }; });
    res.status(200).json({
      plan: r.plan, lang, speaker, minutes, attempts: r.attempts,
      catalog: { screens: catalog.screens.map((s) => ({ id: s.id, name: s.name, steps: s.steps })), styles },
    });
    return;
  }
  res.status(404).json({ error: 'unknown action' });
}

module.exports = handler;
module.exports.__test = { directorModels, buildPrompt, normalizePlan, requestPlan, signJobToken, verifyJobToken, extractJson, sceneTarget, SYSTEM, TOKEN_TTL_MS, DEFAULT_MODELS, cleanLabels };
