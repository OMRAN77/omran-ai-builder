'use strict';
/* v-image-memory (خطة المالك ٦ سبتمبر، البند ٣): نموذج الصور يرى أدوار السلسلة السابقة — «أفضل من هذي» محادثة متصلة كـGemini */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const maha = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const tools = fs.readFileSync('js/app-17-agent-tools.js', 'utf8');

test('server turns the client history into real user/model turns before the current request', () => {
  assert.match(maha, /const history = Array\.isArray\(body\.history\) \? body\.history\n\s+\.filter\(function \(h\) \{ return h && typeof h\.text === 'string' && typeof h\.resultBase64 === 'string' && h\.resultBase64\.length > 100 && h\.resultBase64\.length <= 420000; \}\)\n\s+\.slice\(-4\)/);
  assert.match(maha, /const __historyTurns = \(editImageBase64 && !extras\.length && history\.length\) \? history\.reduce\(/);
  assert.match(maha, /acc\.push\(\{ role: 'user', parts: up \}\);\n\s+acc\.push\(\{ role: 'model', parts: \[\{ inlineData: \{ mimeType: h\.resultMime, data: h\.resultBase64 \} \}\] \}\);/);
  assert.match(maha, /const __contents = __historyTurns\.length \? __historyTurns\.concat\(\[\{ role: 'user', parts \}\]\) : \[\{ parts \}\];/);
  assert.equal((maha.match(/contents: __contents, generationConfig: genConfigFor\(/g) || []).length, 2, 'الطلب الرئيسي (الخام والمهندس) يستخدم السياق');
  assert.match(maha, /Never return an earlier result unchanged/);
  /* الصور خارج القائمة البيضاء تُعامل JPEG، والمصدر الأصلي اختياري */
  assert.match(maha, /const __okMime = function \(m\) \{ return \/\^image\\\/\(\?:jpeg\|png\|webp\)\$\/\.test\(String\(m \|\| ''\)\) \? m : 'image\/jpeg'; \};/);
});

test('client records each edit turn as a 768px thumb and sends the last three on follow-ups', () => {
  assert.match(attach, /async function omranShrinkForEdit\(b64, mime, maxPx, force\)/);
  assert.match(attach, /if\(!b64 \|\| \(!force && b64\.length < 900000\)\) return/);
  assert.match(attach, /history: \(__continuesEditChain && Array\.isArray\(cur\.imageTurns\) && cur\.imageTurns\.length\) \? cur\.imageTurns\.slice\(-3\) : undefined/);
  assert.match(attach, /const __tRes = await omranShrinkForEdit\(__data\.imageBase64, __outMime, 768, true\);/);
  assert.match(attach, /cur\.imageTurns = cur\.imageTurns\.concat\(\[__turn\]\)\.slice\(-4\);/);
  assert.match(attach, /cur\.imageTurns = \[\]; \/\* v-image-memory: مصدر جديد = سلسلة جديدة \*\//);
  /* مسار الأدوات يرسل السياق نفسه ويسجّل الدور */
  assert.match(tools, /history: tHist,/);
  assert.match(tools, /tcur\.imageTurns = tcur\.imageTurns\.concat\(\[tTurn\]\)\.slice\(-4\);/);
});
