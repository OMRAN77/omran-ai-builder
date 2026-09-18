// v-prompt-cache (١٨ سبتمبر ٢٠٢٦): التخزين المؤقّت للموجّه في مسار المحادثة الرئيسيّ —
// النظام ثابت + متغيّر، والعلامة على آخر كتلة، وإعادة بلا كاش عند 400، وعدّاد توكنات للمالك.
'use strict';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-prompt-cache';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { splitSystemForCache, markLastForCache, usageLabel } = require('../api/_lib/chat.js').__cache;
const EPH = { type: 'ephemeral' };

test('splitSystemForCache: الثابت أوّلًا بعلامة الكاش، والمتغيّر بعده بلا علامة', () => {
  const stable = 'PERSONA\nMEMORY';
  const b = splitSystemForCache(stable + '\n[الوقت الآن]: ٣:٠٤', stable);
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], { type: 'text', text: stable, cache_control: EPH });
  assert.deepEqual(b[1], { type: 'text', text: '\n[الوقت الآن]: ٣:٠٤' });
  // لا متغيّر → كتلة واحدة معلَّمة
  assert.deepEqual(splitSystemForCache(stable, stable), [{ type: 'text', text: stable, cache_control: EPH }]);
  // فارغ (المالك الخام) → undefined
  assert.equal(splitSystemForCache('', stable), undefined);
  // نصّ لا يبدأ بالثابت → كتلة واحدة معلَّمة، لا ضياع
  assert.deepEqual(splitSystemForCache('X', stable), [{ type: 'text', text: 'X', cache_control: EPH }]);
});

test('markLastForCache: آخر كتلة في آخر رسالة تُعلَّم، نسخةً لا تعديلًا في المكان', () => {
  const convo = [{ role: 'user', content: 'هلا' }, { role: 'assistant', content: 'أهلًا' }, { role: 'user', content: 'اقرأ الملفّ …' }];
  const out = markLastForCache(convo);
  assert.notEqual(out, convo);
  assert.equal(convo[2].content, 'اقرأ الملفّ …', 'الأصل لم يُمسّ');
  assert.deepEqual(out[2], { role: 'user', content: [{ type: 'text', text: 'اقرأ الملفّ …', cache_control: EPH }] });
  assert.equal(out[0], convo[0]); assert.equal(out[1], convo[1]);
  // مصفوفة كتل: العلامة على الأخيرة فقط
  const img = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'اقرأ' }] }];
  const o2 = markLastForCache(img);
  assert.equal(o2[0].content[0].cache_control, undefined);
  assert.deepEqual(o2[0].content[1], { type: 'text', text: 'اقرأ', cache_control: EPH });
  assert.equal(img[0].content[1].cache_control, undefined, 'الأصل لم يُمسّ');
  // نتيجة أداة في حلقة الأدوات
  const tr = [{ role: 'user', content: 'س' }, { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'web_search', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'نتيجة' }] }];
  const o3 = markLastForCache(tr);
  assert.deepEqual(o3[2].content[0].cache_control, EPH);
  assert.equal(o3[1], tr[1]);
  // كتلة فارغة أو محادثة فارغة تُترك كما هي
  assert.equal(markLastForCache([{ role: 'user', content: '' }])[0].content, '');
  assert.equal(markLastForCache([{ role: 'user', content: [{ type: 'text', text: '' }] }])[0].content[0].cache_control, undefined);
  assert.deepEqual(markLastForCache([]), []);
});

test('usageLabel: كاش · جديد · خرج بأرقام مختصرة', () => {
  assert.equal(usageLabel({ input: 1200, cacheRead: 48000, cacheWrite: 300, output: 950 }), 'كاش 48k · جديد 1.5k · خرج 950');
  assert.equal(usageLabel({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }), 'كاش 0 · جديد 0 · خرج 0');
});

test('chat.js: الطلب يحمل النظام كتلًا معلَّمة والرسائل معلَّمة، مع مفتاح إيقاف وإعادة على 400', () => {
  const s = read('api/_lib/chat.js');
  assert.match(s, /let __cacheOn = String\(process\.env\.CHAT_PROMPT_CACHE \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'off';/);
  assert.match(s, /const __sysBlocks = splitSystemForCache\(__sysSend, PERSONA_NOTE \+ '\\n' \+ baseSystem\);/);
  assert.match(s, /system: __cacheOn \? __sysBlocks : \(__sysSend \|\| undefined\), messages: __cacheOn \? markLastForCache\(convo\) : convo, tools: toolTurn \? TOOLS : undefined, stream: true/);
  assert.match(s, /if \(\/cache_control\/i\.test\(__cc\)\) \{\n\s+__cacheOn = false;\n\s+await logErrorAndFlush\('chat\/prompt-cache-400'/);
  // العدّاد من message_start وmessage_delta، والعرض للمالك وحده
  assert.match(s, /ev\.type === 'message_start'[\s\S]*?cache_read_input_tokens/);
  assert.match(s, /if \(__ownerReq\) send\(\{ modelId: __pick\.picked \? __pick\.id : 'default', modelLabel: \(__pick\.label \|\| 'الافتراضيّ'\) \+ ' · ' \+ usageLabel\(__usage\) \}\);/);
  // الثابت لا يحوي الوقت: nowNote يُلحق بعد baseSystem في نصّ النظام لا داخل sysParts
  assert.ok(!/sysParts\.push\([^)]*nowNote/.test(s), 'الوقت يجب أن يبقى خارج الكتلة الثابتة');
  // المتغيّر موثّق
  assert.match(read('api/_lib/env.js'), /CHAT_PROMPT_CACHE:/);
});
