'use strict';
/* v-models-latest (أمر المالك ٢٥ سبتمبر «رقّهم كلّهم لآخر الإصدارات»): المهامّ الخفيفة على OpenAI
   (اقتراح أزياء، خطّة صلاة، بريد، سكربت فيديو، درس، ذاكرة…) كانت مثبّتة على gpt-4o-mini/gpt-4.1-mini.
   الأحدث gpt-6-luna (أرخص منهما)، لكنّه موديل يفكّر: يرفض max_tokens وtemperature، والتفكير يُحسب من
   max_completion_tokens — فتبديل الاسم وحده يكسر النداء (400) أو يرجع نصًّا فارغًا. هنا:
   (١) قائمة مرشّحين: موديل لا يملكه المفتاح (404 / «does not exist») = التالي، لا فشل؛
   (٢) الجسم يُشكَّل لكلّ موديل: الجديد بلا temperature، وmax_completion_tokens بهامش للتفكير، وجهد منخفض؛
       القديم (gpt-4*) بجسمه كما هو؛
   (٣) حقل يرفضه الموديل بالاسم (400) يُحذف ويُعاد النداء على الموديل نفسه مرّة.
   الناتج Response عاديّة كما من fetch، فلا يتغيّر ما بعد النداء في أيّ ملفّ. */
const OA_LIGHT_MODELS = ['gpt-6-luna', 'gpt-5-mini', 'gpt-4.1-mini'];
const OA_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const REASONING_HEADROOM = 2000;

function isLegacy(model) { return /^gpt-4/i.test(String(model || '')); }

function shapeBody(model, payload) {
  const b = Object.assign({}, payload, { model });
  if (isLegacy(model)) return b;
  if (b.max_tokens != null) { b.max_completion_tokens = Number(b.max_tokens) + REASONING_HEADROOM; delete b.max_tokens; }
  delete b.temperature;
  delete b.top_p;
  if (b.reasoning_effort == null) b.reasoning_effort = 'low';
  return b;
}

function modelMissing(status, text) {
  if (status === 404) return true;
  return (status === 400 || status === 403) && /model/i.test(text) && /does not exist|not found|do not have access|not available|unsupported model|invalid model/i.test(text);
}

const DROPPABLE = ['reasoning_effort', 'temperature', 'max_completion_tokens', 'top_p', 'response_format'];

// payload: جسم chat/completions بلا model. opts: { models, fetchImpl, signal, url }.
async function oaLightFetch(apiKey, payload, opts) {
  const o = opts || {};
  const f = o.fetchImpl || fetch;
  const models = (Array.isArray(o.models) && o.models.length) ? o.models : OA_LIGHT_MODELS;
  let last = null;
  for (const model of models) {
    let body = shapeBody(model, payload);
    for (let attempt = 0; attempt < 3; attempt++) {
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey }, body: JSON.stringify(body) };
      if (o.signal) init.signal = o.signal;
      const r = await f(o.url || OA_CHAT_URL, init);
      if (r.ok || (r.status !== 400 && r.status !== 403 && r.status !== 404)) return r; // 401/402/429/5xx: المفتاح أو الرصيد — تظهر كما هي
      const text = await r.text().catch(() => '');
      last = new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
      const bad = DROPPABLE.find((k) => body[k] != null && new RegExp(k, 'i').test(text));
      if (r.status === 400 && bad && !modelMissing(r.status, text)) {
        body = Object.assign({}, body); delete body[bad]; continue;
      }
      if (modelMissing(r.status, text)) break; // المرشّح التالي
      return last;
    }
  }
  return last;
}

module.exports = { oaLightFetch, shapeBody, modelMissing, OA_LIGHT_MODELS };
