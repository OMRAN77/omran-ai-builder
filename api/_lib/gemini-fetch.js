'use strict';
/* v-vertex-route (المالك ٢١ أكتوبر ٢٠٢٦، استثناء من التجميد بموافقته: «تحويل اتصالات قوقل إلى Vertex AI… نبي نصرف من رصيد الـ300
   دولار في Google Cloud، وهذا الرصيد ما يغطي مفاتيح AI Studio»).
   نقطة عبور واحدة لكلّ نداءات Gemini (النصّ والصور) في api/_lib: الملفّات تبني رابط AI Studio كما كانت وتنادي geminiFetch بدل fetch.
   - بلا GOOGLE_VERTEX_API_KEY (أو GOOGLE_VERTEX=off): نداء fetch نفسه بالرابط نفسه والمفتاح نفسه — لا يتغيّر شيء.
   - بالمفتاح: generateContent وstreamGenerateContent تمرّان بمكتبة @google/genai على Vertex AI Express (vertexai:true + apiKey،
     الرابط https://aiplatform.googleapis.com/v1beta1/publishers/google/models/<model>:…) ويُردّ Response بشكل REST نفسه
     (candidates/usageMetadata، والخطأ {error:{code,message}} بحالته) فلا يتغيّر قارئ واحد. أسماء AI Studio المستعارة (-latest،
     nano-banana) لا توجد على Vertex فتُحوَّل (MODEL_MAP)، وGOOGLE_VERTEX_MODELS="قديم=جديد,…" يصحّح اسمًا بلا نشر كود.
   - لا تمرّ بـVertex (تبقى على AI Studio): واجهة OpenAI المتوافقة (oa-direct/tier)، وVeo (predictLongRunning والعمليّات
     والتنزيل من files/)، وInteractions (TTS المخرج وOmni)، وFiles API (video-watch) — لها مسارات وأسماء مختلفة على Vertex.
   المكتبة تُحمَّل عند أوّل نداء Vertex لا عند التحميل (١٢ م.ب) فلا يثقل الإقلاع البارد، والمفتاح يُقرأ عند النداء. */

const VERTEX_URL_RE = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:/?]+):(generateContent|streamGenerateContent)(?:[?#]|$)/;

/* أسماء AI Studio التي لا يعرفها Vertex. الأساس المعرفة بالتسمية حتّى أكتوبر ٢٠٢٦ — يُثبتها مسبار health?vertex=probe على المفتاح الحقيقيّ. */
const MODEL_MAP = {
  'gemini-flash-latest': 'gemini-3.8-flash',
  'gemini-flash-lite-latest': 'gemini-3.8-flash-lite',
  'gemini-pro-latest': 'gemini-3.1-pro-preview',
  'gemini-nano-banana': 'gemini-2.5-flash-image',
};

function vertexKey(env) {
  env = env || process.env;
  if (String(env.GOOGLE_VERTEX || '').trim().toLowerCase() === 'off') return '';
  return String(env.GOOGLE_VERTEX_API_KEY || '').trim();
}
const vertexActive = (env) => !!vertexKey(env);

function parseGeminiUrl(url) {
  const m = VERTEX_URL_RE.exec(String(url || ''));
  if (!m) return null;
  let model = decodeURIComponent(m[1]);
  return { model, method: m[2], stream: m[2] === 'streamGenerateContent' };
}

function overrides(env) {
  const out = {};
  for (const pair of String((env || process.env).GOOGLE_VERTEX_MODELS || '').split(',')) {
    const i = pair.indexOf('='); if (i < 1) continue;
    const a = pair.slice(0, i).trim(), b = pair.slice(i + 1).trim();
    if (a && b) out[a] = b;
  }
  return out;
}
function toVertexModel(name, env) {
  const m = String(name || '').replace(/^models\//, '');
  const o = overrides(env);
  return o[m] || MODEL_MAP[m] || m;
}

/* جسم REST (كما تبنيه الملفّات) ← معاملات المكتبة: generationConfig تُفرد في config، وما هو في جذر الجسم (systemInstruction، tools…) ينضمّ إليه */
const CONFIG_ROOT_KEYS = ['systemInstruction', 'safetySettings', 'tools', 'toolConfig', 'cachedContent', 'labels'];
function restToSdk(body) {
  const b = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {});
  const config = Object.assign({}, b.generationConfig || {});
  for (const k of CONFIG_ROOT_KEYS) if (b[k] != null) config[k] = b[k];
  return { contents: b.contents, config };
}
/* ردّ المكتبة ← JSON بشكل REST (الحقول نفسها؛ sdkHttpResponse الداخليّ يُحذف) */
function sdkToRest(resp) {
  const o = JSON.parse(JSON.stringify(resp || {}));
  delete o.sdkHttpResponse;
  return o;
}
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
/* خطأ المكتبة (ApiError: status + message، ورسالته غالبًا جسم JSON فيه error) ← Response بحالة الخادم نفسها وبشكل REST؛ غيره (شبكة) يُرمى كما كان fetch يرمي */
function errorToResponse(e) {
  const status = Number(e && e.status) || 0;
  if (!status) throw e;
  const message = String((e && e.message) || '');
  let body = null;
  try { const p = JSON.parse(message); if (p && p.error) body = p; } catch (e2) { /* guard-ok — نصّ لا JSON */ }
  if (!body) body = { error: { code: status, message: message.slice(0, 2000), status: '' } };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

let sdkFactory = null; /* للاختبار: مصنع عميل بديل */
function setSdkFactory(fn) { sdkFactory = fn || null; }
function client(apiKey) {
  if (sdkFactory) return sdkFactory({ vertexai: true, apiKey });
  const { GoogleGenAI } = require('@google/genai');
  return new GoogleGenAI({ vertexai: true, apiKey });
}

async function geminiFetch(url, init, fetchFn) {
  const key = vertexKey();
  const g = key ? parseGeminiUrl(url) : null;
  if (!g) return (fetchFn || fetch)(url, init);
  const { contents, config } = restToSdk(init && init.body);
  if (init && init.signal) config.abortSignal = init.signal;
  const params = { model: toVertexModel(g.model), contents, config };
  const ai = client(key);
  try {
    if (!g.stream) {
      const resp = await ai.models.generateContent(params);
      return new Response(JSON.stringify(sdkToRest(resp)), { status: 200, headers: JSON_HEADERS });
    }
    const it = await ai.models.generateContentStream(params);
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async pull(ctrl) {
        try {
          const { value, done } = await it.next();
          if (done) { ctrl.close(); return; }
          ctrl.enqueue(enc.encode('data: ' + JSON.stringify(sdkToRest(value)) + '\r\n\r\n'));
        } catch (e) { ctrl.error(e); }
      },
      cancel() { try { if (it.return) it.return(); } catch (e) { /* guard-ok — إغلاق مكرّر */ } },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
  } catch (e) {
    return errorToResponse(e);
  }
}

/* الأسماء المستعملة في api/_lib (النصّ والصور) — يفحصها المسبار على Vertex */
const USED_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', 'gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-nano-banana'];
/* المسبار (health?vertex=probe، للمالك): نداء نصّ صغير ونداء صورة صغير بالمفتاح الحقيقيّ، وأسماء النماذج، ورقم المشروع إن ظهر —
   يعيد النتيجة ورسالة الخطأ كاملةً، ولا يعيد المفتاح أبدًا */
async function probe(opts) {
  opts = opts || {};
  const key = vertexKey(opts.env);
  const out = { ok: false, active: !!key, sdk: '', text: null, image: null, models: {}, project: '', errors: [] };
  if (!key) { out.errors.push('GOOGLE_VERTEX_API_KEY غير موجود في هذه البيئة'); return out; }
  try { const p = require('path'); out.sdk = JSON.parse(require('fs').readFileSync(p.join(p.dirname(require.resolve('@google/genai')), '..', '..', 'package.json'), 'utf8')).version; } catch (e) { /* guard-ok — الإصدار للعرض فقط */ }
  const ai = opts.client || client(key);
  const projectOf = (x) => { const m = /projects\/(\d{6,})/.exec(String(x || '')); return m ? m[1] : ''; };
  const errText = (e) => { const s = String((e && e.message) || e); if (!out.project) out.project = projectOf(s); return (e && e.status ? e.status + ' ' : '') + s.slice(0, 1500); };
  /* الاسم يُثبت بنداء حقيقيّ أصغر ما يكون (رمز واحد، نصًّا) — models.get على Vertex Express يردّ 401 «API keys are not supported» (ثبت ٢١ أكتوبر).
     404 = الاسم غير موجود؛ 200 = موجود؛ 400 عن الوسائط (نموذج صور يرفض النصّ وحده) = موجود */
  for (const name of opts.models || USED_MODELS) {
    const v = toVertexModel(name, opts.env);
    const tag = v === name ? '' : v + ' ← ';
    try {
      const r = await ai.models.generateContent({ model: v, contents: 'hi', config: { maxOutputTokens: 1, temperature: 0, responseModalities: ['TEXT'] } });
      const j = sdkToRest(r);
      out.models[name] = tag + 'ok' + (j.modelVersion ? ' · ' + j.modelVersion : '');
    } catch (e) {
      const t = errText(e);
      out.models[name] = tag + (e && e.status === 404 ? 'لا يوجد: ' : (e && e.status === 400 && /modalit|image/i.test(t) ? 'موجود (يقبل الصور فقط): ' : 'لا: ')) + t.slice(0, 220);
    }
  }
  const t0 = Date.now();
  try {
    const r = await ai.models.generateContent({ model: toVertexModel(opts.textModel || 'gemini-flash-latest', opts.env), contents: 'Reply with the single word OK.', config: { maxOutputTokens: 8, temperature: 0 } });
    const j = sdkToRest(r);
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts; const s = Array.isArray(txt) ? txt.map((p) => p.text || '').join('') : '';
    out.text = { ok: !!s, ms: Date.now() - t0, reply: s.slice(0, 60), usage: j.usageMetadata || null, modelVersion: j.modelVersion || '' };
    if (r && r.sdkHttpResponse && r.sdkHttpResponse.headers) for (const v of Object.values(r.sdkHttpResponse.headers)) if (!out.project) out.project = projectOf(v);
  } catch (e) { out.text = { ok: false, ms: Date.now() - t0 }; out.errors.push('text: ' + errText(e)); }
  const t1 = Date.now();
  try {
    const r = await ai.models.generateContent({ model: toVertexModel(opts.imageModel || 'gemini-3-pro-image', opts.env), contents: 'A single small red circle centered on a plain white background. Minimal.', config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '1K' } } });
    const j = sdkToRest(r);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.find((p) => p.inlineData && p.inlineData.data);
    out.image = { ok: !!img, ms: Date.now() - t1, bytes: img ? Math.floor(img.inlineData.data.length * 3 / 4) : 0, mime: img ? img.inlineData.mimeType : '', usage: j.usageMetadata || null, modelVersion: j.modelVersion || '' };
  } catch (e) { out.image = { ok: false, ms: Date.now() - t1 }; out.errors.push('image: ' + errText(e)); }
  out.ok = !!(out.text && out.text.ok && out.image && out.image.ok);
  const safe = JSON.stringify(out); /* المفتاح لا يُطبع — وإن ورد في رسالة خطأ يُمحى */
  return key && safe.includes(key) ? JSON.parse(safe.split(key).join('[key]')) : out;
}

module.exports = { geminiFetch, vertexKey, vertexActive, parseGeminiUrl, toVertexModel, restToSdk, sdkToRest, errorToResponse, probe, setSdkFactory, MODEL_MAP, USED_MODELS, VERTEX_URL_RE };
