// tests/chat-image-fail.test.cjs — v-img-err: دور الصورة حين يفشل — السبب يظهر ولا يُدفن.
// لقطة المالك ١٢ سبتمبر (بعد v-img-wire): كلّ دور فيه صورة ينتهي بـ«404 The model
// meta-llama/llama-4-scout-17b-16e-instruct does not exist» — وهو خطأ آخر مزوّد في سلسلة
// الاحتياط القديمة، لا سبب فشل المسار الأوّل (كلود المباشر) الذي بقي مجهولًا.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = read('api/_lib/chat.js');
const checkout = read('js/app-06-checkout.js');
const attach = read('js/app-09-attach.js');

test('server: image-turn config retried on any upstream failure, failures flushed to the owner log, keepalive on image turns', () => {
  assert.ok(chat.includes("const { logError, logErrorAndFlush } = require('./log-error.js');"), 'المسجّل المنتظَر مستورد');
  assert.ok(chat.includes('if (!upstream.ok && __imgCfg && (__imgCfg.output_config || __imgCfg.model !== CHAT_MODEL)) {'), 'الإعادة على أيّ فشل لا 400 وحده');
  assert.ok(!chat.includes("if (!upstream.ok && upstream.status === 400 && __imgCfg"), 'شرط 400 القديم زال');
  assert.ok(chat.includes("await logErrorAndFlush('chat/image-turn-' + upstream.status"), 'فشل إعداد الصورة يُسجَّل منتظَرًا');
  assert.ok(chat.includes("await logErrorAndFlush('chat/upstream-fail', new Error(upstream.status + ': ' + errText), { action: lastUserHasImage ? 'image-turn' : 'text-turn' });"), 'الفشل النهائيّ يُسجَّل بنوع الدور');
  assert.ok(chat.includes('let kaTimer = (!toolTurn || __longUserMsg || lastUserHasImage) ? setInterval('), 'النبض لدور الصورة');
  const i = chat.indexOf("const eff = String(e.CHAT_IMAGE_EFFORT || 'high')");
  assert.ok(i > 0, 'الجهد الافتراضيّ high');
});

test('client: the first provider error is what the user sees when the whole legacy chain fails', () => {
  assert.ok(checkout.includes('let firstErr = null;') && checkout.includes('if(!firstErr){ firstErr = err; firstProv = providerKey; }'), 'يحفظ خطأ المزوّد الأوّل');
  const tail = checkout.slice(checkout.indexOf('if(firstErr && lastErr && firstErr !== lastErr){'), checkout.indexOf("throw lastErr || new Error(t('providerError') + ' - fallback');"));
  assert.ok(tail.includes('throw firstErr;'), 'يرمي الأوّل لا الأخير');
  assert.ok(tail.includes('الاحتياط فشل أيضًا'), 'ويُلحق فشل الاحتياط باختصار');
});

test('client: Groq vision model gone = describe-then-text fallback, not a dead turn', () => {
  const i = checkout.indexOf('async function callGroq(messages, onDelta){');
  const fn = checkout.slice(i, checkout.indexOf('async function __groqSend(model, msgsOut, onDelta){'));
  assert.ok(fn.includes('if(!hasImages) return await __groqSend(textModel, messages, onDelta);'), 'النصّ كما كان');
  assert.ok(fn.includes('return await __groqSend(GROQ_VISION_MODEL, toOpenAIVisionMessages(messages), onDelta);'), 'نموذج الرؤية أوّلًا');
  assert.ok(/model_not_found\|does not exist\|decommissioned/.test(fn), 'خطأ النموذج يُميَّز');
  assert.ok(fn.includes('return await __groqSend(textModel, await stripImagesWithDescription(messages), onDelta);'), 'ثمّ الوصف + النصّيّ');
  assert.ok(fn.includes("e.name === 'AbortError'") && fn.includes('throw e;'), 'الإيقاف وغير خطأ النموذج يمرّان كما هما');
  assert.ok(checkout.includes('async function __groqSend(model, msgsOut, onDelta){'), 'المرسِل المشترك');
  // نسخة مطابقة لمنطق التمييز — تُختبر سلوكيًّا
  const isModelErr = (e) => !!(e && (e.status === 404 || /model_not_found|does not exist|decommissioned|has been deprecated|not supported/i.test(String((e && (e.upstreamText || e.message)) || ''))));
  assert.equal(isModelErr(Object.assign(new Error('x'), { status: 404 })), true);
  assert.equal(isModelErr(Object.assign(new Error('خطأ 400'), { status: 400, upstreamText: '{"error":{"message":"The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist or you do not have access to it.","code":"model_not_found"}}' })), true, 'لقطة المالك');
  assert.equal(isModelErr(Object.assign(new Error('rate'), { status: 429 })), false);
  assert.equal(isModelErr(Object.assign(new Error('bad'), { status: 400, upstreamText: 'invalid image' })), false);
});

test('client: the error bubble carries the primary (tools path) error next to the fallback error', () => {
  assert.ok(attach.includes("__primaryErr = String((window.__diagTurn && window.__diagTurn.toolsErr) || '').trim();"), 'يقرأ خطأ مسار الأدوات');
  assert.ok(attach.includes("content: '⚠️ ' + __friendlyErr(err) + (__primaryErr ? ('\\n' + (lang === 'ar' ? 'المسار الأوّل (كلود): ' : 'Primary path (Claude): ') + __primaryErr.slice(0, 220)) : '')"), 'ويعرضه في الفقاعة');
});
