// scripts/lib/models-live.cjs — v-models-live: الفحص الدوريّ لأسماء الموديلات المكتوبة في الكود مقابل قوائم المزوّدين الحيّة.
//
// العرض: الأسماء المكتوبة نصًّا تموت بصمت حين توقفها شركتها (v-dead-models: Kimi وGroq وDeepSeek وMistral…)، ولا يُكتشف
// ذلك إلّا بشكوى مستخدم. هنا: (١) تُستخرج الأسماء من سلاسل الكود نفسه (رموز acorn، فالتعليقات لا تُعدّ) — لا قائمة يدويّة
// تتقادم كما تقادمت قائمة model-probe القديمة؛ (٢) يُسأل كلّ مزوّد عن قائمته عبر /models — طلب مجّانيّ لا يشغّل موديلًا؛
// (٣) الاسم «ميّت» فقط إن جُلبت كلّ القوائم التي قد تخدمه ولم يوجد في أيّها. مزوّد بلا مفتاح = «لم يُفحص»، لا «ميّت».
'use strict';

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

// العائلات: كلّ اسم يُنسب إلى القوائم التي قد تخدمه. الترتيب مهمّ: الأوّل المطابق يحكم.
const FAMILIES = [
  // لاحقة :free توجيه خاصّ بالوسيط (OpenRouter) وحده.
  { name: 'free', re: /^[a-z0-9-]+\/[a-z0-9][\w.-]*:free$/, catalogs: ['openrouter'] },
  // معرّف بشرطة مائلة «شركة/موديل»: الوسيط (OpenRouter) أو Groq (openai/gpt-oss · qwen/… · meta-llama/…).
  { name: 'slug', re: /^(?:anthropic|openai|google|meta-llama|deepseek|mistralai|z-ai|qwen|x-ai|moonshotai|nvidia|cohere|perplexity|microsoft|amazon|minimax|baidu|bytedance-seed|thudm|nousresearch)\/[a-z0-9][\w.:-]*$/i, catalogs: ['openrouter', 'groq'] },
  { name: 'claude', re: /^claude-(?:opus|sonnet|haiku|fable|3|4|5)[\w.-]*$/i, catalogs: ['anthropic'] },
  { name: 'gemini', re: /^(?:models\/)?(?:gemini|gemma|imagen|veo)-[\w.-]+$/i, catalogs: ['gemini'] },
  { name: 'kimi', re: /^(?:kimi-k[\w.-]+|moonshot-v1-[\w-]+)$/i, catalogs: ['moonshot'] },
  { name: 'openai', re: /^(?:gpt-[\w.-]+|o[134](?:-mini|-pro)?(?:-\d{4}-\d\d-\d\d)?|chatgpt-[\w.-]+|dall-e-[23]|sora-[\w.-]+)$/i, catalogs: ['openai'] },
  { name: 'deepseek', re: /^deepseek-[\w.-]+$/i, catalogs: ['deepseek'] },
  { name: 'mistral', re: /^(?:mistral|ministral|magistral|codestral|pixtral|devstral|open-mistral)-[\w.-]+$/i, catalogs: ['mistral'] },
  { name: 'cohere', re: /^(?:command-[\w.-]+|c4ai-[\w.-]+)$/i, catalogs: ['cohere'] },
  { name: 'xai', re: /^grok-[\w.-]+$/i, catalogs: ['xai'] },
  { name: 'groq', re: /^(?:llama-3[\w.-]*|llama-4[\w.-]*|whisper-large-[\w.-]+)$/i, catalogs: ['groq'] },
];

function familyOf(id) {
  if (id !== id.toLowerCase()) return null; // «GPT-5.5» عنوان عرض لا معرّف
  for (const f of FAMILIES) if (f.re.test(id)) return f;
  return null;
}

// الملفّات التي تنادي المزوّدين فعلًا: الخادم، وأجزاء الواجهة (لا الحزمة المولّدة)، وملفّات js المنفصلة، والورك فلوهات.
function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(c?js|mjs)$/.test(e.name)) out.push(rel);
    }
  };
  walk('api');
  for (const n of fs.readdirSync(path.join(root, 'js'))) if (/\.js$/.test(n) && n !== 'app.bundle.js') out.push('js/' + n);
  return out.sort();
}

/** يستخرج كلّ سلسلة نصّيّة تطابق عائلة موديل، مع موضعها. التعليقات لا تُقرأ. */
function extractFromSource(text, file) {
  const found = [];
  let tokens;
  try {
    tokens = [...acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType: /\.mjs$/.test(file) ? 'module' : 'script', allowHashBang: true, locations: true, allowReturnOutsideFunction: true })];
    const TT = acorn.tokTypes;
    const isEq = (t) => !!t && t.type === TT.equality;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== TT.string && t.type !== TT.template) continue;
      const v = t.value;
      if (typeof v !== 'string' || v.length > 80 || /\s/.test(v)) continue;
      const id = v.replace(/^models\//, '');
      const fam = familyOf(id);
      if (!fam) continue;
      // اسم قديم مقصود: يُقارَن (model === 'x') أو مفتاح جدول ترحيل ('قديم': 'جديد') — موجود ليُترجَم لا ليُنادى.
      const legacy = isEq(tokens[i - 1]) || isEq(tokens[i + 1]) || (!!tokens[i + 1] && tokens[i + 1].type === TT.colon && (!tokens[i - 1] || tokens[i - 1].type !== TT.question));
      found.push({ id, family: fam.name, file, line: t.loc.start.line, legacy });
    }
  } catch (e) {
    // ملفّ لا يُحلَّل (نادر) لا يُسقط الفحص كلّه — يُبلَّغ في التقرير.
    found.push({ error: String(e && e.message || e), file });
  }
  return found;
}

function extractModels(root, ignore) {
  const skip = new Set((ignore && ignore.ids) || []);
  const byId = new Map();
  const errors = [];
  for (const f of listSourceFiles(root)) {
    for (const hit of extractFromSource(fs.readFileSync(path.join(root, f), 'utf8'), f)) {
      if (hit.error) { errors.push(hit); continue; }
      if (skip.has(hit.id)) continue;
      if (!byId.has(hit.id)) byId.set(hit.id, { id: hit.id, family: hit.family, where: [], called: false });
      const m = byId.get(hit.id);
      if (hit.legacy) continue;
      m.called = true;
      if (m.where.length < 5) m.where.push(hit.file + ':' + hit.line);
    }
  }
  // اسم لا يظهر إلّا في مقارنة أو جدول ترحيل لا يُفحص.
  return { models: [...byId.values()].filter((m) => m.called).map(({ called, ...m }) => m).sort((a, b) => a.id.localeCompare(b.id)), errors };
}

// قوائم المزوّدين: كلّ واحد { url, headers, ids(json) }. المفتاح من البيئة؛ بلا مفتاح = لا قائمة.
const CATALOGS = {
  openrouter: { key: null, url: 'https://openrouter.ai/api/v1/models', ids: (j) => (j.data || []).map((m) => m.id) },
  anthropic: { key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/models?limit=1000', headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }), ids: (j) => (j.data || []).map((m) => m.id) },
  gemini: { key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', headers: (k) => ({ 'x-goog-api-key': k }), ids: (j) => (j.models || []).map((m) => String(m.name || '').replace(/^models\//, '')), next: (j) => j.nextPageToken },
  moonshot: { key: 'MOONSHOT_API_KEY', url: 'https://api.moonshot.ai/v1/models', bearer: true, ids: (j) => (j.data || []).map((m) => m.id) },
  groq: { key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/models', bearer: true, ids: (j) => (j.data || []).map((m) => m.id) },
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models', bearer: true, ids: (j) => (j.data || []).map((m) => m.id) },
  deepseek: { key: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/models', bearer: true, ids: (j) => (j.data || []).map((m) => m.id) },
  mistral: { key: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/models', bearer: true, ids: (j) => (j.data || []).flatMap((m) => [m.id].concat(m.aliases || [])) },
  cohere: { key: 'COHERE_API_KEY', url: 'https://api.cohere.com/v1/models?page_size=1000', bearer: true, ids: (j) => (j.models || []).map((m) => m.name) },
  xai: { key: 'XAI_API_KEY', url: 'https://api.x.ai/v1/models', bearer: true, ids: (j) => (j.data || []).flatMap((m) => [m.id].concat(m.aliases || [])) },
};

/** يجلب القوائم المتاحة. fetchImpl للاختبار. الناتج { name: Set | {skipped|error} } — المفتاح لا يُطبع أبدًا. */
async function fetchCatalogs(env, fetchImpl) {
  const f = fetchImpl || fetch;
  const out = {};
  await Promise.all(Object.entries(CATALOGS).map(async ([name, c]) => {
    const key = c.key ? String(env[c.key] || '').trim() : '';
    if (c.key && !key) { out[name] = { skipped: 'لا مفتاح ' + c.key }; return; }
    const headers = c.headers ? c.headers(key) : (c.bearer ? { authorization: 'Bearer ' + key } : {});
    try {
      const ids = new Set();
      let url = c.url;
      for (let page = 0; page < 10 && url; page++) {
        const r = await f(url, { headers, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        for (const id of c.ids(j)) if (id) ids.add(String(id));
        const tok = c.next && c.next(j);
        url = tok ? c.url + '&pageToken=' + encodeURIComponent(tok) : null;
      }
      if (!ids.size) throw new Error('قائمة فارغة');
      out[name] = ids;
    } catch (e) {
      out[name] = { error: String(e && e.message || e).slice(0, 120) };
    }
  }));
  return out;
}

const isSet = (x) => x instanceof Set;
// الاسم المستعار يُخدم بلقطة مؤرّخة (claude-x ← claude-x-20250929): الحيّ = الاسم نفسه أو لقطة تبدأ به ثمّ رقم.
function inCatalog(set, id) {
  if (set.has(id)) return true;
  const pre = id + '-';
  for (const c of set) if (c.length > pre.length && c.startsWith(pre) && /\d/.test(c[pre.length])) return true;
  return false;
}

/** يصنّف كلّ اسم: live (وُجد) · dead (كلّ القوائم المرشّحة جُلبت ولم يوجد) · unverified (قائمة مرشّحة ناقصة). */
function classify(models, catalogs) {
  const live = [], dead = [], unverified = [];
  for (const m of models) {
    const fam = FAMILIES.find((f) => f.name === m.family);
    const cands = fam ? fam.catalogs : [];
    const got = cands.filter((c) => isSet(catalogs[c]));
    if (got.some((c) => inCatalog(catalogs[c], m.id))) live.push(m);
    else if (got.length === cands.length && cands.length) dead.push(m);
    else unverified.push(Object.assign({}, m, { missing: cands.filter((c) => !isSet(catalogs[c])) }));
  }
  return { live, dead, unverified };
}

function report(result, catalogs, errors) {
  const L = [];
  L.push('## فحص الموديلات الحيّة');
  L.push('');
  L.push('| المزوّد | الحالة |');
  L.push('|---|---|');
  for (const name of Object.keys(CATALOGS)) {
    const c = catalogs[name];
    L.push('| ' + name + ' | ' + (isSet(c) ? '✅ ' + c.size + ' موديلًا' : c && c.skipped ? '⏭️ ' + c.skipped : '⚠️ ' + ((c && c.error) || '؟')) + ' |');
  }
  L.push('');
  L.push('**حيّ:** ' + result.live.length + ' · **ميّت:** ' + result.dead.length + ' · **لم يُفحص:** ' + result.unverified.length);
  if (result.dead.length) {
    L.push('');
    L.push('### ❌ أسماء في الكود غير موجودة عند مزوّدها');
    for (const m of result.dead) L.push('- `' + m.id + '` — ' + m.where.map((w) => '`' + w + '`').join('، '));
  }
  if (result.unverified.length) {
    L.push('');
    L.push('<details><summary>لم يُفحص (' + result.unverified.length + ') — قائمة مزوّده غير متاحة</summary>');
    L.push('');
    for (const m of result.unverified) L.push('- `' + m.id + '` (' + m.missing.join('، ') + ')');
    L.push('</details>');
  }
  if (errors && errors.length) {
    L.push('');
    L.push('ملفّات لم تُحلَّل: ' + errors.map((e) => '`' + e.file + '`').join('، '));
  }
  L.push('');
  L.push('_لإسكات اسم مقصود (ترجمة اسم قديم مثلًا): أضفه إلى `scripts/models-live-ignore.json`._');
  return L.join('\n');
}

module.exports = { FAMILIES, CATALOGS, familyOf, listSourceFiles, extractFromSource, extractModels, fetchCatalogs, classify, report };
