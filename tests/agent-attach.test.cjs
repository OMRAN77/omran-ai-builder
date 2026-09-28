'use strict';
/* v-agent-attach — لقطة المالك ٢٥ سبتمبر: أرفق sw.js.txt في وضع الوكيل فردّ «ما وصلني شي أحلله».
   runOmranAgent بنى السجلّ من الرسائل المحفوظة (نصّ المستخدم وحده) وتجاهل apiText الذي يحمل الملفّ. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/app-09-attach.js'), 'utf8');
const start = src.indexOf('async function runOmranAgent(');
const end = src.indexOf('\n  const reader = res.body.getReader();', start);
assert.ok(start > 0 && end > start, 'وُجدت الدالّة');
const fnSrc = src.slice(start, end) + '\n}';

(async () => {
  let sent = null;
  const env = {
    makeChatStatus: () => ({ step: () => ({ done() {} }) }),
    lang: 'ar',
    __stripCodeForHistory: (role, t) => String(t || ''),
    authGet: () => '',
    localStorage: { setItem() {}, removeItem() {} },
    window: { getGuestId: () => 'g1' },
    genAbortController: null,
    fetch: async (url, init) => { sent = JSON.parse(init.body); return { ok: false, text: async () => '' }; },
    throwProviderError: () => { throw new Error('stop'); },
  };
  const run = new Function(...Object.keys(env), fnSrc + '\nreturn runOmranAgent;')(...Object.values(env));

  const file = 'self.addEventListener(\'install\', () => {});';
  const cur = { id: 'p1', code: '', messages: [
    { role: 'user', content: 'مرحبا' }, { role: 'assistant', content: '🤖 أهلًا' },
    { role: 'user', content: 'مرفقات', attachments: [{ name: 'sw.js.txt', text: file }] },
  ] };
  const apiText = '📄 sw.js.txt:\n```\n' + file + '\n```';
  await run(cur, apiText, {}).catch((e) => { if (e.message !== 'stop') throw e; });
  const last = sent.messages[sent.messages.length - 1];
  assert.strictEqual(last.role, 'user');
  assert.ok(last.content.includes("self.addEventListener('install'"), 'نصّ الملفّ يصل الوكيل');
  assert.strictEqual(sent.messages[0].content, 'مرحبا', 'الرسائل السابقة كما هي');

  // الدور الحاليّ ليس رسالة مستخدم (نادر) — لا يُستبدل شيء
  const cur2 = { id: 'p2', code: '', messages: [{ role: 'assistant', content: '🤖 x' }] };
  await run(cur2, 'نصّ', {}).catch((e) => { if (e.message !== 'stop') throw e; });
  assert.strictEqual(sent.messages[0].content, '🤖 x');

  console.log('agent-attach: ok');
})().catch((e) => { console.error(e); process.exit(1); });
