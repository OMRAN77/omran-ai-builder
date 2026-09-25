'use strict';
/* v-routing-map — خريطة التوجيه (knowledge/ROUTING.md) لا تُصان بالنيّة الحسنة.
   `knowledge/PROJECT.md` مثال حيّ على توثيق تخلّف عن الواقع (CLAUDE.md نفسه
   يستثني منه نقطة). هذا الاختبار يجعل الخريطة تفشل الفحص إن كذبت:

   (١) كلّ مرساة «ملفّ:سطر» مذكورة في الخريطة يجب أن تشير إلى سطر موجود فعلًا،
       وأن يحمل ما يوافق اسم الدالّة/الثابت الذي ذُكر بجانبها.
   (٢) القوائم الحاسمة (PROVIDERS · DEFAULT_CHAIN · CLAUDE_MODELS · MODES)
       يجب أن تطابق ما في الكود عنصرًا عنصرًا.
   (٣) الحقائق البنيويّة التي تقوم عليها الخريطة (أنّ chat خارج PROVIDERS،
       وأنّ الهبوط الصامت مشروط بـ!anyText) يجب أن تبقى صحيحة. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MAP = rd('knowledge/ROUTING.md');

// ── (١) كلّ مرساة «ملفّ:سطر» تشير إلى سطر موجود ──
// تُكتب في الخريطة بصيغتين: `ai.js:305` (نسبيّة لـapi/) أو `_lib/router.js:32`
// أو `tests/…`. نحلّ المسار على المواضع المحتملة ثمّ نتحقّق من وجود السطر.
const CANDIDATE_DIRS = ['api', 'api/_lib', '', 'js', 'scripts'];
function resolveFile(name) {
  for (const d of CANDIDATE_DIRS) {
    const p = d ? path.join(d, name) : name;
    if (fs.existsSync(path.join(root, p))) return p;
  }
  return null;
}

// نلتقط كل «اسم.js:رقم» في الخريطة (داخل الجداول والمخطّطات معًا)
const anchorRe = /([A-Za-z0-9_\-/.]+\.(?:js|mjs|cjs)):(\d+)/g;
const anchors = [];
let m;
while ((m = anchorRe.exec(MAP))) anchors.push({ raw: m[1], line: Number(m[2]) });
assert.ok(anchors.length >= 25, 'الخريطة تحمل مراسي كافية (وُجد ' + anchors.length + ')');

const lineCache = new Map();
function linesOf(p) {
  if (!lineCache.has(p)) lineCache.set(p, rd(p).split('\n'));
  return lineCache.get(p);
}
const seenFiles = new Set();
for (const a of anchors) {
  const p = resolveFile(a.raw);
  assert.ok(p, 'الملفّ المذكور في الخريطة موجود: ' + a.raw);
  seenFiles.add(p);
  const lines = linesOf(p);
  assert.ok(a.line >= 1 && a.line <= lines.length,
    'المرساة ' + a.raw + ':' + a.line + ' خارج حدود الملفّ (' + lines.length + ' سطرًا)');
  assert.ok(lines[a.line - 1].trim().length > 0,
    'المرساة ' + a.raw + ':' + a.line + ' تشير إلى سطر فارغ — الكود تحرّك والخريطة لم تُحدَّث');
}

// ── (١-ب) المراسي المسمّاة: السطر يحمل التعريف الذي ادّعته الخريطة ──
// لو انزاح تعريف دالّة سطرًا واحدًا، يُمسك هنا لا في مراجعة بشريّة.
const NAMED = [
  ['api/ai.js', 19, 'function load('],
  ['api/ai.js', 294, 'const AI_MODE'],
  ['api/ai.js', 296, 'const MODES'],
  ['api/ai.js', 307, 'function resolveMode('],
  ['api/ai.js', 352, 'function stripAppSystem('],
  ['api/ai.js', 358, 'function injectNote('],
  ['api/ai.js', 440, 'function applyNote('],
  ['api/ai.js', 477, 'const PROVIDERS'],
  ['api/ai.js', 479, "withErrorCapture('ai'"],
  ['api/_lib/chat.js', 63, 'function customInstructionsBlock('],
  ['api/_lib/chat.js', 560, 'function imageTurnConfig('],
  ['api/_lib/chat.js', 580, 'const CLAUDE_MODELS'],
  ['api/_lib/chat.js', 586, 'function pickClaudeModel('],
  ['api/_lib/chat.js', 593, 'const OR_MODELS'],
  ['api/_lib/chat.js', 1059, 'module.exports = async'],
  ['api/_lib/chat.js', 1080, 'let viaOR'],
  ['api/_lib/chat.js', 1083, 'let apiKey'],
  ['api/_lib/chat.js', 1084, 'ANTHROPIC_API_KEY / OPENROUTER_API_KEY'],
  ['api/_lib/chat.js', 1085, 'let CHAT_URL'],
  ['api/_lib/chat.js', 1091, 'let DEFAULT_MODEL'],
  ['api/_lib/chat.js', 1124, 'const applyRoute'], // v-plan-routing
  ['api/_lib/chat.js', 1103, 'let __direct = (__ownerReq'], // v-owner-direct
  ['api/_lib/chat.js', 1098, 'pickClaudeModel('], // v-provider-models: سطران تعليق قبله
  ['api/_lib/chat.js', 1195, '__planRoute = tierLib.planRoute('], // v-plan-routing
  ['api/_lib/chat.js', 1201, 'checkAndConsume('],
  ['api/_lib/chat.js', 1202, 'usage.allowed'],
  ['api/_lib/chat.js', 1217, '__freeLane'],
  ['api/_lib/chat.js', 1272, 'const sysParts'],
  ['api/_lib/chat.js', 1279, 'customInstructionsBlock('],
  ['api/_lib/chat.js', 1369, 'imageTurnConfig('],
  ['api/_lib/chat.js', 1414, 'if (__freeLane)'],
  ['api/_lib/chat.js', 1533, 'while (!upstream.ok && !anyText && __planFallbacks.length)'], // v-plan-routing
  ['api/_lib/chat.js', 1548, 'v-king-fallback'],
  ['api/_lib/tier.js', 40, 'const PLAN_ROUTING'], // v-plan-routing
  ['api/_lib/tier.js', 47, 'function isStrongTurn('],
  ['api/_lib/tier.js', 54, 'function planRoute('],
  ['api/_lib/tier.js', 117, 'const DEFAULT_CHAIN'],
  ['api/_lib/tier.js', 139, 'function isOwnerUsername('],
  ['api/_lib/tier.js', 144, 'function planActive('],
  ['api/_lib/tier.js', 159, 'async function resolveTier('],
  ['api/_lib/tier.js', 204, 'function freeChain('],
  ['api/_lib/free-chain.js', 18, 'const FREE_NOTE'],
  ['api/_lib/free-chain.js', 156, 'async function streamFreeChain('],
  ['api/_lib/free-chain.js', 244, 'function modelsToTry('],
  ['api/_lib/free-chain.js', 251, 'function rememberWorking('],
  ['api/_lib/router.js', 32, 'function quickIntent('],
  ['api/_lib/router.js', 78, 'const INTENT_NOTES'],
];
for (const [p, line, needle] of NAMED) {
  const lines = linesOf(p);
  assert.ok(lines.length >= line, p + ':' + line + ' خارج الحدود');
  assert.ok(lines[line - 1].includes(needle),
    p + ':' + line + ' يجب أن يحمل «' + needle + '» — وجد: ' + lines[line - 1].trim().slice(0, 80));
  // والمرساة نفسها مذكورة في الخريطة (وإلّا فالخريطة ناقصة نقطة قرار)
  const short = p.replace(/^api\/_lib\//, '_lib/').replace(/^api\//, '');
  assert.ok(MAP.includes(short + ':' + line) || MAP.includes(path.basename(p) + ':' + line),
    'المرساة ' + short + ':' + line + ' غير مذكورة في الخريطة');
}

// ── (٢) القوائم الحاسمة تطابق الكود عنصرًا عنصرًا ──
const ai = rd('api/ai.js');
const tier = rd('api/_lib/tier.js');
const chat = rd('api/_lib/chat.js');

function listOf(src, decl) {
  const i = src.indexOf(decl);
  assert.ok(i > 0, 'التعريف موجود: ' + decl);
  const seg = src.slice(i, src.indexOf(']', i) + 1);
  return (seg.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
}

const PROVIDERS = listOf(ai, 'const PROVIDERS = [');
assert.deepStrictEqual(PROVIDERS,
  ['openai', 'gemini', 'groq', 'claude', 'cohere', 'deepseek', 'mistral', 'openrouter', 'perplexity'],
  'قائمة PROVIDERS تغيّرت — حدّث §١ في الخريطة');
PROVIDERS.forEach((p) => assert.ok(MAP.includes(p), 'المزوّد ' + p + ' مذكور في الخريطة'));

const DEFAULT_CHAIN = listOf(tier, 'const DEFAULT_CHAIN = [');
assert.deepStrictEqual(DEFAULT_CHAIN, ['groq', 'gemini', 'mistral', 'openrouter'], // v-plan-routing: Groq أوّلًا
  'ترتيب السلسلة المجانيّة تغيّر — حدّث §٤ في الخريطة');
assert.ok(MAP.includes("['groq','gemini','mistral','openrouter']"),
  'الخريطة تذكر ترتيب السلسلة المجانيّة كما هو في الكود');

const MODES = listOf(ai, 'const MODES = [');
assert.deepStrictEqual(MODES, ['factory', 'balanced', 'minimal', 'guided'],
  'قائمة MODES تغيّرت — حدّث §٢-أ في الخريطة');
assert.ok(MAP.includes("['factory','balanced','minimal','guided']"), 'الخريطة تذكر MODES كما هي');

const { CLAUDE_MODELS } = (function () {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
  return require(path.join(root, 'api/_lib/chat.js')).__vmodels;
})();
Object.keys(CLAUDE_MODELS).forEach((id) => {
  assert.ok(chat.includes("'" + id + "'"), 'النموذج ' + id + ' معرَّف في الكود');
});
assert.ok(MAP.includes('CLAUDE_MODELS'), 'الخريطة تذكر مصدر قائمة النماذج');

// ── (٣) الحقائق البنيويّة التي تقوم عليها الخريطة ──
// (أ) chat وagent خارج PROVIDERS — هذا أساس قسم «الأسلاك المقطوعة» كلّه
assert.ok(PROVIDERS.indexOf('chat') === -1,
  'chat خارج PROVIDERS — إن دخلها فقسم «أسلاك مقطوعة» صار قديمًا');
assert.ok(PROVIDERS.indexOf('agent') === -1, 'agent خارج PROVIDERS');
assert.ok(/case 'chat': return require\('\.\/_lib\/chat\.js'\)/.test(ai),
  'action=chat يسلّم إلى _lib/chat.js');
assert.ok(/if \(PROVIDERS\.indexOf\(action\) !== -1 && req\.method === 'POST'\)/.test(ai),
  'injectNote مشروط بعضويّة PROVIDERS — الحقيقة التي تشرحها §١');

// (ب) الهبوط الصامت مشروط بألّا يكون كُتب حرف
assert.ok(/if \(!anyText\) \{/.test(chat), 'الهبوط إلى السلسلة مشروط بـ!anyText');
assert.ok(MAP.includes('!anyText') || MAP.includes('anyText'),
  'الخريطة تذكر شرط anyText في جدول الفشل');

// (ج) الطبقة المجانيّة لا تهبط لمزوّد مدفوع
assert.ok(/__freeLane = !!\(usage\.tier && !usage\.subscriber\)/.test(chat),
  'تعريف __freeLane كما تصفه §٣-ب');
assert.ok(/isPaidProvider/.test(tier), 'حارس المزوّد المدفوع قائم');

// (د) الأسلاك المقطوعة المذكورة ما زالت مقطوعة فعلًا (وإلّا فالخريطة تكذب)
assert.ok(!/quickIntent/.test(chat), 'مصنّف النيّة ما زال لا يصل chat.js — كما تقول §٦-ب');
assert.ok(!/require\(.*tone\.js.*\)/.test(chat), 'tone.js ما زال لا يصل chat.js — كما تقول §٦-ب');
assert.ok(/CACHE_NAME/.test(rd('scripts/build.mjs')) && /BUILD_ID/.test(rd('sw.js')),
  'تناقض ختم sw.js ما زال قائمًا كما تقول §٦-ب');

// ── (٤) الخريطة مذكورة حيث يقرأها القادم ──
assert.ok(/tests\/routing-anchors\.test\.cjs/.test(MAP), 'الخريطة تشير إلى اختبارها');
assert.ok(/routing-anchors\.test\.cjs/.test(rd('package.json')), 'الاختبار مسجَّل في package.json');

console.log('✓ routing-anchors: ' + anchors.length + ' مرساة صحيحة · ' + seenFiles.size
  + ' ملفّات · القوائم الحاسمة مطابقة · الأسلاك المقطوعة ما زالت كما وُصفت');
