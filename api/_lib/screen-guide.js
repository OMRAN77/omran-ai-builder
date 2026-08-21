'use strict';
// screen-guide.js — نقطة نهاية المرشد البصري.
// POST /api/ai?action=screen-guide
//
// المرور:  Gemini Vision (سريع، رخيص) ← إذا confidence < CHAIN_THRESHOLD ← GPT-4o Vision (أدق)
// الفوترة: خصم مرة واحدة للجلسة (sessionId جديد = خصم، متابعة = مجانية)
// الأمان:  شاشات OTP/دفع تُحجب في الخادم، الصور لا تُخزَّن أبدًا
// الكشف:  نفس بصمة الصورة مرتين = مستخدم عالق → مسار بديل

const { checkAndConsume, clientIp } = require('./_usage.js');
const { logError } = require('./log-error.js');
const { safeParse } = require('./safe-parse.js');
const {
  needsMoreInfo, askMessage, normalizeGuideStep, buildGuidePrompt, SENSITIVE_AR, SENSITIVE_EN,
} = require('./screen-guide-prompt.js');

// — إعدادات النموذجين —
const GEM_MODEL   = process.env.SCREEN_GUIDE_MODEL   || 'gemini-3.1-pro-preview';
const OAI_MODEL   = process.env.SCREEN_GUIDE_OAI_MODEL || 'gpt-4o';
const GEM_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models/';
const OAI_BASE    = 'https://api.openai.com/v1/chat/completions';
const CHAIN_THRESHOLD = 0.65;   // إذا confidence < هذا → fallback لـ GPT-4o
const MAX_IMG_BYTES   = 4 * 1024 * 1024; // ~3 MB بعد JPEG
const ALLOWED_MIME    = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SESSION_PREFIX  = 'sg_charged_';  // مفتاح KV لتتبع الجلسات المخصومة

let KNOWN_APPS = null;
function loadApps() {
  if (KNOWN_APPS) return KNOWN_APPS;
  try { KNOWN_APPS = require('../../knowledge/screen-guide/apps.json'); }
  catch (e) { logError('screen-guide:apps', e, {}); KNOWN_APPS = {}; }
  return KNOWN_APPS;
}

// ---- فك تشفير الصورة ----
function decodeImage(body) {
  const mime = String(body.mime || '').toLowerCase().trim();
  if (!ALLOWED_MIME.has(mime)) return { error: 'bad_mime' };
  let b64 = String(body.imageB64 || '');
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma !== -1) b64 = b64.slice(comma + 1);
  b64 = b64.replace(/\s+/g, '');
  if (!b64) return { error: 'no_image' };
  if (Math.floor(b64.length * 3 / 4) > MAX_IMG_BYTES) return { error: 'too_large' };
  return { b64, mime };
}

// ---- بصمة بسيطة للكشف عن الشاشة المكررة (عالق) ----
function quickHash(b64) {
  // أخذ عينة من 200 حرف من المنتصف لتجنب headers الثابتة
  const mid = Math.floor(b64.length / 2);
  return b64.slice(mid, mid + 200);
}

// ---- استدعاء Gemini Vision ----
async function callGemini(apiKey, prompt, image) {
  const url = GEM_BASE + encodeURIComponent(GEM_MODEL) + ':generateContent?key=' + apiKey;
  const payload = {
    contents: [{ role: 'user', parts: [
      { inline_data: { mime_type: image.mime, data: image.b64 } },
      { text: prompt },
    ]}],
    generationConfig: { temperature: 0.15, maxOutputTokens: 700, responseMimeType: 'application/json' },
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await resp.text();
  if (!resp.ok) { const e = new Error('gemini_http_' + resp.status); e.providerBody = text.slice(0, 300); throw e; }
  const d = safeParse(text, null, 'screen-guide:gemini');
  const part = d?.candidates?.[0]?.content?.parts?.[0];
  return safeParse(part?.text || '', null, 'screen-guide:gemini-inner');
}

// ---- استدعاء GPT-4o Vision (fallback) ----
async function callGPT4o(apiKey, prompt, image) {
  const payload = {
    model: OAI_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}`, detail: 'high' } },
        { type: 'text', text: prompt },
      ],
    }],
  };
  const resp = await fetch(OAI_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  if (!resp.ok) { const e = new Error('gpt4o_http_' + resp.status); e.providerBody = text.slice(0, 300); throw e; }
  const d = safeParse(text, null, 'screen-guide:gpt4o');
  return safeParse(d?.choices?.[0]?.message?.content || '', null, 'screen-guide:gpt4o-inner');
}

// ---- المعالج الرئيسي ----
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  try {
    const gemKey = process.env.GEMINI_API_KEY;
    const oaiKey = process.env.OPENAI_API_KEY;
    if (!gemKey) { res.status(503).json({ error: 'screen_guide_unavailable' }); return; }

    let body = req.body;
    if (!body || typeof body === 'string') body = safeParse(body || '{}', {}, 'screen-guide:body') || {};

    const { goal, token, guestId, lang = 'ar', appId, sessionId, history = [] } = body;

    // ١. بوابة الطلب الغامض — قبل أي خصم
    if (needsMoreInfo(goal)) {
      res.status(200).json({ kind: 'ask', message: askMessage(lang), stored: false });
      return;
    }

    // ٢. فك تشفير الصورة
    const img = decodeImage(body);
    if (img.error) { res.status(400).json({ error: img.error }); return; }

    // ٣. الفوترة — مرة واحدة للجلسة
    let charged = false;
    const { kvGetRaw, kvSetRaw } = require('./kv.js');
    const sessKey = SESSION_PREFIX + String(sessionId || '').slice(0, 80);
    if (sessionId) {
      const alreadyCharged = await kvGetRaw(sessKey).catch(() => null);
      if (!alreadyCharged) {
        const usage = await checkAndConsume(token, guestId, 'screen_guide', clientIp(req));
        if (!usage.allowed) {
          const status = usage.reason === 'auth' ? 401 : 402;
          const code   = usage.reason === 'auth' ? 'auth_required' : 'no_points';
          res.status(status).json({ error: code }); return;
        }
        await kvSetRaw(sessKey, '1', 60 * 60 * 6).catch(() => {}); // TTL 6 ساعات
        charged = true;
      }
    } else {
      // بدون sessionId: خصم دائمًا (مستخدم لم يمرر جلسة)
      const usage = await checkAndConsume(token, guestId, 'screen_guide', clientIp(req));
      if (!usage.allowed) {
        res.status(usage.reason === 'auth' ? 401 : 402).json({ error: usage.reason === 'auth' ? 'auth_required' : 'no_points' }); return;
      }
      charged = true;
    }

    // ٤. كشف المستخدم العالق (نفس الشاشة مرتين)
    const imgHash = quickHash(img.b64);
    const histArr = Array.isArray(history) ? history : [];
    const lastHash = histArr.length ? (histArr[histArr.length - 1]._imgHash || null) : null;
    const stuck = lastHash === imgHash && histArr.length > 0;

    // ٥. معرفة التطبيق
    const apps = loadApps();
    const appInfo = appId ? (apps[String(appId).toLowerCase()] || null) : null;

    // ٦. بناء التعليمة
    const prompt = buildGuidePrompt(goal, { lang, app: appInfo, history: histArr, stuck });

    // ٧. استدعاء Gemini أولاً
    let raw = null;
    let usedFallback = false;
    try { raw = await callGemini(gemKey, prompt, img); } catch (e) {
      logError('screen-guide:gemini-call', e, { action: 'primary' });
    }

    let step = raw ? normalizeGuideStep(raw) : null;

    // ٨. سلسلة النماذج: إذا ثقة منخفضة وعندنا GPT-4o → أعد المحاولة
    if (oaiKey && (!step || (!step.sensitive && !step.askFor && !step.done && (step.confidence || 0) < CHAIN_THRESHOLD))) {
      try {
        const raw2 = await callGPT4o(oaiKey, prompt, img);
        const step2 = raw2 ? normalizeGuideStep(raw2) : null;
        if (step2 && (step2.confidence || 0) > (step ? (step.confidence || 0) : -1)) {
          step = step2;
          usedFallback = true;
        }
      } catch (e2) {
        logError('screen-guide:gpt4o-call', e2, { action: 'fallback' });
      }
    }

    // ٩. لا رد مفيد
    if (!step) {
      res.status(200).json({ kind: 'ask', message: askMessage(lang), stored: false });
      return;
    }

    // ١٠. شاشة حساسة
    if (step.sensitive) {
      res.status(200).json({
        kind: 'blocked',
        message: String(lang || 'ar').startsWith('en') ? SENSITIVE_EN : SENSITIVE_AR,
        stored: false,
      });
      return;
    }

    // ١١. الهدف تحقق
    if (step.done) {
      res.status(200).json({ kind: 'done', screen: step.screen, message: step.instruction || (lang.startsWith('en') ? 'Done! Your goal has been achieved.' : 'تم! وصلت للهدف.'), price: step.price, stored: false });
      return;
    }

    // ١٢. سؤال توضيحي
    if (step.askFor) {
      res.status(200).json({ kind: 'ask', message: step.askFor, stored: false });
      return;
    }

    // ١٣. رد طبيعي
    res.status(200).json({
      kind: 'step',
      screen: step.screen,
      instruction: step.instruction,
      label: step.label,
      price: step.price,
      box: step.box,
      confidence: step.confidence,
      stepNumber: step.stepNumber,
      totalSteps: step.totalSteps,
      onTrack: step.onTrack,
      stuck,
      _imgHash: imgHash,   // يعاد للعميل فيحفظه في history لكشف التكرار لاحقًا
      usedFallback,
      stored: false,
    });

  } catch (err) {
    logError('screen-guide:handler', err, {});
    res.status(500).json({ error: 'screen_guide_failed' });
  }
};
